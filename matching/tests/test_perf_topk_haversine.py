"""
matching/tests/test_perf_topk_haversine.py — Test Task perf 5 + 6.

Task 5 — Top-K heapq.nlargest: kết quả top (thứ tự + nội dung) phải GIỐNG
HỆT sort toàn mảng cũ, đặc biệt các trường hợp hòa điểm (tie-break).
heapq.nlargest ≡ sorted(iterable, key, reverse=True)[:n] — tie giữ thứ tự gốc.

Task 6 — haversine_km delegate sang haversine_distance_optimized/1000:
giá trị trả về phải khớp bản công thức cũ (< 0.01 km) trên 12 cặp tọa độ
thật, gồm 2 điểm trùng nhau và 2 điểm gần nửa vòng trái đất. Đơn vị trả về
GIỮ NGUYÊN km (bản optimized trả mét → chia 1000).
"""

import heapq
import math

from django.test import TestCase

from matching.services.matching_service import (
    _candidate_rank_key,
    haversine_km,
)


# ═══════════════════════════════════════════════════════════════════
# Task 5 — Top-K parity (heap vs sort)
# ═══════════════════════════════════════════════════════════════════
def _old_sort_top(candidates, top_n):
    """Bản sort cũ (pre-refactor) — giữ nguyên để đối chiếu."""
    ordered = sorted(candidates,
                     key=lambda c: (-c['match_score'], -c['_elo'],
                                    c['_distance'], -c['_completion']))
    return ordered[:top_n]


class TopKHeapParityTests(TestCase):
    def _synthetic(self, specs):
        """specs: list (name, score, elo, dist, completion) → candidate dicts."""
        return [dict(carepartner_id=n, match_score=s, _elo=e,
                     _distance=d, _completion=c)
                for n, s, e, d, c in specs]

    def test_heap_equals_old_sort_with_ties(self):
        """Hòa match_score / hòa đủ 4 key — thứ tự heap phải khớp sort cũ.

        Block tie đặc biệt: 3 candidate hòa TỔNG ĐỜI (score, elo, dist,
        completion đều bằng nhau) → giữ nguyên thứ tự gốc (stable)."""
        specs = [
            ('a', 90, 1500, 2.0, 100.0),
            ('b', 90, 1500, 2.0, 100.0),   # hòa tổng đôi với a
            ('c', 90, 1500, 5.0, 100.0),   # hòa score+elo, xa hơn
            ('d', 90, 1400, 1.0, 100.0),   # hòa score, elo thấp hơn
            ('e', 75, 1600, 10.0, 80.0),
            ('f', 75, 1600, 8.0, 80.0),    # hòa score+elo, gần hơn
            ('g', 60, 1200, 0.5, 50.0),
            ('h', 60, 1200, 0.5, 99.0),    # hòa score+elo+dist, completion cao
        ]
        candidates = self._synthetic(specs)
        expected = [c['carepartner_id']
                    for c in _old_sort_top(candidates, 5)]
        got = [c['carepartner_id']
               for c in heapq.nlargest(5, candidates, key=_candidate_rank_key)]
        self.assertEqual(got, expected,
                         'heap.nlargest phải cho cùng thứ tự (kể cả tie) '
                         'với sort cũ')

    def test_heap_key_matches_old_sort_key_mathematically(self):
        """_candidate_rank_key(c1) > _candidate_rank_key(c2) ⟺
        old_key(c1) < old_key(c2) (đảo chiều, -distance xử lý đúng)."""
        pairs = [
            ((90, 1500, 2.0, 100.0), (90, 1500, 5.0, 100.0)),
            ((75, 1600, 8.0, 80.0), (75, 1600, 10.0, 80.0)),
            ((60, 1200, 0.5, 99.0), (60, 1200, 0.5, 50.0)),
            ((50, 2000, 0.0, 0.0), (50, 400, 100.0, 100.0)),
        ]
        for t1, t2 in pairs:
            c1 = dict(match_score=t1[0], _elo=t1[1], _distance=t1[2], _completion=t1[3])
            c2 = dict(match_score=t2[0], _elo=t2[1], _distance=t2[2], _completion=t2[3])
            old1 = (-c1['match_score'], -c1['_elo'], c1['_distance'], -c1['_completion'])
            old2 = (-c2['match_score'], -c2['_elo'], c2['_distance'], -c2['_completion'])
            self.assertEqual(_candidate_rank_key(c1) > _candidate_rank_key(c2),
                             old1 < old2)


# ═══════════════════════════════════════════════════════════════════
# Task 6 — haversine_km parity
# ═══════════════════════════════════════════════════════════════════
def _haversine_km_reference(lat1, lng1, lat2, lng2):
    """Bản công thức cũ (pre-refactor) trong matching_service."""
    if None in (lat1, lng1, lat2, lng2):
        return None
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class HaversineKmParityTests(TestCase):
    # 12 cặp thật: VN (HN-HCM, HN-ĐN...), quốc tế, trùng nhau, gần nửa vòng
    PAIRS = [
        (21.0285, 105.8542, 10.8231, 106.6297),   # Hà Nội → TP.HCM
        (21.0285, 105.8542, 16.0544, 108.2022),   # Hà Nội → Đà Nẵng
        (10.8231, 106.6297, 10.0301, 105.7689),   # HCM → Cần Thơ
        (21.0278, 105.8342, 21.0300, 105.8360),   # cùng phố ~300m
        (10.0, 106.0, 10.0, 106.0),               # trùng nhau → 0
        (0.0, 0.0, 0.0, 0.0),                     # trùng nhau tại gốc → 0
        (0.0, 0.0, 0.0, 179.9),                   # ~nửa vòng trái đất (qua xích đạo)
        (45.0, 0.0, -45.0, 180.0),                # đối xứng qua tâm → nửa vòng
        (51.5074, -0.1278, 48.8566, 2.3522),      # London → Paris
        (35.6762, 139.6503, 37.5665, 126.9780),   # Tokyo → Seoul
        (-33.8688, 151.2093, 1.3521, 103.8198),   # Sydney → Singapore
        (64.1466, -21.9426, -18.9143, 47.5257),   # Reykjavik → Antananarivo
        (21.0056, 105.8430, None, 105.0),         # thiếu tọa độ → None
    ]

    def test_values_match_reference_within_001km(self):
        for p in self.PAIRS:
            lat1, lng1, lat2, lng2 = p
            got = haversine_km(lat1, lng1, lat2, lng2)
            ref = _haversine_km_reference(lat1, lng1, lat2, lng2)
            if ref is None:
                self.assertIsNone(got)
                continue
            self.assertAlmostEqual(got, ref, delta=0.01,
                                   msg=f'haversine_km lệch tại {p}: {got} vs {ref}')

    def test_identical_points_exact_zero(self):
        self.assertEqual(haversine_km(10.0, 106.0, 10.0, 106.0), 0.0)

    def test_antipodal_about_half_earth(self):
        d = haversine_km(0.0, 0.0, 0.0, 179.9)
        # Nửa chu vi R=6371: πR ≈ 20015.09 km; 179.9° kinh độ tại xích đạo
        self.assertAlmostEqual(d, math.pi * 6371.0 * (179.9 / 180.0),
                               delta=0.05)
