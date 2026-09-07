# ASSUMPTIONS — Quyết định khi spec thiếu/không rõ

> Theo master prompt §CÁCH LÀM VIỆC mục 2: "Nếu spec thiếu/thiếu rõ → chọn
> phương án hợp lý nhất, ghi vào file này, tiếp tục làm, KHÔNG dừng lại chờ hỏi."

| # | Vấn đề | Quyết định | Lý do |
|---|--------|-----------|-------|
| A1 | Tên model ví đền bù: spec Step 7.8 dùng `ParentWallet` + `Compensation`, master prompt dùng `CreditBalance` + `CreditTransaction` | Dùng `CreditBalance` + `CreditTransaction` (giữ nguyên ngữ nghĩa spec: credit ảo, không rút được, idempotent per booking qua partial unique constraint) | Master prompt là chỉ thị mới nhất của owner |
| A2 | Điểm thưởng `parent_cancelled_compensation` +5/+10 (Step 6.3 vs 7.7) | +5 khi parent hủy <24h, +10 khi hủy <3h/sau giờ start — caller (cancellation_service Phase 3) truyền `delta_override` | Spec để mở ở Step 6.3 ("+5 or +10") |
| A3 | decay áp cho penalty nào | MỌI ledger row có delta < 0 đều decay theo tuổi (Step 6.5 "Penalty rows carry decay_at") | Đọc sát Step 6.5 |
| A4 | Biên decay theo ngày | floor(age_days): 30d23h59 → ×1.00; 31d → ×0.60 | Đúng test spec Step 6 |
| A5 | Throttle đề xuất/ngày đếm từ đâu | Bảng mới `CandidateProposal` (unique job+CP) — matching engine ghi 1 row mỗi lần CP vào candidate list; `can_receive_proposal` đếm theo ngày lịch VN | Spec Step 6.6.5 cần nơi đếm; Prompt 01 không có bảng này nên thêm |
| A6 | Chống overlap hard-lock ở DB | Service-level `SELECT FOR UPDATE` + all-or-nothing trong transaction (chưa dùng Postgres ExclusionConstraint vì phải chạy được trên SQLite dev) | Prompt 03 AC2 cho phép "unique/condition phù hợp"; PostgreSQL prod khóa transaction ngay khi ghi |
| A7 | Lịch rảnh: bảng mới `CarePartnerAvailability` trong app matching | Tạo bảng mới (UUID PK, field `time_from/time_to` chuẩn spec), có lệnh seed chuyển dữ liệu `core.WorkerAvailability` cũ sang; endpoint cũ `/api/worker/availability/` vẫn sống | Master prompt: model mới UUID PK; Prompt 04 yêu cầu field name chuẩn spec, giữ tương thích ngược |
| A8 | Prefix URL mới | `/api/matching/...` (deviation so với spec rải nhiều prefix); path đuôi vẫn chuẩn: `/api/matching/carepartners/me/availability`, `/api/matching/credits/balance/`, `/api/matching/notifications/` | Tránh đè URL cũ của core; tester cần biết điểm này |
| A9 | `CancelPolicy.trigger` field thêm ngoài spec | Thêm (`in_window/lead_time/no_show/escalation`) để cancellation_service chọn tier đúng tự động | Spec không có cách phân biệt T0 vs T1-T4 vs T5 vs T6 ngoài ngữ cảnh |
| A10 | Notification gửi thật (Expo push + retry) | Phase 1 chỉ enqueue + in-app inbox; gửi thật wire ở Phase 3 (Prompt 11) | Phạm vi phase 1: schema + ELO + lock + blackout |
| A11 | Beat task `detect_no_show` dùng slot đầu tiên của job | So `slot_start + NO_SHOW_GRACE` với trạng thái booking `committed` | Step 7.4.1; booking đa slot bắt đầu từ slot sớm nhất |
| A12 | `total_value_vnd` frozen | Do booking_service (Phase 3) tính lúc select: rate × giờ/slot × số slot còn lại | Step 7.2 |
| A13 | CheckConstraint Django 5.2 | Dùng `condition=` (Django 5.1+ API mới) | Repo Django 5.2.15 |
| A14 | Window cắt nửa đêm | Serializer/service tách 2 row khi LƯU (22:00-23:59 + 00:00-01:00); JobSlot không cho cắt nửa đêm | Step 9.3 |
| A15 | `matching/tests/base.py` tự seed config | Mọi test class kế thừa `MatchingTestBase` — seed_matching_config chạy 1 lần/class | Bảng config phải có trong test DB |
| A16 | Hard lock loại trừ booking đang tạo khỏi conflict check | `hard_lock(slots, booking, ...)` exclude chính booking (Step 5.1.2: tạo booking trước, khóa sau, cùng transaction) | Nếu không exclude thì mọi hard_lock sẽ tự conflict |
