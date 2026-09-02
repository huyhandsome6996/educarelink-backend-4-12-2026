"""
Management command chạy tracking schedulers (offline + verification) standalone.

QA-FIX-2 / C: trên production với WEB_CONCURRENCY=2, mỗi gunicorn worker chạy
1 scheduler riêng → 2 scheduler chạy song song → có thể tạo duplicate
DeviceOfflineAlert + RandomVerificationCheck cho cùng task.

Cách dùng đúng trên Render:
  1. Tạo 1 cron job mỗi 1 phút chạy:
       python manage.py run_tracking_schedulers --once
  2. Hoặc tạo 1 worker dyno chạy daemon:
       python manage.py run_tracking_schedulers
     (set env TRACKING_SCHEDULER_PROCESS=true để apps.py biết đây là process
      riêng, không phải web worker.)

Khi chạy --once: chạy scheduler 1 lần rồi exit (cho cron job).
Khi chạy daemon: khởi động APScheduler chạy mỗi 1 phút (cho worker dyno).

DB unique constraint (unique_active_alert_per_task và
unique_pending_check_per_task_worker) đảm bảo即使 có 2 scheduler chạy đồng thời,
không tạo duplicate record.

QA-FIX-3 / C: health logging — mỗi lần chạy, ghi file
/tmp/tracking_scheduler_health.json với timestamp + stats. Monitoring outside
đọc file này để phát hiện scheduler không chạy (file cũ quá → scheduler die).

QA-FIX-5 / M2: căn chỉnh kiến trúc health endpoint — Render Cron Job và web
service là 2 container độc lập, không chia sẻ /tmp. Bổ sung ghi health vào DB
qua SchedulerHealth model.record_run(). Endpoint /api/tracking/scheduler-health/
đọc từ DB thay vì /tmp file. Vẫn giữ /tmp file như fallback (cho dev local).
"""

import os
import time
import logging
import signal
import json

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('educarelink.tracking.run_schedulers')

# File ghi trạng thái scheduler lần chạy gần nhất — monitoring đọc file này
# để phát hiện scheduler không chạy (file cũ quá → scheduler die).
# QA-FIX-5 / M2: chỉ dùng cho dev local + log; production đọc DB.
HEALTH_FILE = '/tmp/tracking_scheduler_health.json'


def _write_health_file(stats):
    """Ghi file health cho monitoring outside process (legacy, dev local).

    QA-FIX-5 / M2: production dùng DB (SchedulerHealth.record_run) thay vì
    file vì Render Cron Job và web service không chia sẻ /tmp. File này vẫn
    giữ cho dev local + log + test.
    """
    try:
        # Nếu stats có 'last_run_at' (cho test stale), dùng giá trị đó.
        last_run = stats.get('last_run_at') if isinstance(stats, dict) else None
        if last_run is None:
            last_run = timezone.now().isoformat()
        with open(HEALTH_FILE, 'w') as f:
            json.dump({
                'last_run_at': last_run,
                'stats': stats,
            }, f)
    except Exception as e:
        logger.warning(f'[run_tracking_schedulers] write health file failed: {e}')


def _read_health_file():
    """Đọc file health (cho monitoring endpoint) — legacy fallback."""
    try:
        with open(HEALTH_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return None


def _record_health_db(stats, only='both', started_at=None, finished_at=None,
                      source='cron'):
    """QA-FIX-5 / M2: ghi health vào DB — chia sẻ giữa Cron và web service.

    stats có thể chứa 'errors' list → success=False nếu có errors.
    """
    try:
        from tracking.models import SchedulerHealth
        # Parse started_at/finished_at từ stats nếu có (ISO string)
        from django.utils.dateparse import parse_datetime

        started_dt = None
        finished_dt = None
        last_run_dt = None

        if started_at:
            started_dt = parse_datetime(started_at) if isinstance(started_at, str) else started_at
        if finished_at:
            finished_dt = parse_datetime(finished_at) if isinstance(finished_at, str) else finished_at
        # last_run_at ưu tiên finished_at, fallback now()
        if finished_dt:
            last_run_dt = finished_dt
        elif started_dt:
            last_run_dt = started_dt
        else:
            last_run_dt = timezone.now()

        errors = stats.get('errors', []) if isinstance(stats, dict) else []
        success = len(errors) == 0
        error_message = '; '.join(str(e) for e in errors) if errors else ''

        SchedulerHealth.record_run(
            last_run_at=last_run_dt,
            source=source,
            scheduler_kind=only,
            success=success,
            error_message=error_message,
            stats=stats if isinstance(stats, dict) else {},
            started_at=started_dt,
            finished_at=finished_dt,
        )
    except Exception as e:
        logger.warning(f'[run_tracking_schedulers] write DB health failed: {e}')


def _read_health_db():
    """QA-FIX-5 / M2: đọc health từ DB — trả về dict hoặc None.

    Trả về None nếu chưa có row hoặc DB chưa migrate.
    """
    try:
        from tracking.models import SchedulerHealth
        obj = SchedulerHealth.get_singleton()
        if obj.last_run_at is None:
            return None
        return {
            'last_run_at': obj.last_run_at.isoformat() if obj.last_run_at else None,
            'started_at': obj.started_at.isoformat() if obj.started_at else None,
            'finished_at': obj.finished_at.isoformat() if obj.finished_at else None,
            'source': obj.source,
            'scheduler_kind': obj.scheduler_kind,
            'success': obj.success,
            'error_message': obj.error_message,
            'stats': obj.stats,
        }
    except Exception as e:
        logger.warning(f'[run_tracking_schedulers] read DB health failed: {e}')
        return None


class Command(BaseCommand):
    help = (
        'Chạy tracking schedulers (offline check + verification check) '
        'standalone — không chạy trong web worker.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--once',
            action='store_true',
            help='Chạy 1 lần rồi exit (cho cron job). Mặc định: chạy daemon.',
        )
        parser.add_argument(
            '--only',
            choices=['offline', 'verification', 'both'],
            default='both',
            help='Chọn scheduler nào chạy (default: both).',
        )

    def handle(self, *args, **options):
        # Đánh dấu đây là process scheduler riêng (không phải web worker)
        os.environ['TRACKING_SCHEDULER_PROCESS'] = 'true'

        once = options['once']
        only = options['only']

        self.stdout.write(self.style.SUCCESS(
            f'[run_tracking_schedulers] Bắt đầu — mode={"once" if once else "daemon"}, only={only}'
        ))

        if once:
            # Chạy 1 lần rồi exit — cho cron job
            self._run_once(only)
            return

        # Daemon mode — chạy foreground, SIGTERM/SIGINT để dừng
        self._run_daemon(only)

    def _run_once(self, only):
        """Chạy schedulers 1 lần rồi exit."""
        started_at = timezone.now()
        overall_stats = {
            'started_at': started_at.isoformat(),
            'offline': None,
            'verification': None,
            'errors': [],
        }
        if only in ('offline', 'both'):
            from tracking.services import check_offline_devices, retry_offline_alert_pushes
            try:
                stats = check_offline_devices()
                self.stdout.write(f'[offline] check_offline_devices: {stats}')
                retry_stats = retry_offline_alert_pushes()
                self.stdout.write(f'[offline] retry_offline_alert_pushes: {retry_stats}')
                overall_stats['offline'] = {'check': stats, 'retry': retry_stats}
            except Exception as e:
                logger.exception(f'[offline] scheduler failed: {e}')
                self.stderr.write(self.style.ERROR(f'[offline] failed: {e}'))
                overall_stats['errors'].append(f'offline: {e}')

        if only in ('verification', 'both'):
            from tracking.verification_scheduler import run_verification_check
            try:
                stats = run_verification_check()
                self.stdout.write(f'[verification] run_verification_check: {stats}')
                overall_stats['verification'] = stats
            except Exception as e:
                logger.exception(f'[verification] scheduler failed: {e}')
                self.stderr.write(self.style.ERROR(f'[verification] failed: {e}'))
                overall_stats['errors'].append(f'verification: {e}')

        finished_at = timezone.now()
        overall_stats['finished_at'] = finished_at.isoformat()
        # QA-FIX-3 / C: ghi health file để monitoring phát hiện scheduler die.
        _write_health_file(overall_stats)
        # QA-FIX-5 / M2: ghi DB health — production endpoint đọc từ đây.
        _record_health_db(
            overall_stats, only=only,
            started_at=started_at.isoformat(),
            finished_at=finished_at.isoformat(),
            source='cron',
        )

    def _run_daemon(self, only):
        """Daemon mode — khởi động APScheduler chạy mỗi 1 phút."""
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger

        scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        # QA-FIX-3 / C: biến đếm lần chạy cho health logging định kỳ.
        run_counter = {'n': 0}
        health_log_every = int(os.environ.get('TRACKING_SCHEDULER_HEALTH_LOG_EVERY', '5'))

        def _run_once_internal():
            """Wrapper cho daemon — đếm lần chạy + health log."""
            run_counter['n'] += 1
            started_at = timezone.now()
            try:
                overall_stats = {
                    'started_at': started_at.isoformat(),
                    'run_number': run_counter['n'],
                    'offline': None,
                    'verification': None,
                    'errors': [],
                }
                if only in ('offline', 'both'):
                    from tracking.services import check_offline_devices, retry_offline_alert_pushes
                    try:
                        stats = check_offline_devices()
                        retry_stats = retry_offline_alert_pushes()
                        overall_stats['offline'] = {'check': stats, 'retry': retry_stats}
                    except Exception as e:
                        logger.exception(f'[offline] job failed: {e}')
                        overall_stats['errors'].append(f'offline: {e}')

                if only in ('verification', 'both'):
                    from tracking.verification_scheduler import run_verification_check
                    try:
                        stats = run_verification_check()
                        overall_stats['verification'] = stats
                    except Exception as e:
                        logger.exception(f'[verification] job failed: {e}')
                        overall_stats['errors'].append(f'verification: {e}')

                finished_at = timezone.now()
                overall_stats['finished_at'] = finished_at.isoformat()
                _write_health_file(overall_stats)
                # QA-FIX-5 / M2: ghi DB health cho daemon mode.
                _record_health_db(
                    overall_stats, only=only,
                    started_at=started_at.isoformat(),
                    finished_at=finished_at.isoformat(),
                    source='daemon',
                )

                # QA-FIX-3 / C: log heartbeat định kỳ để monitoring phát hiện
                # scheduler đang chạy (mặc định mỗi 5 lần = 5 phút nếu cron 1 phút).
                if run_counter['n'] % health_log_every == 0:
                    logger.info(
                        f'[run_tracking_schedulers] heartbeat run #{run_counter["n"]} '
                        f'— stats: {overall_stats}'
                    )
            except Exception as e:
                logger.exception(f'[run_tracking_schedulers] job failed: {e}')

        if only in ('offline', 'both'):
            scheduler.add_job(
                _run_once_internal,
                trigger=IntervalTrigger(minutes=1),
                id='tracking_schedulers',
                name='EduCareLink Tracking Schedulers (offline + verification)',
                replace_existing=True,
            )

        if only == 'verification':
            scheduler.add_job(
                _run_once_internal,
                trigger=IntervalTrigger(minutes=1),
                id='tracking_schedulers',
                name='EduCareLink Tracking Schedulers (verification only)',
                replace_existing=True,
            )

        scheduler.start()
        self.stdout.write(self.style.SUCCESS(
            f'[run_tracking_schedulers] Daemon started — health log every {health_log_every} runs. '
            'Press Ctrl+C to stop.'
        ))

        # Handle SIGTERM (Render dyno shutdown) + SIGINT (Ctrl+C)
        def _shutdown(signum, frame):
            self.stdout.write(self.style.WARNING(
                f'[run_tracking_schedulers] Received signal {signum} — shutting down...'
            ))
            scheduler.shutdown(wait=False)
            os._exit(0)

        signal.signal(signal.SIGTERM, _shutdown)
        signal.signal(signal.SIGINT, _shutdown)

        # Keep process alive
        try:
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            scheduler.shutdown(wait=False)
