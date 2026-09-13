"""
matching/tests/test_tutoring_curriculum_gps.py — Acceptance Test Suite for
Tutoring Matching Engine, Curriculum, Dynamic Pricing & GPS Guard.

Covers Acceptance Criteria:
- AC-B1: Literature tutor in Huế (`carepartner_van_hue`) matches Literature job in TP. Huế.
- AC-B2: Primary tutor in Huế (`carepartner_tieuhoc_hue`) matches job with
         `child_age=8`, `school_level='cap_1'`, `subject_code=['tieng_viet']`.
- AC-B3: Multi-subject job (`['toan', 'tieng_anh']`) includes partial matches with proportional score.
- AC-B4: CarePartner registered in Huế with fresh GPS in Hanoi is excluded from Huế jobs
         (and control: stale GPS > 48h falls back to registered Huế coords).
- AC-B5: Interaction test: Huế literature tutor with Hanoi GPS is excluded from Huế literature job.
- AC-B6: Legacy JobPost data without new fields does not crash matching.
- AC-B7: Heartbeat endpoint returns 403 when `LocationConsent` is not granted.
- AC-B8: `validate_job_payload()` rejects session < 30 mins and `child_age` outside [6, 18].
"""

from datetime import date, time, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from core.models import Task, TaskApplication
from matching.models import (
    CarePartnerAvailability,
    CarePartnerProfile,
    EloBand,
    JobPost,
    JobSlot,
)
from matching.services.elo_service import EloService
from matching.services.job_schema import validate_job_payload
from matching.services.matching_service import (
    _major_match_bonus,
    find_candidates,
    get_effective_coordinates,
    subscore_skills,
)
from matching.tests.base import MatchingTestBase
from tracking.models import LocationConsent

User = get_user_model()

# Cố định thứ Hai để test availability
TEST_MONDAY = date(2026, 9, 14)


class TutoringCurriculumGpsAcceptanceTest(MatchingTestBase):
    """Bộ test chấp nhận cho Động cơ ghép cặp Gia sư, Khung chương trình và Chốt chặn GPS."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()

        # Phụ huynh tại TP. Huế
        self.parent_hue = User.objects.create_user(
            username='parent_hue_test',
            password='Password123!',
            role='parent',
            latitude=16.4602,
            longitude=107.6008,
            address='Căn hộ The Manor Crown Huế, TP. Huế',
        )

    def _create_cp(
        self,
        username,
        *,
        first_name='Gia Sư',
        last_name='Huế',
        lat=16.4682,
        lng=107.5895,
        skills=None,
        major='',
        school='ĐH Sư Phạm - Đại học Huế',
        rating=4.5,
        reviews=8,
        elo=1200,
        band_name='normal',
        has_vehicle=True,
        gender='female',
        cur_lat=None,
        cur_lng=None,
        last_gps_updated_at=None,
    ):
        """Helper tạo CarePartner với hồ sơ tín nhiệm ELO và lịch rảnh thứ Hai."""
        user = User.objects.create_user(
            username=username,
            password='Password123!',
            role='worker',
            first_name=first_name,
            last_name=last_name,
            is_approved=True,
            is_active=True,
            latitude=lat,
            longitude=lng,
            current_latitude=cur_lat,
            current_longitude=cur_lng,
            last_gps_updated_at=last_gps_updated_at,
        )

        profile = EloService.get_profile(user)
        profile.school = school
        profile.major = major
        profile.skills = skills if skills is not None else []
        profile.rating_avg = rating
        profile.review_count = reviews
        profile.effective_elo = elo
        profile.has_vehicle = has_vehicle
        profile.gender = gender
        profile.jobs_completed = 10

        if band_name:
            profile.band = EloBand.objects.get(name=band_name)
        profile.save()

        # Thêm lịch rảnh thứ Hai: 17:00 - 22:00
        CarePartnerAvailability.objects.create(
            carepartner=user,
            weekday=TEST_MONDAY.weekday(),
            time_from=time(17, 0),
            time_to=time(22, 0),
        )
        return user

    def _create_tutoring_job(
        self,
        *,
        title='Tìm gia sư Văn lớp 8 tại Huế',
        lat=16.4637,
        lng=107.5908,
        ai_parse_result=None,
        type_data=None,
        hourly_rate_vnd=120000,
    ):
        """Helper tạo JobPost gia sư kèm JobSlot thứ Hai 19:00 - 21:00."""
        job = JobPost.objects.create(
            parent=self.parent_hue,
            job_type='tutoring',
            title=title,
            latitude=lat,
            longitude=lng,
            hourly_rate_vnd=hourly_rate_vnd,
            status='ai_parsed',
            ai_parse_result=ai_parse_result if ai_parse_result is not None else {},
            type_data=type_data if type_data is not None else {},
        )
        JobSlot.objects.create(
            job=job,
            date=TEST_MONDAY,
            time_from=time(19, 0),
            time_to=time(21, 0),
        )
        return job

    # ─────────────────────────────────────────────────────────────────
    # AC-B1: Literature tutor in Huế matches Literature job in TP. Huế
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b1_literature_tutor_hue_matches_literature_job(self):
        """AC-B1: Gia sư Ngữ Văn tại Huế (carepartner_van_hue) ghép cặp thành công
        với công việc gia sư Văn tại TP. Huế."""
        van_hue = self._create_cp(
            'carepartner_van_hue',
            first_name='Mai Phương',
            last_name='Lê',
            lat=16.4682,
            lng=107.5895,
            school='Đại học Sư Phạm - Đại học Huế',
            major='Sư phạm Ngữ Văn (Năm 3)',
            skills=['van', 'ngu_van', 'tieng_viet', 'luyen_chu_dep', 'tieu_hoc', 'cap_2', 'kien_nhan', 'lich_su'],
            elo=1540,
            band_name='trusted',
            rating=4.95,
            reviews=20,
        )

        job = self._create_tutoring_job(
            title='Gia sư Ngữ Văn lớp 7',
            lat=16.4637,
            lng=107.5908,
            ai_parse_result={'required_skills': ['van'], 'urgency': 'normal'},
            type_data={'subject_code': ['van']},
        )

        result = find_candidates(job)
        candidate_ids = [c['carepartner_id'] for c in result['candidates']]

        self.assertIn(str(van_hue.pk), candidate_ids)
        van_cand = next(c for c in result['candidates'] if c['carepartner_id'] == str(van_hue.pk))
        self.assertGreaterEqual(van_cand['match_score'], 75)
        self.assertIn(van_cand['match_level'], ['high', 'very_high'])
        self.assertTrue(van_cand['distance_km'] < 5.0)

    # ─────────────────────────────────────────────────────────────────
    # AC-B2: Primary tutor in Huế matches job with child_age=8, cap_1
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b2_primary_tutor_hue_matches_tier1_job(self):
        """AC-B2: Gia sư Tiểu học tại Huế (carepartner_tieuhoc_hue) ghép cặp thành công
        với công việc có child_age=8, school_level='cap_1', subject_code=['tieng_viet']."""
        tieuhoc_hue = self._create_cp(
            'carepartner_tieuhoc_hue',
            first_name='Anh Thư',
            last_name='Nguyễn Hoàng',
            lat=16.4635,
            lng=107.5912,
            school='Đại học Sư Phạm - Đại học Huế',
            major='Giáo dục Tiểu học',
            skills=['toan', 'tieng_viet', 'tu_nhien_xa_hoi', 'luyen_chu_dep', 'am_nhac', 'van'],
            elo=1510,
            band_name='trusted',
            rating=4.9,
            reviews=18,
        )

        job = self._create_tutoring_job(
            title='Kèm Tiếng Việt lớp 3 tại Huế',
            lat=16.4637,
            lng=107.5908,
            ai_parse_result={'required_skills': ['tieng_viet'], 'urgency': 'normal'},
            type_data={
                'child_age': 8,
                'school_level': 'cap_1',
                'subject_code': ['tieng_viet'],
            },
        )

        result = find_candidates(job)
        candidate_ids = [c['carepartner_id'] for c in result['candidates']]

        self.assertIn(str(tieuhoc_hue.pk), candidate_ids)

        # Kiểm tra điểm cộng chuyên ngành (major match bonus)
        bonus = _major_match_bonus('Giáo dục Tiểu học', 'tutoring', ['tieng_viet'])
        self.assertEqual(bonus, 1)

    # ─────────────────────────────────────────────────────────────────
    # AC-B3: Multi-subject job includes partial matches with proportional score
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b3_multi_subject_job_proportional_scoring(self):
        """AC-B3: Yêu cầu nhiều môn ['toan', 'tieng_anh'] bao gồm ứng viên khớp một phần
        với điểm tỷ lệ thuận (proportional score)."""
        # CP A: Khớp cả 2 môn ('toan', 'tieng_anh')
        cp_full = self._create_cp(
            'cp_full_match',
            skills=['toan', 'tieng_anh'],
            major='Sư phạm Toán',
            elo=1200,
            band_name='normal',
            rating=4.0,
        )
        # CP B: Chỉ khớp 1 môn ('toan')
        cp_partial = self._create_cp(
            'cp_partial_match',
            skills=['toan', 'vat_ly'],
            major='Sư phạm Toán',
            elo=1200,
            band_name='normal',
            rating=4.0,
        )
        # CP C: Không khớp môn nào và không có chuyên ngành sư phạm/liên quan
        cp_none = self._create_cp(
            'cp_no_match',
            skills=['nau_an', 'pha_che'],
            major='Tài chính Ngân hàng',
            school='Đại học Kinh tế - Đại học Huế',
            elo=1200,
            band_name='normal',
            rating=4.0,
        )

        job = self._create_tutoring_job(
            title='Dạy kèm Toán và Tiếng Anh lớp 6',
            ai_parse_result={'required_skills': ['toan', 'tieng_anh']},
            type_data={'subject_code': ['toan', 'tieng_anh']},
        )

        result = find_candidates(job)
        cand_map = {c['carepartner_id']: c for c in result['candidates']}

        # Cả ứng viên toàn phần và bán phần đều được chấp nhận vào danh sách
        self.assertIn(str(cp_full.pk), cand_map)
        self.assertIn(str(cp_partial.pk), cand_map)
        # Ứng viên 0 môn khớp và không có chuyên ngành phù hợp bị loại hoàn toàn
        self.assertNotIn(str(cp_none.pk), cand_map)

        # Kiểm tra tỷ lệ điểm kỹ năng chuyên môn:
        # Full match: ratio = 2/2 = 1.0 -> 60.0 * 1.0 + 40.0 * 1 = 100.0
        score_full = subscore_skills(['toan', 'tieng_anh'], ['toan', 'tieng_anh'], 'Sư phạm Toán', 'tutoring', use_match_ratio=True)
        # Partial match: ratio = 1/2 = 0.5 -> 60.0 * 0.5 + 40.0 * 1 = 70.0
        score_partial = subscore_skills(['toan', 'tieng_anh'], ['toan'], 'Sư phạm Toán', 'tutoring', use_match_ratio=True)
        self.assertAlmostEqual(score_full, 100.0)
        self.assertAlmostEqual(score_partial, 70.0)

        # Điểm tổng thể của ứng viên toàn phần cao hơn ứng viên bán phần
        self.assertGreater(cand_map[str(cp_full.pk)]['match_score'], cand_map[str(cp_partial.pk)]['match_score'])

    # ─────────────────────────────────────────────────────────────────
    # AC-B4: CarePartner in Huế with fresh Hanoi GPS excluded (stale >48h fallback)
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b4_hue_cp_with_fresh_hanoi_gps_excluded_and_stale_fallback(self):
        """AC-B4: CP đăng ký ở Huế nhưng có GPS thời gian thực tại Hà Nội bị loại khỏi việc ở Huế;
        ngược lại GPS cũ > 48h tự động dùng lại tọa độ đăng ký tại Huế."""
        now = timezone.now()

        # CP 1: Đăng ký ở Huế nhưng đang ở Hà Nội với GPS tươi mới (10 phút trước)
        cp_fresh_hanoi = self._create_cp(
            'cp_fresh_hanoi',
            lat=16.4682,
            lng=107.5895,
            cur_lat=21.0285,
            cur_lng=105.8542,
            last_gps_updated_at=now - timedelta(minutes=10),
            skills=['toan'],
            major='Sư phạm Toán',
        )

        # CP 2 (Đối chứng): Đăng ký ở Huế, có GPS Hà Nội nhưng đã quá hạn 49h (> 48h)
        cp_stale_hanoi = self._create_cp(
            'cp_stale_hanoi',
            lat=16.4682,
            lng=107.5895,
            cur_lat=21.0285,
            cur_lng=105.8542,
            last_gps_updated_at=now - timedelta(hours=49),
            skills=['toan'],
            major='Sư phạm Toán',
        )

        # Kiểm tra hàm get_effective_coordinates
        eff_lat1, eff_lng1 = get_effective_coordinates(cp_fresh_hanoi)
        self.assertAlmostEqual(eff_lat1, 21.0285)
        self.assertAlmostEqual(eff_lng1, 105.8542)

        eff_lat2, eff_lng2 = get_effective_coordinates(cp_stale_hanoi)
        self.assertAlmostEqual(eff_lat2, 16.4682)
        self.assertAlmostEqual(eff_lng2, 107.5895)

        # Chạy matching cho công việc tại Huế
        job = self._create_tutoring_job(
            title='Dạy Toán tại Huế',
            lat=16.4637,
            lng=107.5908,
            ai_parse_result={'required_skills': ['toan']},
        )

        result = find_candidates(job)
        ids = [c['carepartner_id'] for c in result['candidates']]

        # CP đang ở Hà Nội bị loại
        self.assertNotIn(str(cp_fresh_hanoi.pk), ids)
        # CP có GPS cũ >48h lùi về tọa độ Huế và được chấp nhận
        self.assertIn(str(cp_stale_hanoi.pk), ids)

    # ─────────────────────────────────────────────────────────────────
    # AC-B5: Interaction test: Huế literature tutor with Hanoi GPS excluded
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b5_interaction_hue_literature_tutor_with_hanoi_gps_excluded(self):
        """AC-B5: Tương tác: Gia sư Văn tại Huế (carepartner_van_hue) có kỹ năng chuẩn
        nhưng GPS thời gian thực tại Hà Nội thì vẫn bị loại khỏi việc tại Huế."""
        van_hanoi_gps = self._create_cp(
            'carepartner_van_hanoi_gps',
            first_name='Mai Phương',
            last_name='Lê',
            lat=16.4682,
            lng=107.5895,
            cur_lat=21.0285,
            cur_lng=105.8542,
            last_gps_updated_at=timezone.now() - timedelta(minutes=5),
            school='Đại học Sư Phạm - Đại học Huế',
            major='Sư phạm Ngữ Văn (Năm 3)',
            skills=['van', 'ngu_van', 'tieng_viet'],
            elo=1540,
        )

        job = self._create_tutoring_job(
            title='Gia sư Ngữ Văn lớp 8 tại TP. Huế',
            lat=16.4637,
            lng=107.5908,
            ai_parse_result={'required_skills': ['van']},
            type_data={'subject_code': ['van']},
        )

        result = find_candidates(job)
        candidate_ids = [c['carepartner_id'] for c in result['candidates']]

        self.assertNotIn(str(van_hanoi_gps.pk), candidate_ids)

    # ─────────────────────────────────────────────────────────────────
    # AC-B6: Legacy JobPost data without new fields does not crash matching
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b6_legacy_job_data_does_not_crash_matching(self):
        """AC-B6: Dữ liệu JobPost cũ không có type_data hoặc thiếu các trường mới
        (child_age, subject_code, school_level...) không làm sập matching engine."""
        self._create_cp(
            'cp_legacy_candidate',
            skills=['toan'],
            major='Sư phạm Toán',
            lat=16.4637,
            lng=107.5908,
        )

        # JobPost cũ với type_data và ai_parse_result rỗng (không có các trường mới)
        legacy_job = JobPost.objects.create(
            parent=self.parent_hue,
            job_type='tutoring',
            title='Công việc cũ từ năm 2025',
            latitude=16.4637,
            longitude=107.5908,
            hourly_rate_vnd=100000,
            status='ai_parsed',
            ai_parse_result={},
            type_data={},
        )
        JobSlot.objects.create(
            job=legacy_job,
            date=TEST_MONDAY,
            time_from=time(19, 0),
            time_to=time(21, 0),
        )

        # Không ném ngoại lệ hay KeyError
        try:
            result = find_candidates(legacy_job)
        except Exception as e:
            self.fail(f"find_candidates(legacy_job) crashed with {type(e).__name__}: {e}")

        self.assertIsInstance(result, dict)
        self.assertIn('total_matched', result)
        self.assertIn('candidates', result)

        # Kiểm tra thêm trường hợp type_data=None / ai_parse_result=None trên object memory
        legacy_job.type_data = None
        legacy_job.ai_parse_result = None
        try:
            result_none = find_candidates(legacy_job)
        except Exception as e:
            self.fail(f"find_candidates(legacy_job with None fields) crashed with {type(e).__name__}: {e}")
        self.assertIsInstance(result_none, dict)

    # ─────────────────────────────────────────────────────────────────
    # AC-B7: Heartbeat endpoint returns 403 when LocationConsent is not granted
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b7_heartbeat_endpoint_requires_granted_location_consent(self):
        """AC-B7: Endpoint /api/tracking/heartbeat/ trả về HTTP 403 khi LocationConsent
        chưa được cấp hoặc đã bị từ chối/thu hồi."""
        worker = User.objects.create_user(
            username='worker_heartbeat_test',
            password='Password123!',
            role='worker',
            is_approved=True,
        )

        task = Task.objects.create(
            title='Ca dạy kèm test heartbeat',
            description='Test tracking heartbeat',
            price=120000,
            status='in_progress',
            parent=self.parent_hue,
            location='TP. Huế',
            scheduled_time=timezone.now() + timedelta(hours=1),
        )
        TaskApplication.objects.create(task=task, worker=worker, status='accepted')

        self.client.force_authenticate(user=worker)
        url = '/api/tracking/heartbeat/'
        payload = {'task_id': task.id, 'latitude': 16.4637, 'longitude': 107.5908}

        # 1. Chưa có LocationConsent -> HTTP 403
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Carepartner chưa đồng ý chia sẻ vị trí cho task này.', res.data.get('error', ''))

        # 2. LocationConsent ở trạng thái 'denied' -> HTTP 403
        consent = LocationConsent.objects.create(task=task, worker=worker, consent='denied')
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. LocationConsent ở trạng thái 'revoked' -> HTTP 403
        consent.consent = 'revoked'
        consent.save()
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Khi consent được 'granted' -> HTTP 200 OK
        consent.consent = 'granted'
        consent.save()
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'ok')

    # ─────────────────────────────────────────────────────────────────
    # AC-B8: validate_job_payload() rejects session < 30 mins and child_age outside [6, 18]
    # ─────────────────────────────────────────────────────────────────
    def test_ac_b8_validate_job_payload_rejects_invalid_time_and_age(self):
        """AC-B8: validate_job_payload() từ chối ca học < 30 phút và child_age ngoài khoảng [6, 18]."""
        today = timezone.localdate()
        valid_date = str(today + timedelta(days=1))

        base_payload = {
            'subject': 'Toán lớp 3',
            'specific_requirements': 'Kèm toán cơ bản',
            'dates': [valid_date],
            'time_from': '19:00',
            'time_to': '21:00',
            'child_age': 8,
            'school_level': 'cap_1',
            'subject_code': ['toan'],
        }

        # 1. Ca học < 30 phút (19:00 -> 19:20 = 20 phút) -> raise ValidationError ở time_to
        payload_short = dict(base_payload, time_from='19:00', time_to='19:20')
        with self.assertRaises(ValidationError) as ctx:
            validate_job_payload('tutoring', payload_short, user_role='parent')
        self.assertIn('time_to', ctx.exception.detail)
        self.assertIn('ít nhất 30 phút', str(ctx.exception.detail['time_to']))

        # 2. Giờ kết thúc trước hoặc bằng giờ bắt đầu -> raise ValidationError ở time_to
        payload_inverted = dict(base_payload, time_from='20:00', time_to='19:00')
        with self.assertRaises(ValidationError) as ctx:
            validate_job_payload('tutoring', payload_inverted, user_role='parent')
        self.assertIn('time_to', ctx.exception.detail)

        # 3. Tuổi trẻ < 6 (VD: 5 tuổi) -> raise ValidationError ở child_age
        payload_underage = dict(base_payload, child_age=5)
        with self.assertRaises(ValidationError) as ctx:
            validate_job_payload('tutoring', payload_underage, user_role='parent')
        self.assertIn('child_age', ctx.exception.detail)
        self.assertIn('từ 6 đến 18', str(ctx.exception.detail['child_age']))

        # 4. Tuổi trẻ > 18 (VD: 19 tuổi) -> raise ValidationError ở child_age
        payload_overage = dict(base_payload, child_age=19)
        with self.assertRaises(ValidationError) as ctx:
            validate_job_payload('tutoring', payload_overage, user_role='parent')
        self.assertIn('child_age', ctx.exception.detail)
        self.assertIn('từ 6 đến 18', str(ctx.exception.detail['child_age']))

        # 5. Hợp lệ: ca học chính xác 30 phút (19:00 -> 19:30), tuổi 6 và tuổi 18 -> Pass
        payload_valid_edge_6 = dict(base_payload, time_from='19:00', time_to='19:30', child_age=6)
        cleaned_6 = validate_job_payload('tutoring', payload_valid_edge_6, user_role='parent')
        self.assertEqual(cleaned_6['child_age'], 6)
        self.assertEqual(cleaned_6['time_to'], '19:30')

        payload_valid_edge_18 = dict(base_payload, child_age=18)
        cleaned_18 = validate_job_payload('tutoring', payload_valid_edge_18, user_role='parent')
        self.assertEqual(cleaned_18['child_age'], 18)
