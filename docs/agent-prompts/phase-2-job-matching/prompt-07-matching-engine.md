# Prompt 07 — Matching Engine 7-factor + Hard Filters + Max-8

## Context
Trái tim của Flow 1: sau khi job parsed, hệ thống lọc cứng rồi chấm điểm 7 yếu tố (tổng 100) cho mọi CarePartner active, trả về top 8 trong < 2s. Engine thay thế `core/services/smart_match.py` (chỉ 3 tiêu chí workload/distance) bằng engine mới trong app `matching` — LUỒNG CŨ GIỮ NGUYÊN. Con số trọng số ĐỌC TỪ BẢNG `MatchingWeight` (Step 11.6), band multiplier từ `EloBand` (Step 6).

## Requirements (nguồn spec)
- `flow1-step2-matching-engine.md` §2.2.1 hard filters (loại TRƯỚC khi chấm):
  1. Account not active/banned/unverified (`is_active, is_approved, CarePartnerProfile.matching_paused=false, không suspend`);
  2. Không overlap availability với TẤT CẢ slot (đi qua `availability.available_slots()` — Step 9.3 cấm đọc bảng tuần trực tiếp);
  3. Đã có booking/lock trùng slot (qua `LockService`);
  4. Ngoài max radius (cp.max_radius_km hoặc default 20km — config `MatchingConfig MAX_RADIUS_KM_DEFAULT`);
  5. Thiếu skill bắt buộc khi parent yêu cầu rõ ("cần nữ", "cần sinh viên sư phạm");
  6. Band `blocked` loại hẳn; `restricted` chỉ vào khi pool < 8; throttle `max_proposals_per_day` theo band.
- §2.2.2 bảng 7 factor: Availability 25%, Skills 20%, Distance 15%, Rating 15%, Completion 10%, ELO 10%, Response 5% — trọng số đọc `MatchingWeight` (W_AVAILABILITY...), validate tổng 100.
- `flow1-step11-ai-gemini-scoring.md` §11.6 CÔNG THỨC CHÍNH XÁC:
  - availability_fit = covered/required × 100 (candidate sống sót hard filter luôn 100);
  - skills = 60×jaccard(required, cp_skills) + 40×major_match_bonus (bonus=1 nếu major map đúng job_type);
  - distance = max(0, 100 − km/max_radius×100); km = min(home_distance, school_distance); `has_vehicle` → km × 0.75;
  - rating = rating/5×100; nếu review_count < 3 → blend 0.6×rating_sub + 0.4×60;
  - completion = completed/(completed+cancelled+no_show)×100; newcomer = 70;
  - elo = clamp((effective−650)/800×100, 0, 120);
  - response = % booking ack trong SLA 15 phút ×100; newcomer = 60;
  - final = Σ(weight_i × sub_i)/100 × band_multiplier, làm tròn int 0-100.
- match_level: ≥85 very_high | 70-84 high | 55-69 medium | <55 low (low chỉ hiện khi pool < 8).
- §2.2.3 tie-breaker: ELO > distance > completion. §2.2.4 AI re-rank (post-MVP, tùy chọn): chỉ đảo thứ tự trong top-20, không thêm/bớt — cài flag bật/tắt `ENABLE_AI_RERANK` mặc định OFF.
- §2.4 API contract `POST /api/matching/candidates` body `{job_id}` → response ĐẦY ĐỦ schema (total_matched, candidates[≤8] với carepartner_id, display_name, avatar_url, school, major, rating, completed_jobs, distance_km, match_score, match_level, top_skills[≤3], latest_review, response_tag, availability_fit).
- AC §2: < 2s với dữ liệu demo; newcomer không bị loại; loại đúng theo test seed A/B/C.

## Acceptance Criteria
1. `MatchingService.find_candidates(job) -> {total_matched, candidates}` — đúng schema §2.4; test seed spec: A (Mon 18-22, 4.9*, 1km) > B (Mon 19-21, 4.2*, 8km), C (không rảnh) BỊ loại.
2. Toàn bộ 6 hard filter hoạt động — test riêng từng filter (seed vi phạm 1 mình filter đó → bị loại).
3. Unit test TỪNG sub-score theo công thức §11.6 với ví dụ số cụ thể (vd: km=5, max=20, has_vehicle → km_eff=3.75 → distance=81.25→81; review_count=2, rating 4.0 → 0.6×80+0.4×60=72).
4. Trọng số đổi DB (W_DISTANCE 15→25, giảm W_RATING còn 5) → ranking ĐỔI không deploy; tổng 99 → save bị từ chối (đã có từ Prompt 01).
5. Band multiplier áp final: trusted ×1.15 (clamp ≤100), watch ×0.85... — test CP 100 raw → 85 với ×0.85.
6. `restricted` chỉ xuất hiện khi qualified pool < 8 (seed 10 qualified gồm 1 restricted → excluded; seed 3 → present).
7. Throttle band: watch max 4 proposals/ngày — proposal là gì: bản ghi đưa vào candidate list (tạo `MatchingProposal` row mỗi lần xuất hiện trong list) — thứ 5 trong ngày → bị loại khỏi list + log.
8. Tie-breaker: 2 CP bằng điểm đủ mọi thứ → ELO cao hơn trước; ELO bằng → gần hơn; completion cao hơn.
9. Hiệu năng: seed 200 CP (factory batch) → find_candidates < 2s (test đánh dấu `@pytest.mark.slow`/skip theo env nhưng phải có); số query N+1 bị chặn bởi `assertNumQueries` upper bound.
10. Gemini chết → engine vẫn trả list rule-based (mock gemini_client raise) — re-rank AI bỏ qua.
11. `MatchingProposal` model + hàm `record_proposals(job, candidates)` — phục vụ throttle + Step 8.5 "đã đề xuất 3 lần".
12. Distance: CP ở ĐÚNG biên max radius → INCLUDED (không loại vì floating point — dùng epsilon 1m).

## Technical Approach
- `matching/services/matching_engine.py`: `find_candidates(job)` — pipeline: (lọc SQL sơ bộ role/approved/active/coords trong bounding box của min(max_radius, job-specific)) → vòng python chấm slot qua `available_slots` (batch: cache theo cp×date đã có từ Prompt 03) → sub-scores (vector thuần python, dữ liệu prefetched `select_related/prefetch`) → sort → band filter/restricted → throttle → top 8.
- Dữ liệu rating/completion/response: aggregate từ `Review`/Booking hiện có + `MatchingConfig` newcomer defaults (COMPLETION_NEWCOMER=70, RESPONSE_NEWCOMER=60, RATING_NEUTRAL=60).
- School distance: dùng `User.latitude/longitude` làm home; school_distance tạm = home (chưa có trường riêng — ghi chú config `USE_SCHOOL_DISTANCE=false`).
- Response speed: đếm từ Booking khi có (`ack_at` field — Prompt 09 thêm); trước đó dùng neutral.
- API `matching/api/matching.py::MatchingCandidatesAPIView` (POST, parent-only, job phải `ai_parsed|matching|needs_replacement`).
- Ghi `JobPost.total_matched`; transition `matching` (từ ai_parsed) qua state helper.

## Code References
- Spec: `flow1-step2-matching-engine.md` (§2.2, §2.3, §2.4), `flow1-step11-ai-gemini-scoring.md` §11.6, `flow1-step6-hidden-elo.md` §6.6.
- Tạo: `matching/services/matching_engine.py`, `matching/api/matching.py`, model `MatchingProposal` (migration mới), `matching/tests/test_matching_engine.py`.
- Tái sử dụng: `performance/spatial.py::bounding_box_filter`, `matching/services/availability.py::available_slots`, `matching/services/elo_service.py`, `LockService.has_conflict`.
- KHÔNG sửa `core/services/smart_match.py` (luồng cũ sống độc lập).

## Testing Checklist (spec §Testing + bổ sung)
- Full seed spec Step 2 (A/B/C) → đúng kết quả.
- Job ngày quá khứ → 400 trước khi match.
- CP tại đúng biên 20km → included.
- CP có booking trùng slot → excluded (LockService).
- Newcomer 0 rating 0 job → completion 70, rating blend 60×0.4..., KHÔNG bị loại.
- Đổi trọng số DB → ranking đổi.
- 200 CP < 2s + assertNumQueries ≤ ngưỡng đã đặt.
- Restricted/throttle/block các band đúng.
- Gemini chết → vẫn trả kết quả.
- Kết quả ổn định: chạy 2 lần cùng dữ liệu → cùng thứ tự (stable sort + tie-breaker deterministic).

## Edge Cases
- Pool sau hard filter = 0 → `{total_matched: 0, candidates: []}` — UI empty state (Prompt 08).
- CP không có availability nào → loại ở filter 2, KHÔNG crash.
- max_radius_km null → default config; 0 → loại tất cả ngoài 0km (hợp lệ).
- Job có 20 slots recurring — coverage phải full MỌI slot mới pass (partial → loại).
- Review của luồng cũ (Task) KHÔNG tính — chỉ review gắn JobPost/Booking mới (khi chưa có → newcomer defaults; ghi chú chuyển tiếp).

## Dependencies
- Prompt 01, 02 (ELO + band), 03 (available_slots + conflict), 04 (blackout trong available_slots), 05+06 (JobPost + ai_requirement).
- Prompt 08/09/11 consume output.
