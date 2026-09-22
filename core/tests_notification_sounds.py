"""
core/tests_notification_sounds.py — 2026-09-20.

Kiểm thử bộ âm thanh thông báo mới (phía backend):
send_expo_push_notification map type='admin_notification' → channel
'educarelink_admin' (nhạc Messenger) — payload Expo push đúng spec;
device_offline critical giữ channel emergency-alerts; type lạ fallback default.

Chạy: python manage.py test core.tests_notification_sounds
"""

from unittest import mock

from django.test import TestCase

from core.views import send_expo_push_notification
