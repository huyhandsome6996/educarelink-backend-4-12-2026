"""Django admin registration cho chat."""

from django.contrib import admin
from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'parent', 'worker', 'status',
                    'opens_at', 'closes_at', 'closed_at')
    list_filter = ('status',)
    search_fields = ('task__title', 'parent__username', 'worker__username')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'conversation', 'sender', 'content', 'created_at', 'read_at')
    search_fields = ('content', 'sender__username', 'conversation__task__title')
    readonly_fields = ('created_at',)
    list_per_page = 100
