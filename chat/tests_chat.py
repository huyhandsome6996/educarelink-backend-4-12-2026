"""
N — Test Cửa sổ chat Parent ↔ CarePartner (chỉ mở trong window thời gian).

Chạy: python manage.py test chat.tests_chat --verbosity=2

Phủ:
  - Conversation tự mở khi task → in_progress (Lựa chọn A-1)
  - KHÔNG tạo conversation cho task chưa in_progress
  - Cửa sổ đóng đúng completed_at + 24h (biên: 23h59 vẫn mở, 24h01 đóng)
  - Task cancelled → đóng NGAY (quyết định B)
  - Lazy-close ở mọi API (không phụ thuộc scheduler)
  - Scheduler close_expired_conversations đóng hết hạn
  - Gửi/nhận tin 2 chiều happy path + Notification in-app
  - Bảo mật: người ngoài 403 (không lộ tồn tại), anonymous 401,
    gửi khi closed → 403, task chưa có conversation → 404
  - Kiểm duyệt: chặn từ khoá cấm (không lưu DB), không chặn nhầm hợp lệ
    (lỗi false-positive 'di trong' → 'dit' từng gặp — dùng nội dung
    chứa 'di trong' để regression)
  - Anti-bypass: 'đ.ị.t' cũng bị chặn
  - since polling + mark_read + unread_count
  - Race condition: 2 tin gần đồng thời → 2 Message rows, không mất
  - Admin xem được, worker thường xem hội thoại người khác → 403
  - Task state machine không đổi (completed_at được set tại nguồn)
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from core.models import User, Task, ServiceCategory, TaskApplication, Notification
from chat.models import Conversation, Message
from chat.services import (
    open_conversation_for_task, close_conversation_for_task,
    send_message, get_messages, mark_messages_read,
    moderate_message,
)
from chat.scheduler import close_expired_conversations


class ChatTestCaseBase(TestCase):
    """Base: parent + worker + task in_progress (chat đã mở qua signal)."""

    def setUp(self):
        self.client.force_authenticate = None  # placeholder — subclass dùng APIClient
        self.parent = User.objects.create_user(
            username='n_parent', password='pass_123456',
            role='parent', email='n_parent@test.com',
        )
        self.worker = User.objects.create_user(
            username='n_worker', password='pass_123456',
            role='worker', email='n_worker@test.com',
            is_approved=True,
        )
        # Người không liên quan
        self.other_parent = User.objects.create_user(
            username='n_other_parent', password='pass_123456',
            role='parent', email='n_other_parent@test.com',
        )
        self.other_worker = User.objects.create_user(
            username='n_other_worker', password='pass_123456',
            role='worker', email='n_other_worker@test.com',
            is_approved=True,
        )
        self.admin = User.objects.create_user(
            username='n_admin', password='pass_123456',
            role='parent', email='n_admin@test.com',
            is_staff=True, is_superuser=True,
        )
        self.category = ServiceCategory.objects.create(name='Gia sư N')

        # Task tạo ở trạng thái 'open' RỒI approve qua signal path (giống
        # production) — dùng update status trực tiếp + save để trigger signal
        self.task = Task.objects.create(
            title='Trông bé tối thứ 7',
            description='Trông 2 bé từ 18h-22h',
            price=Decimal('350000'),
            status='open',
            parent=self.parent,
            category=self.category,
            location='Quận 3, TP.HCM',
            scheduled_time=timezone.now() + timedelta(days=1),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='pending',
        )

    def _start_shift(self):
        """Chuyển task → in_progress (mô phỏng ApproveCandidate flow:
        application → accepted + task.save() → signal mở conversation)."""
        TaskApplication.objects.filter(task=self.task).update(status='accepted')
        self.task.status = 'in_progress'
        self.task.save()
        self.task.refresh_from_db()
        return Conversation.objects.get(task=self.task)

    def _complete_task(self):
        """Chuyển task → completed + set completed_at (mô phỏng
        TaskUpdateStatusAPIView — set completed_at tại nguồn)."""
        self.task.status = 'completed'
        self.task.completed_at = timezone.now()
        self.task.save()
        self.task.refresh_from_db()

    def _cancel_task(self):
        self.task.status = 'cancelled'
        self.task.save()
        self.task.refresh_from_db()


# ═══════════════════════════════════════════════════════════════════
#  1. MỞ / ĐÓNG CỬA SỔ THEO TASK LIFECYCLE
# ═══════════════════════════════════════════════════════════════════

class ConversationLifecycleTests(ChatTestCaseBase):

    def test_conversation_opens_on_in_progress(self):
        """(A-1) Task → in_progress ⇒ signal tạo Conversation status='open'."""
        self.assertFalse(Conversation.objects.filter(task=self.task).exists())
        conversation = self._start_shift()
        self.assertEqual(conversation.status, 'open')
        self.assertEqual(conversation.parent_id, self.parent.id)
        self.assertEqual(conversation.worker_id, self.worker.id)
        self.assertIsNotNone(conversation.opens_at)
        self.assertIsNone(conversation.closes_at)  # chưa completed → chưa có hạn

    def test_no_conversation_for_open_task(self):
        """Task 'open' không có conversation (không tạo sẵn — tránh rác data)."""
        self.assertFalse(Conversation.objects.filter(task=self.task).exists())

    def test_no_conversation_without_accepted_worker(self):
        """Task in_progress nhưng không có worker accepted → không mở chat."""
        TaskApplication.objects.filter(task=self.task).delete()
        result = open_conversation_for_task(self.task)
        self.assertIsNone(result)
        self.assertFalse(Conversation.objects.filter(task=self.task).exists())

    def test_open_idempotent(self):
        """Signal/save lại nhiều lần không tạo trùng conversation."""
        conversation1 = self._start_shift()
        result = open_conversation_for_task(self.task)
        self.assertEqual(result.id, conversation1.id)
        self.assertEqual(Conversation.objects.filter(task=self.task).count(), 1)

    def test_completed_sets_closes_at_24h(self):
        """(B) completed_at + 24h = closes_at; status vẫn 'open' tới khi hết hạn."""
        conversation = self._start_shift()
        before = timezone.now()
        self._complete_task()
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, 'open')  # chưa tới hạn
        expected_window = timedelta(hours=24)
        delta = conversation.closes_at - self.task.completed_at
        # closes_at = completed_at + 24h (sai số do now() gọi 2 lần < vài giây)
        self.assertAlmostEqual(
            delta.total_seconds(), expected_window.total_seconds(), delta=10,
        )
        self.assertGreaterEqual(conversation.closes_at, before + timedelta(hours=24) - timedelta(seconds=5))

    def test_completed_at_null_fallback_to_now(self):
        """Task cũ pre-migration (completed_at NULL) → closes_at vẫn được set."""
        conversation = self._start_shift()
        self.task.status = 'completed'
        self.task.save()  # KHÔNG set completed_at (giả lập data cũ)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.completed_at)
        conversation.refresh_from_db()
        self.assertIsNotNone(conversation.closes_at)

    def test_cancelled_closes_immediately(self):
        """(B) cancelled → đóng NGAY, không có 24h buffer."""
        conversation = self._start_shift()
        before_cancel = timezone.now()
        self._cancel_task()
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, 'closed')
        self.assertIsNotNone(conversation.closed_at)
        self.assertGreaterEqual(conversation.closed_at, before_cancel)
        # closes_at = thời điểm huỷ (không +24h)
        self.assertLessEqual(conversation.closes_at, before_cancel + timedelta(seconds=5))

    def test_cancelled_before_in_progress_no_conversation(self):
        """Task huỷ khi còn 'open' → không có conversation, không lỗi."""
        self._cancel_task()
        self.assertFalse(Conversation.objects.filter(task=self.task).exists())


# ═══════════════════════════════════════════════════════════════════
#  2. BIÊN 24H + LAZY-CLOSE + SCHEDULER
# ═══════════════════════════════════════════════════════════════════

class WindowBoundaryTests(ChatTestCaseBase):
    """Biên cửa sổ: 23h59 sau completed vẫn mở, 24h01 đã đóng."""

    def _complete_and_shift(self, hours_after_complete):
        conversation = self._start_shift()
        self._complete_task()
        conversation.refresh_from_db()
        # Giả lập thời gian trôi: dịch closes_at về quá khứ đúng hours_after
        conversation.closes_at = self.task.completed_at + timedelta(hours=hours_after_complete)
        conversation.save()
        return conversation

    def test_window_still_open_at_23h59(self):
        """completed + 23h59 → conversation VẪN MỞ."""
        conversation = self._complete_and_shift(hours_after_complete=23.98)  # ~23h59
        # Mô phỏng: completed 23h59 trước → closes_at (completed+24h) còn ~1p
        completed_at = timezone.now() - timedelta(hours=23, minutes=59)
        Task.objects.filter(pk=self.task.pk).update(completed_at=completed_at)
        Conversation.objects.filter(pk=conversation.pk).update(
            closes_at=completed_at + timedelta(hours=24),
        )
        from chat.services import get_conversation_for_requester
        fresh = get_conversation_for_requester(task_id=self.task.id, requester=self.parent)
        self.assertEqual(fresh.status, 'open')

    def test_window_closed_at_24h01(self):
        """completed + 24h01 → conversation ĐÃ ĐÓNG (lazy-close tại API)."""
        conversation = self._complete_and_shift(hours_after_complete=24)
        # Dịch cả completed_at VÀ closes_at về quá khứ 24h+1phút
        # (closes_at do signal tính từ completed_at lúc đó — mô phỏng
        # 25h đã trôi kể từ khi complete)
        expired_time = timezone.now() - timedelta(hours=24, minutes=1)
        Task.objects.filter(pk=self.task.pk).update(completed_at=expired_time)
        Conversation.objects.filter(pk=conversation.pk).update(
            closes_at=expired_time + timedelta(hours=24),
        )
        from chat.services import get_conversation_for_requester
        fresh = get_conversation_for_requester(task_id=self.task.id, requester=self.parent)
        self.assertEqual(fresh.status, 'closed')
        self.assertIsNotNone(fresh.closed_at)

    def test_scheduler_closes_expired(self):
        """Scheduler close_expired_conversations đóng hết hạn, bỏ qua còn hạn."""
        conversation = self._start_shift()
        self._complete_task()

        # (1) Conversation còn hạn → scheduler không đóng
        closed = close_expired_conversations()
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, 'open')
        self.assertEqual(closed, 0)

        # (2) Dịch completed_at về quá khứ > 24h → hết hạn
        Task.objects.filter(pk=self.task.pk).update(
            completed_at=timezone.now() - timedelta(hours=25),
        )
        conversation.refresh_from_db()
        Conversation.objects.filter(pk=conversation.pk).update(
            closes_at=timezone.now() - timedelta(hours=1),
        )
        closed = close_expired_conversations()
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, 'closed')
        self.assertGreaterEqual(closed, 1)

        # (3) Idempotent — chạy lại không đổi gì
        closed_again = close_expired_conversations()
        self.assertEqual(closed_again, 0)


# ═══════════════════════════════════════════════════════════════════
#  3. GỬI / NHẬN TIN NHẮN
# ═══════════════════════════════════════════════════════════════════

class SendMessageTests(ChatTestCaseBase):

    def test_parent_to_worker_happy_path(self):
        """Parent gửi → Message lưu + worker nhận Notification in-app."""
        conversation = self._start_shift()
        msg = send_message(
            task_id=self.task.id, sender=self.parent,
            content='Chào bạn, bé đã ăn tối chưa ạ?',
        )
        self.assertEqual(msg.sender_id, self.parent.id)
        self.assertEqual(msg.conversation_id, conversation.id)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.worker, title__contains='Tin nhắn mới',
            ).exists(),
        )

    def test_worker_to_parent_happy_path(self):
        """Worker gửi → Message lưu + parent nhận Notification."""
        self._start_shift()
        msg = send_message(
            task_id=self.task.id, sender=self.worker,
            content='Bé đã ăn xong, đang chuẩn bị ngủ ạ.',
        )
        self.assertEqual(msg.sender_id, self.worker.id)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.parent, title__contains='Tin nhắn mới',
            ).exists(),
        )

    def test_send_empty_content_400(self):
        """Content rỗng / toàn khoảng trắng → ValueError."""
        self._start_shift()
        for bad in ('', '   ', None):
            with self.assertRaises(ValueError):
                send_message(task_id=self.task.id, sender=self.parent, content=bad)

    def test_send_too_long_content_400(self):
        """Content > 2000 ký tự → ValueError."""
        self._start_shift()
        with self.assertRaises(ValueError):
            send_message(
                task_id=self.task.id, sender=self.parent,
                content='x' * 2001,
            )

    def test_send_when_closed_403(self):
        """(C) Gửi khi conversation closed → PermissionError (read-only)."""
        self._start_shift()
        self._cancel_task()  # đóng ngay
        with self.assertRaises(PermissionError) as ctx:
            send_message(
                task_id=self.task.id, sender=self.parent, content='Xin chào',
            )
        self.assertIn('hết hiệu lực', str(ctx.exception))

    def test_send_after_window_expired_403(self):
        """Hết 24h sau completed → lazy-close → gửi bị 403."""
        self._start_shift()
        self._complete_task()
        # Dịch quá hạn
        Conversation.objects.update(
            closes_at=timezone.now() - timedelta(minutes=1),
        )
        with self.assertRaises(PermissionError):
            send_message(
                task_id=self.task.id, sender=self.parent, content='Hết hạn rồi',
            )

    def test_send_no_conversation_404_value_error(self):
        """Task chưa từng in_progress → ValueError (chưa có conversation)."""
        with self.assertRaises(ValueError):
            send_message(
                task_id=self.task.id, sender=self.parent, content='Xin chào',
            )

    def test_messages_kept_after_close_read_only(self):
        """(C) Đóng cửa sổ KHÔNG xoá tin nhắn — đọc lại vẫn thấy đủ."""
        self._start_shift()
        send_message(task_id=self.task.id, sender=self.parent, content='Tin 1')
        send_message(task_id=self.task.id, sender=self.worker, content='Tin 2')
        self._cancel_task()
        messages = get_messages(task_id=self.task.id, requester=self.parent)
        self.assertEqual(len(messages), 2)

    def test_race_condition_two_messages(self):
        """2 tin gửi liên tiếp gần như đồng thời → 2 rows riêng, không mất."""
        self._start_shift()
        # Mô phỏng 2 thread: gọi send_message 2 lần trong cùng transaction
        # scope (SQLite serialize — mục đích là verify INSERT tạo 2 rows
        # riêng biệt, không update-in-place mất dữ liệu)
        msg1 = send_message(task_id=self.task.id, sender=self.parent, content='Tin A')
        msg2 = send_message(task_id=self.task.id, sender=self.worker, content='Tin B')
        self.assertNotEqual(msg1.id, msg2.id)
        self.assertEqual(Message.objects.filter(conversation__task=self.task).count(), 2)
        messages = get_messages(task_id=self.task.id, requester=self.parent)
        contents = [m['content'] for m in messages]
        self.assertIn('Tin A', contents)
        self.assertIn('Tin B', contents)


# ═══════════════════════════════════════════════════════════════════
#  4. KIỂM DUYỆT NỘI DUNG
# ═══════════════════════════════════════════════════════════════════

class MessageModerationTests(ChatTestCaseBase):
    """Kiểm duyệt từ khoá cấm — tái dùng BANNED_KEYWORDS của moderation."""

    def test_banned_keyword_blocked_not_saved(self):
        """Tin chứa từ khoá cấm → ValueError + KHÔNG tạo Message row."""
        self._start_shift()
        before = Message.objects.count()
        with self.assertRaises(ValueError) as ctx:
            send_message(
                task_id=self.task.id, sender=self.parent,
                content='Mày định làm gì con bé đó, tao sẽ đánh con nó bây giờ',
            )
        self.assertIn('không được phép', str(ctx.exception))
        self.assertEqual(Message.objects.count(), before)  # không lưu DB

    def test_banned_english_blocked(self):
        self._start_shift()
        with self.assertRaises(ValueError):
            send_message(
                task_id=self.task.id, sender=self.worker, content='fuck you',
            )

    def test_banned_obfuscation_blocked(self):
        """Anti-bypass: 'đ.ị.t' (chèn dấu chấm) cũng bị chặn."""
        self._start_shift()
        with self.assertRaises(ValueError):
            send_message(
                task_id=self.task.id, sender=self.parent, content='đ.ị.t mẹ mày',
            )

    def test_normal_content_not_blocked(self):
        """Nội dung chat chăm sóc hợp lệ KHÔNG bị chặn nhầm."""
        self._start_shift()
        legit_messages = [
            'Bé đã ăn tối và làm bài tập xong rồi ạ',
            'Em đưa bé đi trong công viên 30 phút rồi về nhà',  # regression: 'di trong' ≠ 'dit'
            'Cháu ngủ rồi, cô chở em cháu đi học thêm nhé',
            'Dạ em đến nơi rồi, bé đang vui ạ!',
        ]
        for content in legit_messages:
            msg = send_message(task_id=self.task.id, sender=self.worker, content=content)
            self.assertIsNotNone(msg.id, f'Không nên chặn: {content}')

    def test_moderate_message_unit(self):
        """Unit test helper: trả cấu trúc đúng."""
        ok = moderate_message('Chào bạn, bé khoẻ không ạ?')
        self.assertFalse(ok['banned'])
        bad = moderate_message('đánh bé')
        self.assertTrue(bad['banned'])
        self.assertIn('reason', bad)


# ═══════════════════════════════════════════════════════════════════
#  5. API — bảo mật + contract
# ═══════════════════════════════════════════════════════════════════

from rest_framework.test import APIClient  # noqa: E402


class ChatAPITests(ChatTestCaseBase):

    def setUp(self):
        super().setUp()
        self._start_shift()

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_list_conversations(self):
        """GET /api/chat/conversations/ — user thấy hội thoại của mình."""
        send_message(task_id=self.task.id, sender=self.worker, content='Chào phụ huynh')
        resp = self._client(self.parent).get('/api/chat/conversations/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        conv = resp.data['conversations'][0]
        self.assertEqual(conv['task_id'], self.task.id)
        self.assertEqual(conv['status'], 'open')
        self.assertEqual(conv['other_party']['username'], 'n_worker')
        self.assertEqual(conv['unread_count'], 1)
        self.assertIsNotNone(conv['last_message'])

    def test_detail_conversation(self):
        """GET detail trả trạng thái + closes_at để UI đếm ngược."""
        resp = self._client(self.parent).get(f'/api/chat/conversations/{self.task.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'open')
        self.assertIsNone(resp.data['closes_at'])  # chưa completed

    def test_messages_polling_since(self):
        """GET messages?since=<id> chỉ trả tin mới."""
        m1 = send_message(task_id=self.task.id, sender=self.parent, content='Tin 1')
        m2 = send_message(task_id=self.task.id, sender=self.worker, content='Tin 2')
        m3 = send_message(task_id=self.task.id, sender=self.parent, content='Tin 3')

        client = self._client(self.worker)
        resp = client.get(f'/api/chat/conversations/{self.task.id}/messages/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['messages']), 3)

        resp_since = client.get(
            f'/api/chat/conversations/{self.task.id}/messages/?since={m2.id}'
        )
        self.assertEqual(resp_since.status_code, 200)
        ids = [m['id'] for m in resp_since.data['messages']]
        self.assertEqual(ids, [m3.id])

    def test_send_message_api(self):
        """POST message thành công → 201 + response contract."""
        resp = self._client(self.parent).post(
            f'/api/chat/conversations/{self.task.id}/messages/send/',
            {'content': 'Nhớ cho bé uống sữa trước 20h nhé'},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['sender_id'], self.parent.id)
        self.assertIn('id', resp.data)
        self.assertIn('created_at', resp.data)

    def test_send_closed_conversation_403_api(self):
        """API gửi khi closed → 403 + message 'hết hiệu lực'."""
        self._cancel_task()
        resp = self._client(self.parent).post(
            f'/api/chat/conversations/{self.task.id}/messages/send/',
            {'content': 'Xin chào'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn('hết hiệu lực', str(resp.data['error']))

    def test_send_banned_via_api_400(self):
        """API gửi nội dung vi phạm → 400, không lưu."""
        before = Message.objects.count()
        resp = self._client(self.parent).post(
            f'/api/chat/conversations/{self.task.id}/messages/send/',
            {'content': 'bóp cổ bé ngay'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('không được phép', str(resp.data['error']))
        self.assertEqual(Message.objects.count(), before)

    def test_no_conversation_404_api(self):
        """API task chưa từng in_progress → 404."""
        task2 = Task.objects.create(
            title='Task chưa nhận', description='desc', price=Decimal('100000'),
            status='open', parent=self.parent, category=self.category,
            location='HN', scheduled_time=timezone.now(),
        )
        resp = self._client(self.parent).get(f'/api/chat/conversations/{task2.id}/')
        self.assertEqual(resp.status_code, 404)

    def _assert_outsider_blocked(self, url, method='get', payload=None):
        """Người không liên quan (cả parent lẫn worker khác) → 403."""
        for outsider in (self.other_parent, self.other_worker):
            client = self._client(outsider)
            if method == 'get':
                resp = client.get(url)
            else:
                resp = client.post(url, payload or {}, format='json')
            self.assertEqual(
                resp.status_code, 403,
                f'{outsider.username} phải nhận 403, nhận {resp.status_code}',
            )

    def test_outsider_cannot_view_conversation(self):
        """Bảo mật: người ngoài xem detail → 403."""
        self._assert_outsider_blocked(f'/api/chat/conversations/{self.task.id}/')

    def test_outsider_cannot_list_messages(self):
        self._assert_outsider_blocked(
            f'/api/chat/conversations/{self.task.id}/messages/'
        )

    def test_outsider_cannot_send(self):
        self._assert_outsider_blocked(
            f'/api/chat/conversations/{self.task.id}/messages/send/',
            method='post', payload={'content': 'Tôi là người lạ'},
        )

    def test_outsider_cannot_mark_read(self):
        self._assert_outsider_blocked(
            f'/api/chat/conversations/{self.task.id}/read/',
            method='post',
        )

    def test_anonymous_401(self):
        """Anonymous không truy cập được endpoint nào."""
        client = APIClient()
        for url in (
            '/api/chat/conversations/',
            f'/api/chat/conversations/{self.task.id}/',
            f'/api/chat/conversations/{self.task.id}/messages/',
        ):
            resp = client.get(url)
            self.assertEqual(resp.status_code, 401, f'{url} phải 401')

    def test_mark_read_api(self):
        """POST read → đánh dấu đã đọc tin người kia gửi."""
        send_message(task_id=self.task.id, sender=self.worker, content='Chào ạ')
        send_message(task_id=self.task.id, sender=self.worker, content='Bé ổn rồi')
        send_message(task_id=self.task.id, sender=self.parent, content='Cảm ơn')

        resp = self._client(self.parent).post(
            f'/api/chat/conversations/{self.task.id}/read/'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['marked_count'], 2)  # chỉ 2 tin của worker

        # unread_count về 0
        detail = self._client(self.parent).get(f'/api/chat/conversations/{self.task.id}/')
        self.assertEqual(detail.data['unread_count'], 0)

    def test_invalid_task_id_404(self):
        """task_id không phải số nguyên → URL conf không match → 404."""
        resp = self._client(self.parent).get('/api/chat/conversations/abc/')
        self.assertEqual(resp.status_code, 404)
        # task_id numeric nhưng không tồn tại → 404 từ service
        resp2 = self._client(self.parent).get('/api/chat/conversations/999999/')
        self.assertEqual(resp2.status_code, 404)

    def test_admin_can_view_conversation(self):
        """Admin xem được hội thoại (xử lý tranh chấp)."""
        send_message(task_id=self.task.id, sender=self.parent, content='Tin cho admin xem')
        resp = self._client(self.admin).get(
            f'/api/chat/admin/conversations/{self.task.id}/messages/'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['conversation_status'], 'open')
        self.assertEqual(len(resp.data['messages']), 1)

    def test_non_admin_cannot_use_admin_endpoint(self):
        """User thường gọi endpoint admin → 403 (kể cả bên trong hội thoại)."""
        resp = self._client(self.parent).get(
            f'/api/chat/admin/conversations/{self.task.id}/messages/'
        )
        self.assertEqual(resp.status_code, 403)


# ═══════════════════════════════════════════════════════════════════
#  6. TASK STATE MACHINE KHÔNG ĐỔI
# ═══════════════════════════════════════════════════════════════════

class TaskStateMachineIntegrityTests(ChatTestCaseBase):
    """N không phá Task state machine — completed_at set tại nguồn,
    các transition cũ hoạt động y hệt (verify qua API thật)."""

    def test_completed_at_set_via_api(self):
        """PATCH status completed qua API → completed_at được set tự động."""
        from rest_framework.test import APIClient
        self._start_shift()
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.patch(
            f'/api/tasks/{self.task.id}/status/',
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, 'completed')
        self.assertIsNotNone(self.task.completed_at)
        # Conversation nhận hạn đóng
        conv = Conversation.objects.get(task=self.task)
        self.assertIsNotNone(conv.closes_at)

    def test_invalid_transition_still_rejected(self):
        """Transition sai (open → completed) vẫn bị chặn như cũ."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.patch(
            f'/api/tasks/{self.task.id}/status/',
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_worker_cannot_change_status(self):
        """Worker không đổi được status task (permission cũ giữ nguyên)."""
        from rest_framework.test import APIClient
        self._start_shift()
        client = APIClient()
        client.force_authenticate(user=self.worker)
        resp = client.patch(
            f'/api/tasks/{self.task.id}/status/',
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
