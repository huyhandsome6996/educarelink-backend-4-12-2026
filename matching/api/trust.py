"""
matching/api/trust.py — API tín nhiệm cho CarePartner (Step 6.7).

GET /api/matching/carepartner/trust/
  → band label VI + progress hint + 10 sự kiện gần nhất (mô tả KHÔNG SỐ).
  TUYỆT ĐỐI không trả bất kỳ trường số điểm nào (tên field nằm trong elo_service).
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import EloLedger
from ..serializers import TRUST_EVENT_DESCRIPTIONS_VI
from ..services.elo_service import EloService

# Nhãn band — fallback nếu chưa seed (band.name luôn có trong EloBand seeded)
BAND_FALLBACK_LABELS = {
    'trusted': 'CarePartner đáng tin cậy',
    'good': 'Phản hồi tốt / Đúng giờ',
    'normal': '',
    'watch': 'Cần cải thiện phản hồi',
    'restricted': 'Đang bị hạn chế đề xuất',
    'blocked': 'Tạm khóa - liên hệ hỗ trợ',
}

# Hint tiến độ theo band (Step 6.7)
BAND_HINTS_VI = {
    'trusted': 'Bạn đang ở mức ưu tiên cao nhất. Hãy giữ phong độ nhé!',
    'good': 'Hoàn thành thêm 2 đơn đúng giờ để đạt mức ưu tiên cao nhất.',
    'normal': 'Hoàn thành thêm 2 đơn đúng giờ để cải thiện mức độ ưu tiên đề xuất.',
    'watch': 'Hãy phản hồi nhanh và hoàn thành đơn đúng cam kết để cải thiện.',
    'restricted': 'Bạn đang bị hạn chế số đề xuất mỗi ngày. Hoàn thành đơn đúng giờ để cải thiện.',
    'blocked': 'Tài khoản tạm khóa khỏi đề xuất. Vui lòng liên hệ hỗ trợ hoặc gửi kháng cáo.',
}


class TrustAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = EloService.get_profile(request.user)
        band = profile.band
        if band is None:
            # recompute tính band từ ledger — giá trị số không bao giờ ra response
            _effective, band = EloService.recompute(profile)
        band_name = band.name if band else 'normal'
        label = (band.label_vi if band and band.label_vi else '') or BAND_FALLBACK_LABELS.get(band_name, '')

        events = []
        for row in EloLedger.objects.filter(carepartner=request.user)[:10]:
            events.append({
                'description_vi': TRUST_EVENT_DESCRIPTIONS_VI.get(
                    row.reason_code, 'Cập nhật tín nhiệm'),
                'when': row.created_at,
                'kind': 'reward' if row.delta > 0 else 'penalty',
            })

        return Response({
            'band': band_name,
            'band_label_vi': label,
            'progress_hint_vi': BAND_HINTS_VI.get(band_name, ''),
            'paused': profile.matching_paused,
            'events': events,
        })
