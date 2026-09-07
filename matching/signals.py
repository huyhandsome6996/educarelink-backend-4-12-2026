"""
matching/signals.py — Signals cho app matching.

  - CarePartnerAvailability save/delete → invalidate cache available_slots
    (Step 9.3 — cache phải invalidate khi availability thay đổi).
  - CarePartnerBlackout save → invalidate cache + check 14 ngày nghỉ liên tiếp
    (Step 9.2 — invariant giữ đúng trên MỌI đường ghi: API, admin, script).
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import CarePartnerAvailability, CarePartnerBlackout


@receiver(post_save, sender=CarePartnerAvailability)
@receiver(post_delete, sender=CarePartnerAvailability)
def _on_availability_changed(sender, instance, **kwargs):
    from .services.lock_service import invalidate_availability_cache
    invalidate_availability_cache(instance.carepartner)


@receiver(post_save, sender=CarePartnerBlackout)
def _on_blackout_saved(sender, instance, **kwargs):
    from .services.availability_service import check_14_day_pause
    from .services.lock_service import invalidate_availability_cache
    invalidate_availability_cache(instance.carepartner, instance.date)
    check_14_day_pause(instance.carepartner)


@receiver(post_delete, sender=CarePartnerBlackout)
def _on_blackout_deleted(sender, instance, **kwargs):
    from .services.lock_service import invalidate_availability_cache
    invalidate_availability_cache(instance.carepartner, instance.date)
