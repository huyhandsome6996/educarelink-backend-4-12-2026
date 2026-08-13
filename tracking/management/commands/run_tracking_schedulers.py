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
unique_pending_check_per_task) đảm bảo即使 có 2 scheduler chạy đồng thời,
không tạo duplicate record.
"""

import os
import time
import logging
import signal

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger('educarelink.tracking.run_schedulers')


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
        if only in ('offline', 'both'):
            from tracking.services import check_offline_devices, retry_offline_alert_pushes
            try:
                stats = check_offline_devices()
                self.stdout.write(f'[offline] check_offline_devices: {stats}')
                retry_stats = retry_offline_alert_pushes()
                self.stdout.write(f'[offline] retry_offline_alert_pushes: {retry_stats}')
            except Exception as e:
                logger.exception(f'[offline] scheduler failed: {e}')
                self.stderr.write(self.style.ERROR(f'[offline] failed: {e}'))

        if only in ('verification', 'both'):
            from tracking.verification_scheduler import run_verification_check
            try:
                stats = run_verification_check()
                self.stdout.write(f'[verification] run_verification_check: {stats}')
            except Exception as e:
                logger.exception(f'[verification] scheduler failed: {e}')
                self.stderr.write(self.style.ERROR(f'[verification] failed: {e}'))

    def _run_daemon(self, only):
        """Daemon mode — khởi động APScheduler chạy mỗi 1 phút."""
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger

        scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        if only in ('offline', 'both'):
            from tracking.services import check_offline_devices, retry_offline_alert_pushes

            def _offline_job():
                try:
                    stats = check_offline_devices()
                    if stats.get('new_alerts', 0) > 0 or stats.get('already_alerted', 0) > 0:
                        logger.info(f'[offline] {stats}')
                    retry_offline_alert_pushes()
                except Exception as e:
                    logger.exception(f'[offline] job failed: {e}')

            scheduler.add_job(
                _offline_job,
                trigger=IntervalTrigger(minutes=1),
                id='offline_check',
                name='EduCareLink Device Offline Check',
                replace_existing=True,
            )

        if only in ('verification', 'both'):
            from tracking.verification_scheduler import run_verification_check

            def _verification_job():
                try:
                    run_verification_check()
                except Exception as e:
                    logger.exception(f'[verification] job failed: {e}')

            scheduler.add_job(
                _verification_job,
                trigger=IntervalTrigger(minutes=1),
                id='verification_check',
                name='EduCareLink Random Verification Check',
                replace_existing=True,
            )

        scheduler.start()
        self.stdout.write(self.style.SUCCESS(
            '[run_tracking_schedulers] Daemon started — press Ctrl+C to stop.'
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
