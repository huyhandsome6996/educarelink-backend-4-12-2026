"""
python manage.py seed_matching_config

Nạp cấu hình nghiệp vụ vào DB (Step 6.2 / 7.1 / 8.3 / 11.6 + MatchingConfig):
  - 6 EloBand         — thresholds + multiplier
  - 7 CancelPolicy    — T0..T6
  - 7 MatchingWeight  — trọng số 7-factor
  - 16 NotificationTemplate — copy tiếng Việt Step 8.3
  - MatchingConfig    — BUFFER_MINUTES, COMMIT_WINDOW_*, ...
  - CarePartnerProfile cho mọi worker hiện có (hidden_elo=1200)
  - Chuyển WorkerAvailability cũ → CarePartnerAvailability (một lần, idempotent)

IDEMPOTENT: chạy lại không nhân bản (update_or_create / get_or_create).
"""

import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from matching.constants import DEFAULT_CONFIG
from matching.models import (
    CancelPolicy,
    CarePartnerAvailability,
    CarePartnerProfile,
    EloBand,
    MatchingConfig,
    MatchingWeight,
    NotificationTemplate,
)


class Command(BaseCommand):
    help = 'Seed cấu hình nghiệp vụ matching (EloBand, CancelPolicy, MatchingWeight, NotificationTemplate, MatchingConfig) — idempotent'

    @transaction.atomic
    def handle(self, *args, **options):
        self._seed_elo_bands()
        self._seed_cancel_policies()
        self._seed_matching_weights()
        self._seed_notification_templates()
        self._seed_matching_config()
        self._seed_carepartner_profiles()
        self._migrate_old_availability()
        self.stdout.write(self.style.SUCCESS('Seed matching config HOÀN TẤT (idempotent).'))

    # ─────────────────────────────────────────────────────────
    def _seed_elo_bands(self):
        bands = [
            # name, min, max, multiplier, max_proposals/day, label_vi, excluded, only_when_pool_below
            ('trusted',    1450, 2000, '1.15', None, 'CarePartner đáng tin cậy', False, None),
            ('good',       1250, 1449, '1.05', None, 'Phản hồi tốt / Đúng giờ', False, None),
            ('normal',     1050, 1249, '1.00', None, '', False, None),
            ('watch',       850, 1049, '0.85', 4,    'Cần cải thiện phản hồi', False, None),
            ('restricted',  650,  849, '0.60', 1,    'Đang bị hạn chế đề xuất', False, 8),
            ('blocked',       0,  649, '0.60', None, 'Tạm khóa - liên hệ hỗ trợ', True, None),
        ]
        for name, lo, hi, mult, maxp, label, excluded, pool_below in bands:
            EloBand.objects.update_or_create(
                name=name,
                defaults=dict(min_elo=lo, max_elo=hi, rank_multiplier=mult,
                              max_proposals_per_day=maxp, label_vi=label,
                              excluded_from_matching=excluded,
                              only_when_pool_below=pool_below))
        self.stdout.write(f'  ✓ EloBand: {EloBand.objects.count()} band')

    def _seed_cancel_policies(self):
        # tier, trigger, min_lead, max_lead, elo, pct, min_comp, repeat_window, repeat_threshold, escalate_to, suspend
        policies = [
            ('T0', 'in_window', None, None,   -5,   0,     0, 30, None, '',    0),
            ('T1', 'lead_time', 1440, None,  -15,   0,     0, 30, None, '',    0),
            ('T2', 'lead_time',  360, 1440,  -30,  10,     0, 30, None, '',    0),
            ('T3', 'lead_time',  180,  360,  -50,  20,     0, 30, None, '',    0),
            ('T4', 'lead_time',    0,  180,  -80,  30,     0, 30, 2,    'T5',  0),
            ('T5', 'no_show',   None, None, -150,  50, 50000, 30, 2,    'T6',  7),
            ('T6', 'escalation', None, None, -250, 100,     0, 30, None, '',   30),
        ]
        for tier, trigger, mn, mx, elo, pct, minc, rwin, rthr, esc, susp in policies:
            CancelPolicy.objects.update_or_create(
                tier=tier,
                defaults=dict(trigger=trigger, min_lead_minutes=mn, max_lead_minutes=mx,
                              elo_delta=elo, compensation_pct=pct,
                              min_compensation_vnd=minc,
                              force_majeure_multiplier='0.50',
                              repeat_window_days=rwin, repeat_threshold=rthr,
                              escalate_to=esc, suspend_days=susp, is_active=True))
        self.stdout.write(f'  ✓ CancelPolicy: {CancelPolicy.objects.count()} tier')

    def _seed_matching_weights(self):
        weights = [
            ('availability', 25), ('skills', 20), ('distance', 15),
            ('rating', 15), ('completion', 10), ('elo', 10), ('response', 5),
        ]
        for factor, pct in weights:
            MatchingWeight.objects.update_or_create(
                factor=factor, defaults=dict(weight_pct=pct, is_active=True))
        self.stdout.write(f'  ✓ MatchingWeight: {MatchingWeight.objects.count()} factor (tổng '
                          f'{sum(w.weight_pct for w in MatchingWeight.objects.filter(is_active=True))})')

    def _seed_notification_templates(self):
        tpls = [
            # code, klass, audience, title, body
            ('job_assigned', 'critical', 'carepartner', 'Bạn có đơn mới',
             'Bạn được giao đơn này vì bạn đã khai rảnh vào khung giờ đó. Xem chi tiết ngay.'),
            ('booking_committed', 'important', 'carepartner', 'Đơn đã được xác nhận',
             'Bạn cần có mặt đúng giờ vào {time} ngày {date}.'),
            ('carepartner_declined', 'critical', 'parent', 'CarePartner vừa từ chối công việc',
             'CarePartner {name} không thể nhận công việc này. Hệ thống đang đề xuất người thay thế.'),
            ('carepartner_cancelled', 'critical', 'parent', 'CarePartner vừa hủy lịch',
             'CarePartner {name} vừa hủy lịch. Bạn có muốn xem danh sách CarePartner thay thế không?'),
            ('carepartner_no_show', 'critical', 'parent', 'CarePartner không đến',
             'Chúng tôi rất tiếc. Hệ thống đã tìm người thay thế và gửi bù {amount}đ vào ví của bạn.'),
            ('replacement_found', 'critical', 'parent', 'Đã tìm được người thay thế',
             'Chúng tôi tìm thấy {n} CarePartner khác phù hợp với công việc của bạn.'),
            ('no_replacement', 'important', 'parent', 'Chưa có CarePartner phù hợp',
             'Hiện tại chưa có CarePartner phù hợp ngay. Hệ thống sẽ thông báo khi có người mới.'),
            ('compensation_issued', 'important', 'parent', 'Đã nhận đền bù',
             'Bạn nhận được {amount}đ credit do đơn bị hủy. Xem ví của bạn.'),
            ('job_reminder_60m', 'critical', 'both', 'Sắp đến giờ',
             'Đơn bắt đầu lúc {time}. Vui lòng có mặt đúng giờ.'),
            ('reschedule_requested', 'critical', 'parent', 'Yêu cầu đổi giờ',
             'CarePartner {name} đề xuất đổi từ {old} sang {new}. Bạn có đồng ý không?'),
            ('reschedule_answer_needed', 'critical', 'parent', 'Sắp hết hạn phản hồi',
             'Bạn còn {minutes} phút để trả lời yêu cầu đổi giờ của CarePartner {name}.'),
            ('review_requested', 'info', 'both', 'Đánh giá đơn',
             'Hãy đánh giá để hệ thống ghép cặp tốt hơn.'),
            ('elo_band_changed', 'important', 'carepartner', 'Mức ưu tiên thay đổi',
             '{label}. Hoàn thành thêm đơn đúng giờ để cải thiện.'),
            ('account_suspended', 'critical', 'carepartner', 'Tài khoản bị tạm khóa',
             '{reason}. Bạn có thể gửi kháng cáo trong 7 ngày.'),
            ('appeal_decided', 'critical', 'carepartner', 'Kết quả kháng cáo',
             '{result}. {admin_note}'),
            ('blackout_paused', 'important', 'carepartner', 'Tạm dừng đề xuất',
             'Bạn đã đánh dấu không rảnh 14 ngày liên tiếp. Hệ thống tạm dừng đề xuất đơn.'),
        ]
        for code, klass, audience, title, body in tpls:
            NotificationTemplate.objects.update_or_create(
                code=code,
                defaults=dict(klass=klass, audience=audience, title_vi=title, body_vi=body,
                              sound='critical_alert.wav' if klass == 'critical' else None,
                              is_active=True))
        self.stdout.write(f'  ✓ NotificationTemplate: {NotificationTemplate.objects.count()} template')

    def _seed_matching_config(self):
        notes = {
            'BUFFER_MINUTES': 'Buffer tối thiểu giữa 2 job liên tiếp của cùng CP (Step 10)',
            'COMMIT_WINDOW_24H': 'Cửa sổ cam kết khi job bắt đầu >24h (phút)',
            'COMMIT_WINDOW_6H': 'Cửa sổ cam kết khi job bắt đầu 6-24h (phút)',
            'COMMIT_WINDOW_1H': 'Cửa sổ cam kết khi job bắt đầu 1-6h (phút)',
            'COMMIT_WINDOW_URGENT': 'Cửa sổ cam kết khi job bắt đầu <1h (phút)',
            'COMMIT_MIN_MARGIN_MIN': 'Window phải kết thúc trước giờ job ít nhất X phút',
        }
        for key, value in DEFAULT_CONFIG.items():
            MatchingConfig.objects.update_or_create(
                key=key, defaults=dict(value_json=value, note=notes.get(key, '')))
        self.stdout.write(f'  ✓ MatchingConfig: {MatchingConfig.objects.count()} key')

    def _seed_carepartner_profiles(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        normal_band = EloBand.objects.filter(name='normal').first()
        created = 0
        for worker in User.objects.filter(role='worker'):
            profile, was_created = CarePartnerProfile.objects.get_or_create(user=worker)
            if was_created:
                profile.hidden_elo = 1200
                profile.effective_elo = 1200
                profile.band = normal_band
                profile.save()
                created += 1
        self.stdout.write(f'  ✓ CarePartnerProfile: tạo mới {created}, tổng '
                          f'{CarePartnerProfile.objects.count()}')

    def _migrate_old_availability(self):
        """Chuyển WorkerAvailability (start_time/end_time) → CarePartnerAvailability
        (time_from/time_to) một lần duy nhất, không nhân bản."""
        from core.models import WorkerAvailability
        copied = skipped = 0
        for w in WorkerAvailability.objects.all():
            obj, was_created = CarePartnerAvailability.objects.get_or_create(
                carepartner=w.worker, weekday=w.weekday,
                time_from=w.start_time, time_to=w.end_time)
            copied += 1 if was_created else 0
            skipped += 0 if was_created else 1
        if copied or skipped:
            self.stdout.write(f'  ✓ Chuyển lịch rảnh cũ → mới: {copied} tạo, {skipped} đã có')
