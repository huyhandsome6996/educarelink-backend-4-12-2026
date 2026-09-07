"""
matching/services/elo_service.py — Hidden ELO Trust Score (Step 6).

QUY TẮC TUYỆT ĐỐI:
  - hidden_elo / effective_elo KHÔNG BAO GIỜ lộ ra client (serializer cấm —
    có test grep CI). CP chỉ thấy band label + mô tả sự kiện không số.
  - Mỗi thay đổi ghi ĐÚNG 1 row EloLedger; idempotent per (booking, reason_code).
  - Effective = hidden_elo(base 1200) + Σ(rewards) + Σ(penalty × decay_factor),
    clamp [400, 2000]; rewards KHÔNG decay; cooldown 7 ngày sau T5/T6 →
    mọi reward dương chỉ tính 50%.
  - Delta thưởng/phạt MẶC ĐỊNH nằm hằng class-level; delta tier T0-T6 ĐỌC
    từ bảng CancelPolicy.
"""

import logging
import math

from datetime import datetime as _dt, time as _time
from decimal import Decimal, ROUND_HALF_UP
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..constants import (
    BookingStatus,
    FORCE_MAJEURE_CODES,
)
from ..models import (
    Booking,
    CandidateProposal,
    CarePartnerProfile,
    CancelPolicy,
    EloBand,
    EloLedger,
)

logger = logging.getLogger('educarelink.matching.elo')

# Điểm ELO biên
ELO_MIN = 400
ELO_MAX = 2000
ELO_BASE_DEFAULT = 1200

# Bảng thưởng mặc định (Step 6.3) — reason_code -> delta
# (parent_cancelled_compensation = +5/+10 tùy Step 7.7 → caller truyền delta_override)
ELO_REWARD_DELTAS = {
    'job_completed': 12,
    'review_5': 10,
    'review_4': 6,
    'review_3': 1,
    'review_bad': -8,
    'positive_review_text': 4,
    'streak_3': 8,
    'streak_5': 15,
    'streak_10': 30,
    'clean_month': 10,
    'profile_complete': 5,
    'fast_ack': 2,
    'reschedule_ok': 1,
    'parent_cancelled_compensation': 5,   # +10 khi parent hủy <3h — caller override
    'slow_ack_repeat': -6,
    'parent_report_valid': -25,
    'appeal_abuse': -10,
    'appeal_approved': 0,                  # row đảo phạt — delta truyền qua override
    'admin_adjust': 0,                     # row admin chỉnh tay — delta bắt buộc override
}

# Sự kiện phạt — cần decay theo tuổi
PENALTY_REASONS = frozenset({
    'review_bad', 'slow_ack_repeat', 'parent_report_valid', 'appeal_abuse',
})

# Sự kiện chỉ được xảy ra 1 lần mỗi account
ONE_TIME_REASONS = frozenset({'profile_complete'})

# Sự kiện giới hạn theo ngày lịch VN
DAILY_LIMIT_REASONS = {'fast_ack': 1}

# Mốc streak
STREAK_MILESTONES = {3: 'streak_3', 5: 'streak_5', 10: 'streak_10'}


class EloService:
    """Toàn bộ logic đọc/ghi điểm tin nhiệm ẩn."""

    # ─────────────────────────────────────────────────────────────
    # Xác định delta cho 1 reason_code
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def resolve_delta(reason_code, delta_override=None):
        """Trả về (delta, is_penalty_tier_code). Tier T0-T6 đọc từ CancelPolicy."""
        if delta_override is not None:
            return int(delta_override), reason_code.upper() in EloService._all_tier_codes()

        tier_policies = {p.tier: p.elo_delta for p in CancelPolicy.objects.filter(is_active=True)}
        if reason_code.upper() in tier_policies:
            return tier_policies[reason_code.upper()], True
        if reason_code in ELO_REWARD_DELTAS:
            return ELO_REWARD_DELTAS[reason_code], False
        raise ValueError(f'Không biết reason_code ELO: {reason_code!r}')

    # ─────────────────────────────────────────────────────────────
    # Decay + cooldown (hàm thuần, dễ test)
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _decay_factor(created_at, now):
        """Hệ số giảm trừ penalty theo tuổi (Step 6.5) — biên theo NGÀY:
        0-30 ngày ×1.00, 31-90 ×0.60, 91-180 ×0.25, >180 ×0.00.
        30 ngày 23h59 vẫn ×1.00 vì floor(age_days) = 30."""
        if created_at is None:
            return 1.0
        age_seconds = (now - created_at).total_seconds()
        if age_seconds <= 0:
            return 1.0
        age_days = math.floor(age_seconds / 86400)
        if age_days <= 30:
            return 1.00
        if age_days <= 90:
            return 0.60
        if age_days <= 180:
            return 0.25
        return 0.00

    _TIER_CODES_CACHE = None

    @classmethod
    def _tier_codes_at_or_below(cls, min_abs_delta=150):
        """Các reason_code tier có |delta| >= min_abs_delta (T5, T6)."""
        codes = set()
        for p in CancelPolicy.objects.filter(is_active=True):
            if abs(p.elo_delta) >= min_abs_delta:
                codes.add(p.tier)
        return codes

    @classmethod
    def _all_tier_codes(cls):
        if cls._TIER_CODES_CACHE is None:
            cls._TIER_CODES_CACHE = {
                p.tier for p in CancelPolicy.objects.filter(is_active=True)}
        return cls._TIER_CODES_CACHE

    @staticmethod
    def _in_recovery_cooldown(carepartner, now, cooldown_days=7):
        """True nếu CP đang trong 7 ngày phục hồi sau T5/T6 (Step 6.5)."""
        threshold = now - timezone.timedelta(days=cooldown_days)
        tier_codes = EloService._tier_codes_at_or_below(150)
        if not tier_codes:
            return False
        return EloLedger.objects.filter(
            carepartner=carepartner,
            reason_code__in=tier_codes,
            delta__lt=0,
            created_at__gte=threshold,
        ).exists()

    # ─────────────────────────────────────────────────────────────
    # Recompute effective + band
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def recompute(profile, now=None):
        """Tính lại effective_elo + band, cache lên profile (cùng transaction caller).

        Effective = hidden_elo + Σ rewards(+cooldown 50%) + Σ(penalty × factor).
        Làm tròn 1 chữ số thập phân ROUND_HALF_UP khi cache.
        """
        now = now or timezone.now()
        base = profile.hidden_elo if profile.hidden_elo is not None else ELO_BASE_DEFAULT

        cooldown_days = _get_int_config('RECOVERY_COOLDOWN_DAYS', 7)
        in_cooldown = EloService._in_recovery_cooldown(profile.user, now, cooldown_days)

        rewards = 0.0
        penalties = 0.0
        rows = EloLedger.objects.filter(carepartner=profile.user).only(
            'delta', 'reason_code', 'created_at')
        for row in rows:
            if row.delta > 0:
                # Rewards KHÔNG decay; cooldown sau T5/T6 → 50% (Step 6.5)
                rewards += row.delta * (0.5 if in_cooldown else 1.0)
            elif row.delta < 0:
                # Mọi penalty decay theo tuổi (Step 6.5)
                penalties += row.delta * EloService._decay_factor(row.created_at, now)

        effective = base + rewards + penalties
        effective = max(float(ELO_MIN), min(float(ELO_MAX), effective))
        # ROUND_HALF_UP 1 chữ số thập phân
        effective_f = float(Decimal(str(effective)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))

        band = EloService.determine_band(effective_f)
        profile.effective_elo = effective_f
        old_band = profile.band
        profile.band = band
        profile.band_updated_at = now
        profile.save(update_fields=['effective_elo', 'band', 'band_updated_at'])

        # Notify khi band đổi (Step 8.3 elo_band_changed) — enqueue at commit
        if old_band is not None and band is not None and old_band.pk != band.pk:
            from .notification_service import NotificationService
            NotificationService.enqueue(
                profile.user, 'elo_band_changed',
                data={'old_band': old_band.name, 'new_band': band.name},
                ctx={'label': band.label_vi},
            )
        return effective_f, band

    @staticmethod
    def determine_band(effective_elo):
        """Chọn band theo [min_elo, max_elo] đọc từ DB."""
        for band in EloBand.objects.all():
            if band.min_elo <= effective_elo <= band.max_elo:
                return band
        # Fallback an toàn: band gần nhất theo min_elo
        return (EloBand.objects.order_by('-min_elo').first()
                or EloBand.objects.first())

    # ─────────────────────────────────────────────────────────────
    # apply_event — điểm vào DUY NHẤT ghi ledger
    # ─────────────────────────────────────────────────────────────
    @classmethod
    def apply_event(cls, carepartner, reason_code, booking=None, delta_override=None,
                    admin=None, note='', created_at=None):
        """Ghi 1 sự kiện ELO. Idempotent per (booking, reason_code).

        Trả về (ledger, applied_bool). Gọi 2 lần cùng cặp → no-op trả lần đầu.
        Caller nên bọc trong transaction.atomic() — hàm tự dùng savepoint.
        """
        try:
            with transaction.atomic():
                profile = cls.get_profile(carepartner)
                delta, is_tier = cls.resolve_delta(reason_code, delta_override)

                # Guard 1 lần / account
                if reason_code in ONE_TIME_REASONS and profile.profile_complete_awarded:
                    return None, False
                # Guard theo ngày lịch VN (VD fast_ack max 1/ngày)
                daily_limit = DAILY_LIMIT_REASONS.get(reason_code)
                if daily_limit:
                    day_start = timezone.make_aware(
                        _dt.combine(timezone.localdate(), _time.min))
                    if EloLedger.objects.filter(
                            carepartner=carepartner, reason_code=reason_code,
                            created_at__gte=day_start).count() >= daily_limit:
                        logger.info('[ELO] %s vượt giới hạn ngày cho %s',
                                    carepartner_id(carepartner), reason_code)
                        return None, False

                elo_before = int(profile.effective_elo or profile.hidden_elo or ELO_BASE_DEFAULT)
                # decay_at: mọi penalty carry mốc decay (Step 6.1) — nếu caller
                # không backdate thì decay_at = thời điểm ghi
                penalty_time = created_at or timezone.now()
                ledger = EloLedger.objects.create(
                    carepartner=carepartner,
                    delta=delta,
                    reason_code=reason_code,
                    booking=booking,
                    elo_before=elo_before,
                    elo_after=elo_before,  # recompute sẽ ghi đúng
                    decay_at=penalty_time if delta < 0 else None,
                    note=note or '',
                    created_by_admin=admin,
                )
                effective, band = cls.recompute(profile)
                ledger.elo_after = int(effective)
                ledger.save(update_fields=['elo_after'])

                # Đánh dấu sự kiện 1-lần đã thưởng
                if reason_code == 'profile_complete' and not profile.profile_complete_awarded:
                    profile.profile_complete_awarded = True
                    profile.save(update_fields=['profile_complete_awarded'])
                return ledger, True
        except IntegrityError:
            # (booking, reason_code) đã tồn tại — no-op, trả row cũ
            existing = EloLedger.objects.filter(booking=booking, reason_code=reason_code).first()
            logger.info('[ELO] Idempotent skip: %s / %s', carepartner_id(carepartner), reason_code)
            return existing, False

    # ─────────────────────────────────────────────────────────────
    # Subscore + band gates cho matching
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def effective_subscore(effective_elo):
        """elo_subscore (Step 6.6.1) = clamp((eff-650)/800×100, 0, 120)."""
        raw = (effective_elo - 650) / 800.0 * 100.0
        return max(0.0, min(120.0, raw))

    @staticmethod
    def is_matchable(profile, now=None):
        """Hard gate: blocked band / paused / suspended / tài khoản không hợp lệ."""
        now = now or timezone.now()
        user = profile.user
        if not (user.is_active and getattr(user, 'is_approved', False)):
            return False
        if profile.matching_paused:
            return False
        if profile.suspended_until and profile.suspended_until > now:
            return False
        band = profile.band
        if band is not None and band.excluded_from_matching:
            return False
        return True

    @staticmethod
    def is_allowed_in_pool(profile, pool_size):
        """restricted chỉ hiện khi pool < band.only_when_pool_below (Step 6.2)."""
        band = profile.band
        if band is None:
            return True
        if band.excluded_from_matching:
            return False
        if band.only_when_pool_below is not None and pool_size >= band.only_when_pool_below:
            return False
        return True

    @staticmethod
    def can_receive_proposal(carepartner, when=None):
        """Throttle đề xuất/ngày theo band, đếm theo ngày lịch VN (Step 6.6.5)."""
        when = when or timezone.now()
        profile = EloService.get_profile(carepartner)
        if not EloService.is_matchable(profile, when):
            return False
        band = profile.band
        if band is None or band.max_proposals_per_day is None:
            return True
        day_start = timezone.make_aware(
            _dt.combine(timezone.localdate(when), _time.min))
        count = CandidateProposal.objects.filter(
            carepartner=carepartner, proposed_at__gte=day_start).count()
        if count >= band.max_proposals_per_day:
            logger.warning('[ELO] Throttle: %s (band %s) đã nhận %d đề xuất hôm nay',
                           carepartner_id(carepartner), band.name, count)
            return False
        return True

    # ─────────────────────────────────────────────────────────────
    # Streak + helpers
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def get_profile(user):
        """Lấy/tạo CarePartnerProfile cho user (an toàn gọi nhiều lần)."""
        profile, _created = CarePartnerProfile.objects.get_or_create(user=user)
        return profile

    @classmethod
    def record_completion(cls, carepartner, booking):
        """Gọi khi booking hoàn thành: job_completed + streak milestone.

        Mỗi mốc streak chỉ thưởng 1 lần mỗi chuỗi (reset khi cancel/no-show).
        """
        profile = cls.get_profile(carepartner)
        cls.apply_event(carepartner, 'job_completed', booking=booking)
        profile.refresh_from_db()
        profile.streak_count += 1
        milestone = STREAK_MILESTONES.get(profile.streak_count)
        awarded = None
        if milestone and profile.streak_last_milestone < profile.streak_count:
            profile.streak_last_milestone = profile.streak_count
            awarded = milestone
        profile.save(update_fields=['streak_count', 'streak_last_milestone'])
        if awarded:
            cls.apply_event(carepartner, awarded, booking=booking)
        return profile

    @classmethod
    def reset_streak(cls, carepartner):
        profile = cls.get_profile(carepartner)
        profile.streak_count = 0
        profile.streak_last_milestone = 0
        profile.save(update_fields=['streak_count', 'streak_last_milestone'])


def carepartner_id(user):
    return getattr(user, 'pk', user)


def _get_int_config(key, default):
    from ..config import get_int
    return get_int(key, default)
