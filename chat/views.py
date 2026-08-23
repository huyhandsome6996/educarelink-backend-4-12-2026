"""
API Views cho chat module (N — Cửa sổ chat còn hiệu lực).
Views chỉ làm I/O (parse → gọi service → response) — đúng §15.3.

Endpoint map:
  [Parent + Worker — ownership check trong service layer]
    GET  /api/chat/conversations/                    danh sách hội thoại của user
    GET  /api/chat/conversations/<task_id>/          chi tiết + trạng thái cửa sổ
    GET  /api/chat/conversations/<task_id>/messages/?since=<id>   polling tin nhắn
    POST /api/chat/conversations/<task_id>/messages/  gửi tin nhắn
    POST /api/chat/conversations/<task_id>/read/      đánh dấu đã đọc

  [Admin]
    GET  /api/chat/admin/conversations/<task_id>/messages/   xem lịch sử (an toàn/tranh chấp)
"""

import logging

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .services import (
    send_message, get_messages, mark_messages_read,
    get_conversation_for_requester, serialize_conversation,
    list_conversations_for_user, get_conversation_messages_for_admin,
)

logger = logging.getLogger('educarelink.chat.api')


def _parse_task_id(task_id) -> int:
    """Parse task_id an toàn — trả ValueError 400 nếu không phải số nguyên."""
    try:
        return int(task_id)
    except (TypeError, ValueError):
        raise ValueError("task_id không hợp lệ.")


class ConversationListAPIView(APIView):
    """
    GET /api/chat/conversations/

    Danh sách hội thoại của user hiện tại (parent hoặc worker),
    kèm last_message + unread_count, sắp xếp theo cập nhật gần nhất.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get('limit', 50))
            limit = max(1, min(limit, 100))
        except (TypeError, ValueError):
            limit = 50
        conversations = list_conversations_for_user(
            requester=request.user, limit=limit,
        )
        return Response({'count': len(conversations), 'conversations': conversations})


class ConversationDetailAPIView(APIView):
    """
    GET /api/chat/conversations/<task_id>/

    Chi tiết conversation + trạng thái cửa sổ (open/closed) + closes_at
    (UI đếm ngược "còn X giờ"). Service lazy-close nếu đã quá hạn.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            conversation = get_conversation_for_requester(
                task_id=_parse_task_id(task_id), requester=request.user,
            )
            return Response(serialize_conversation(conversation, request.user))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class MessageListAPIView(APIView):
    """
    GET /api/chat/conversations/<task_id>/messages/?since=<id>

    Lấy tin nhắn cho polling: ?since=<last_id> chỉ trả tin MỚI (id > since).
    Không since → trang cuối (100 tin gần nhất, thứ tự cũ → mới).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            since = request.query_params.get('since')
            messages = get_messages(
                task_id=_parse_task_id(task_id),
                requester=request.user,
                since=since,
            )
            # last_id cho client dùng làm mốc since chu kỳ poll tiếp theo
            last_id = messages[-1]['id'] if messages else (int(since) if since else None)
            return Response({
                'count': len(messages),
                'messages': messages,
                'last_id': last_id,
            })
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class MessageCreateAPIView(APIView):
    """
    POST /api/chat/conversations/<task_id>/messages/

    Body: { content }
    - Kiểm duyệt nội dung TRƯỚC khi lưu (ValueError 400 nếu bị chặn)
    - Cửa sổ đóng → 403 "Cuộc trò chuyện đã hết hiệu lực" (read-only)
    - 404: task chưa từng in_progress (chưa có conversation)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        content = request.data.get('content') if isinstance(request.data, dict) else None
        if content is None:
            return Response(
                {'error': 'Thiếu trường content.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            message = send_message(
                task_id=_parse_task_id(task_id),
                sender=request.user,
                content=content,
            )
            return Response({
                'id': message.id,
                'sender_id': message.sender_id,
                'content': message.content,
                'created_at': message.created_at.isoformat(),
                'read_at': None,
            }, status=status.HTTP_201_CREATED)
        except ValueError as e:
            # Validation / kiểm duyệt chặn / chưa có conversation
            msg = str(e)
            if 'chưa có cuộc trò chuyện' in msg or 'Không tìm thấy công việc' in msg:
                return Response({'error': msg}, status=status.HTTP_404_NOT_FOUND)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class MarkReadAPIView(APIView):
    """
    POST /api/chat/conversations/<task_id>/read/

    Đánh dấu đã đọc mọi tin người kia gửi. Body rỗng.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        try:
            count = mark_messages_read(
                task_id=_parse_task_id(task_id), requester=request.user,
            )
            return Response({'status': 'ok', 'marked_count': count})
        except ValueError as e:
            msg = str(e)
            if 'chưa có cuộc trò chuyện' in msg or 'Không tìm thấy công việc' in msg:
                return Response({'error': msg}, status=status.HTTP_404_NOT_FOUND)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class AdminConversationMessagesAPIView(APIView):
    """
    GET /api/chat/admin/conversations/<task_id>/messages/

    Admin xem lịch sử hội thoại (xử lý tranh chấp/an toàn) — kể cả hội
    thoại của người khác. Chỉ is_superuser/is_staff.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            data = get_conversation_messages_for_admin(
                task_id=_parse_task_id(task_id), requester=request.user,
            )
            return Response(data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
