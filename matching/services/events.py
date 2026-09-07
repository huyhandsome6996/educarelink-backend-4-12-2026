"""
matching/services/events.py — Event bus nội bộ qua Django signals (Step Prompt 04).

Các service publish event; beat task / service khác subscribe. MVP: dispatcher
đơn giản — không cần Celery/Redis.
"""

import logging

import django.dispatch

logger = logging.getLogger('educarelink.matching.events')

# Event có sẵn:
#   reschedule_expired (booking_id)   — đổi giờ hết hạn CP im lặng
#   blackout_paused (carepartner_id)  — 14 ngày nghỉ liên tiếp
reschedule_expired = django.dispatch.Signal()
blackout_paused = django.dispatch.Signal()

EVENTS = {
    'reschedule_expired': reschedule_expired,
    'blackout_paused': blackout_paused,
}


def publish(name, **data):
    """Phát event — subscriber (nếu có) xử lý; lỗi subscriber không chặn publisher."""
    signal = EVENTS.get(name)
    if signal is None:
        logger.warning('[Events] Không biết event %s', name)
        return
    try:
        signal.send(sender='matching', **data)
        logger.info('[Events] Published %s %s', name, data)
    except Exception:
        logger.exception('[Events] Subscriber của %s lỗi', name)
