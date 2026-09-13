"""
matching/services/coldstart_service.py — Cold-start CarePartner mới (Task C).

Bối cảnh (QA audit 2026-09-13): CarePartner mới bị "bỏ quên" sau khi duyệt —
không ai tạo CarePartnerProfile cho họ, không có exploration slot, và trước
đây login còn bị 403 nên không thể tự hoàn thiện hồ sơ.

Flow khi admin duyệt (is_approved False → True, bắt qua signal core.User):
  1. Đảm bảo CarePartnerProfile tồn tại (hidden_elo=1200, band normal).
  2. Push "Hồ sơ đã duyệt — khai lịch rảnh và kỹ năng để nhận việc ngay".

Việc chèn exploration slot vào top N nằm trong matching_service.find_candidates
(không phải service này) — service này chỉ lo side-effect lúc duyệt.
"""

import logging

from ..models import EloBand
from .elo_service import EloService
from .notification_service import NotificationService

logger = logging.getLogger('educarelink.matching.coldstart')

APPROVED_PUSH_TITLE = 'Hồ sơ đã được duyệt'
APPROVED_PUSH_BODY = ('Hồ sơ đã duyệt — khai lịch rảnh và kỹ năng để nhận '
                      'việc ngay.')


def on_worker_approved(user):
    """Gọi khi worker vừa được admin duyệt. IDEMPOTENT.

    1. Tạo CarePartnerProfile nếu chưa có (ELO mặc định 1200) + gắn band
       'normal' nếu chưa có band.
    2. Gửi thông báo (in-app + Expo push qua NotificationService) nhắc khai
       lịch rảnh + kỹ năng.
    Không raise — lỗi chỉ log (việc duyệt không được fail vì side-effect).
    """
    try:
        profile = EloService.get_profile(user)
        if profile.band_id is None:
            normal = EloBand.objects.filter(name='normal').first()
            if normal is not None:
                profile.band = normal
                profile.save(update_fields=['band', 'updated_at'])
        NotificationService.enqueue(
            user, 'profile_approved',
            data={'type': 'profile_approved'},
            ctx={})
        logger.info('[Coldstart] Worker %s vừa được duyệt — profile sẵn sàng '
                    '+ push onboarding', user.username)
    except Exception:
        logger.exception('[Coldstart] Lỗi xử lý duyệt worker %s',
                         getattr(user, 'username', '?'))
