"""URL routing cho chat module (N)."""

from django.urls import path
from .views import (
    ConversationListAPIView, ConversationDetailAPIView,
    MessageListAPIView, MessageCreateAPIView, MarkReadAPIView,
    AdminConversationMessagesAPIView,
)

urlpatterns = [
    # Danh sách hội thoại của user hiện tại (parent hoặc worker)
    path('chat/conversations/', ConversationListAPIView.as_view(), name='chat-conversation-list'),
    # Chi tiết conversation theo task + trạng thái cửa sổ (open/closed + closes_at)
    path('chat/conversations/<int:task_id>/', ConversationDetailAPIView.as_view(), name='chat-conversation-detail'),
    # Lấy tin nhắn (polling ?since=<id>) + gửi tin nhắn
    path('chat/conversations/<int:task_id>/messages/', MessageListAPIView.as_view(), name='chat-message-list'),
    path('chat/conversations/<int:task_id>/messages/send/', MessageCreateAPIView.as_view(), name='chat-message-create'),
    # Đánh dấu đã đọc
    path('chat/conversations/<int:task_id>/read/', MarkReadAPIView.as_view(), name='chat-mark-read'),
    # Admin — xem lịch sử hội thoại (tranh chấp/an toàn)
    path('chat/admin/conversations/<int:task_id>/messages/', AdminConversationMessagesAPIView.as_view(), name='chat-admin-messages'),
]
