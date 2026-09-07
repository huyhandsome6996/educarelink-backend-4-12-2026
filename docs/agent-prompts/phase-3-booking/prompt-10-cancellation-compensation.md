# Prompt 10 — Hủy đơn T0-T6 + Đền bù Credit + No-Show + Kháng cáo

## Context
Step 7 là hệ xử phạt phức tạp nhất: tier T0-T6 theo lead time, đền bù parent bằng CREDIT (không tiền thật — LOCKED #1), force majeure ×0.5 ELO nhưng KHÔNG giảm đền bù, no-show xác nhận bởi parent (LOCKED #4), kháng cáo admin duyệt, hủy từ phía parent (7.7). Mọi con số từ bảng `CancelPolicy` (Prompt 01 seed). Mọi penalty + đền bù + unlock + replacement phải ATOMIC và IDEMPOTENT.

## Requirements (nguồn `flow1-step7-cancellation-compensation.md`)
- §7.1 tier theo lead = `slot_start_sớm_nhất_còn_lại − cancel_time`: T0 trong window (-5, 0); T1 >24h (-15, 0); T2 6-24h (-30, 10%); T3 3-6h (-50, 20%); T4 <3h (-80, 30%, 2 lần/30d → xử như T5); T5 no-show (-150, 50% floor 50.000đ, 2 lần/30d → suspend 7 ngày); T6 vi phạm khi đang restricted/blocked HOẶC T4/T5 thứ 3 trong 30d (-250, 100%, suspend 30 ngày + xem xét ban).
- Force majeure: ELO ×0.5, đền bù GIỮ NGUYÊN (platform absorbs); mã 5.3: school_schedule/health/family_emergency/accident/wrong_job_info (force_majeure, note bắt buộc ≥ 20 ký tự, evidence tùy chọn ≤3 file ×5MB jpg/png/pdf); transport/personal/other = normal_cancel (other bắt buộc note); force majeure KHÔNG bao giờ chặn notification/replacement; chống lạm dụng max 2 lần FM/30 ngày roll — lần 3 trở đi full penalty.
- §7.2 giá trị: rate × hours/slot × slots CÒN LẠI (recurring đã xong 1 buổi → chỉ tính phần còn lại); làm tròn XUỐNG 1.000đ; T5 floor 50k; fallback rate 100.000đ/h nếu thiếu data.
- §7.3 nguồn tiền: credit vào `ParentWallet.credit_vnd` — KHÔNG rút được; CP không mất tiền MVP, ghi `debt_vnd` (field trên CarePartnerProfile) cho phase sau.
- §7.4 no-show: slot_start +15' vẫn `committed` chưa start → `suspected_no_show` + hỏi parent [Đã đến][Không đến]; Không đến → `no_show` T5 (đền bù + replacement + admin alert); parent im 24h → `no_show_unconfirmed` chỉ T4 + flag admin; CP dispute trong 48h qua appeal.
- §7.5 auto-replacement: tier ≥ T1 → unlock slots CP, job → `needs_replacement`, re-run matching (exclude CP hủy), notify parent số candidate + số đền bù; pool rỗng → notify "chưa có" + retry 30 phút × 6h rồi admin alert (chi tiết flow ở Prompt 11 — prompt này phát event).
- §7.6 appeal: trong 7 ngày; note ≥ 20 ký tự + evidence ≤3×5MB; pending → approved (reversal ELO + lift suspend, GIỮ đền bù) | partially_approved (50% reversal) | rejected; max 3/30 ngày, thứ 4 auto-reject; Gemini pre-classify tùy chọn (trust LOW — admin quyết định).
- §7.7 parent hủy: >24h free; <24h → CP +5 ELO `parent_cancelled_compensation`; <3h hoặc sau start → CP +10 + `ParentTrustFlag`; không parent score MVP.
- §7.9 API: cancel, report-no-show, appeal (POST/GET), wallet/credit, carepartner/penalties (labels KHÔNG số), admin appeals queue.

## Acceptance Criteria
1. `POST /api/bookings/{id}/cancel` tự chọn tier theo lead time — KHÔNG có manual tier; test 5 biên: 30h→T1, 10h→T2, 4h→T3, 1h→T4, trong window→T0 (spec §Testing).
2. Penalty ELO (`EloService.apply_event` reason `cancel_T{n}`) + Compensation + release locks + JobPost transition + notification — CÙNG transaction, idempotent: gửi 2 lần cùng request → 1 penalty, 1 đền bù, 1 notification.
3. FM T4 → ELO -40 (×0.5), đền bù vẫn 30%; FM note 5 ký tự → 400.
4. FM thứ 3 trong 30 ngày roll → full penalty (test seed 2 FM trước đó).
5. T5 floor: job 60.000đ → đền 50.000đ (không phải 30.000).
6. Recurring 3 ngày, xong ngày 1 rồi hủy → lead tính từ ngày 2, value = 2 slot còn lại.
7. Repeat escalation: 2×T4/30d → lần 2 tính theo T5 + suspend 7 ngày; 3×T4/T5/30d → T6 + suspend 30 ngày; suspend → `can_receive_proposal=False`, không start job được (409 `account_suspended`).
8. No-show: +15' beat → `suspected_no_show` + notification hỏi parent; parent "Không đến" → `no_show` T5; im 24h → `no_show_unconfirmed` T4 + flag; parent "Đã đến" → quay `in_progress`.
9. Appeal: đúng 7 ngày window (biên: phút 7×24h+1 → 400); approve → ledger reversal `appeal_approved` + lift suspend + đền bù GIỮ; 4th/30d → auto reject `appeal_limit`.
10. Parent hủy: >24h free + unlock; <24h → CP +5; 2h trước → CP +10 + ParentTrustFlag (test cả 3).
11. `GET /api/carepartner/penalties` trả events label VI không số ("Hủy sát giờ làm — mức cảnh cáo"); KHÔNG lộ elo delta (grep test mở rộng).
12. `GET /api/wallet/credit` + lịch sử Compensation có tham chiếu booking; T5 đền bù xuất hiện trong wallet history.

## Technical Approach
- `matching/services/cancel_service.py`: `cancel_booking(booking, actor, reason_code, note, evidence)` — resolve tier (hàm thuần `resolve_tier(lead_minutes, in_window, band, history)`), áp qua `EloService`, `Compensation.objects.create`, `ParentWallet.credit_vnd` update (F() + aggregate idempotent qua unique (booking, tier) trên Compensation? — dùng `EloLedger` unique làm nguồn sự thật + guard row `PenaltyApplied(booking, tier)` unique), unlock qua `LockService.release_locks`, state transition, publish signal `replacement_needed` (Prompt 11 consume), suspend theo policy.
- `matching/services/noshow_service.py` + beat trong scheduler: scan booking `committed` quá start+15'; 24h timeout job.
- `matching/services/appeal_service.py`: create/list/decide + limits + reversal ledger.
- `matching/services/wallet_service.py`: credit(parent, amount, booking) atomic F() + row Compensation.
- APIs: `matching/api/{cancel,noshow,appeal,wallet,penalties}.py`; admin queue Django Admin filter Appeal.status=pending + action approve/partial/reject (bắt buộc admin_note).
- Evidence upload: lưu file field `Appeal.evidence_files` (3 ImageField/FileField hoặc 1 FileField list qua model riêng — chọn JSON path + Django default_storage, validate size/type serializer).

## Code References
- Spec: `flow1-step7-cancellation-compensation.md` toàn bộ; `flow1-step5-booking-commitment.md` §5.3 (reason codes); `flow1-step12-state-machines.md` §12.2 (cancel/no-show/expired transitions); `flow1-step6-hidden-elo.md` §6.4.
- Tạo: services + api trên; sửa `matching/models.py` (PenaltyApplied, suspend fields trên CarePartnerProfile: `suspended_until`, `debt_vnd`), tests `matching/tests/test_cancel.py`, `test_noshow.py`, `test_appeal.py`, `test_wallet.py`.
- Tái sử dụng: `EloService` (02), `LockService` (03), state helper (05), notify stub (11), scheduler pattern.

## Testing Checklist (spec §Testing — làm ĐỦ 13 dòng)
- 5 biên tier như AC1; FM các case; 2×T4 → lần 3 T5+suspend (spec nói "two T4 events in 30 days -> the third is charged at T5") — dùng mốc: T4 thứ 2 bị tính như T5 theo bảng §7.1 (clarify trong code comment: trigger ghi "2x in 30 days → charge as T5" nghĩa là SỰ KIỆN T4 THỨ 2 bị tính T5; implement theo bảng, test khớp bảng).
- No-show 3 nhánh + 24h timeout.
- Appeal 4 biên (approve/partial/reject/4th).
- Parent cancel 3 nhánh.
- Replay cancel 2 lần → 1x mọi side effect.
- Sửa CancelPolicy T4 30%→40% → lần hủy sau trả 40% (không deploy).
- suspend chặn start + matching.
- Wallet history đúng booking reference.

## Edge Cases
- Cancel khi booking `awaiting_commitment` TRƯỚC committed → luôn T0 bất kể lead time.
- Cancel job recurring khi đang `in_progress` slot hiện tại → chỉ áp cho slots còn lại; slot đang chạy hoàn thành bình thường (không cho cancel slot đang chạy — 400).
- Parent cancel khi job `needs_replacement` (chưa có booking active) → chỉ đổi job state, không penalty.
- evidence file 6MB → 400 `evidence_too_large`; loại .gif → 400.
- CP trong recovery cooldown ELO (Prompt 02) vẫn nhận đủ penalty (chỉ reward bị giảm).
- `suspected_no_show` khi parent offline 24h + CP dispute sau đó → appeal flow bình thường.

## Dependencies
- Prompt 01 (bảng + seed policy), 02 (EloService), 03 (release locks), 09 (booking states + ack_at), 04 (reschedule_expired auto-cancel dùng cancel_service), 11 (notify + replacement — dùng stub signal).
