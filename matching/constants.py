"""
matching/constants.py — Nguồn sự thật DUY NHẤT cho:
  - 13 trạng thái JobPost + 16 trạng thái Booking (Step 12.1 / 12.2)
  - Bảng chuyển trạng thái data-driven (Step 12.1 / 12.2) — KHÔNG if-else rải rác
  - Nhãn tiếng Việt cho mọi enum (Step 12.3 rule 8)
  - 8 mã lý do hủy (Step 5.3) + phân loại force majeure
  - 16 mã notification (Step 8.3)
Mọi service/importer đều import từ đây. KHÔNG hardcode ở nơi khác.
"""

from django.db import models


# ═══════════════════════════════════════════════════════════════════
# 1. TRẠNG THÁI JOBPOST (Step 12.1 — 13 trạng thái)
# ═══════════════════════════════════════════════════════════════════
class JobPostStatus(models.TextChoices):
    DRAFT = 'draft', 'Bản nháp'
    PUBLISHED = 'published', 'Đã đăng'
    AI_PARSING = 'ai_parsing', 'AI đang phân tích'
    AI_PARSED = 'ai_parsed', 'Đã phân tích xong'
    AI_FAILED = 'ai_failed', 'Cần kiểm tra lại'
    NEEDS_ADMIN_REVIEW = 'needs_admin_review', 'Đang chờ kiểm duyệt'
    MATCHING = 'matching', 'Đang tìm CarePartner'
    CAREPARTNER_SELECTED = 'carepartner_selected', 'Đã chọn CarePartner'
    NEEDS_REPLACEMENT = 'needs_replacement', 'Cần người thay thế'
    IN_PROGRESS = 'in_progress', 'Đang thực hiện'
    COMPLETED = 'completed', 'Hoàn thành'
    CANCELLED_BY_PARENT = 'cancelled_by_parent', 'Đã hủy'
    EXPIRED = 'expired', 'Hết hạn'


# ═══════════════════════════════════════════════════════════════════
# 2. TRẠNG THÁI BOOKING (Step 12.2 — 16 trạng thái)
# ═══════════════════════════════════════════════════════════════════
class BookingStatus(models.TextChoices):
    PROPOSED = 'proposed', 'Được đề xuất'
    NOT_SELECTED = 'not_selected', 'Không được chọn'
    AWAITING_COMMITMENT = 'awaiting_commitment', 'Chờ cam kết'
    COMMITTED = 'committed', 'Đã cam kết'
    RESCHEDULE_REQUESTED = 'reschedule_requested', 'Đang xin đổi giờ'
    IN_PROGRESS = 'in_progress', 'Đang thực hiện'
    AWAITING_REVIEW = 'awaiting_review', 'Chờ đánh giá'
    COMPLETED = 'completed', 'Hoàn thành'
    DECLINED_IN_WINDOW = 'declined_in_window', 'Đã từ chối trong thời hạn'
    CANCELLED_BY_CAREPARTNER = 'cancelled_by_carepartner', 'CarePartner đã hủy'
    SUSPECTED_NO_SHOW = 'suspected_no_show', 'Nghi ngờ không đến'
    NO_SHOW = 'no_show', 'Không đến làm'
    NO_SHOW_UNCONFIRMED = 'no_show_unconfirmed', 'Chưa xác nhận không đến'
    CANCELLED_BY_PARENT = 'cancelled_by_parent', 'Phụ huynh đã hủy'
    EXPIRED_NO_RESPONSE = 'expired_no_response', 'Hết hạn phản hồi'
    DISPUTED = 'disputed', 'Có tranh chấp'


# Trạng thái Booking đang "chiếm" slot — dùng cho available_slots + khóa lịch
# (Step 9.3: awaiting_commitment | committed | reschedule_requested | in_progress)
BUSY_BOOKING_STATUSES = frozenset({
    BookingStatus.AWAITING_COMMITMENT,
    BookingStatus.COMMITTED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.IN_PROGRESS,
})

# Trạng thái JobPost trước khi bắt đầu làm — parent được phép hủy
# (Step 12.1: "any state before in_progress → cancelled_by_parent")
CANCELLABLE_JOBPOST_STATUSES = frozenset({
    JobPostStatus.PUBLISHED,
    JobPostStatus.AI_PARSING,
    JobPostStatus.AI_PARSED,
    JobPostStatus.AI_FAILED,
    JobPostStatus.NEEDS_ADMIN_REVIEW,
    JobPostStatus.MATCHING,
    JobPostStatus.CAREPARTNER_SELECTED,
    JobPostStatus.NEEDS_REPLACEMENT,
})

# Trạng thái Booking mà parent được phép hủy (Step 12.2 "any active state")
CANCELLABLE_BOOKING_STATUSES = frozenset({
    BookingStatus.AWAITING_COMMITMENT,
    BookingStatus.COMMITTED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.IN_PROGRESS,
    BookingStatus.SUSPECTED_NO_SHOW,
})

# ═══════════════════════════════════════════════════════════════════
# 3. NHÃN TIẾNG VIỆT DUY NHẤT cho UI (Step 12.3 rule 8 — enum không lộ ra UI)
# ═══════════════════════════════════════════════════════════════════
STATUS_LABELS_VI = {
    # JobPost (13)
    'draft': 'Bản nháp',
    'published': 'Đã đăng',
    'ai_parsing': 'AI đang phân tích',
    'ai_parsed': 'Đã phân tích xong',
    'ai_failed': 'Cần kiểm tra lại',
    'needs_admin_review': 'Đang chờ kiểm duyệt',
    'matching': 'Đang tìm CarePartner',
    'carepartner_selected': 'Đã chọn CarePartner',
    'needs_replacement': 'Cần người thay thế',
    'in_progress': 'Đang thực hiện',
    'completed': 'Hoàn thành',
    'cancelled_by_parent': 'Đã hủy',
    'expired': 'Hết hạn',
    # Booking (16)
    'proposed': 'Được đề xuất',
    'not_selected': 'Không được chọn',
    'awaiting_commitment': 'Chờ cam kết',
    'committed': 'Đã cam kết',
    'reschedule_requested': 'Đang xin đổi giờ',
    'awaiting_review': 'Chờ đánh giá',
    'declined_in_window': 'Đã từ chối trong thời hạn',
    'cancelled_by_carepartner': 'CarePartner đã hủy',
    'suspected_no_show': 'Nghi ngờ không đến',
    'no_show': 'Không đến làm',
    'no_show_unconfirmed': 'Chưa xác nhận không đến',
    'cancelled_by_parent': 'Phụ huynh đã hủy',
    'expired_no_response': 'Hết hạn phản hồi',
    'disputed': 'Có tranh chấp',
}


def get_status_label_vi(status_value):
    """Nhãn tiếng Việt cho 1 enum value (dùng chung mobile + web admin)."""
    return STATUS_LABELS_VI.get(status_value, status_value)


# ═══════════════════════════════════════════════════════════════════
# 4. BẢNG CHUYỂN TRẠNG THÁI (data-driven — Step 12.1 / 12.2)
# from_status -> frozenset(to_status)
# ═══════════════════════════════════════════════════════════════════
JOBPOST_TRANSITIONS = {
    JobPostStatus.DRAFT: frozenset({JobPostStatus.PUBLISHED}),
    JobPostStatus.PUBLISHED: frozenset({
        JobPostStatus.AI_PARSING,
        JobPostStatus.NEEDS_ADMIN_REVIEW,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.AI_PARSING: frozenset({
        JobPostStatus.AI_PARSED,
        JobPostStatus.AI_FAILED,
        JobPostStatus.NEEDS_ADMIN_REVIEW,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.AI_FAILED: frozenset({
        JobPostStatus.AI_PARSED,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.NEEDS_ADMIN_REVIEW: frozenset({
        JobPostStatus.AI_PARSED,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.AI_PARSED: frozenset({
        JobPostStatus.MATCHING,
        JobPostStatus.NEEDS_ADMIN_REVIEW,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.MATCHING: frozenset({
        JobPostStatus.CAREPARTNER_SELECTED,
        JobPostStatus.EXPIRED,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.CAREPARTNER_SELECTED: frozenset({
        JobPostStatus.NEEDS_REPLACEMENT,
        JobPostStatus.IN_PROGRESS,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.NEEDS_REPLACEMENT: frozenset({
        JobPostStatus.CAREPARTNER_SELECTED,
        JobPostStatus.MATCHING,
        JobPostStatus.EXPIRED,
        JobPostStatus.CANCELLED_BY_PARENT,
    }),
    JobPostStatus.IN_PROGRESS: frozenset({JobPostStatus.COMPLETED}),
    JobPostStatus.COMPLETED: frozenset(),
    JobPostStatus.CANCELLED_BY_PARENT: frozenset(),
    JobPostStatus.EXPIRED: frozenset(),
}

BOOKING_TRANSITIONS = {
    BookingStatus.PROPOSED: frozenset({
        BookingStatus.AWAITING_COMMITMENT,
        BookingStatus.NOT_SELECTED,
    }),
    BookingStatus.NOT_SELECTED: frozenset(),
    BookingStatus.AWAITING_COMMITMENT: frozenset({
        BookingStatus.COMMITTED,
        BookingStatus.DECLINED_IN_WINDOW,
        BookingStatus.RESCHEDULE_REQUESTED,
        BookingStatus.CANCELLED_BY_PARENT,
        BookingStatus.DISPUTED,
    }),
    BookingStatus.COMMITTED: frozenset({
        BookingStatus.RESCHEDULE_REQUESTED,
        BookingStatus.IN_PROGRESS,
        BookingStatus.SUSPECTED_NO_SHOW,
        BookingStatus.CANCELLED_BY_CAREPARTNER,
        BookingStatus.CANCELLED_BY_PARENT,
        BookingStatus.DISPUTED,
    }),
    BookingStatus.RESCHEDULE_REQUESTED: frozenset({
        BookingStatus.COMMITTED,
        BookingStatus.EXPIRED_NO_RESPONSE,
        BookingStatus.CANCELLED_BY_CAREPARTNER,
        BookingStatus.CANCELLED_BY_PARENT,
        BookingStatus.DISPUTED,
    }),
    BookingStatus.IN_PROGRESS: frozenset({
        BookingStatus.AWAITING_REVIEW,
        BookingStatus.CANCELLED_BY_PARENT,
        BookingStatus.DISPUTED,
    }),
    BookingStatus.AWAITING_REVIEW: frozenset({
        BookingStatus.COMPLETED,
        BookingStatus.DISPUTED,
    }),
    BookingStatus.COMPLETED: frozenset(),
    BookingStatus.SUSPECTED_NO_SHOW: frozenset({
        BookingStatus.IN_PROGRESS,
        BookingStatus.NO_SHOW,
        BookingStatus.NO_SHOW_UNCONFIRMED,
        BookingStatus.CANCELLED_BY_PARENT,
        BookingStatus.DISPUTED,
    }),
    BookingStatus.NO_SHOW: frozenset({BookingStatus.DISPUTED}),
    BookingStatus.NO_SHOW_UNCONFIRMED: frozenset({BookingStatus.DISPUTED}),
    BookingStatus.DECLINED_IN_WINDOW: frozenset(),
    BookingStatus.CANCELLED_BY_CAREPARTNER: frozenset(),
    BookingStatus.CANCELLED_BY_PARENT: frozenset(),
    BookingStatus.EXPIRED_NO_RESPONSE: frozenset(),
    BookingStatus.DISPUTED: frozenset({
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
        BookingStatus.CANCELLED_BY_CAREPARTNER,
        BookingStatus.CANCELLED_BY_PARENT,
    }),
}


def is_valid_transition(transition_map, from_status, to_status) -> bool:
    """Kiểm tra 1 bước chuyển có nằm trong bảng không (Step 12.3 rule 1)."""
    allowed = transition_map.get(from_status)
    if allowed is None:
        return False
    return to_status in allowed


# ═══════════════════════════════════════════════════════════════════
# 4. LÝ DO HỦY (Step 5.3 — 8 mã)
# ═══════════════════════════════════════════════════════════════════
CANCEL_CLASS_FORCE_MAJEURE = 'force_majeure'
CANCEL_CLASS_NORMAL = 'normal_cancel'

CANCEL_REASONS = {
    'school_schedule':   ('Trùng lịch học đột xuất', CANCEL_CLASS_FORCE_MAJEURE),
    'health':            ('Sức khỏe không tốt', CANCEL_CLASS_FORCE_MAJEURE),
    'family_emergency':  ('Việc gia đình khẩn cấp', CANCEL_CLASS_FORCE_MAJEURE),
    'accident':          ('Tai nạn / sự cố di chuyển', CANCEL_CLASS_FORCE_MAJEURE),
    'wrong_job_info':    ('Thông tin công việc không đúng mô tả', CANCEL_CLASS_FORCE_MAJEURE),
    'transport':         ('Không thể di chuyển', CANCEL_CLASS_NORMAL),
    'personal':          ('Lý do cá nhân', CANCEL_CLASS_NORMAL),
    'other':             ('Khác (bắt buộc ghi chú)', CANCEL_CLASS_NORMAL),
}

FORCE_MAJEURE_CODES = frozenset(
    code for code, (_, klass) in CANCEL_REASONS.items()
    if klass == CANCEL_CLASS_FORCE_MAJEURE
)

# Ghi chú bắt buộc tối thiểu cho force majeure (Step 5.3)
FORCE_MAJEURE_MIN_NOTE_CHARS = 20
# Anti-abuse: tối đa 2 force majeure / rolling 30 ngày (Step 5.3)
FORCE_MAJEURE_MAX_PER_30D = 2


# ═══════════════════════════════════════════════════════════════════
# 5. MÃ NOTIFICATION (Step 8.3 — 16 template)
# ═══════════════════════════════════════════════════════════════════
NOTIFICATION_CLASS_CRITICAL = 'critical'
NOTIFICATION_CLASS_IMPORTANT = 'important'
NOTIFICATION_CLASS_INFO = 'info'

# (audience, klass) — tiêu đề/nội dung nằm trong NotificationTemplate DB
NOTIFICATION_CODES = {
    'job_assigned':            ('carepartner', 'critical'),
    'booking_committed':       ('carepartner', 'important'),
    'carepartner_declined':    ('parent', 'critical'),
    'carepartner_cancelled':   ('parent', 'critical'),
    'carepartner_no_show':     ('parent', 'critical'),
    'replacement_found':       ('parent', 'critical'),
    'no_replacement':          ('parent', 'important'),
    'compensation_issued':     ('parent', 'important'),
    'job_reminder_60m':        ('both', 'critical'),
    'reschedule_requested':    ('parent', 'critical'),
    'reschedule_answer_needed': ('parent', 'critical'),
    'review_requested':        ('both', 'info'),
    'elo_band_changed':        ('carepartner', 'important'),
    'account_suspended':       ('carepartner', 'critical'),
    'appeal_decided':          ('carepartner', 'critical'),
    'blackout_paused':         ('carepartner', 'important'),
}

# ═══════════════════════════════════════════════════════════════════
# 6. HẰNG SỐ NGHIỆP VỤ KHÁC (giá trị MẶC ĐỊNH — cấu hình thật nằm DB
# MatchingConfig, seed_matching_config nạp; đọc qua matching/config.py)
# ═══════════════════════════════════════════════════════════════════
DEFAULT_CONFIG = {
    # Step 10 — buffer 90 phút giữa 2 job liên tiếp
    'BUFFER_MINUTES': 90,
    # Step 5.2 — commitment window (phút)
    'COMMIT_WINDOW_24H': 60,
    'COMMIT_WINDOW_6H': 30,
    'COMMIT_WINDOW_1H': 15,
    'COMMIT_WINDOW_URGENT': 5,
    'COMMIT_MIN_MARGIN_MIN': 5,
    # Step 10 — soft lock TTL
    'SOFT_LOCK_TTL_SECONDS': 300,
    # Step 2 — số ứng viên tối đa
    'MAX_CANDIDATES': 8,
    # Bán kính mặc định (km) khi CP không tự cấu hình
    'DEFAULT_MAX_RADIUS_KM': 20,
    # Step 7.2 — giá giờ fallback khi thiếu dữ liệu
    'FALLBACK_HOURLY_RATE_VND': 100000,
    # Step 7.4 — no-show: start + 15 phút chưa start → suspected_no_show
    'NO_SHOW_GRACE_MINUTES': 15,
    'NO_SHOW_PARENT_TIMEOUT_HOURS': 24,
    # Step 5.3 / 7.6 — anti-abuse
    'FORCE_MAJEURE_MAX_30D': 2,
    'MAX_APPEALS_30D': 3,
    'APPEAL_WINDOW_DAYS': 7,
    # Step 9 — reschedule
    'MAX_RESCHEDULE_PER_BOOKING': 2,
    'RESCHEDULE_IDLE_MINUTES': 30,
    # Step 9.2 — blackout
    'MAX_BLACKOUTS_FUTURE': 30,
    'BLACKOUT_PAUSE_DAYS': 14,
    # Step 6.5 — recovery cooldown sau T5/T6
    'RECOVERY_COOLDOWN_DAYS': 7,
    # Step 5.1.8 — auto-complete sau 24h chờ review
    'REVIEW_AUTO_CLOSE_HOURS': 24,
    # Step 8.5 — auto-replacement retry
    'REPLACEMENT_RETRY_MINUTES': 30,
    'REPLACEMENT_RETRY_WINDOW_HOURS': 6,
}

# Nhãn tiếng Việt cho 7 factor matching (Step 11.6)
MATCHING_FACTORS = (
    ('availability', 'Khung giờ phù hợp', 25),
    ('skills', 'Kỹ năng / chuyên ngành', 20),
    ('distance', 'Khoảng cách', 15),
    ('rating', 'Đánh giá sao', 15),
    ('completion', 'Tỷ lệ hoàn thành', 10),
    ('elo', 'Điểm tin nhiệm', 10),
    ('response', 'Tốc độ phản hồi', 5),
)

# match_level -> nhãn tiếng Việt (Step 2 API contract + Step 3 UI)
MATCH_LEVEL_LABELS_VI = {
    'very_high': 'Rất phù hợp',
    'high': 'Phù hợp cao',
    'medium': 'Khá phù hợp',
    'low': 'Phù hợp thấp',
}
