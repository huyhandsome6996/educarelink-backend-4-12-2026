# Prompt 02 — Hidden ELO Trust Score (service + API riêng tư)

## Context
Spec Step 6 yêu cầu điểm tin nhiệm ẩn cho CarePartner: quyết định thứ hạng đề xuất, throttle, hạn chế — nhưng **KHÔNG BAO GIỜ lộ số raw ra client**. Đây là trục đánh giá mới, tách biệt tier B4 hiện có (`User.tier`, giữ nguyên). Prompt này dựng toàn bộ service ELO trên các bảng `EloLedger`/`EloBand`/`CarePartnerProfile` đã có từ Prompt 01.

## Requirements (nguồn `flow1-step6-hidden-elo.md`)
- §6.1: mỗi thay đổi ghi ĐÚNG 1 row ledger; matching dùng EFFECTIVE score.
- §6.3: 13 sự kiện cộng điểm với reason_code + delta đúng bảng (`job_completed` +12, `review_5` +10, `review_4` +6, `review_3` +1, `review_bad` -8, `positive_review_text` +4, `streak_3/5/10` +8/+15/+30, `clean_month` +10, `profile_complete` +5 một lần, `fast_ack` +2 max 1/ngày, `reschedule_ok` +1, `parent_cancelled_compensation` +5/+10).
- §6.4: tier T0-T6 (-5/-15/-30/-50/-80/-150/-250) + `slow_ack_repeat` -6, `parent_report_valid` -25, `appeal_abuse` -10. Idempotent per `(booking, reason_code)`.
- §6.5: decay penalty theo tuổi: 0-30d ×1.00, 31-90d ×0.60, 91-180d ×0.25, >180d ×0.00; reward KHÔNG decay; cooldown 7 ngày sau T5/T6 → mọi reward cộng dư chỉ tính 50%; Effective = 1200 + Σ(rewards) + Σ(penalty×factor), clamp [400, 2000]; recompute + cache lên profile.
- §6.6: elo_subscore = clamp((eff-650)/800×100, 0, 120); band multiplier áp lên final score; blocked loại hoàn toàn; restricted chỉ hiện khi pool < 8; throttle đề xuất/ngày theo band, tính theo ngày lịch Asia/Ho_Chi_Minh.
- §6.7: CP chỉ thấy band label + hint tiến độ; màn hình "Tín nhiệm" 10 sự kiện gần nhất KHÔNG kèm số.
- §6.8: admin chỉnh tay bắt buộc note, reason_code=`admin_adjust`, ghi admin id.

## Acceptance Criteria
1. CP mới = 1200, band `normal` (test bằng tạo profile + tính effective).
2. Mỗi lần gọi apply_event sinh ĐÚNG 1 ledger row; gọi 2 lần cùng `(booking, reason_code)` → chỉ 1 delta (IntegrityError được catch → no-op trả về kết quả lần đầu).
3. `hidden_elo`/`effective_elo` KHÔNG xuất hiện trong BẤT KỲ serializer nào — có **test CI grep** quét toàn bộ `**/serializers*.py` + `matching/api/*.py` cấm 2 chuỗi này (test fail build nếu lộ).
4. Band recompute ngay sau mỗi ledger write, cache vào `CarePartnerProfile.effective_elo/band/band_updated_at` (cùng transaction).
5. Decay biên CHÍNH XÁC: penalty 30 ngày 23h59 → ×1.00; đúng 31 ngày → ×0.60; 90d23h59 → ×0.60; 91d → ×0.25; 180d23h59 → ×0.25; 181d → ×0.00 (test freeze time).
6. Cooldown 7 ngày sau T5/T6: hoàn thành job 3 ngày sau no-show → +12 chỉ tính +6; hết 7 ngày → full +12.
7. `blocked` không bao giờ trong candidate pool (hook trả cờ `is_matchable=False`); `restricted` chỉ khi pool qualified < 8 (API hàm `is_allowed_in_pool(pool_size)`).
8. Throttle: `EloService.can_receive_proposal(cp, date)` đếm theo ngày lịch VN; band watch max 4, restricted max 1 (đọc từ EloBand, không hardcode); vượt → False + log.
9. `EloService.effective_elo(profile)` luôn nằm [400, 2000] — test với ledger tổng ±5000.
10. Sửa `EloBand.min_elo` trong DB → band recompute theo dữ liệu mới không cần deploy (test update row → gọi recompute_bands toàn bộ qua management command `recompute_elo_bands`).
11. Streak counter: reset về 0 khi cancel/no-show; +8/+15/+30 khi chạm 3/5/10 liên tiếp (reason_code `streak_N`, mỗi mốc chỉ tính 1 lần mỗi streak).
12. API `GET /api/carepartner/trust`: trả band label VI, 10 sự kiện gần nhất dạng mô tả tiếng Việt không số ("Hoàn thành đúng giờ", "Hủy trong thời hạn cam kết"...), next milestone text. KHÔNG có bất kỳ trường số ELO nào.

## Technical Approach
- File mới `matching/services/elo_service.py`:
  - `apply_event(carepartner, reason_code, booking=None, admin=None, note="") -> EloLedger` — lookup delta từ 2 bảng config (`EloRewardRule` dùng hằng class-level để map reason→delta MẶC ĐỊNH, nhưng cho phép override qua `EloBand`-style config nếu owner yêu cầu; delta T0-T6 ĐỌC từ `CancelPolicy` — không hardcode số -150 v.v.).
  - `_decay_factor(penalty_created_at, now)` — hàm thuần, dễ test.
  - `_in_recovery_cooldown(profile, now)` — tra ledger T5/T6 gần nhất 7 ngày.
  - `recompute(profile)` — sum theo công thức 6.5, cache, trả (effective, band).
  - `effective_subscore(effective)` — công thức §6.6.1.
- Vòng lặp recompute band: `management/commands/recompute_elo_bands.py` (dùng khi owner sửa EloBand).
- Hook điểm gọi: **KHÔNG tự gọi từ nơi khác trong prompt này** — các prompt 09/10/12 sẽ gọi `apply_event` trong transaction của chúng. Prompt này chỉ cung cấp service + API read-only + admin.
- Admin: action Django Admin "Điều chỉnh ELO thủ công" bắt buộc nhập note → ghi `admin_adjust`.
- Api view: `matching/api/trust.py` + đăng ký url `/api/carepartner/trust` (IsAuthenticated, chỉ đọc profile của chính mình).

## Code References
- Spec: `docs/agent-spec/flow1-step6-hidden-elo.md` (toàn bộ), `flow1-step7-cancellation-compensation.md` §7.1 (delta tier).
- Sửa/tạo: `matching/services/elo_service.py` (mới), `matching/api/trust.py` (mới), `matching/urls.py` (mới — include từ `backend/urls.py` cạnh các app khác), `matching/admin.py` (bổ sung action), `matching/tests/test_elo.py` (mới).
- Tham chiếu pattern service: `core/services/tier_service.py` (tách service khỏi view).

## Testing Checklist (từ spec + bổ sung)
- Seed 1200 → 3 job completed 5 sao → 1200+36+30+8(streak_3)=1274 → band `good`.
- T5 -150 → band rơi đúng ngưỡng (850-1049 = watch).
- Backdate -150 penalty 100 ngày → effective -37.5 (làm tròn theo quy tắc ROUND_HALF_UP 1 chữ số thập phân khi cache — ghi rõ trong code).
- Backdate 200 ngày → bị bỏ qua hoàn toàn.
- Job 3 ngày sau no-show → +6 (50% cooldown).
- CP `blocked` perfect-match → vắng mặt trong danh sách (hook unit test với pool size 0 và 10).
- Grep test: `grep -r "hidden_elo\|effective_elo" --include="*serializer*"` → 0 hit (test tự động).
- Webhook completion bắn 2 lần → +12 một lần (unique constraint).
- Proposal thứ 5 trong ngày của band watch → bị chặn + log warning.
- Sửa `EloBand.trusted.min_elo` = 1300 → command recompute → band thay đổi, không deploy.

## Edge Cases
- Ledger với `booking = null` (sự kiện không gắn booking: `profile_complete`, `clean_month`, `slow_ack_repeat`) — unique constraint chỉ chặn cặp (booking, reason_code) khi cả 2 non-null.
- `fast_ack` max 1/ngày: kiểm tra ledger cùng ngày lịch VN có reason_code này chưa.
- clock skew: mọi so sánh dùng `django.utils.timezone.now()` (aware), KHÔNG `datetime.now()`.
- CP bị suspend (Prompt 10) → `can_receive_proposal` trả False bất kể band.

## Dependencies
- Prompt 01 (bảng EloLedger/EloBand/CarePartnerProfile/CancelPolicy + seed).
- Các prompt 09/10/12 sẽ gọi service này — không phụ thuộc ngược.
