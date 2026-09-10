"""
matching/tests/test_matching_perf.py — Guard chống hồi quy hiệu năng (Task perf 1).

2 nhóm test:
1. Query-count guard: tổng số query của find_candidates() phải là HẰNG SỐ
   nhỏ khi N tăng (10 → 100 CarePartnerProfile) — không tăng tuyến tính.
   Trước refactor: 4-5 query/CP cho covers_all_slots + 1 query review/CP
   + 2 query throttle/CP → O(N). Sau refactor: ~12 query nền + ≤ 2×top_n
   query ghi CandidateProposal (bounded theo top_n, KHÔNG theo N).

2. Output parity: kết quả find_candidates() (candidates + thứ tự + điểm)
   phải GIỐNG HỆT bản ghi vàng (golden) sinh từ mã TRƯỚC refactor trên
   cùng 1 bộ fixture — đây là refactor hiệu năng, không đổi logic nghiệp vụ.

Fixture chỉ đọc (setUpTestData) — an toàn với CaptureQueriesContext.
"""

import json
from datetime import date, time
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext

from matching.models import (
    Booking,
    CarePartnerAvailability,
    CarePartnerBlackout,
    JobPost,
    JobSlot,
    SlotLock,
)
from matching.services.elo_service import EloService
from matching.services.matching_service import find_candidates
from matching.tests.base import MatchingTestBase
from core.models import Review, Task

from django.utils import timezone as tz

User = get_user_model()

MONDAY = date(2026, 9, 14)

GOLDEN_PATH = Path(__file__).resolve().parent / 'golden_find_candidates.json'

# Ngưỡng query HẰNG SỐ (không tăng theo N). Cấu thành:
#   ~12 query nền: weights + config + max(radius) + profiles + 5 batch
#   (avail/blackout/busy/slots-prefetch/locks) + reviews + proposals
#   + ≤ 2×top_n (get_or_create CandidateProposal cho top 8: SELECT+INSERT)
# Nếu test fail vì vượt ngưỡng: kiểm tra loop trong find_candidates có
# query ẩn mới (không được thêm query trong vòng lặp for profile).
QUERY_COUNT_BOUND = 45


def build_parity_fixture():
    """Fixture parity: 14 CP đa dạng trạng thái → output xác định.

    Trả (job, cp_usernames) — job tutoring thứ 2 Monday 19:00-21:00.
    Toàn bộ điểm số/rating/elo thiết lập TRỰC TIẾP lên profile để không
    phụ thuộc thứ tự tạo hay thời gian.
    """
    parent = User.objects.create_user('parity_parent', password='x', role='parent',
                                      latitude=21.0, longitude=105.8)
    job = JobPost.objects.create(
        parent=parent, job_type='tutoring', hourly_rate_vnd=100000,
        status='ai_parsed', latitude=21.0, longitude=105.8,
        ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
    JobSlot.objects.create(job=job, date=MONDAY, time_from=time(19, 0),
                           time_to=time(21, 0))

    def make_cp(name, *, lat=21.0, lng=105.8, effective=1200.0, rating=0.0,
                reviews=0, completed=0, skills=None, major='', school='',
                no_coords=False, radius=None, vehicle=False):
        u = User.objects.create_user(name, password='x', role='worker',
                                     is_approved=True,
                                     latitude=None if no_coords else lat,
                                     longitude=None if no_coords else lng)
        p = EloService.get_profile(u)
        CarePartnerAvailability.objects.create(
            carepartner=u, weekday=MONDAY.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))
        p.effective_elo = effective
        p.rating_avg = rating
        p.review_count = reviews
        p.jobs_completed = completed
        p.skills = skills or []
        p.major = major
        p.school = school
        p.has_vehicle = vehicle
        if radius is not None:
            p.max_radius_km = radius
        p.save()
        return u

    # 1. Ứng viên tốt nhất: gần + elo cao + skills khớp + review tốt
    make_cp('cp_best', lat=21.001, effective=1500.0, rating=4.8, reviews=10,
            completed=20, skills=['toan', 'tieu_hoc'],
            major='Sư phạm Toán', school='ĐH Sư phạm Hà Nội')
    # 2. Trung bình
    make_cp('cp_mid', lat=21.01, effective=1300.0, rating=4.0, reviews=5,
            completed=10, skills=['toan'])
    # 3. Rìa bán kính 20km (~18.9km)
    make_cp('cp_far', lat=21.17, effective=1250.0)
    # 4. Không có tọa độ — vẫn được đề xuất (km None, không lọc bán kính)
    make_cp('cp_no_coords', no_coords=True, effective=1210.0)
    # 5. Blackout cả ngày → loại
    u5 = make_cp('cp_blackout', effective=1400.0)
    CarePartnerBlackout.objects.create(carepartner=u5, date=MONDAY,
                                       time_from=None, time_to=None)
    # 6. Booking committed trùng khung → loại
    u6 = make_cp('cp_busy', effective=1400.0)
    other_job = JobPost.objects.create(
        parent=parent, job_type='childcare', hourly_rate_vnd=90000,
        status='ai_parsed', latitude=21.0, longitude=105.8)
    JobSlot.objects.create(job=other_job, date=MONDAY, time_from=time(19, 0),
                           time_to=time(21, 0))
    now = tz.now()
    Booking.objects.create(job=other_job, carepartner=u6, parent=parent,
                           status='committed', selected_at=now,
                           commit_deadline=now + tz.timedelta(hours=1),
                           total_value_vnd=90000)
    # 7. Soft lock còn hạn trùng khung → loại
    u7 = make_cp('cp_softlock', effective=1400.0)
    SlotLock.objects.create(carepartner=u7, date=MONDAY,
                            time_from=time(19, 0), time_to=time(21, 0),
                            lock_type=SlotLock.LockType.SOFT,
                            expires_at=now + tz.timedelta(minutes=10))
    # 8. Có review mới nhất (text lọt candidate)
    u8 = make_cp('cp_reviewed', lat=21.002, effective=1350.0)
    t = Task.objects.create(parent=parent, title='Việc review parity',
                            description='task cho review', price=100000,
                            location='Hà Nội', scheduled_time=tz.now())
    Review.objects.create(task=t, reviewer=parent, reviewee=u8, rating=5,
                          comment='Chăm chỉ, đúng giờ, trẻ rất thích')
    # 9. ELO thấp
    make_cp('cp_low_elo', lat=21.004, effective=700.0)
    # 10. Có xe (khoảng cách hiệu quả ×0.75 — chỉ ảnh hưởng điểm)
    make_cp('cp_vehicle', lat=21.05, effective=1280.0, vehicle=True)
    # 11. matching_paused → loại (is_matchable)
    u11 = make_cp('cp_paused', effective=1450.0)
    p11 = EloService.get_profile(u11)
    p11.matching_paused = True
    p11.save()
    # 12. Không duyệt → loại ở SQL
    User.objects.create_user('cp_unapproved', password='x', role='worker',
                             is_approved=False, latitude=21.0, longitude=105.8)
    # 13. max_radius riêng 5km, ở ~3.3km → vào (đủ để MAX(max_radius)≠default)
    make_cp('cp_custom_radius', lat=21.03, effective=1260.0, radius=5)
    # 14. Nằm ngoài khung bounding-box + ngoài bán kính (~111km) → loại
    make_cp('cp_out_of_range', lat=22.0, effective=1400.0)
    return job


def normalize_result(result):
    """Chuẩn hóa output để so golden: bỏ trường không ổn định giữa các lần
    chạy (carepartner_id là UUID tạo mới mỗi lần build fixture)."""
    keep = ('display_name', 'school', 'major', 'rating', 'completed_jobs',
            'distance_km', 'match_score', 'match_level', 'match_level_vi',
            'top_skills', 'latest_review', 'response_tag', 'availability_fit')
    return {
        'total_matched': result['total_matched'],
        'candidates': [
            {k: c.get(k) for k in keep} for c in result['candidates']
        ],
    }


class PerfFactoryBase(MatchingTestBase):
    """Factory N CP dùng chung cho test query-count."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.parent = User.objects.create_user('perf_parent', password='x',
                                              role='parent', latitude=21.0,
                                              longitude=105.8)
        cls.job = JobPost.objects.create(
            parent=cls.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='ai_parsed', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=cls.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        cls.cp_ids = []
        for i in range(100):
            u = User.objects.create_user(f'perf_cp_{i}', password='x',
                                         role='worker', is_approved=True,
                                         latitude=21.0 + i * 0.0004,  # ≤ ~4.4km
                                         longitude=105.8)
            EloService.get_profile(u)
            CarePartnerAvailability.objects.create(
                carepartner=u, weekday=MONDAY.weekday(),
                time_from=time(18, 0), time_to=time(22, 0))
            cls.cp_ids.append(u.pk)


class QueryCountScalingTest(PerfFactoryBase):
    def test_query_count_constant_when_n_doubles(self):
        """find_candidates() không được tốn thêm query khi N tăng 10 → 100.

        N điều khiển qua exclude_carepartners (cùng fixture, cùng số ứng
        viên top → cùng số query ghi đề xuất) — số query phải BẰNG NHAU.
        """
        exclude90 = set(self.cp_ids[:90])   # còn 10 CP vào vòng lặp
        with CaptureQueriesContext(connection) as ctx100:
            r100 = find_candidates(self.job)
        with CaptureQueriesContext(connection) as ctx10:
            r10 = find_candidates(self.job, exclude_carepartners=exclude90)

        q100, q10 = len(ctx100), len(ctx10)
        self.assertEqual(q100, q10,
                         'Số query phải HẰNG SỘ khi N tăng 10 → 100 '
                         f'(N=100: {q100}, N=10: {q10}) — nghi ngờ N+1 quay lại')
        self.assertLessEqual(q100, QUERY_COUNT_BOUND,
                             f'{q100} query > ngưỡng {QUERY_COUNT_BOUND} '
                             '— vòng lặp có query ẩn')
        self.assertGreater(r100['total_matched'], 0)
        self.assertGreater(r10['total_matched'], 0)

    def test_batch_context_returns_same_slots_as_direct_path(self):
        """available_slots(path batch) == available_slots(path query trực tiếp).

        Đảm bảo load_slot_context + prefetched cho kết quả Y HỆT path cũ
        (dùng cho luồng đặt ca) trên cùng dữ liệu.
        """
        from matching.services.lock_service import available_slots, load_slot_context
        u = User.objects.get(username='perf_cp_0')
        d = MONDAY
        direct = available_slots(u, d, use_cache=False)
        ctx = load_slot_context([u.pk], [d])
        batched = available_slots(u, d, prefetched=ctx)
        self.assertEqual(batched, direct)


class FindCandidatesParityTest(MatchingTestBase):
    """So sánh output find_candidates() với golden sinh từ mã TRƯỚC refactor.

    Golden file: matching/tests/golden_find_candidates.json — sinh bởi
    scripts/gen_golden_find_candidates.py chạy trên commit cũ (pre-refactor).
    """

    def test_output_matches_pre_refactor_golden(self):
        job = build_parity_fixture()
        result = find_candidates(job)
        normalized = normalize_result(result)
        golden = json.loads(GOLDEN_PATH.read_text(encoding='utf-8'))
        self.assertEqual(normalized['total_matched'], golden['total_matched'])
        self.assertEqual(normalized['candidates'], golden['candidates'],
                         'Output find_candidates() khác bản ghi vàng pre-refactor '
                         '— refactor hiệu năng KHÔNG được đổi logic nghiệp vụ')
