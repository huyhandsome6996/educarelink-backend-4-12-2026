"""
matching/services/state.py — State machine engine data-driven (Step 12).

Rule 12.3.1: transition không nằm trong bảng → InvalidTransition (HTTP 409).
Rule 12.3.2: mỗi transition ghi ĐÚNG 1 StateTransitionLog.
Rule 12.3.4: status change + side effects CÙNG transaction (caller bọc atomic).
"""

import logging

from django.utils import timezone

from ..constants import (
    BOOKING_TRANSITIONS,
    JOBPOST_TRANSITIONS,
    BookingStatus,
    JobPostStatus,
)
from ..models import Booking, JobPost, StateTransitionLog

logger = logging.getLogger('educarelink.matching.state')


class InvalidTransition(Exception):
    """Chuyển trạng thái không hợp lệ — map sang HTTP 409."""


def validate_transition(entity, from_status, to_status):
    """Kiểm tra 1 bước chuyển. entity: 'job_post' | 'booking'."""
    mapping = BOOKING_TRANSITIONS if entity == 'booking' else JOBPOST_TRANSITIONS
    if not _is_valid(mapping, from_status, to_status):
        raise InvalidTransition(
            f'Không thể chuyển {entity} từ "{from_status}" sang "{to_status}" — '
            f'không nằm trong bảng trạng thái.')
    return True


def _is_valid(mapping, from_status, to_status):
    allowed = mapping.get(from_status)
    return bool(allowed and to_status in allowed)


def transition(entity_obj, to_status, actor='system', actor_user=None, reason=''):
    """Thực hiện transition + ghi log. Caller bọc transaction.atomic().

    entity_obj: JobPost hoặc Booking (đọc .status). LƯU Ý: side effects
    (ELO, credit, lock, notify) do service gọi transition thực hiện trong
    CÙNG transaction trước khi save.
    """
    if isinstance(entity_obj, Booking):
        entity = 'booking'
        mapping = BOOKING_TRANSITIONS
    elif isinstance(entity_obj, JobPost):
        entity = 'job_post'
        mapping = JOBPOST_TRANSITIONS
    else:
        raise TypeError('entity_obj phải là Booking hoặc JobPost')

    from_status = entity_obj.status
    validate_transition(entity, from_status, to_status)

    entity_obj.status = to_status
    entity_obj.save(update_fields=['status', 'updated_at'])

    StateTransitionLog.objects.create(
        entity=entity, entity_id=entity_obj.pk,
        from_status=from_status, to_status=to_status,
        actor=actor, actor_user=actor_user, reason=reason or '',
    )
    logger.info('[State] %s %s: %s → %s (%s)',
                entity, entity_obj.pk, from_status, to_status, actor)
    return entity_obj


# Trạng thái active cho booking (dùng bởi scheduler/lazy check)
ACTIVE_BOOKING_STATUSES = frozenset({
    BookingStatus.AWAITING_COMMITMENT,
    BookingStatus.COMMITTED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.IN_PROGRESS,
    BookingStatus.SUSPECTED_NO_SHOW,
})
