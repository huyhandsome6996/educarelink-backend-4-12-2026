"""QA-FIX-8 / Bug #1: Regression tests cho infinite retry loop fix.

Tester phát hiện: khi parent không có expo_push_token, retry scheduler
không bao giờ cập nhật push_sent_at/push_retry_count → alert match
query MỖI LẦN chạy → infinite loop, burn cron cycle mỗi phút vô hạn.

Fix: LUÔN cập nhật push_sent_at + push_retry_count trên mọi outcome
(True/False/None). Sau OFFLINE_PUSH_MAX_RETRIES lần → alert bị loại khỏi
query pending_alerts.
"""

from django.test import TestCase, override_settings
from django.utils import timezone
from datetime import timedelta

from core.models import User, Task, TaskApplication
from tracking.models import DeviceOfflineAlert
from tracking.services import retry_offline_alert_pushes, OFFLINE_PUSH_MAX_RETRIES


class InfiniteRetryLoopFixTest(TestCase):
    """QA-FIX-8 / Bug #1: Regression test — alert với parent không có
    expo_push_token phải dừng retry sau OFFLINE_PUSH_MAX_RETRIES lần."""

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_no_token',
            password='pass123',
            role='parent',
            email='parent_no_token@test.com',
            expo_push_token='',
        )
        self.worker = User.objects.create_user(
            username='worker1',
            password='pass123',
            role='carepartner',
            email='worker1@test.com',
        )
        self.task = Task.objects.create(
            parent=self.parent,
            title='Test task',
            description='Test',
            price=100000,
            status='in_progress',
            location='HCM',
            scheduled_time=timezone.now() - timedelta(hours=1),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted'
        )
        self.alert = DeviceOfflineAlert.objects.create(
            task=self.task,
            worker=self.worker,
            last_seen=timezone.now() - timedelta(minutes=5),
            status='active',
        )

    @override_settings(DEBUG=True)
    def test_no_token_stops_after_max_retries(self):
        """Parent không có push token → sau 5 lần retry, alert bị loại khỏi query."""
        import tracking.services as svc
        original_interval = svc.OFFLINE_PUSH_RETRY_INTERVAL_SECONDS
        svc.OFFLINE_PUSH_RETRY_INTERVAL_SECONDS = 0
        try:
            for i in range(OFFLINE_PUSH_MAX_RETRIES):
                stats = retry_offline_alert_pushes()
                self.alert.refresh_from_db()
                self.assertEqual(
                    self.alert.push_retry_count,
                    i + 1,
                    f'retry_count nên là {i + 1} sau lần chạy thứ {i + 1}'
                )
                self.assertIsNotNone(self.alert.push_sent_at)

            # Lần thứ 6 — alert KHÔNG nên được chọn lại
            stats = retry_offline_alert_pushes()
            self.alert.refresh_from_db()
            self.assertEqual(self.alert.push_retry_count, OFFLINE_PUSH_MAX_RETRIES)
            self.assertEqual(stats['push_failed'], 0)
        finally:
            svc.OFFLINE_PUSH_RETRY_INTERVAL_SECONDS = original_interval

    @override_settings(DEBUG=True)
    def test_no_token_push_sent_stays_false(self):
        """Parent không có token → push_sent KHÔNG bao giờ True."""
        retry_offline_alert_pushes()
        self.alert.refresh_from_db()
        self.assertFalse(self.alert.push_sent)
