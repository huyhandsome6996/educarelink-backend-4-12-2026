"""
matching/api/onboarding.py — Trạng thái onboarding CarePartner (Task C — 2026-09-14).

GET /api/matching/carepartners/me/onboarding-status/

Task C: sau khi admin duyệt, CarePartner mới phải khai ĐỦ skill + lịch rảnh
mới được vào pool matching. Client (mobile + web) dùng endpoint này để:
  - Chặn "xong" onboarding khi skills rỗng hoặc chưa có CarePartnerAvailability.
  - Hiện banner "Hoàn thiện hồ sơ" trên trang chủ worker.
Endpoint cho phép cả worker PENDING (đây chính là bước họ phải làm).
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CarePartnerAvailability
from ..services.elo_service import EloService

MESSAGE_NOT_READY_VI = ('Chưa khai kỹ năng/lịch rảnh thì hệ thống không thể '
                        'giới thiệu việc.')


class OnboardingStatusAPIView(APIView):
    """GET trạng thái onboarding của CarePartner đang đăng nhập."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        profile = EloService.get_profile(user)
        has_skills = bool(profile.skills or [])
        has_availability = CarePartnerAvailability.objects.filter(
            carepartner=user).exists()
        ready = has_skills and has_availability
        return Response({
            'has_skills': has_skills,
            'has_availability': has_availability,
            'ready_for_matching': ready,
            'is_approved': bool(getattr(user, 'is_approved', False)),
            'message_vi': '' if ready else MESSAGE_NOT_READY_VI,
        })
