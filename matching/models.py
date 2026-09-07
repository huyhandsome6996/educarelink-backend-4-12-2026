"""
matching/models.py — Toàn bộ schema luồng Ghép cặp Flow 1.

Quy ước BẮT BUỘC:
  - Mọi model MỚI dùng UUIDField làm PK (model cũ core.* giữ int PK).
  - FK tới core.User. KHÔNG đụng Task/TaskApplication (luồng cũ vẫn chạy song song).
  - Mọi con số nghiệp vụ đọc từ DB config (EloBand / CancelPolicy / MatchingWeight /
    MatchingConfig) — KHÔNG hardcode tại nơi sử dụng.
  - Notification ở đây là bảng MỚI của app matching (Step 8.7), KHÔNG liên quan
    core.models.Notification (bảng thông báo cũ cho admin).

Chia 5 section: (1) Job + Booking, (2) ELO, (3) Hủy + Credit, (4) Lịch + Khóa,
(5) Config + AI + Notification + Log.
"""

import uuid

from django.conf import settings
from django.db import models

from .constants import (
    BookingStatus,
    JobPostStatus,
    NOTIFICATION_CODES,
    CANCEL_REASONS,
)


def _vi_choices(mapping):
    """Chuyển dict {code: (label, ...)} thành choices Django."""
    return [(code, label) for code, (label, *_rest) in mapping.items()]


# ═══════════════════════════════════════════════════════════════════
# SECTION 1 — JOB POST + SLOT + BOOKING (Step 1 / 5 / 12)
# ═══════════════════════════════════════════════════════════════════

class JobPost(models.Model):
    """Bài đăng việc của phụ huynh — chỉ 3 loại: gia sư / trông trẻ / đón trẻ.

    Bài đăng đi qua state machine 13 trạng thái (JobPostStatus). Dữ liệu riêng
    từng loại job nằm trong type_data JSON (schema ở matching/services/job_schema.py,
   Prompt 05). Gemini parse kết quả ghi vào title/description/type_data với
    ai_parse_status = ok | repaired | fallback.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='matching_job_posts', verbose_name='Phụ huynh',
    )

    class JobType(models.TextChoices):
        TUTORING = 'tutoring', 'Gia sư'
        CHILDCARE = 'childcare', 'Trông trẻ'
        PICKUP = 'pickup', 'Đón trẻ'

    job_type = models.CharField(max_length=20, choices=JobType.choices, db_index=True,
                                help_text='Chỉ 3 loại — parent chọn tường minh, AI không được đè')
    title = models.CharField(max_length=255, blank=True, default='',
                             help_text='Gemini sinh sau khi parse (tiếng Việt)')
    description = models.TextField(blank=True, default='',
                                   help_text='Mô tả công việc (Gemini viết lại hoặc parent nhập)')
    type_data = models.JSONField(default=dict, blank=True,
                                 help_text='Field riêng theo job_type (dates, time, form fields...)')
    hourly_rate_vnd = models.PositiveIntegerField(help_text='Giá/giờ (VND) — bắt buộc > 0')
    status = models.CharField(max_length=30, choices=JobPostStatus.choices,
                              default=JobPostStatus.DRAFT, db_index=True,
                              help_text='13 trạng thái theo Step 12.1')

    # Kết quả AI parse (Step 11)
    ai_parse_status = models.CharField(max_length=20, blank=True, default='',
                                       help_text='ok | repaired | fallback — rỗng khi chưa parse')
    ai_parse_result = models.JSONField(default=dict, blank=True,
                                       help_text='Kết quả parse đầy đủ của Gemini (audit)')
    clarification_questions = models.JSONField(default=list, blank=True,
                                               help_text='Câu hỏi làm rõ khi confidence < 0.6')

    # Vị trí làm việc
    latitude = models.FloatField(null=True, blank=True, help_text='Vĩ độ địa điểm làm việc')
    longitude = models.FloatField(null=True, blank=True, help_text='Kinh độ địa điểm làm việc')
    location_note = models.CharField(max_length=255, blank=True, default='',
                                     help_text='Ghi chú vị trí (cổng, tầng, điểm đón...)')

    # Lặp lại hàng tuần (Step 2.3): {"pattern": "weekly", "weekdays": [2,4,6], "until": "2026-05-30"}
    recurrence = models.JSONField(default=dict, blank=True,
                                  help_text='Rỗng = làm 1 lần; weekly = lặp theo weekday')

    # An toàn + ghép cặp
    needs_admin_review = models.BooleanField(default=False,
                                             help_text='Safety flag mức high → chờ admin duyệt')
    gender_preference = models.CharField(max_length=10, blank=True, default='',
                                         help_text='Chỉ cho phép childcare/pickup; tutoring bỏ qua')
    total_matched = models.PositiveIntegerField(null=True, blank=True,
                                                help_text='Số CP qua hard filter (UX: "47 CP phù hợp, hiển thị 8")')
    selected_carepartner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='selected_matching_jobs', help_text='CP đang nhận/giao đơn')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bài đăng việc (Flow mới)'
        verbose_name_plural = 'Bài đăng việc (Flow mới)'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['parent', 'status'], name='idx_jobpost_parent_status'),
            models.Index(fields=['status', 'created_at'], name='idx_jobpost_status_created'),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(hourly_rate_vnd__gt=0),
                                   name='check_jobpost_rate_positive'),
        ]

    def __str__(self):
        return f"[{self.get_job_type_display()}] {self.title or '(chưa có tiêu đề)'} — {self.get_status_display()}"


class JobSlot(models.Model):
    """Một khung giờ cụ thể của JobPost (1 job có thể nhiều ngày/recurring).

    JobSlot KHÔNG cho phép giờ cắt qua nửa đêm (time_to > time_from trong cùng date).
    """

    class SlotStatus(models.TextChoices):
        FREE = 'free', 'Trống'
        LOCKED = 'locked', 'Đã khóa'
        DONE = 'done', 'Hoàn tất'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(JobPost, on_delete=models.CASCADE, related_name='slots',
                            verbose_name='Bài đăng')
    date = models.DateField(help_text='Ngày làm việc')
    time_from = models.TimeField(help_text='Giờ bắt đầu (VD: 19:00)')
    time_to = models.TimeField(help_text='Giờ kết thúc — phải trong cùng ngày, > time_from')
    status = models.CharField(max_length=10, choices=SlotStatus.choices,
                              default=SlotStatus.FREE, db_index=True)

    class Meta:
        verbose_name = 'Khung giờ công việc'
        verbose_name_plural = 'Khung giờ công việc'
        ordering = ['date', 'time_from']
        constraints = [
            models.UniqueConstraint(fields=['job', 'date', 'time_from'],
                                    name='uniq_job_slot_start'),
            models.CheckConstraint(condition=models.Q(time_from__lt=models.F('time_to')),
                                   name='check_jobslot_time_from_lt_to'),
        ]
        indexes = [
            models.Index(fields=['date', 'time_from'], name='idx_jobslot_date_time'),
        ]

    def __str__(self):
        return f"{self.job_id} — {self.date} {self.time_from:%H:%M}-{self.time_to:%H:%M}"


class Booking(models.Model):
    """Mối ghép Phụ huynh ↔ CarePartner (Step 5 — auto-commit).

    Parent chọn CP → booking tạo NGAY ở awaiting_commitment (KHÔNG cần CP bấm đồng ý).
    total_value_vnd frozen lúc chọn = hourly_rate × số giờ/slot × số slot —
    dùng để tính đền bù Step 7. elo_delta_applied ghi tổng ELO đã áp cho booking này.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(JobPost, on_delete=models.CASCADE, related_name='bookings')
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='carepartner_bookings')
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name='parent_bookings')
    status = models.CharField(max_length=30, choices=BookingStatus.choices,
                              default=BookingStatus.AWAITING_COMMITMENT, db_index=True)

    selected_at = models.DateTimeField(help_text='Thời điểm parent chọn CP')
    commit_deadline = models.DateTimeField(help_text='selected_at + commitment window (Step 5.2)')
    committed_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    total_value_vnd = models.PositiveIntegerField(help_text='Giá trị đơn frozen lúc chọn — > 0')

    # Thông tin hủy (Step 5.3 + 7)
    cancel_reason_code = models.CharField(max_length=30, blank=True, default='',
                                          choices=_vi_choices(CANCEL_REASONS))
    cancel_class = models.CharField(max_length=20, blank=True, default='',
                                    help_text='force_majeure | normal_cancel')
    cancel_note = models.TextField(blank=True, default='')
    cancel_evidence = models.JSONField(default=list, blank=True,
                                       help_text='Tối đa 3 file, 5MB/file (jpg/png/pdf)')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(max_length=20, blank=True, default='',
                                    help_text='carepartner | parent | system | admin')

    compensation_vnd = models.PositiveIntegerField(default=0,
                                                   help_text='Số tiền credit đã đền bù parent')
    elo_delta_applied = models.IntegerField(default=0,
                                            help_text='Tổng delta ELO đã ghi cho booking')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Booking (ghép cặp)'
        verbose_name_plural = 'Booking (ghép cặp)'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['carepartner', 'status'], name='idx_booking_cp_status'),
            models.Index(fields=['job', 'status'], name='idx_booking_job_status'),
            models.Index(fields=['status', 'commit_deadline'], name='idx_booking_status_deadline'),
        ]
        constraints = [
            models.UniqueConstraint(fields=['job', 'carepartner'],
                                    name='uniq_job_carepartner_booking'),
            models.CheckConstraint(condition=models.Q(total_value_vnd__gt=0),
                                   name='check_booking_value_positive'),
        ]

    def __str__(self):
        return f"Booking {self.job_id}:{self.carepartner_id} — {self.get_status_display()}"


# ═══════════════════════════════════════════════════════════════════
# SECTION 2 — HIDDEN ELO (Step 6)
# ═══════════════════════════════════════════════════════════════════

class EloBand(models.Model):
    """6 bậc tin nhiệm — thresholds + multiplier NẰM TRONG DB (Step 6.2).

    Sửa row này → band thay đổi ngay không cần deploy (kèm management command
    recompute_elo_bands để tính lại toàn bộ CP).
    """

    name = models.CharField(max_length=20, unique=True,
                            help_text='trusted | good | normal | watch | restricted | blocked')
    min_elo = models.IntegerField(help_text='Điểm ELO tối thiểu của band')
    max_elo = models.IntegerField(help_text='Điểm ELO tối đa của band (bao gồm biên)')
    rank_multiplier = models.DecimalField(max_digits=4, decimal_places=2,
                                          help_text='Nhân với điểm match cuối (VD 1.15)')
    max_proposals_per_day = models.PositiveIntegerField(null=True, blank=True,
                                                        help_text='Giới hạn đề xuất/ngày; null = không giới hạn')
    label_vi = models.CharField(max_length=100, help_text='Nhãn hiển thị cho CP (không lộ số)')
    excluded_from_matching = models.BooleanField(default=False,
                                                 help_text='blocked = loại khỏi matching hoàn toàn')
    only_when_pool_below = models.PositiveIntegerField(null=True, blank=True,
                                                       help_text='restricted chỉ hiện khi pool < giá trị này; null = luôn hiện')

    class Meta:
        verbose_name = 'Bậc tin nhiệm (ELO)'
        verbose_name_plural = 'Bậc tin nhiệm (ELO)'
        ordering = ['-min_elo']

    def __str__(self):
        return f"{self.name} [{self.min_elo}..{self.max_elo}] ×{self.rank_multiplier}"


class CarePartnerProfile(models.Model):
    """Hồ sơ tin nhiệm + hồ sơ ghép cặp của CarePartner (Step 6.1).

    hidden_elo là điểm gốc (default 1200); effective_elo là điểm ĐÃ cộng
    reward/penalty (có decay) — cache để matching không tính lại mỗi query.
    CẢ HAI KHÔNG BAO GIỜ xuất hiện trong serializer client (Step 6.7).
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='carepartner_profile')
    hidden_elo = models.IntegerField(default=1200, help_text='Điểm gốc — default 1200, clamp [400,2000]')
    effective_elo = models.FloatField(null=True, blank=True,
                                      help_text='Cache điểm hiệu quả — không lộ ra client')
    band = models.ForeignKey(EloBand, on_delete=models.SET_NULL, null=True, blank=True)
    band_updated_at = models.DateTimeField(null=True, blank=True)

    # Throttle/hiệu lực trong matching
    matching_paused = models.BooleanField(default=False,
                                          help_text='True = 14 ngày nghỉ liên tiếp hoặc admin tạm dừng')
    suspended_until = models.DateTimeField(null=True, blank=True,
                                           help_text='T5 ×2 / T6 → tạm khóa nhận việc (Step 7.1)')
    auto_replace = models.BooleanField(default=False,
                                       help_text='Cho phép tự động nhận người thay khi CP hủy (Step 8.5.6)')

    # Sở thích ghép cặp
    max_radius_km = models.PositiveIntegerField(null=True, blank=True,
                                                help_text='null → dùng DEFAULT_MAX_RADIUS_KM (20)')
    has_vehicle = models.BooleanField(default=False, help_text='Có xe — khoảng cách hiệu quả ×0.75')
    school = models.CharField(max_length=255, blank=True, default='')
    major = models.CharField(max_length=255, blank=True, default='')
    skills = models.JSONField(default=list, blank=True,
                              help_text='Danh sách skill code (VD: ["toan","tieu_hoc","kien_nhan"])')

    # Bộ đếm cho 7-factor scoring (Step 11.6) — cập nhật khi booking đổi trạng thái
    jobs_completed = models.PositiveIntegerField(default=0)
    jobs_cancelled = models.PositiveIntegerField(default=0)
    jobs_no_show = models.PositiveIntegerField(default=0)
    rating_avg = models.FloatField(default=0, help_text='Điểm sao trung bình 0-5')
    review_count = models.PositiveIntegerField(default=0)
    responded_within_sla = models.PositiveIntegerField(default=0,
                                                       help_text='Số lần ack trong 15 phút SLA')
    responses_total = models.PositiveIntegerField(default=0)
    streak_count = models.PositiveIntegerField(default=0,
                                               help_text='Số đơn hoàn thành liên tiếp không hủy')
    streak_last_milestone = models.PositiveIntegerField(default=0,
                                                        help_text='Mốc streak đã thưởng gần nhất (3/5/10)')
    profile_complete_awarded = models.BooleanField(default=False,
                                                   help_text='profile_complete chỉ thưởng 1 lần')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Hồ sơ CarePartner (tin nhiệm)'
        verbose_name_plural = 'Hồ sơ CarePartner (tin nhiệm)'

    def __str__(self):
        return f"Profile {self.user} — band {self.band}"


class EloLedger(models.Model):
    """Sổ cái ELO — MỖI thay đổi ghi ĐÚNG 1 row (Step 6.1).

    Idempotent per (booking, reason_code) qua UniqueConstraint — khi booking NULL
    (sự kiện không gắn đơn) Postgres/SQLite cho phép nhiều row cùng reason_code
    (NULL distinct) — đúng ý thiết kế.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='elo_ledger')
    delta = models.IntegerField(help_text='Dương = thưởng, âm = phạt')
    reason_code = models.CharField(max_length=40, db_index=True,
                                   help_text='job_completed / review_5 / T0..T6 / admin_adjust...')
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='elo_events')
    elo_before = models.IntegerField(help_text='Điểm hiệu quả trước khi ghi')
    elo_after = models.IntegerField(help_text='Điểm hiệu quả sau khi ghi')
    decay_at = models.DateTimeField(null=True, blank=True,
                                    help_text='Chỉ penalty — mốc bắt đầu giảm trừ')
    note = models.TextField(blank=True, default='')
    created_by_admin = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='elo_adjustments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Sổ cái ELO'
        verbose_name_plural = 'Sổ cái ELO'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['carepartner', 'created_at'], name='idx_elo_cp_created'),
            models.Index(fields=['reason_code', 'created_at'], name='idx_elo_reason_created'),
        ]
        constraints = [
            models.UniqueConstraint(fields=['booking', 'reason_code'],
                                    name='uniq_elo_event_per_booking'),
        ]

    def __str__(self):
        return f"{self.carepartner_id} {self.reason_code} {self.delta:+d}"


class CandidateProposal(models.Model):
    """Nhật ký ĐỀ XUẤT ứng viên (Step 6.6.5 — throttle đề xuất/ngày theo band).

    Matching engine (Step 2) ghi 1 row mỗi lần CP xuất hiện trong candidate list.
    EloService.can_receive_proposal đếm row theo ngày lịch Asia/Ho_Chi_Minh.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(JobPost, on_delete=models.CASCADE, related_name='proposals')
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='matching_proposals')
    match_score = models.PositiveIntegerField(default=0, help_text='Điểm match tại thời điểm đề xuất')
    match_level = models.CharField(max_length=12, blank=True, default='',
                                   help_text='very_high | high | medium | low')
    proposed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Lượt đề xuất ứng viên'
        verbose_name_plural = 'Lượt đề xuất ứng viên'
        ordering = ['-proposed_at']
        indexes = [
            models.Index(fields=['carepartner', 'proposed_at'], name='idx_proposal_cp_time'),
        ]
        constraints = [
            models.UniqueConstraint(fields=['job', 'carepartner'],
                                    name='uniq_proposal_per_job_cp'),
        ]

    def __str__(self):
        return f"{self.carepartner_id} đề xuất cho job {self.job_id} ({self.match_score})"


# ═══════════════════════════════════════════════════════════════════
# SECTION 3 — HỦY / PHẠT / ĐỀN BÙ CREDIT (Step 7 + quyết định LOCKED #1)
# ═══════════════════════════════════════════════════════════════════

class CancelPolicy(models.Model):
    """Bảng phạt T0→T6 — MỌI SỐ ĐỌC TỪ ĐÂY, không hardcode (Step 7.1).

    trigger giúp cancellation_service chọn tier đúng:
      in_window (T0) | lead_time (T1-T4 theo khoảng lead phút) |
      no_show (T5) | escalation (T6).
    """

    class PolicyTrigger(models.TextChoices):
        IN_WINDOW = 'in_window', 'Hủy trong cửa sổ cam kết'
        LEAD_TIME = 'lead_time', 'Hủy theo thời gian báo trước'
        NO_SHOW = 'no_show', 'Không đến làm'
        ESCALATION = 'escalation', 'Vi phạm lặp lại / bị khóa'

    tier = models.CharField(max_length=4, unique=True, help_text='T0..T6')
    trigger = models.CharField(max_length=12, choices=PolicyTrigger.choices)
    min_lead_minutes = models.IntegerField(null=True, blank=True,
                                           help_text='Lead time tối thiểu (phút); null = không xét')
    max_lead_minutes = models.IntegerField(null=True, blank=True,
                                           help_text='Lead time tối đa; null = vô cực')
    elo_delta = models.IntegerField(help_text='Delta ELO (âm) — VD: -150 cho T5')
    compensation_pct = models.PositiveIntegerField(help_text='% giá trị đơn đền bù parent')
    min_compensation_vnd = models.PositiveIntegerField(default=0,
                                                       help_text='Sàn đền bù (T5 = 50.000)')
    force_majeure_multiplier = models.DecimalField(max_digits=3, decimal_places=2, default=0.5,
                                                   help_text='ELO ×0.5 với force majeure; ĐỀN BÙ KHÔNG GIẢM')
    repeat_window_days = models.PositiveIntegerField(default=30)
    repeat_threshold = models.PositiveIntegerField(null=True, blank=True,
                                                   help_text='Bao nhiêu lần trong window thì escalate')
    escalate_to = models.CharField(max_length=4, blank=True, default='',
                                   help_text='Tier nâng cấp khi lặp (VD T4 ×2 → T5)')
    suspend_days = models.PositiveIntegerField(default=0,
                                               help_text='Số ngày tạm khóa nhận việc')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Chính sách phạt hủy (T0-T6)'
        verbose_name_plural = 'Chính sách phạt hủy (T0-T6)'
        ordering = ['tier']

    def __str__(self):
        return f"{self.tier} ({self.get_trigger_display()}) — ELO {self.elo_delta:+d}, đền {self.compensation_pct}%"


class CreditBalance(models.Model):
    """Ví credit ảo của phụ huynh (Step 7.3 — quyết định LOCKED #1).

    Đền bù bằng credit ảo KHÔNG phải tiền thật; credit dùng trừ phí dịch vụ
    đơn sau, không rút được. (Tên cũ trong spec: ParentWallet.)
    """

    parent = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name='credit_balance')
    credit_vnd = models.PositiveIntegerField(default=0, help_text='Số dư credit (VND)')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ví credit phụ huynh'
        verbose_name_plural = 'Ví credit phụ huynh'

    def __str__(self):
        return f"Ví {self.parent} — {self.credit_vnd}đ credit"


class CreditTransaction(models.Model):
    """1 giao dịch credit (đền bù từ booking bị hủy / dùng trừ phí dịch vụ).

    Tương đương Compensation trong spec Step 7.8 nhưng đổi tên theo yêu cầu
    owner (master prompt). Idempotent: 1 booking chỉ có 1 row platform_credit.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='credit_transactions')
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name='credit_transactions')
    amount_vnd = models.PositiveIntegerField(help_text='Số credit (+ phát sinh / - sử dụng)')
    KIND_CHOICES = (
        ('platform_credit', 'Đền bù credit từ hệ thống'),
        ('service_fee_offset', 'Dùng trừ phí dịch vụ'),
        ('admin_adjust', 'Admin điều chỉnh'),
    )
    kind = models.CharField(max_length=30, choices=KIND_CHOICES, default='platform_credit')
    STATUS_CHOICES = (
        ('issued', 'Đã phát hành'),
        ('used', 'Đã sử dụng'),
        ('revoked', 'Đã thu hồi'),
    )
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='issued')
    issued_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True, default='',
                            help_text='VD: "T3 - CarePartner hủy trước 4h"')

    class Meta:
        verbose_name = 'Giao dịch credit'
        verbose_name_plural = 'Giao dịch credit'
        ordering = ['-issued_at']
        indexes = [
            models.Index(fields=['parent', 'issued_at'], name='idx_credit_parent_time'),
        ]
        constraints = [
            models.UniqueConstraint(fields=['booking', 'kind'],
                                    condition=models.Q(kind='platform_credit'),
                                    name='uniq_compensation_per_booking'),
        ]

    def __str__(self):
        return f"{self.parent} {self.amount_vnd:+d}đ ({self.get_kind_display()})"


class Appeal(models.Model):
    """Kháng cáo phạt của CarePartner — admin quyết định cuối (Step 7.6).

    Max 3 đơn / rolling 30 ngày; đơn thứ 4 auto-reject. Approve → ghi row
    EloLedger ngược (reason_code=appeal_approved); ĐỀN BÙ PARENT GIỮ NGUYÊN.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='appeals')
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='appeals')
    reason_code = models.CharField(max_length=30)
    note = models.TextField(help_text='Tối thiểu 20 ký tự')
    evidence = models.JSONField(default=list, blank=True, help_text='Tối đa 3 file, 5MB/file')
    ai_precheck = models.JSONField(null=True, blank=True,
                                   help_text='{"verdict": "...", "rationale": "..."} — chỉ mang tính tham khảo')
    STATUS_CHOICES = (
        ('pending', 'Đang chờ'),
        ('approved', 'Đã chấp nhận'),
        ('partially_approved', 'Chấp nhận một phần'),
        ('rejected', 'Đã từ chối'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                              null=True, blank=True, related_name='appeal_decisions')
    admin_note = models.TextField(blank=True, default='')
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Kháng cáo'
        verbose_name_plural = 'Kháng cáo'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['carepartner', 'created_at'], name='idx_appeal_cp_time')]

    def __str__(self):
        return f"Kháng cáo {self.carepartner} cho booking {self.booking_id} — {self.get_status_display()}"


class ParentTrustFlag(models.Model):
    """Cờ tin nhiệm phụ huynh (Step 7.7) — chỉ admin xem, MVP không có score."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name='trust_flags')
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='trust_flags')
    code = models.CharField(max_length=30, help_text='late_cancel | repeated_late_cancel')
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Cờ tin nhiệm phụ huynh'
        verbose_name_plural = 'Cờ tin nhiệm phụ huynh'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.parent} — {self.code}"


# ═══════════════════════════════════════════════════════════════════
# SECTION 4 — LỊCH RẢNH + BLACKOUT + KHÓA + ĐỔI GIỜ (Step 4 / 9 / 10)
# ═══════════════════════════════════════════════════════════════════

class CarePartnerAvailability(models.Model):
    """Khung giờ rảnh LẶP TUẦN của CP — bảng MỚI chuẩn spec (Step 4).

    Tách khỏi core.WorkerAvailability để: (1) UUID PK theo quy ước model mới,
    (2) field time_from/time_to đúng spec, (3) luồng cũ vẫn chạy song song.
    weekday 0=Thứ Hai .. 6=Chủ Nhật (giống quy ước WorkerAvailability cũ).
    Window cắt nửa đêm (22:00-01:00) ĐƯỢC Serializer tách thành 2 row
    22:00-23:59 và 00:00-01:00 ngày sau (Step 9.3).
    """

    WEEKDAY_CHOICES = (
        (0, 'Thứ Hai'), (1, 'Thứ Ba'), (2, 'Thứ Tư'), (3, 'Thứ Năm'),
        (4, 'Thứ Sáu'), (5, 'Thứ Bảy'), (6, 'Chủ Nhật'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='availability_windows_v2')
    weekday = models.IntegerField(choices=WEEKDAY_CHOICES,
                                  help_text='0=Thứ Hai ... 6=Chủ Nhật')
    time_from = models.TimeField(help_text='Giờ bắt đầu (trong ngày)')
    time_to = models.TimeField(help_text='Giờ kết thúc (trong ngày, > time_from)')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Lịch rảnh tuần (Flow mới)'
        verbose_name_plural = 'Lịch rảnh tuần (Flow mới)'
        ordering = ['carepartner', 'weekday', 'time_from']
        constraints = [
            models.UniqueConstraint(fields=['carepartner', 'weekday', 'time_from', 'time_to'],
                                    name='uniq_availability_window_v2'),
            models.CheckConstraint(condition=models.Q(time_from__lt=models.F('time_to')),
                                   name='check_availability_time_from_lt_to'),
        ]
        indexes = [models.Index(fields=['carepartner', 'weekday'], name='idx_avail_cp_weekday')]

    def __str__(self):
        return f"{self.carepartner} — {self.get_weekday_display()} {self.time_from:%H:%M}-{self.time_to:%H:%M}"


class CarePartnerBlackout(models.Model):
    """Ngày bận đột xuất (Step 9.2) — "thường Thứ 2 rảnh nhưng ngày này bận".

    time_from/time_to null = BẬN CẢ NGÀY. Tạo blackout trùng booking → 409
    blackout_conflicts_with_booking (phải hủy/đổi giờ chính thức trước).
    """

    REASON_CHOICES = (
        ('exam', 'Thi / kiểm tra'),
        ('health', 'Sức khỏe'),
        ('family', 'Việc gia đình'),
        ('travel', 'Đi xa'),
        ('personal', 'Cá nhân'),
        ('other', 'Khác'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='blackouts')
    date = models.DateField(help_text='Ngày bận')
    time_from = models.TimeField(null=True, blank=True, help_text='null = bận cả ngày')
    time_to = models.TimeField(null=True, blank=True)
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Ngày không nhận việc (blackout)'
        verbose_name_plural = 'Ngày không nhận việc (blackout)'
        ordering = ['date', 'time_from']
        constraints = [
            models.UniqueConstraint(fields=['carepartner', 'date', 'time_from', 'time_to'],
                                    name='uniq_blackout_slot'),
        ]
        indexes = [models.Index(fields=['carepartner', 'date'], name='idx_blackout_cp_date')]

    def __str__(self):
        hours = 'cả ngày' if not self.time_from else f'{self.time_from:%H:%M}-{self.time_to:%H:%M}'
        return f"{self.carepartner} bận {self.date} ({hours})"


class SlotLock(models.Model):
    """Khóa slot chống double-booking (Step 10).

    soft: hold 5 phút khi parent đang xem (expires_at set, tự hết hạn).
    hard: khóa thật khi booking tạo — expires_at NULL — tồn tại đến khi
    booking hủy/hoàn thành (release_locks).
    Overlap hard-lock chặn ở service (SELECT ... FOR UPDATE + all-or-nothing).
    """

    class LockType(models.TextChoices):
        SOFT = 'soft', 'Khóa mềm (hold 5 phút)'
        HARD = 'hard', 'Khóa cứng (booking thật)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    carepartner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                    related_name='slot_locks')
    job = models.ForeignKey(JobPost, on_delete=models.CASCADE, null=True, blank=True,
                            related_name='slot_locks')
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, null=True, blank=True,
                                related_name='slot_locks')
    date = models.DateField()
    time_from = models.TimeField()
    time_to = models.TimeField()
    lock_type = models.CharField(max_length=6, choices=LockType.choices)
    expires_at = models.DateTimeField(null=True, blank=True,
                                      help_text='Chỉ soft lock — hết hạn tự dọn')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Khóa slot lịch'
        verbose_name_plural = 'Khóa slot lịch'
        indexes = [
            models.Index(fields=['carepartner', 'date'], name='idx_lock_cp_date'),
            models.Index(fields=['lock_type', 'expires_at'], name='idx_lock_type_expiry'),
        ]

    def __str__(self):
        return f"{self.get_lock_type_display()} {self.carepartner} {self.date} {self.time_from:%H:%M}-{self.time_to:%H:%M}"


class RescheduleRequest(models.Model):
    """Yêu cầu đổi giờ của CP — parent duyệt (Step 9 Rule 3). Max 2/booking."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='reschedules')
    new_date = models.DateField()
    new_time_from = models.TimeField()
    new_time_to = models.TimeField()
    reason = models.CharField(max_length=255, blank=True, default='')
    STATUS_CHOICES = (
        ('pending', 'Đang chờ parent trả lời'),
        ('approved', 'Parent đã đồng ý'),
        ('declined', 'Parent đã từ chối'),
        ('expired', 'Hết hạn không trả lời'),
    )
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='pending',
                              db_index=True)
    parent_deadline = models.DateTimeField(help_text='Hạn parent trả lời (bảng lead time Step 9.1)')
    responded_at = models.DateTimeField(null=True, blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True,
                                            help_text='Đã gửi nhắc ở 50% deadline')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Yêu cầu đổi giờ'
        verbose_name_plural = 'Yêu cầu đổi giờ'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['booking', 'status'], name='idx_reschedule_booking_status')]

    def __str__(self):
        return f"Đổi giờ booking {self.booking_id} → {self.new_date} {self.new_time_from:%H:%M}"


# ═══════════════════════════════════════════════════════════════════
# SECTION 5 — CONFIG + AI + NOTIFICATION + LOG
# ═══════════════════════════════════════════════════════════════════

class MatchingWeight(models.Model):
    """Trọng số 7-factor — ĐỌC TỪ DB (Step 11.6). Tổng các row active = 100,
    validate ở clean() khi save."""

    factor = models.CharField(max_length=20, unique=True,
                              help_text='availability | skills | distance | rating | completion | elo | response')
    weight_pct = models.PositiveIntegerField(help_text='% trọng số (tổng 7 row active = 100)')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Trọng số matching'
        verbose_name_plural = 'Trọng số matching'

    def clean(self):
        from django.core.exceptions import ValidationError
        active = MatchingWeight.objects.filter(is_active=True).exclude(pk=self.pk)
        total = sum(w.weight_pct for w in active) + (self.weight_pct if self.is_active else 0)
        if self.is_active and total != 100:
            raise ValidationError(
                {'weight_pct': f'Tổng trọng số các factor đang bật phải = 100 (hiện = {total}).'})

    def __str__(self):
        return f"{self.factor}: {self.weight_pct}%"


class MatchingConfig(models.Model):
    """Key-value config nghiệp vụ (buffer, commitment window, sàn đền bù...).

    Đổi giá trị = data change, không deploy. Đọc qua matching/config.get_config().
    """

    key = models.CharField(max_length=50, unique=True)
    value_json = models.JSONField(help_text='Giá trị (số, chuỗi, list...)')
    note = models.CharField(max_length=255, blank=True, default='',
                            help_text='Mô tả ý nghĩa key')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cấu hình matching'
        verbose_name_plural = 'Cấu hình matching'

    def __str__(self):
        return f"{self.key} = {self.value_json}"


class NotificationTemplate(models.Model):
    """16 template thông báo tiếng Việt (Step 8.3) — sửa copy không cần release."""

    code = models.CharField(max_length=40, unique=True,
                            choices=_vi_choices(NOTIFICATION_CODES))
    klass = models.CharField(max_length=10, help_text='critical | important | info')
    audience = models.CharField(max_length=15, help_text='parent | carepartner | both')
    title_vi = models.CharField(max_length=255)
    body_vi = models.TextField(help_text='Dùng placeholder {name} {time} {amount}...')
    sound = models.CharField(max_length=64, null=True, blank=True,
                             help_text='critical_alert.wav cho class critical')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Template thông báo'
        verbose_name_plural = 'Template thông báo'

    def __str__(self):
        return f"{self.code} ({self.klass})"


class Notification(models.Model):
    """Notification v2 của luồng ghép cặp (Step 8.7) — KHÔNG liên quan
    core.models.Notification. Enqueue trong transaction, gửi sau on_commit."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='matching_notifications')
    code = models.CharField(max_length=40, help_text='Mã template')
    klass = models.CharField(max_length=10, help_text='critical | important | info')
    title_vi = models.CharField(max_length=255)
    body_vi = models.TextField()
    data = models.JSONField(default=dict, blank=True, help_text='Deep-link payload')
    channels = models.JSONField(default=list, blank=True, help_text='["push","inapp","webpush"]')
    status = models.CharField(max_length=12, default='queued',
                              help_text='queued | sent | delivered | failed | read')
    attempts = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Thông báo (Flow mới)'
        verbose_name_plural = 'Thông báo (Flow mới)'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at'], name='idx_notif_user_time'),
            models.Index(fields=['user', 'status'], name='idx_notif_user_status'),
        ]

    def __str__(self):
        return f"[{self.klass}] {self.title_vi} → {self.user}"


class DeviceToken(models.Model):
    """Token push đa nền tảng (Step 8.7) — mobile lưu 1 field trên User cũ,
    bảng này chuẩn hóa cho cả web push."""

    PLATFORM_CHOICES = (
        ('expo', 'Expo (React Native)'),
        ('web', 'Web Push'),
        ('ios', 'iOS native'),
        ('android', 'Android native'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='device_tokens')
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES, default='expo')
    token = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Thiết bị nhận push'
        verbose_name_plural = 'Thiết bị nhận push'
        constraints = [
            models.UniqueConstraint(fields=['user', 'token'], name='uniq_user_device_token'),
        ]

    def __str__(self):
        return f"{self.user} ({self.platform})"


class ReplacementAttempt(models.Model):
    """Nhật ký chạy tìm người thay (Step 8.5.8) — beat task ghi mỗi lần chạy."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(JobPost, on_delete=models.CASCADE, related_name='replacement_attempts')
    attempt_no = models.PositiveIntegerField()
    candidate_count = models.PositiveIntegerField(default=0)
    auto_assigned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Lượt tìm người thay'
        verbose_name_plural = 'Lượt tìm người thay'
        ordering = ['-created_at']

    def __str__(self):
        return f"Job {self.job_id} lần {self.attempt_no}: {self.candidate_count} ứng viên"


class PromptTemplate(models.Model):
    """Template prompt Gemini (Step 11.8) — code chỉ tham chiếu key."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=60, db_index=True)
    version = models.CharField(max_length=10, default='v1')
    body = models.TextField()
    variables = models.JSONField(default=list, blank=True)
    model = models.CharField(max_length=60, default='gemini-2.5-flash')
    temperature = models.FloatField(default=0.1)
    max_output_tokens = models.PositiveIntegerField(default=1200)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Prompt template (AI)'
        verbose_name_plural = 'Prompt template (AI)'
        constraints = [
            models.UniqueConstraint(fields=['key', 'version'], name='uniq_prompt_key_version'),
        ]

    def __str__(self):
        return f"{self.key}@{self.version}"


class AiCallLog(models.Model):
    """Nhật ký mỗi lần gọi AI (Step 11.8) — token/latency để kiểm soát chi phí."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prompt_key = models.CharField(max_length=60)
    prompt_version = models.CharField(max_length=10)
    model = models.CharField(max_length=60)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=12, help_text='ok | repaired | fallback | error')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Log gọi AI'
        verbose_name_plural = 'Log gọi AI'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.prompt_key}@{self.prompt_version} {self.status} {self.latency_ms}ms"


class StateTransitionLog(models.Model):
    """Log MỖI lần chuyển trạng thái JobPost/Booking (Step 12.4) — read-only."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.CharField(max_length=12, help_text='job_post | booking')
    entity_id = models.UUIDField()
    from_status = models.CharField(max_length=30)
    to_status = models.CharField(max_length=30)
    actor = models.CharField(max_length=15, help_text='parent | carepartner | system | admin')
    actor_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='state_transitions')
    reason = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Log chuyển trạng thái'
        verbose_name_plural = 'Log chuyển trạng thái'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entity', 'entity_id', 'created_at'],
                         name='idx_stlog_entity_time'),
        ]

    def __str__(self):
        return f"{self.entity}:{str(self.entity_id)[:8]} {self.from_status} → {self.to_status}"
