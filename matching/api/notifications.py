"""
matching/api/notifications.py — Inbox thông báo Flow mới (Step 8.8).

GET  /api/matching/notifications/                danh sách (query: unread=true)
GET  /api/matching/notifications/unread-count/   badge count
POST /api/matching/notifications/mark-read/      đánh dấu đã đọc
                                                 (body {} = tất cả, hoặc {ids: [...]})
"""

from django.utils import timezone
from rest_framework import permissions
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from .permissions import WorkerMustBeApproved

from ..models import Notification


class NotificationListAPIView(ListAPIView):
    # Task C: worker pending bị chặn hộp thư matching (403)
    permission_classes = [permissions.IsAuthenticated, WorkerMustBeApproved]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get('unread') == 'true':
            qs = qs.filter(read_at__isnull=True)
        return qs[:50]

    def list(self, request, *args, **kwargs):
        rows = list(self.get_queryset())
        return Response({
            'count': len(rows),
            'unread': Notification.objects.filter(
                user=request.user, read_at__isnull=True).count(),
            'results': [
                {
                    'id': str(n.pk),
                    'code': n.code,
                    'class': n.klass,
                    'title': n.title_vi,
                    'body': n.body_vi,
                    'data': n.data,
                    'status': n.status,
                    'created_at': n.created_at,
                    'read_at': n.read_at,
                }
                for n in rows
            ],
        })


class UnreadCountAPIView(APIView):
    """GET unread-count cho badge — luôn đúng kể cả khi push thất bại (Step 8.4)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({'unread': Notification.objects.filter(
            user=request.user, read_at__isnull=True).count()})


class NotificationMarkReadAPIView(APIView):
    """POST mark-read — đồng bộ hành vi “Đọc tất cả” giữa web ↔ mobile.

    Trước đây read_at không bao giờ được set → badge chưa đọc tăng vô hạn
    dù push đã nhận. Body: {} = đánh dấu tất cả; {ids: [uuid…]} = một phần.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        qs = Notification.objects.filter(user=request.user, read_at__isnull=True)
        ids = request.data.get('ids') or None
        if ids:
            qs = qs.filter(pk__in=ids)
        updated = qs.update(read_at=timezone.now(), status='read')
        unread = Notification.objects.filter(
            user=request.user, read_at__isnull=True).count()
        return Response({'marked': updated, 'unread': unread})
