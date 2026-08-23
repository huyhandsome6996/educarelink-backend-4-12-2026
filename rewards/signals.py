"""Signal hooks — cộng điểm khi Task completed / Review 5 sao.

Pattern giống payments/signals.py: pre_save cache status cũ,
post_save chỉ trigger khi status thực sự đổi → completed.
"""

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from core.models import Task, Review

logger = logging.getLogger('educarelink.rewards.signals')

_old_task_status_cache = {}


@receiver(pre_save, sender=Task)
def _cache_old_task_status_for_rewards(sender, instance: Task, **kwargs):
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            _old_task_status_cache[instance.pk] = old.status
        except Task.DoesNotExist:
            _old_task_status_cache[instance.pk] = None
    else:
        _old_task_status_cache[instance.pk] = None


@receiver(post_save, sender=Task)
def _award_points_on_task_completed(sender, instance: Task, created: bool, **kwargs):
    if kwargs.get('raw'):
        return

    old_status = _old_task_status_cache.pop(instance.pk, None)
    new_status = instance.status

    # Chỉ khi chuyển sang completed (kể cả create với status completed)
    if new_status != 'completed':
        return
    if not created and old_status == new_status:
        return

    from .services import award_points_for_task
    try:
        award_points_for_task(instance)
    except Exception as e:
        logger.exception(
            '[rewards.signals] award_points_for_task thất bại Task#%s: %s',
            instance.pk, e,
        )


@receiver(post_save, sender=Review)
def _award_bonus_on_five_star_review(sender, instance: Review, created: bool, **kwargs):
    if kwargs.get('raw'):
        return
    if not created:
        return
    if int(instance.rating or 0) != 5:
        return

    from .services import award_review_bonus
    try:
        award_review_bonus(instance)
    except Exception as e:
        logger.exception(
            '[rewards.signals] award_review_bonus thất bại Review#%s: %s',
            instance.pk, e,
        )
