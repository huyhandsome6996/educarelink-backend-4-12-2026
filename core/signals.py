"""
Signal hooks cho core — B4 phân hạng CarePartner.

- Task completed → refresh_tier(worker)
- Review created → refresh_tier(reviewee)
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

_old_status_cache = {}


@receiver(post_save, sender='core.Task')
def _on_task_save_refresh_tier(sender, instance, created, **kwargs):
    if kwargs.get('raw'):
        return
    if instance.status != 'completed':
        return
    try:
        from core.models import TaskApplication
        from core.services.tier_service import refresh_tier

        app = TaskApplication.objects.filter(
            task=instance, status='accepted'
        ).select_related('worker').first()
        if app and app.worker_id:
            refresh_tier(app.worker)
    except Exception:
        logger.exception('[Tier] Lỗi refresh_tier khi task completed id=%s', instance.pk)


@receiver(post_save, sender='core.Review')
def _on_review_save_refresh_tier(sender, instance, created, **kwargs):
    if kwargs.get('raw'):
        return
    if not created:
        return
    try:
        from core.services.tier_service import refresh_tier
        if instance.reviewee_id:
            worker = instance.reviewee
            refresh_tier(worker)
    except Exception:
        logger.exception('[Tier] Lỗi refresh_tier khi review id=%s', instance.pk)


# ═══════════════════════════════════════════════════════════════════
# Task C (2026-09-14) — Cold-start: bắt sự kiện admin DUYỆT CarePartner
# (is_approved False → True) để: tạo CarePartnerProfile ELO 1200 band
# normal (nếu chưa có) + push "khai lịch rảnh và kỹ năng".
# Bắt qua pre_save/post_save nên PHỦ HẾT mọi đường duyệt: admin API,
# Django admin, chatbot command, shell.
# ═══════════════════════════════════════════════════════════════════

@receiver(pre_save, sender='core.User')
def _stash_prev_is_approved(sender, instance, **kwargs):
    """Ghi lại trạng thái is_approved TRƯỚC khi lưu để post_save nhận diện
    cú flip False → True (duyệt). Bulk update không chạy signal — chấp nhận."""
    if kwargs.get('raw'):
        return
    if instance.pk and not instance._state.adding:
        from core.models import User
        prev = User.objects.filter(pk=instance.pk).values_list(
            'is_approved', flat=True).first()
        instance._prev_is_approved = prev
    else:
        instance._prev_is_approved = None


@receiver(post_save, sender='core.User')
def _on_worker_approved(sender, instance, created, **kwargs):
    if kwargs.get('raw') or created:
        return
    prev = getattr(instance, '_prev_is_approved', None)
    if prev is None or prev is True or not instance.is_approved:
        return
    if instance.role != 'worker':
        return
    try:
        from matching.services.coldstart_service import on_worker_approved
        on_worker_approved(instance)
    except Exception:
        logger.exception('[Coldstart] Signal duyệt worker lỗi id=%s', instance.pk)
