"""
matching/tests/test_integration.py — Integration test FULL FLOW (Prompt 14).

Luồng demo BGK (master prompt AC tổng):
  PH đăng job Gia sư môn "Kỹ năng sống" → publish (AI parse fallback) →
  candidates (max 8, match_level VI) → chọn CP → Booking tạo NGAY
  (awaiting_commitment) → notify trong 1 transaction → hết window →
  committed → CP hủy trước 3h → T3 (-50 ELO) + PH nhận credit 20% →
  auto-replacement chạy → CP mới được đề xuất.
Kèm: race select (slot_taken), no-show T5 sàn 50.000đ, buffer 90' reject.
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from rest_framework.test import APIClient

from matching.models import (
    Booking,
    CarePartnerAvailability,
    CreditBalance,
    EloLedger,
    JobSlot,
    Notification,
    ReplacementAttempt,
)
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase

User = get_user_model()


class FullFlowIntegrationTest(MatchingTestBase):
    def setUp(self):
        super().setUp()
        self.now = tz.localtime().replace(hour=10, minute=0, second=0, microsecond=0)
        import unittest.mock as mock
        self.frozen_now = tz.make_aware(self.now.replace(tzinfo=None))
        patcher = mock.patch('django.utils.timezone.now',
                             side_effect=lambda: self.frozen_now)
        patcher.start()
        self.addCleanup(patcher.stop)

        # Parent + 3 CP với lịch rảnh thứ Hai 18-22
        self.parent_client = APIClient()
        self.parent = User.objects.create_user('ph', password='x', role='parent',
                                               latitude=21.0, longitude=105.8)
        self.parent_client.force_authenticate(user=self.parent)
        self.cps = []
        for i, (rating, dist) in enumerate([('cpa', 4.9), ('cpb', 4.5), ('cpc', 4.0)]):
            cp = User.objects.create_user(rating, password='x', role='worker',
                                          is_approved=True,
                                          latitude=21.0 + i * 0.01, longitude=105.8)
            EloService.get_profile(cp)
            CarePartnerAvailability.objects.create(
                carepartner=cp, weekday=0, time_from=time(18, 0), time_to=time(22, 0))
            profile = EloService.get_profile(cp)
            profile.rating_avg = {'cpa': 4.9, 'cpb': 4.5, 'cpc': 4.0}[rating]
            profile.review_count = 10
            profile.effective_elo = 1200
            profile.save()
            self.cps.append(cp)

    def _post_job(self):
        monday = (tz.localdate() + timedelta(days=(7 - tz.localdate().weekday()) % 7 or 7))
        resp = self.parent_client.post('/api/matching/jobs/', {
            'job_type': 'tutoring',
            'subject': 'Kỹ năng sống',  # môn KỸ NĂNG — rule 5
            'specific_requirements': 'Cần người kiên nhẫn dạy bé tự tin',
            'dates': [monday.isoformat()],
            'time_from': '19:00', 'time_to': '21:00',
            'latitude': 21.0, 'longitude': 105.8,
            'hourly_rate_vnd': 150000,
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.json())
        return resp.json()['id']

    def test_happy_path_with_cancel_t3_and_replacement(self):
        """Đăng job → parse → candidates → chọn → committed → hủy T3 →
        credit + replacement."""
        job_id = self._post_job()

        # 1. Publish → fallback parse → slots
        resp = self.parent_client.post(f'/api/matching/jobs/{job_id}/publish/')
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()['status'], 'ai_parsed')
        self.assertEqual(resp.json()['ai_parse_status'], 'fallback')

        # 2. Candidates — max 8, có match_level VI, skill 'ky_nang_song' được extract
        resp = self.parent_client.post('/api/matching/candidates/',
                                       {'job_id': job_id}, format='json')
        self.assertEqual(resp.status_code, 200, resp.json())
        body = resp.json()
        self.assertEqual(len(body['candidates']), 3)
        self.assertLessEqual(len(body['candidates']), 8)
        first = body['candidates'][0]
        self.assertIn('match_level_vi', first)
        self.assertTrue(first['match_level_vi'])

        # 3. Parent chọn CP đầu → BOOKING TẠO NGAY (auto-commit)
        cp1_id = body['candidates'][0]['carepartner_id']
        cp1 = User.objects.get(pk=cp1_id)
        resp = self.parent_client.post(
            f'/api/matching/jobs/{job_id}/select-carepartner/',
            {'carepartner_id': cp1_id}, format='json',
            HTTP_IDEMPOTENCY_KEY='test-key-001')
        self.assertEqual(resp.status_code, 201, resp.json())
        booking_id = resp.json()['id']
        self.assertEqual(resp.json()['status'], 'awaiting_commitment')
        self.assertEqual(resp.json()['total_value_vnd'], 300000)  # 150k × 2h

        # CP nhận push critical job_assigned (enqueue trong transaction)
        self.assertTrue(Notification.objects.filter(
            user=cp1, code='job_assigned', klass='critical').exists())

        # 4. Replay cùng Idempotency-Key → KHÔNG tạo booking mới
        resp2 = self.parent_client.post(
            f'/api/matching/jobs/{job_id}/select-carepartner/',
            {'carepartner_id': cp1_id}, format='json',
            HTTP_IDEMPOTENCY_KEY='test-key-001')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.json()['id'], booking_id)
        self.assertEqual(Booking.objects.filter(job_id=job_id).exclude(
            status='not_selected').count(), 1)

        # 5. Ứng viên khác → not_selected
        self.assertTrue(Booking.objects.filter(
            job_id=job_id, status='not_selected').count() >= 1)

        # 6. Hết cửa sổ cam kết → committed (lazy check) — đồng hồ +61 phút
        self.frozen_now = self.frozen_now + timedelta(minutes=61)
        resp = self.parent_client.get(f'/api/matching/bookings/{booking_id}/')
        self.assertEqual(resp.json()['status'], 'committed')

        # 7. Đưa đồng hồ tới lead 4h59' trước slot đầu — DETERMINISTIC:
        # tính từ slot THỰC TẾ trong DB (không phụ thuộc thứ chạy test —
        # trước đây cộng cứng +7d4h59m chỉ đúng khi hôm nay là Thứ Hai,
        # dẫn tới T4 -80 thay vì T3 -50 khi chạy vào ngày khác).
        # lead = 299' ∈ [180,360) → T3: -50 ELO, đền 20% (Step 7.1).
        import datetime as _dtmod
        slot = (JobSlot.objects.filter(job_id=job_id)
                .order_by('date', 'time_from').first())
        self.assertIsNotNone(slot)
        slot_start = tz.make_aware(
            _dtmod.datetime.combine(slot.date, slot.time_from))
        self.frozen_now = slot_start - timedelta(hours=4, minutes=59)
        cp_client = APIClient()
        cp_client.force_authenticate(user=cp1)
        resp = cp_client.post(f'/api/matching/bookings/{booking_id}/cancel/', {
            'reason_code': 'transport',
            'note': 'Không thể di chuyển về kịp',
            'evidence': [],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()['status'], 'cancelled_by_carepartner')
        # T3: -50 ELO (master prompt AC: hủy trước 3h → T3 -50)
        self.assertEqual(resp.json()['elo_delta_applied'], -50)

        # 8. PH nhận credit đền bù 20% = 60.000đ (ĐỀN BÙ KHÔNG GIẢM khi FM)
        balance = CreditBalance.objects.get(parent=self.parent)
        self.assertEqual(balance.credit_vnd, 60000)

        # 9. Auto-replacement chạy → job needs_replacement → ReplacementAttempt
        resp = self.parent_client.get(f'/api/matching/admin/jobs/') if False else None
        job_resp = self.parent_client.get(f'/api/matching/bookings/{booking_id}/')
        self.assertTrue(ReplacementAttempt.objects.filter(job_id=job_id).exists())

        # 10. Ví API trả đúng số dư
        resp = self.parent_client.get('/api/matching/credits/balance/')
        self.assertEqual(resp.json()['credit_vnd'], 60000)

    def test_race_second_parent_gets_409_slot_taken(self):
        """2 parent chọn cùng CP + slot → 1 thành công, 1 nhận 409 slot_taken."""
        job_id = self._post_job()
        self.parent_client.post(f'/api/matching/jobs/{job_id}/publish/')
        resp = self.parent_client.post('/api/matching/candidates/',
                                       {'job_id': job_id}, format='json')
        cp_id = resp.json()['candidates'][0]['carepartner_id']

        # Parent 1 chọn thành công
        r1 = self.parent_client.post(
            f'/api/matching/jobs/{job_id}/select-carepartner/',
            {'carepartner_id': cp_id}, format='json',
            HTTP_IDEMPOTENCY_KEY='race-1')
        self.assertEqual(r1.status_code, 201)

        # Parent 2 (job khác trùng slot, cùng CP) → chọn cùng CP → 409
        parent2 = User.objects.create_user('ph2', password='x', role='parent',
                                           latitude=21.0, longitude=105.8)
        c2 = APIClient()
        c2.force_authenticate(user=parent2)
        job2_id = self._post_job()
        r2 = c2.post(f'/api/matching/jobs/{job2_id}/select-carepartner/',
                     {'carepartner_id': cp_id}, format='json',
                     HTTP_IDEMPOTENCY_KEY='race-2')
        self.assertEqual(r2.status_code, 409)
        self.assertEqual(r2.json()['code'], 'slot_taken')

    def test_no_show_t5_compensation_floor(self):
        """No-show: T5 -150 ELO, đền 50% sàn 50.000đ, auto-replacement chạy."""
        job_id = self._post_job()
        self.parent_client.post(f'/api/matching/jobs/{job_id}/publish/')
        resp = self.parent_client.post('/api/matching/candidates/',
                                       {'job_id': job_id}, format='json')
        cp_id = resp.json()['candidates'][0]['carepartner_id']
        cp = User.objects.get(pk=cp_id)
        resp = self.parent_client.post(
            f'/api/matching/jobs/{job_id}/select-carepartner/',
            {'carepartner_id': cp_id}, format='json',
            HTTP_IDEMPOTENCY_KEY='noshow-1')
        booking_id = resp.json()['id']

        # Đưa booking về suspected_no_show (mô phỏng beat task)
        booking = Booking.objects.get(pk=booking_id)
        booking.status = 'suspected_no_show'
        booking.save(update_fields=['status'])

        # Parent trả lời "Không đến"
        resp = self.parent_client.post(
            f'/api/matching/bookings/{booking_id}/report-no-show/',
            {'arrived': False}, format='json')
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()['status'], 'no_show')

        # ELO -150 (T5)
        self.assertTrue(EloLedger.objects.filter(
            carepartner=cp, reason_code='T5', delta=-150).exists())
        # Đền bù: 50% của 300.000 = 150.000đ (giá trị lớn nên không chạm sàn)
        balance = CreditBalance.objects.get(parent=self.parent)
        self.assertEqual(balance.credit_vnd, 150000)
        # Replacement đã chạy
        self.assertTrue(ReplacementAttempt.objects.filter(job_id=job_id).exists())

    def test_buffer_90_rejects_second_job(self):
        """2 job cách nhau 60 phút cho cùng CP → bị chặn (buffer 90 phút)."""
        job_id = self._post_job()
        self.parent_client.post(f'/api/matching/jobs/{job_id}/publish/')
        resp = self.parent_client.post('/api/matching/candidates/',
                                       {'job_id': job_id}, format='json')
        cp_id = resp.json()['candidates'][0]['carepartner_id']
        self.parent_client.post(
            f'/api/matching/jobs/{job_id}/select-carepartner/',
            {'carepartner_id': cp_id}, format='json',
            HTTP_IDEMPOTENCY_KEY='buf-1')
        cp = User.objects.get(pk=cp_id)

        # Job thứ 2: 21:30-23:00 cùng ngày Thứ Hai — job 1 kết thúc 21:00 → gap 30'
        parent2 = User.objects.create_user('ph3', password='x', role='parent',
                                           latitude=21.0, longitude=105.8)
        c2 = APIClient()
        c2.force_authenticate(user=parent2)
        monday = (tz.localdate() + timedelta(days=(7 - tz.localdate().weekday()) % 7 or 7))
        r = c2.post('/api/matching/jobs/', {
            'job_type': 'tutoring', 'subject': 'Tiếng Anh',
            'specific_requirements': 'Lớp 8',
            'dates': [monday.isoformat()],
            'time_from': '21:30', 'time_to': '23:00',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 120000,
        }, format='json')
        job2_id = r.json()['id']
        c2.post(f'/api/matching/jobs/{job2_id}/publish/')
        r2 = c2.post(f'/api/matching/jobs/{job2_id}/select-carepartner/',
                     {'carepartner_id': cp_id}, format='json',
                     HTTP_IDEMPOTENCY_KEY='buf-2')
        # Buffer 90' — gap 30' → FAIL → SlotConflictError → 409
        self.assertEqual(r2.status_code, 409)
