"""
python manage.py recompute_elo_bands

Tính lại effective_elo + band cho TẤT CẢ CarePartnerProfile.
Chạy khi owner sửa EloBand thresholds / CancelPolicy trong admin —
không cần deploy (Step 6 AC11).
"""

from django.core.management.base import BaseCommand

from matching.models import CarePartnerProfile
from matching.services.elo_service import EloService


class Command(BaseCommand):
    help = 'Tính lại effective ELO + band cho mọi CarePartner (dùng sau khi sửa EloBand)'

    def handle(self, *args, **options):
        total = CarePartnerProfile.objects.count()
        changed = 0
        for profile in CarePartnerProfile.objects.select_related('band', 'user').all():
            old_band = profile.band
            effective, band = EloService.recompute(profile)
            if old_band != band:
                changed += 1
        self.stdout.write(self.style.SUCCESS(
            f'Recompute xong: {total} profile, {changed} đổi band.'))
