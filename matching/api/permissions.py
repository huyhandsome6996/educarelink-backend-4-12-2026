"""
matching/api/permissions.py — Phân quyền API matching (Task C — 2026-09-14).

Task C: CarePartner pending (is_approved=False) ĐƯỢC login hạn chế để hoàn
thiện onboarding (khai skill + lịch rảnh + upload CCCD), nhưng KHÔNG được
vào matching / bookings / feed việc. Trước đây pending bị chặn đăng nhập
hoàn toàn (403) → không thể tự hoàn thiện hồ sơ → ngày duyệt vẫn bị
skill-gate — vòng luẩn quẩn.

Endpoint ONBOARDING được phép cho pending:
  - /api/auth/profile/ (core)
  - /api/matching/carepartners/me/availability/* + blackouts/* (khai lịch)
  - /api/matching/device-token/ (đăng ký push)
  - /api/tracking/matching-gps-consent/ (consent GPS gợi ý việc)

Endpoint bị CHẶN (403) cho pending — áp class này:
  - /api/matching/bookings/* (feed việc / đơn)
  - /api/matching/notifications/*
  - /api/matching/candidates/*, credits, trust (không cần thiết khi pending)
"""

from rest_framework.permissions import BasePermission

PENDING_MESSAGE = ('Tài khoản CarePartner của bạn chưa được duyệt. '
                   'Hiện chỉ có thể hoàn thiện hồ sơ (kỹ năng + lịch rảnh).')


class WorkerMustBeApproved(BasePermission):
    """Chặn CarePartner chưa được admin duyệt khỏi matching/bookings/feed."""

    message = PENDING_MESSAGE

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if getattr(user, 'role', '') == 'worker' and not getattr(user, 'is_approved', False):
            return False
        return True
