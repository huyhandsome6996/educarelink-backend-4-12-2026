"""
matching/tests/test_e2e_two_way_sync.py — E2E đồng bộ 2 chiều Web ↔ Mobile
(prompt "KIỂM THỬ ĐỒNG BỘ TOÀN DIỆN WEB ↔ MOBILE" — PHẦN 4 Nhiệm vụ 4).

Mọi request đều đi qua HTTP thật (APIClient) với JWT Bearer lấy từ
/api/auth/login/ — y hệt cách Web (fetch + Bearer) và Mobile (axios +
Bearer) gọi trong production, KHÔNG force_authenticate.

  Test Case 1 (Web → Mobile): phụ huynh đăng việc Gia sư Toán tại TP. Huế
    qua POST /api/matching/jobs/ + publish, chọn CarePartner qua
    select-carepartner → mobile getBookings({role:'parent'}) (GET
    /api/matching/bookings/?role=parent) phải thấy đúng đơn, status
    awaiting_commitment.

  Test Case 2 (Mobile → Web): CarePartner commit qua JWT (như mobile
    MyJobsScreen) → nguồn dữ liệu Web "Việc của tôi" (GET bookings?role=parent
    + GET jobs) phải phản ánh committed + has_booking=True.

  Test Case 3 (Huỷ/Đổi lịch 2 chiều): CP xin đổi giờ → phụ huynh thấy
    reschedule_request trong danh sách; phụ huynh duyệt → CP thấy committed;
    phụ huynh huỷ đơn → cả 2 phía thấy cancelled_by_parent.
"""

from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from matching.models import CarePartnerAvailability
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase

User = get_user_model()


def _next_monday():
    """Thứ 2 kế tiếp (luôn ở tương lai) — tránh test rot theo lịch thật."""
    today = tz.localdate()
    days_ahead = (0 - today.weekday()) % 7
    return today + timedelta(days=days_ahead or 7)


MONDAY = _next_monday()

# Toạ độ trung tâm TP. Huế — chuẩn địa bàn triển khai duy nhất của dự án
HUE_LAT, HUE_LNG = 16.4637, 107.5909


class E2ETwoWaySyncTest(MatchingTestBase):
    """3 test case E2E — JWT thật, HTTP thật, hai phía Web/Mobile."""

    def setUp(self):
        self.parent = User.objects.create_user('e2e_parent', password='E2e@2026',
                                               role='parent', first_name='Phụ',
                                               last_name='Huynh A',
                                               latitude=HUE_LAT, longitude=HUE_LNG)
        self.cp = User.objects.create_user('e2e_cp', password='E2e@2026',
                                           role='worker', is_approved=True,
                                           first_name='Sinh', last_name='Vien B',
                                           latitude=HUE_LAT + 0.005,
                                           longitude=HUE_LNG + 0.004)
        profile = EloService.get_profile(self.cp)
        profile.skills = ['toan']
        profile.major = 'Sư phạm Toán'
        profile.school = 'ĐH Sư Phạm - Đại học Huế'
        profile.save()
        # CP rảnh thứ 2 18:00-22:00 — khớp khung ca trong test
        CarePartnerAvailability.objects.create(carepartner=self.cp, weekday=0,
                                               time_from=time(18, 0),
                                               time_to=time(22, 0))

        # ---- JWT như client thật (Web fetch / Mobile axios). Dùng
        # RefreshToken.for_user thay vì POST /auth/login/ vì endpoint login
        # có ScopedRateThrottle (429 trong test suite chạy hàng loạt);
        # token sinh ra hoàn toàn giống token client nhận được khi login. ----
        self.web = APIClient()   # góc nhìn Phụ huynh (Web)
        self.app = APIClient()   # góc nhìn CarePartner (Mobile app)
        self.web.credentials(HTTP_AUTHORIZATION=self._jwt(self.parent))
        self.app.credentials(HTTP_AUTHORIZATION=self._jwt(self.cp))

    @staticmethod
    def _jwt(user):
        return 'Bearer ' + str(RefreshToken.for_user(user).access_token)

    def _parent_creates_tutoring_job(self):
        """Phụ huynh đăng việc Gia sư Toán tại Huế (payload như Web form)."""
        resp = self.web.post('/api/matching/jobs/', {
            'job_type': 'tutoring', 'subject': 'Toán',
            'specific_requirements': 'Lớp 5, học tại nhà phường Vĩnh Ninh',
            'dates': [str(MONDAY)], 'time_from': '19:00', 'time_to': '21:00',
            'latitude': HUE_LAT, 'longitude': HUE_LNG,
            'location_note': '12 Nguyễn Huệ, TP. Huế',
            'hourly_rate_vnd': 120000,
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.json())
        job_id = resp.json()['id']

        # Đăng tin (publish) — môi trường test không có API key → fallback parser
        resp = self.web.post(f'/api/matching/jobs/{job_id}/publish/')
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()['status'], 'ai_parsed')
        return job_id

    # ═══════════════════════════════════════════════════════════════
    # TEST CASE 1 — Web đăng việc → Mobile thấy đơn ngay
    # ═══════════════════════════════════════════════════════════════
    def test_case_1_web_to_mobile_booking_visible(self):
        job_id = self._parent_creates_tutoring_job()

        # Web xem danh sách ứng viên (POST candidates như ung_vien.html)
        resp = self.web.post('/api/matching/candidates/',
                             {'job_id': job_id}, format='json')
        self.assertEqual(resp.status_code, 200, resp.json())
        candidates = resp.json()['candidates']
        self.assertTrue(candidates, 'CP rảnh lịch phải xuất hiện trong danh sách')
        cp_id = candidates[0]['carepartner_id']

        # Web chọn CarePartner → tạo booking
        resp = self.web.post(f'/api/matching/jobs/{job_id}/select-carepartner/',
                             {'carepartner_id': cp_id}, format='json')
        self.assertIn(resp.status_code, (200, 201), resp.json())
        booking_id = resp.json()['id']

        # Mobile mở app bằng TÀI KHOẢN PHỤ HUYNH (parity màn MyTasksScreen):
        # getBookings({role:'parent'}) — đúng endpoint mobile gọi — phải thấy
        # đơn vừa tạo từ Web với trạng thái awaiting_commitment
        mobile_parent = APIClient()
        mobile_parent.credentials(HTTP_AUTHORIZATION=self._jwt(self.parent))
        resp = mobile_parent.get('/api/matching/bookings/', {'role': 'parent'})
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        ids = [b['id'] for b in body['results']]
        self.assertIn(booking_id, ids)
        booking = next(b for b in body['results'] if b['id'] == booking_id)
        self.assertEqual(booking['status'], 'awaiting_commitment')
        self.assertEqual(booking['job_type'], 'tutoring')
        self.assertIn('Huế', booking['location_info']['address'] or
                      booking['job_address'] or '')

        # Nguồn dữ liệu Web "Việc của tôi": GET jobs → has_booking=True
        resp = self.web.get('/api/matching/jobs/')
        self.assertEqual(resp.status_code, 200)
        job_row = next(j for j in resp.json()['results'] if j['id'] == job_id)
        self.assertTrue(job_row['has_booking'])
        self.assertEqual(job_row['status_label_vi'], 'Đã chọn CarePartner')

    # ═══════════════════════════════════════════════════════════════
    # TEST CASE 2 — Mobile cam kết → Web thấy "Đã khóa lịch"
    # ═══════════════════════════════════════════════════════════════
    def test_case_2_mobile_to_web_commit_reflected(self):
        job_id = self._parent_creates_tutoring_job()
        resp = self.web.post('/api/matching/candidates/', {'job_id': job_id},
                             format='json')
        cp_id = resp.json()['candidates'][0]['carepartner_id']
        resp = self.web.post(f'/api/matching/jobs/{job_id}/select-carepartner/',
                             {'carepartner_id': cp_id}, format='json')
        booking_id = resp.json()['id']

        # Mobile: CarePartner xác nhận cam kết (POST commit như MyJobsScreen)
        resp = self.app.post(f'/api/matching/bookings/{booking_id}/commit/')
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()['status'], 'committed')

        # Web phụ huynh tải lại "Việc của tôi": trạng thái committed
        resp = self.web.get('/api/matching/bookings/', {'role': 'parent'})
        booking = next(b for b in resp.json()['results'] if b['id'] == booking_id)
        self.assertEqual(booking['status'], 'committed')
        self.assertEqual(booking['status_label_vi'], 'Đã cam kết')

        # Chi tiết đơn (trang /don/<id>/ gọi GET bookings/<id>/)
        resp = self.web.get(f'/api/matching/bookings/{booking_id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'committed')
        self.assertIn('full_name', resp.json()['carepartner_info'])

    # ═══════════════════════════════════════════════════════════════
    # TEST CASE 3 — Đổi lịch + Huỷ đơn đồng bộ 2 chiều
    # ═══════════════════════════════════════════════════════════════
    def test_case_3_reschedule_and_cancel_two_way(self):
        job_id = self._parent_creates_tutoring_job()
        resp = self.web.post('/api/matching/candidates/', {'job_id': job_id},
                             format='json')
        cp_id = resp.json()['candidates'][0]['carepartner_id']
        resp = self.web.post(f'/api/matching/jobs/{job_id}/select-carepartner/',
                             {'carepartner_id': cp_id}, format='json')
        booking_id = resp.json()['id']
        self.app.post(f'/api/matching/bookings/{booking_id}/commit/')

        # ---- 3a. Mobile xin đổi giờ → Web phụ huynh thấy yêu cầu pending ----
        next_tue = MONDAY + timedelta(days=7)
        CarePartnerAvailability.objects.create(carepartner=self.cp, weekday=1,
                                               time_from=time(18, 0),
                                               time_to=time(22, 0))
        resp = self.app.post(f'/api/matching/bookings/{booking_id}/reschedule/', {
            'date': str(next_tue), 'time_from': '19:30', 'time_to': '21:00',
            'reason': 'Trùng lịch thi giữa kỳ',
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.json())

        resp = self.web.get('/api/matching/bookings/', {'role': 'parent'})
        booking = next(b for b in resp.json()['results'] if b['id'] == booking_id)
        self.assertEqual(booking['status'], 'reschedule_requested')
        self.assertIsNotNone(booking['reschedule_request'])
        self.assertEqual(booking['reschedule_request']['new_date'], str(next_tue))

        # ---- 3b. Web duyệt đổi giờ → Mobile thấy committed khung mới ----
        resp = self.web.post(
            f'/api/matching/bookings/{booking_id}/reschedule/respond/',
            {'decision': 'approve'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.json())

        resp = self.app.get(f'/api/matching/bookings/{booking_id}/')
        self.assertEqual(resp.json()['status'], 'committed')
        self.assertIsNone(resp.json()['reschedule_request'])
        first_slot = resp.json()['first_slot']
        self.assertEqual(str(first_slot['date']), str(next_tue))

        # ---- 3c. Web phụ huynh huỷ đơn → cả 2 phía thấy cancelled ----
        resp = self.web.post(f'/api/matching/bookings/{booking_id}/cancel-parent/',
                             {'note': 'Gia đình đổi kế hoạch'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.json())

        resp_web = self.web.get('/api/matching/bookings/', {'role': 'parent'})
        web_row = next(b for b in resp_web.json()['results']
                       if b['id'] == booking_id)
        self.assertEqual(web_row['status'], 'cancelled_by_parent')

        resp_app = self.app.get(f'/api/matching/bookings/{booking_id}/')
        self.assertEqual(resp_app.json()['status'], 'cancelled_by_parent')

    # ═══════════════════════════════════════════════════════════════
    # BỔ SUNG — GET /api/matching/jobs/ (endpoint mới cho Web) contract
    # ═══════════════════════════════════════════════════════════════
    def test_get_jobs_requires_parent_role(self):
        resp = self.app.get('/api/matching/jobs/')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['code'], 'not_a_parent')

    def test_get_jobs_marks_has_booking_correctly(self):
        job_id = self._parent_creates_tutoring_job()
        resp = self.web.get('/api/matching/jobs/')
        job_row = next(j for j in resp.json()['results'] if j['id'] == job_id)
        self.assertFalse(job_row['has_booking'])
        self.assertEqual(job_row['status_label_vi'], 'Đã phân tích xong')
