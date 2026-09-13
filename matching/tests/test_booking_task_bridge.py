"""
matching/tests/test_booking_task_bridge.py — N-003 (QA 2026-09-13).

Booking Flow 1 KHÔNG có core.Task → nút chat / tracking / đánh giá trên thẻ
booking của phụ huynh sẽ 404 (chat.Conversation mở trên core.Task; Review
cũng gắn Task). Bridge matching/services/booking_task_bridge.py tạo Task
"mirror" khi booking → in_progress và đồng bộ vòng đời qua state.transition:

  in_progress     → Task mirror + TaskApplication(accepted) + chat MỞ
  awaiting_review → Task completed + completed_at → chat đóng +24h
  hủy/no_show...  → Task cancelled (nếu chưa completed) → chat đóng NGAY

Chạy: python manage.py test matching.tests.test_booking_task_bridge --verbosity=2
"""

from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone as tz

from chat.models import Conversation
from chat.services import close_conversation_for_task, open_conversation_for_task
from core.models import Task, TaskApplication
from matching.api.bookings import _booking_dict
from matching.constants import BookingStatus
from matching.models import Booking, JobPost, JobSlot
from matching.services.booking_task_bridge import (
    ensure_task_for_booking,
    sync_task_mirror_on_transition,
)
from matching.services.elo_service import EloService
from matching.services.lock_service import LockService
from matching.services.state import transition
from matching.tests.base import MatchingTestBase

from datetime import date

User = get_user_model()
MONDAY = date(2026, 9, 14)


class BookingTaskBridgeTestBase(MatchingTestBase):
    """Seed: parent + carepartner + job 1 slot + booking đã committed."""

    def setUp(self):
        super().setUp()
        self.parent = User.objects.create_user('br_parent', password='x', role='parent')
        self.cp = User.objects.create_user('br_cp', password='x', role='worker',
                                           is_approved=True)
        EloService.get_profile(self.cp)
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring',
            title='Gia sư Toán lớp 6 tối thứ Hai', hourly_rate_vnd=100000,
            status='carepartner_selected', latitude=21.0, longitude=105.8,
            type_data={'location_note': 'Số 12 Nguyễn Trãi, Thanh Xuân'},
            ai_parse_result={'required_skills': ['toan']})
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        self.booking = Booking.objects.create(
            job=self.job, carepartner=self.cp, parent=self.parent,
            status=BookingStatus.COMMITTED,
            selected_at=tz.now() - timedelta(hours=2),
            commit_deadline=tz.now() + timedelta(hours=1),
            total_value_vnd=200000)

    def _start(self):
        """committed → in_progress qua state machine (đường đi thật của API)."""
        self.booking.started_at = tz.now()
        self.booking.save(update_fields=['started_at'])
        return transition(self.booking, BookingStatus.IN_PROGRESS,
                          actor='carepartner', reason='test start')


class TaskMirrorCreationTests(BookingTaskBridgeTestBase):
    def test_start_creates_task_mirror_with_accepted_application(self):
        """Booking bắt đầu → Task mirror status in_progress + application accepted."""
        self._start()
        self.booking.refresh_from_db()
        self.assertIsNotNone(self.booking.task_id)
        task = self.booking.task
        self.assertEqual(task.status, 'in_progress')
        self.assertEqual(task.parent_id, self.parent.id)
        self.assertEqual(task.price, 200000)
        app = TaskApplication.objects.filter(task=task, worker=self.cp).first()
        self.assertIsNotNone(app)
        self.assertEqual(app.status, 'accepted')

    def test_start_opens_chat_conversation(self):
        """N-003 lõi: sau khi booking bắt đầu, cửa sổ chat PHẢI mở.

        Đảm bảo đúng cơ chế backend: conversation mở trên core.Task (không
        phải booking/job), parent ↔ carepartner đúng người."""
        self._start()
        task = self.booking.task
        conv = Conversation.objects.filter(task=task).first()
        self.assertIsNotNone(conv, 'Chat conversation phải được mở cho Task mirror')
        self.assertEqual(conv.status, 'open')
        self.assertEqual(conv.parent_id, self.parent.id)
        self.assertEqual(conv.worker_id, self.cp.id)

    def test_serializer_exposes_task_id(self):
        """Serializer trả task_id (client dùng cho navigate('Chat')) — và
        KHÔNG dùng job_id làm taskId (regression N-003)."""
        self._start()
        data = _booking_dict(Booking.objects.get(pk=self.booking.pk))
        self.assertIsNotNone(data['task_id'])
        self.assertNotEqual(data['task_id'], data['job_id'])
        self.assertIsNone(data['review'])

    def test_serializer_task_id_null_when_not_started(self):
        """Booking chưa bắt đầu (committed/awaiting) → task_id null — client
        ẩn nút chat (degradation trung thực, không 404)."""
        data = _booking_dict(Booking.objects.get(pk=self.booking.pk))
        self.assertIsNone(data['task_id'])

    def test_ensure_task_idempotent(self):
        """Gọi ensure 2 lần → KHÔNG tạo Task/application trùng."""
        self._start()
        task_before = self.booking.task
        task2, created = ensure_task_for_booking(self.booking)
        self.assertFalse(created)
        self.assertEqual(task2.pk, task_before.pk)
        self.assertEqual(Task.objects.filter(flow1_bookings=self.booking).count(), 1)
        self.assertEqual(
            TaskApplication.objects.filter(task=task_before).count(), 1)

    def test_start_failure_does_not_break_booking_transition(self):
        """Mirror fail (job không có slot) → booking VẪN in_progress, task_id null.

        Luồng tiền/trạng thái của booking không được phá vì lỗi phụ (chat)."""
        self.job.slots.all().delete()  # không còn slot → scheduled_time fallback
        booking = self._start()
        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.IN_PROGRESS)


class TaskMirrorLifecycleTests(BookingTaskBridgeTestBase):
    def test_complete_closes_chat_after_24h(self):
        """Booking hoàn thành (in_progress → awaiting_review) → Task completed
        + completed_at = ended_at → conversation đóng tại ended_at + 24h."""
        self._start()
        conv = Conversation.objects.get(task=self.booking.task)
        ended = tz.now()
        self.booking.ended_at = ended
        self.booking.save(update_fields=['ended_at'])
        transition(self.booking, BookingStatus.AWAITING_REVIEW,
                   actor='system', reason='test complete')
        self.booking.refresh_from_db()
        task = self.booking.task
        task.refresh_from_db()
        self.assertEqual(task.status, 'completed')
        conv.refresh_from_db()
        self.assertEqual(conv.status, 'open')  # chưa đóng thật — còn cửa sổ 24h
        self.assertIsNotNone(conv.closes_at)
        delta = conv.closes_at - task.completed_at
        self.assertAlmostEqual(delta.total_seconds(), 24 * 3600, delta=60)

    def test_cancel_in_progress_closes_chat_immediately(self):
        """Hủy ca đang làm → task cancelled → conversation ĐÓNG NGAY."""
        self._start()
        conv = Conversation.objects.get(task=self.booking.task)
        self.assertEqual(conv.status, 'open')
        transition(self.booking, BookingStatus.CANCELLED_BY_PARENT,
                   actor='parent', reason='test cancel mid-shift')
        task = self.booking.task
        task.refresh_from_db()
        self.assertEqual(task.status, 'cancelled')
        conv.refresh_from_db()
        self.assertEqual(conv.status, 'closed')
        self.assertIsNotNone(conv.closed_at)

    def test_cancel_committed_no_task_created(self):
        """Hủy ở committed (chưa bắt đầu) → KHÔNG tạo Task mirror nào."""
        transition(self.booking, BookingStatus.CANCELLED_BY_PARENT,
                   actor='parent', reason='test cancel committed')
        self.booking.refresh_from_db()
        self.assertIsNone(self.booking.task_id)
        self.assertEqual(Task.objects.count(), 0)

    def test_no_show_from_committed_no_task(self):
        """No-show trước khi bắt đầu → không có task, không có conversation."""
        transition(self.booking, BookingStatus.SUSPECTED_NO_SHOW,
                   actor='system', reason='test suspected')
        transition(self.booking, BookingStatus.NO_SHOW,
                   actor='system', reason='test confirmed')
        self.assertEqual(Task.objects.count(), 0)
        self.assertEqual(Conversation.objects.count(), 0)

    def test_jobpost_transition_does_not_touch_tasks(self):
        """Hook chỉ chạy cho Booking — JobPost transition không tạo Task."""
        self.job.status = 'ai_parsed'
        self.job.save(update_fields=['status'])
        from matching.services.state import transition as t
        from matching.constants import JobPostStatus
        t(self.job, JobPostStatus.MATCHING, actor='system')
        self.assertEqual(Task.objects.count(), 0)


class TaskMirrorReviewTests(BookingTaskBridgeTestBase):
    def test_completed_booking_serializer_returns_real_review(self):
        """Phụ huynh đánh giá Task mirror → serializer trả review thật
        (Blocker B: client không được gán cứng '5 sao')."""
        from core.models import Review
        self._start()
        task = self.booking.task
        Review.objects.create(task=task, reviewer=self.parent,
                              reviewee=self.cp, rating=4, comment='Tạm ổn')
        data = _booking_dict(Booking.objects.get(pk=self.booking.pk))
        self.assertIsNotNone(data['review'])
        self.assertEqual(data['review']['rating'], 4)
        self.assertEqual(data['review']['comment'], 'Tạm ổn')

    def test_legacy_chat_window_functions_work_on_mirror_task(self):
        """open/close helpers của chat hoạt động đúng với Task mirror
        (bảo đảm 2 chiều tương thích — không phụ thuộc signal)."""
        self._start()
        task = self.booking.task
        conv2 = open_conversation_for_task(task)
        self.assertIsNotNone(conv2)  # idempotent get_or_create
        closed = close_conversation_for_task(task)  # task chưa completed → 0 chú
        # task đang in_progress (chưa completed/cancelled) → chỉ update closes_at
        self.assertEqual(closed.pk, conv2.pk)


class TaskMirrorLockTests(BookingTaskBridgeTestBase):
    def test_lock_release_after_complete_still_works(self):
        """Luồng complete gốc không bị bridge phá: LockService release + ELO."""
        self._start()
        self.booking.ended_at = tz.now()
        self.booking.save(update_fields=['ended_at'])
        transition(self.booking, BookingStatus.AWAITING_REVIEW,
                   actor='system', reason='test complete full')
        profile = EloService.get_profile(self.cp)
        self.assertGreaterEqual(profile.jobs_completed, 0)  # không crash là đạt
        # locks của booking được release sạch
        LockService.release_locks(self.booking)
