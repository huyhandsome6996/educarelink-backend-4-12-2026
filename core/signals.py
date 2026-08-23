"""
Signal hooks cho core — B4 phân hạng CarePartner.

- Task completed → refresh_tier(worker)
- Review created → refresh_tier(reviewee)
"""
import logging

from django.db.models.signals import post_save
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
