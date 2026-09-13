"""
matching/api/device_token.py — Upsert DeviceToken (Task F — 2026-09-14).

POST /api/matching/device-token/ {platform, token}

Trước đây DeviceToken KHÔNG BAO GIỜ được ghi (chỉ fallback User.expo_push_token)
→ Expo push đi qua 1 token duy nhất / user, không chuẩn hóa đa thiết bị.
Mobile gọi endpoint này lúc login (AuthContext.syncPushTokenToBackend) và
mỗi lần token được cấp lại.

Endpoint CHO PHÉP worker pending (onboarding cần push khi được duyệt).
"""

import logging

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import DeviceToken

logger = logging.getLogger('educarelink.matching.device_token')

VALID_PLATFORMS = {choice[0] for choice in DeviceToken.PLATFORM_CHOICES}


class DeviceTokenUpsertAPIView(APIView):
    """Đăng ký/cập nhật token push của thiết bị hiện tại (idempotent)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('token') or '').strip()
        platform = str(request.data.get('platform') or 'expo').strip().lower()
        if not token:
            return Response({'code': 'token_required',
                             'detail': 'Thiếu token push.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(token) > 255:
            return Response({'code': 'token_too_long',
                             'detail': 'Token push không hợp lệ.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if platform not in VALID_PLATFORMS:
            platform = 'expo'

        obj, created = DeviceToken.objects.update_or_create(
            user=request.user, token=token,
            defaults=dict(platform=platform, is_active=True))
        logger.info('[DeviceToken] %s token cho %s (%s)',
                    'tạo' if created else 'cập nhật', request.user.username, platform)
        return Response({'status': 'ok', 'created': created,
                         'device_token_id': str(obj.pk)},
                        status=status.HTTP_201_CREATED if created
                        else status.HTTP_200_OK)
