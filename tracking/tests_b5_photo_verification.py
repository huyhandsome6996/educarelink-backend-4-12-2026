"""
B5 — Test Xác thực bằng ảnh trong ca làm (bổ sung cho RandomVerificationCheck).

Chạy: python manage.py test tracking.tests_b5_photo_verification --verbosity=2

Phương án A: mở rộng RandomVerificationCheck (verification_type + photo field),
tái sử dụng state machine pending/confirmed/wrong_code/timeout/cancelled.

Phủ các case:
  - Nộp ảnh hợp lệ → confirmed + ảnh lưu + parent được thông báo (1 lần)
  - Nộp cho check của người khác → 403
  - Nộp khi không đang tham gia task (task completed / không phải assignee)
  - Nộp cho check hết hạn → timeout + 400
  - Nộp cho check đã huỷ / đã xong → 400
  - Nộp trùng (đã có ảnh) → 400
  - File quá lớn → 400, check vẫn pending
  - File sai định dạng / MIME giả mạo (đuôi .jpg nhưng nội dung text) → 400,
    check vẫn pending
  - Ảnh bị từ chối vẫn giữ đúng trạng thái pending
  - Phụ huynh xem được ảnh (bytes) / worker xem lại ảnh / admin xem được
  - Người không liên quan không xem được ảnh → 403
  - Thông báo phụ huynh không bị gửi trùng
  - Scheduler tạo check photo: deadline riêng (180s), push type đúng
  - Nhập PIN cho check photo → 400
  - Nộp ảnh cho check PIN → 400
  - History endpoint có field photo
  - Pending endpoint trả verification_type
"""

import io
import os
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication, Notification
from tracking.models import RandomVerificationCheck
from tracking.services import respond_verification_check, submit_verification_photo
from tracking.verification_scheduler import (
    RESPOND_TIMEOUT_SECONDS, PHOTO_RESPOND_TIMEOUT_SECONDS,
    VERIFICATION_PHOTO_MAX_MB, trigger_verification_check_now,
    _create_check,
)


def make_real_image(format='JPEG', size=(60, 40), color=(240, 100, 30)) -> bytes:
    """Tạo bytes ảnh THẬT bằng Pillow (PIL verify được) — JPEG/PNG/WebP."""
    buf = io.BytesIO()
    img = Image.new('RGB', size, color)
    img.save(buf, format=format)
    return buf.getvalue()


def make_fake_jpeg() -> bytes:
    """File GIẢ MẠO: đuôi + content_type là image/jpeg nhưng nội dung là text."""
    return b'This is not an image at all - just plain text pretending to be JPEG.'


@override_settings(DEBUG=True)
class B5PhotoVerificationTestCase(TestCase):
    """Base: parent + worker (có PIN) + task in_progress + consent granted."""

    def setUp(self):
        self.client = APIClient()

        self.parent = User.objects.create_user(
            username='b5_parent', password='parent_pass_123',
            role='parent', email='b5_parent@test.com',
        )
        self.worker = User.objects.create_user(
            username='b5_worker', password='worker_pass_123',
            role='worker', email='b5_worker@test.com',
            is_approved=True,
        )
        self.worker.set_verification_pin('1234')

        # Worker khác (không liên quan) — để test 403
        self.other_worker = User.objects.create_user(
            username='b5_other_worker', password='other_pass_123',
            role='worker', email='b5_other@test.com',
            is_approved=True,
        )
        self.other_worker.set_verification_pin('5678')

        # Parent khác (không sở hữu task) — để test 403 xem ảnh
        self.other_parent = User.objects.create_user(
            username='b5_other_parent', password='other_pass_123',
            role='parent', email='b5_other_parent@test.com',
        )

        self.category = ServiceCategory.objects.create(name='Gia sư B5')
        self.task = Task.objects.create(
            title='Task B5 photo verification',
            description='Test B5',
            price=Decimal('200000'),
            status='in_progress',
            parent=self.parent,
            category=self.category,
            location='HCM',
            latitude=10.0,
            longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted',
        )

        self.photo_check = RandomVerificationCheck.objects.create(
            task=self.task,
            worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=PHOTO_RESPOND_TIMEOUT_SECONDS),
            status='pending',
            verification_type='photo',
        )

    def _make_pin_pending(self):
        """Helper: đổi photo_check sang trạng thái đã kết thúc rồi tạo check
        PIN pending — vì unique constraint (task, worker) WHERE status='pending'
        chỉ cho 1 check pending cùng lúc."""
        RandomVerificationCheck.objects.filter(
            task=self.task, worker=self.worker, status='pending',
        ).update(status='cancelled', responded_at=timezone.now())
        return RandomVerificationCheck.objects.create(
            task=self.task,
            worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=RESPOND_TIMEOUT_SECONDS),
            status='pending',
            verification_type='pin',
        )

    def _photo_file(self, format='JPEG', name=None, content=None, content_type=None):
        """Helper tạo file upload — mặc định là ảnh JPEG thật."""
        if content is None:
            content = make_real_image(format=format)
        if name is None:
            ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}.get(format, 'jpg')
            name = f'verification.{ext}'
        if content_type is None:
            content_type = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}[format]
        return SimpleUploadedFile(name, content, content_type=content_type)

    def _login(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def tearDown(self):
        """Dọn file ảnh đã upload trong test.

        Ảnh xác minh lưu trong PRIVATE_MEDIA_ROOT (ngoài MEDIA_ROOT) —
        không nằm trong gitignored media/ của repo, không dọn sẽ đọng
        file rác giữa các lần chạy test.
        """
        for check in RandomVerificationCheck.objects.all():
            if check.photo and check.photo.name:
                try:
                    storage = check.photo.storage
                    if storage.exists(check.photo.name):
                        storage.delete(check.photo.name)
                except Exception:
                    pass
        super().tearDown()


# ═══════════════════════════════════════════════════════════════════
#  1. NỘP ẢNH — happy path + state machine
# ═══════════════════════════════════════════════════════════════════

class SubmitPhotoTests(B5PhotoVerificationTestCase):

    def test_submit_valid_photo_confirms_check(self):
        """Nộp ảnh JPEG thật → 200, check confirmed, ảnh + timestamps lưu."""
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file(), 'latitude': '10.5', 'longitude': '106.5'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'confirmed')
        self.assertEqual(resp.data['check_id'], self.photo_check.id)

        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'confirmed')
        self.assertTrue(self.photo_check.photo)
        self.assertIsNotNone(self.photo_check.photo_submitted_at)
        self.assertIsNotNone(self.photo_check.responded_at)
        self.assertEqual(float(self.photo_check.response_lat), 10.5)
        self.assertEqual(float(self.photo_check.response_lng), 106.5)
        # Ảnh lưu đúng thư mục convention
        self.assertTrue(
            self.photo_check.photo.name.startswith('verification_photos/'),
            f'Ảnh phải lưu trong verification_photos/, thực tế: {self.photo_check.photo.name}',
        )

    def test_submit_png_and_webp_ok(self):
        """PNG + WebP đều hợp lệ."""
        for fmt in ('PNG', 'WEBP'):
            # Check hiện tại đã confirmed sau vòng lặp trước → reset pending
            RandomVerificationCheck.objects.filter(task=self.task, worker=self.worker).delete()
            check = RandomVerificationCheck.objects.create(
                task=self.task, worker=self.worker,
                respond_deadline=timezone.now() + timedelta(seconds=180),
                status='pending', verification_type='photo',
            )
            client = self._login(self.worker)
            resp = client.post(
                f'/api/tracking/verification-checks/{check.id}/photo/',
                {'photo': self._photo_file(format=fmt)},
                format='multipart',
            )
            self.assertEqual(resp.status_code, 200, f'{fmt} phải được chấp nhận: {resp.data}')

    def test_submit_other_worker_check_403(self):
        """Worker khác nộp cho check không phải của mình → 403, check không đổi."""
        client = self._login(self.other_worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 403)
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'pending')
        self.assertFalse(bool(self.photo_check.photo))

    def test_submit_duplicate_photo_400(self):
        """Nộp trùng (check đã confirmed + có ảnh) → 400 với lỗi rõ ràng."""
        client = self._login(self.worker)
        resp1 = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp1.status_code, 200)

        resp2 = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp2.status_code, 400)
        self.assertIn('đã nộp', str(resp2.data['error']).lower())

    def test_submit_expired_check_times_out(self):
        """Check quá deadline → 400 + status tự chuyển 'timeout'."""
        self.photo_check.respond_deadline = timezone.now() - timedelta(seconds=5)
        self.photo_check.save()
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('hết thời gian', str(resp.data['error']).lower())
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'timeout')

    def test_submit_cancelled_check_400(self):
        """Check đã bị huỷ → 400, không nộp được."""
        self.photo_check.status = 'cancelled'
        self.photo_check.responded_at = timezone.now()
        self.photo_check.save()
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_submit_timeout_check_400(self):
        """Check đã timeout → 400."""
        self.photo_check.status = 'timeout'
        self.photo_check.save()
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_submit_task_not_in_progress_400(self):
        """Task completed → check pending bị signal auto-cancel + submit 400.

        Kiểm chứng luôn hành vi hệ thống: tracking.signals tự huỷ pending
        check khi task kết thúc (cancel_pending_verification_checks_for_task)
        → nộp ảnh bị chặn với lỗi 'đã kết thúc'.
        """
        self.task.status = 'completed'
        self.task.save()  # post_save signal → auto-cancel pending checks
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'cancelled',
                         'Pending check phải bị signal auto-cancel khi task completed')
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('đã kết thúc', str(resp.data['error']).lower())

    def test_submit_worker_not_assignee_400(self):
        """Worker sở hữu check nhưng đã bị thay assignee khác → 400.

        Mô phỏng: xoá TaskApplication accepted của worker, tạo cho
        other_worker → worker gốc không còn đang tham gia task.
        """
        TaskApplication.objects.filter(task=self.task, worker=self.worker).delete()
        TaskApplication.objects.create(
            task=self.task, worker=self.other_worker, status='accepted',
        )
        # Check vẫn thuộc worker gốc (tạo trước khi đổi người)
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('không phải carepartner đang thực hiện', str(resp.data['error']).lower())

    def test_submit_photo_to_pin_check_400(self):
        """Nộp ảnh cho check loại PIN → 400 với message rõ ràng."""
        pin_check = self._make_pin_pending()
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{pin_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('mã pin', str(resp.data['error']).lower())
        pin_check.refresh_from_db()
        self.assertEqual(pin_check.status, 'pending')

    def test_submit_pin_to_photo_check_400(self):
        """Nhập PIN cho check loại photo → 400 (phải nộp ảnh)."""
        with self.assertRaises(ValueError):
            respond_verification_check(
                check_id=self.photo_check.id,
                requester=self.worker,
                pin='1234',
            )
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'pending')


# ═══════════════════════════════════════════════════════════════════
#  2. VALIDATE FILE — size + MIME thật
# ═══════════════════════════════════════════════════════════════════

class PhotoValidationTests(B5PhotoVerificationTestCase):

    def test_file_too_large_400(self):
        """File vượt dung lượng (VERIFICATION_PHOTO_MAX_MB) → 400, check vẫn pending."""
        # Ảnh noise thật (JPEG không nén được) — 2500x2500 quality 95 ≈ 6MB > 5MB
        big_buf = io.BytesIO()
        noise_img = Image.effect_noise((2500, 2500), 90)
        noise_img = noise_img.convert('RGB')
        noise_img.save(big_buf, format='JPEG', quality=95)
        big_bytes = big_buf.getvalue()

        # Đảm bảo thật sự vượt giới hạn; nếu môi trường tạo ảnh nhỏ hơn thì skip
        max_bytes = int(VERIFICATION_PHOTO_MAX_MB * 1024 * 1024)
        if len(big_bytes) <= max_bytes:
            self.skipTest(f'Không tạo được ảnh > {max_bytes} bytes')

        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': SimpleUploadedFile('big.jpg', big_bytes, content_type='image/jpeg')},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('quá lớn', str(resp.data['error']).lower())
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'pending')

    def test_fake_mime_text_file_400(self):
        """File text giả mạo đuôi .jpg + content_type image/jpeg → 400 (Pillow bắt được)."""
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': SimpleUploadedFile('fake.jpg', make_fake_jpeg(), content_type='image/jpeg')},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('không phải ảnh hợp lệ', str(resp.data['error']).lower())

    def test_missing_file_400(self):
        """Không gửi file nào → 400."""
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('thiếu file', str(resp.data['error']).lower())

    def test_empty_file_400(self):
        """File rỗng → 400."""
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': SimpleUploadedFile('empty.jpg', b'', content_type='image/jpeg')},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_rejected_photo_keeps_pending_state(self):
        """Ảnh bị từ chối (sai định dạng) → check GIỮ NGUYÊN trạng thái pending."""
        # Nộp ảnh hỏng
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': SimpleUploadedFile('fake.jpg', make_fake_jpeg(), content_type='image/jpeg')},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'pending')
        self.assertFalse(bool(self.photo_check.photo))

        # Nộp lại ảnh ĐÚNG ngay sau → vẫn thành công (check chưa bị khoá)
        resp2 = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp2.status_code, 200)
        self.photo_check.refresh_from_db()
        self.assertEqual(self.photo_check.status, 'confirmed')

    def test_gif_rejected_400(self):
        """GIF không nằm trong danh sách cho phép → 400."""
        gif_bytes = io.BytesIO()
        Image.new('RGB', (20, 20), (255, 0, 0)).save(gif_bytes, format='GIF')
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': SimpleUploadedFile('anim.gif', gif_bytes.getvalue(), content_type='image/gif')},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('không được hỗ trợ', str(resp.data['error']).lower())


# ═══════════════════════════════════════════════════════════════════
#  3. XEM ẢNH — quyền truy cập (auth, không public URL)
# ═══════════════════════════════════════════════════════════════════

class ViewPhotoTests(B5PhotoVerificationTestCase):

    def setUp(self):
        super().setUp()
        # Nộp ảnh trước để có ảnh xem
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 200)

    def test_parent_views_photo_bytes(self):
        """Phụ huynh của task xem được bytes ảnh + đúng content-type."""
        client = self._login(self.parent)
        resp = client.get(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'image/jpeg')
        # Nội dung phải là ảnh JPEG thật (magic bytes FFD8)
        self.assertEqual(resp.content[:2], b'\xff\xd8')
        # Không cache public
        self.assertIn('no-store', resp['Cache-Control'])

    def test_worker_views_own_photo(self):
        """Worker xem lại ảnh mình đã nộp → 200."""
        client = self._login(self.worker)
        resp = client.get(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
        )
        self.assertEqual(resp.status_code, 200)

    def test_admin_views_photo(self):
        """Admin (is_superuser) xem được ảnh → 200."""
        admin = User.objects.create_user(
            username='b5_admin', password='admin_pass_123',
            role='parent', email='b5_admin@test.com',
            is_staff=True, is_superuser=True,
        )
        client = self._login(admin)
        resp = client.get(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
        )
        self.assertEqual(resp.status_code, 200)

    def test_unrelated_user_cannot_view_403(self):
        """Parent khác / worker khác không xem được → 403."""
        for outsider in (self.other_parent, self.other_worker):
            client = self._login(outsider)
            resp = client.get(
                f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            )
            self.assertEqual(resp.status_code, 403, f'{outsider.username} phải bị 403')

    def test_anonymous_cannot_view_401(self):
        """Không auth → 401 (default IsAuthenticated)."""
        client = APIClient()
        resp = client.get(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
        )
        self.assertEqual(resp.status_code, 401)

    def test_photo_json_metadata_mode(self):
        """?format=json trả metadata — tiện debug + QA test."""
        client = self._login(self.parent)
        resp = client.get(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/?format=json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['check_id'], self.photo_check.id)
        self.assertEqual(resp.data['verification_type'], 'photo')
        self.assertEqual(resp.data['status'], 'confirmed')
        self.assertIsNotNone(resp.data['photo_submitted_at'])

    def test_photo_pending_check_no_photo_400(self):
        """Check photo chưa nộp ảnh → GET trả 400 'chưa có ảnh'."""
        check_no_photo = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=180),
            status='pending', verification_type='photo',
        )
        client = self._login(self.parent)
        resp = client.get(
            f'/api/tracking/verification-checks/{check_no_photo.id}/photo/',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('chưa có ảnh', str(resp.data['error']).lower())

    def test_media_url_not_exposed_in_api(self):
        """API không trả URL /media/ public — phải qua endpoint có auth."""
        client = self._login(self.parent)
        resp = client.get(
            f'/api/tracking/{self.task.id}/verification-checks/history/',
        )
        self.assertEqual(resp.status_code, 200)
        for check in resp.data['checks']:
            if check['id'] == self.photo_check.id:
                self.assertNotIn('/media/', str(check))
                self.assertTrue(check['has_photo'])


# ═══════════════════════════════════════════════════════════════════
#  4. THÔNG BÁO PHỤ HUYNH — chống gửi trùng
# ═══════════════════════════════════════════════════════════════════

class ParentNotificationTests(B5PhotoVerificationTestCase):

    def test_parent_notified_once_on_photo_submit(self):
        """Nộp ảnh hợp lệ → phụ huynh nhận ĐÚNG 1 Notification 'Ảnh xác minh'."""
        notif_count_before = Notification.objects.filter(
            recipient=self.parent,
            title__contains='Ảnh xác minh',
        ).count()
        self.assertEqual(notif_count_before, 0)

        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 200)

        notif_count_after = Notification.objects.filter(
            recipient=self.parent,
            title__contains='Ảnh xác minh',
        ).count()
        self.assertEqual(notif_count_after, 1)
        self.photo_check.refresh_from_db()
        self.assertTrue(self.photo_check.parent_photo_notification_sent)

    def test_parent_not_notified_on_failed_submit(self):
        """Nộp ảnh KHÔNG hợp lệ → không thông báo phụ huynh."""
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': SimpleUploadedFile('fake.jpg', make_fake_jpeg(), content_type='image/jpeg')},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.parent, title__contains='Ảnh xác minh',
            ).count(), 0,
        )
        self.photo_check.refresh_from_db()
        self.assertFalse(self.photo_check.parent_photo_notification_sent)

    def test_notification_not_duplicated_on_service_retry(self):
        """Gọi service 2 lần (giả lập retry network) → chỉ 1 notification.

        Lần 2 bị chặn bởi state machine (check đã confirmed) — nhưng nếu ai
        đó gọi trực tiếp service với check đã confirmed + flag đã set thì
        notification cũng không gửi lại.
        """
        submit_verification_photo(
            check_id=self.photo_check.id,
            requester=self.worker,
            photo_file=self._photo_file(),
        )
        # Flag đã set sau lần 1
        self.photo_check.refresh_from_db()
        self.assertTrue(self.photo_check.parent_photo_notification_sent)

        # Lần 2 → ValueError (đã nộp) + không thêm notification
        with self.assertRaises(ValueError):
            submit_verification_photo(
                check_id=self.photo_check.id,
                requester=self.worker,
                photo_file=self._photo_file(),
            )
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.parent, title__contains='Ảnh xác minh',
            ).count(), 1,
        )


# ═══════════════════════════════════════════════════════════════════
#  5. SCHEDULER — tạo check photo (server-side random)
# ═══════════════════════════════════════════════════════════════════

class SchedulerPhotoCheckTests(B5PhotoVerificationTestCase):

    def test_create_photo_check_uses_photo_deadline(self):
        """_create_check(type='photo') → deadline = now + PHOTO_RESPOND_TIMEOUT_SECONDS (180s)."""
        # Dọn check pending setUp để không dính unique constraint
        RandomVerificationCheck.objects.all().delete()
        before = timezone.now()
        check = _create_check(self.task, self.worker, verification_type='photo')
        self.assertEqual(check.verification_type, 'photo')
        self.assertEqual(check.status, 'pending')
        # Deadline trong khoảng [before+180s, now+180s]
        self.assertGreaterEqual(
            check.respond_deadline, before + timedelta(seconds=PHOTO_RESPOND_TIMEOUT_SECONDS),
        )
        self.assertLessEqual(
            check.respond_deadline, timezone.now() + timedelta(seconds=PHOTO_RESPOND_TIMEOUT_SECONDS),
        )

    def test_create_pin_check_uses_pin_deadline(self):
        """_create_check(type='pin') → deadline vẫn dùng RESPOND_TIMEOUT_SECONDS (90s)."""
        RandomVerificationCheck.objects.all().delete()
        check = _create_check(self.task, self.worker, verification_type='pin')
        self.assertEqual(check.verification_type, 'pin')
        delta = (check.respond_deadline - check.triggered_at).total_seconds()
        self.assertAlmostEqual(delta, RESPOND_TIMEOUT_SECONDS, delta=5)

    def test_photo_check_deadline_longer_than_pin(self):
        """Deadline photo (180s) > deadline pin (90s) — chụp ảnh cần thêm thời gian."""
        self.assertGreater(PHOTO_RESPOND_TIMEOUT_SECONDS, RESPOND_TIMEOUT_SECONDS)

    def test_trigger_now_with_photo_type(self):
        """trigger_verification_check_now(task_id, 'photo') → tạo check photo ngay."""
        # Xoá 2 check pending setUp để không dính unique constraint
        RandomVerificationCheck.objects.all().delete()
        check = trigger_verification_check_now(self.task.id, verification_type='photo')
        self.assertEqual(check.verification_type, 'photo')

    def test_trigger_now_invalid_type_raises(self):
        """verification_type sai → ValueError."""
        with self.assertRaises(ValueError):
            trigger_verification_check_now(self.task.id, verification_type='sms')

    def test_admin_trigger_api_with_photo_type(self):
        """POST admin/trigger-verification-check với verification_type='photo' → 201/200."""
        RandomVerificationCheck.objects.all().delete()
        admin = User.objects.create_user(
            username='b5_admin_trig', password='admin_pass_123',
            role='parent', email='b5_admin_trig@test.com',
            is_staff=True, is_superuser=True,
        )
        client = self._login(admin)
        resp = client.post(
            '/api/tracking/admin/trigger-verification-check/',
            {'task_id': self.task.id, 'verification_type': 'photo'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['verification_type'], 'photo')

    def test_admin_trigger_api_invalid_type_400(self):
        """POST admin trigger với type sai → 400."""
        admin = User.objects.create_user(
            username='b5_admin_trig2', password='admin_pass_123',
            role='parent', email='b5_admin_trig2@test.com',
            is_staff=True, is_superuser=True,
        )
        client = self._login(admin)
        resp = client.post(
            '/api/tracking/admin/trigger-verification-check/',
            {'task_id': self.task.id, 'verification_type': 'voice'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)


# ═══════════════════════════════════════════════════════════════════
#  6. API CONTRACT — pending + history + serializer
# ═══════════════════════════════════════════════════════════════════

class ApiContractTests(B5PhotoVerificationTestCase):

    def test_pending_endpoint_returns_verification_type(self):
        """GET pending check trả verification_type để mobile render đúng UI."""
        client = self._login(self.worker)
        resp = client.get('/api/tracking/verification-checks/pending/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_pending'])
        self.assertEqual(resp.data['check_id'], self.photo_check.id)
        self.assertEqual(resp.data['verification_type'], 'photo')

    def test_pending_endpoint_pin_type(self):
        """Check pending loại pin → verification_type='pin' (backward compat)."""
        pin_check = self._make_pin_pending()
        client = self._login(self.worker)
        resp = client.get('/api/tracking/verification-checks/pending/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_pending'])
        self.assertEqual(resp.data['check_id'], pin_check.id)
        self.assertEqual(resp.data['verification_type'], 'pin')

    def test_history_includes_photo_fields(self):
        """History endpoint cho parent có verification_type + has_photo + photo_submitted_at."""
        client = self._login(self.worker)
        client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        # Tạo thêm 1 check PIN đã confirmed (đối chiếu type trong history)
        pin_history_check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='confirmed', verification_type='pin',
            responded_at=timezone.now(),
        )
        parent_client = self._login(self.parent)
        resp = parent_client.get(
            f'/api/tracking/{self.task.id}/verification-checks/history/',
        )
        self.assertEqual(resp.status_code, 200)
        checks = {c['id']: c for c in resp.data['checks']}
        self.assertIn(self.photo_check.id, checks)
        photo_item = checks[self.photo_check.id]
        self.assertEqual(photo_item['verification_type'], 'photo')
        self.assertTrue(photo_item['has_photo'])
        self.assertIsNotNone(photo_item['photo_submitted_at'])
        self.assertEqual(photo_item['status'], 'confirmed')
        # Check PIN trong history vẫn là pin + không có ảnh
        pin_item = checks[pin_history_check.id]
        self.assertEqual(pin_item['verification_type'], 'pin')
        self.assertFalse(pin_item['has_photo'])

    def test_history_parent_isolation_403(self):
        """Parent khác xem history task của người khác → 403."""
        client = self._login(self.other_parent)
        resp = client.get(
            f'/api/tracking/{self.task.id}/verification-checks/history/',
        )
        self.assertEqual(resp.status_code, 403)

    def test_admin_list_filter_by_type(self):
        """Admin list checks filter ?verification_type=photo hoạt động."""
        admin = User.objects.create_user(
            username='b5_admin_list', password='admin_pass_123',
            role='parent', email='b5_admin_list@test.com',
            is_staff=True, is_superuser=True,
        )
        client = self._login(admin)
        resp = client.get(
            '/api/tracking/admin/verification-checks/?verification_type=photo',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(all(
            c['verification_type'] == 'photo' for c in resp.data['checks']
        ))
        self.assertTrue(any(
            c['id'] == self.photo_check.id for c in resp.data['checks']
        ))

    def test_old_pin_check_defaults_verification_type_pin(self):
        """Row tạo không chỉ định type (data cũ) → mặc định 'pin'."""
        # Dọn pending check của setUp (unique constraint chỉ cho 1 pending)
        RandomVerificationCheck.objects.filter(
            task=self.task, worker=self.worker, status='pending',
        ).update(status='cancelled', responded_at=timezone.now())
        legacy = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
        )
        legacy.refresh_from_db()
        self.assertEqual(legacy.verification_type, 'pin')


# ═══════════════════════════════════════════════════════════════════
#  7. REGRESSION — PIN flow không bị phá
# ═══════════════════════════════════════════════════════════════════

class PinFlowRegressionTests(B5PhotoVerificationTestCase):
    """Đảm bảo luồng PIN hiện tại hoạt động nguyên vẹn sau khi thêm B5."""

    def test_pin_respond_still_works(self):
        """Worker nhập đúng PIN cho check PIN → confirmed như cũ."""
        pin_check = self._make_pin_pending()
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{pin_check.id}/respond/',
            {'pin': '1234'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'confirmed')

    def test_pin_wrong_attempts_still_counted(self):
        """Nhập sai PIN 1 lần → 400 'Còn 2 lần thử' (MAX_WRONG_ATTEMPTS=3)."""
        pin_check = self._make_pin_pending()
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{pin_check.id}/respond/',
            {'pin': '9999'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        pin_check.refresh_from_db()
        self.assertEqual(pin_check.attempts, 1)
        self.assertEqual(pin_check.status, 'pending')


# ═══════════════════════════════════════════════════════════════════
#  8. SECURITY FIX — chặn truy cập trực tiếp /media/verification_photos/
#  (QA phát hiện: docstring tuyên bố "không public qua /media/" nhưng
#   MEDIA_ROOT serve công khai mọi file. Fix 3 lớp: storage ngoài
#   MEDIA_ROOT + re_path 403 + guard chống bypass trong backend/urls.py)
#
#  Phân biệt với ViewPhotoTests (mục 3): mục đó test xem ảnh QUA API
#  endpoint có auth; mục này test request TRỰC TIẾP vào /media/ URL.
# ═══════════════════════════════════════════════════════════════════

class DirectMediaAccessSecurityTests(B5PhotoVerificationTestCase):
    """GET trực tiếp /media/verification_photos/<file thật> (kể cả khi
    file vật lý tồn tại trong MEDIA_ROOT — giả lập file legacy) phải bị
    chặn 403 — không auth, có auth, file tồn tại hay không đều như nhau.

    Lưu ý: class cha có @override_settings(DEBUG=True) — test nào cần
    nhánh production (DEBUG=False) sẽ override lại ở method.
    """

    def _write_legacy_media_file(self, relative_path):
        """Tạo file JPEG THẬT tại MEDIA_ROOT/<relative_path> — giả lập file
        legacy upload trước thời điểm chuyển sang private storage (nếu có).
        Tự dọn file khi test xong bằng addCleanup."""
        from django.conf import settings
        full_path = os.path.join(str(settings.MEDIA_ROOT), relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'wb') as f:
            f.write(make_real_image())

        def _cleanup():
            try:
                os.remove(full_path)
            except FileNotFoundError:
                pass
            # Xoá thư mục nếu rỗng — không để lại vết trong repo
            try:
                os.rmdir(os.path.dirname(full_path))
            except OSError:
                pass

        self.addCleanup(_cleanup)
        return relative_path

    @override_settings(DEBUG=False)
    def test_media_url_blocked_without_auth_production(self):
        """GET /media/verification_photos/<file thật> KHÔNG auth → 403,
        KHÔNG trả nội dung ảnh (nhánh production)."""
        rel = self._write_legacy_media_file('verification_photos/legacy_check_1.jpg')
        client = APIClient()  # anonymous — không Authorization header
        resp = client.get(f'/media/{rel}')
        self.assertEqual(resp.status_code, 403)
        self.assertNotEqual(resp.get('Content-Type'), 'image/jpeg')
        self.assertNotEqual(resp.content[:2], b'\xff\xd8', 'Không được trả bytes JPEG')

    @override_settings(DEBUG=False)
    def test_media_url_blocked_even_with_auth(self):
        """Có Authorization (parent hợp lệ) cũng 403 — /media/ bị chặn hoàn
        toàn, phải xem qua API endpoint riêng."""
        rel = self._write_legacy_media_file('verification_photos/legacy_check_2.jpg')
        client = self._login(self.parent)
        resp = client.get(f'/media/{rel}')
        self.assertEqual(resp.status_code, 403)

    @override_settings(DEBUG=False)
    def test_media_url_blocked_nonexistent_file(self):
        """File không tồn tại vẫn 403 (không khác biệt 403/404 → không leak
        thông tin file nào đang có trên server)."""
        client = APIClient()
        resp = client.get('/media/verification_photos/khong-ton-tai-xyz.jpg')
        self.assertEqual(resp.status_code, 403)

    def test_media_url_blocked_debug_mode(self):
        """Nhánh DEBUG=True (static() helper) cũng bị chặn — kế thừa
        override DEBUG=True từ class cha."""
        rel = self._write_legacy_media_file('verification_photos/legacy_check_3.jpg')
        client = APIClient()
        resp = client.get(f'/media/{rel}')
        self.assertEqual(resp.status_code, 403)

    @override_settings(DEBUG=False)
    def test_media_url_bypass_variants_blocked(self):
        """Biến thể bypass '//' (slash đôi), './' (dot segment), '%2e%2f'
        (URL-encoded) đều bị guard chuẩn hoá path → 403."""
        rel = self._write_legacy_media_file('verification_photos/legacy_bypass.jpg')
        client = APIClient()
        for url in (
            f'/media//{rel}',                      # slash đôi
            f'/media/./{rel}',                     # dot segment
            f'/media/%2e%2f{rel}',                 # URL-encoded './'
            '/media/..%2fverification_photos/legacy_bypass.jpg',  # encoded '../'
        ):
            resp = client.get(url)
            self.assertEqual(
                resp.status_code, 403,
                f'Biến thể bypass {url!r} phải bị chặn 403, nhận {resp.status_code}',
            )

    @override_settings(DEBUG=False)
    def test_other_media_still_served_production(self):
        """Ảnh media KHÁC (id_cards — dùng bởi core.User.id_card_front)
        vẫn serve công khai như cũ (nhánh production — FileResponse streaming)."""
        rel = self._write_legacy_media_file('id_cards/id_card_front_test.jpg')
        client = APIClient()
        resp = client.get(f'/media/{rel}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get('Content-Type'), 'image/jpeg')
        # serve() trả FileResponse (streaming) — đọc bytes qua streaming_content
        body = b''.join(resp.streaming_content)
        self.assertEqual(body[:2], b'\xff\xd8')

    def test_other_media_still_served_debug(self):
        """Nhánh DEBUG=True: media khác (selfies/) vẫn serve như cũ."""
        rel = self._write_legacy_media_file('selfies/selfie_test.jpg')
        client = APIClient()
        resp = client.get(f'/media/{rel}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get('Content-Type'), 'image/jpeg')
        body = b''.join(resp.streaming_content)
        self.assertEqual(body[:2], b'\xff\xd8')

    @override_settings(DEBUG=False)
    def test_photo_saved_outside_media_root(self):
        """Ảnh nộp qua API phải lưu trong PRIVATE_MEDIA_ROOT (ngoài
        MEDIA_ROOT) — bảo vệ vật lý, không phụ thuộc urls.py."""
        from django.conf import settings
        client = self._login(self.worker)
        resp = client.post(
            f'/api/tracking/verification-checks/{self.photo_check.id}/photo/',
            {'photo': self._photo_file()},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 200)
        self.photo_check.refresh_from_db()

        private_root = str(getattr(settings, 'PRIVATE_MEDIA_ROOT', ''))
        media_root = str(settings.MEDIA_ROOT)
        self.assertTrue(private_root, 'PRIVATE_MEDIA_ROOT phải được cấu hình trong settings')
        self.assertTrue(
            self.photo_check.photo.path.startswith(private_root),
            f'Ảnh phải nằm trong {private_root}, thực tế: {self.photo_check.photo.path}',
        )
        self.assertFalse(
            self.photo_check.photo.path.startswith(media_root),
            f'Ảnh KHÔNG được nằm trong MEDIA_ROOT ({media_root}) — sẽ bị serve công khai',
        )

    def test_storage_url_raises_no_public_url(self):
        """storage.url() raise ValueError — không thể vô tình sinh URL công
        khai cho ảnh xác minh (fail to ngay trong dev thay vì lộ link)."""
        from tracking.storages import PrivateVerificationPhotoStorage
        storage = PrivateVerificationPhotoStorage()
        with self.assertRaises(ValueError):
            storage.url('verification_photos/x.jpg')
