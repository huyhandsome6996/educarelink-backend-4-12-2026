# QA Audit — Matching + AI vs product standard

**Date:** 2026-09-13  
**Repo:** `huyhandsome6996/educarelink-backend-4-12-2026`  
**Branch / HEAD:** `main` @ `b1dd5c8`  
**Verdict:** **CHƯA ĐẠT CHUẨN.** Skill-gating và cửa sổ cam kết đã có; GPS 100%, cold-start, chuông+popup, AI re-rank còn lỗ hổng.

Prompt coding agent (fix + CH Play): [`CODING_AGENT_PROMPT_MATCHING_STANDARD_GPS_NOTIF_CHPLAY.md`](./CODING_AGENT_PROMPT_MATCHING_STANDARD_GPS_NOTIF_CHPLAY.md)

## Scorecard

| Yêu cầu | Kết quả | Ghi chú ngắn |
|---|---|---|
| Không đề xuất cùng job cho người khác khi PH chờ SV xác nhận | **GẦN ĐẠT** | Sau khi parent chọn: hard lock + 409 + not_selected. Unlock chỉ khi hết hạn/từ chối. Soft-lock 5' chưa gắn production. Feed worker/legacy có thể vẫn lộ việc. |
| Ưu tiên ứng viên tốt hơn (tiêu chí PH) + AI | **GẦN ĐẠT** | 7-factor + skill-gating OK. Gemini chỉ parse job, **không** re-rank. Distance vừa 15% vừa hard-kill bán kính. |
| CarePartner mới không bị bỏ quên | **CHƯA ĐẠT** | `is_approved=False` chặn login+matching. Không exploration slot. Skill rỗng bị loại. Điểm newcomer (rating 60, completion 100) chỉ giúp *sau khi đã duyệt*. |
| Lịch nghỉ đúng ngày/giờ không bị đề xuất | **ĐẠT (Flow 1)** | Blackout trừ trong `available_slots`. Thiếu test `find_candidates`. Legacy `smart_match` bỏ qua blackout. |
| GPS 100% — khoảng cách là 1 tiêu chí, không quyết định | **CHƯA ĐẠT** | GPS tươi <48h; web 0 heartbeat; consent 403; `MAX_GPS_DRIFT_KM` loại khỏi **mọi** job; `km=None` cho 100 điểm. |
| Chuông + popup khi nhận đơn | **CHƯA LUÔN** | Channel + WAV có. Payload **thiếu** `data.class=critical`. `DeviceToken` không được ghi. Không modal in-app. |
| Web + mobile cùng API / cùng account | **GẦN ĐẠT** | JWT + `/api/matching/*` dùng chung. Dual Task vs JobPost. `SYNC_PARITY.md` cũ. |

## Evidence (file)

- Exclusive: `matching/services/booking_service.py` `select_carepartner`, `expire_booking_on_deadline`; `matching/api/jobs.py` CandidatesAPIView 409.
- Ranking: `matching/services/matching_service.py` 7-factor, skill-gating #6, sort key.
- AI: `matching/services/gemini_service.py` parse only.
- GPS: `get_effective_coordinates`, drift exclude ~446–454; `tracking/views.py` `GpsHeartbeatAPIView`.
- Blackout: `matching/services/lock_service.py` `available_slots`.
- Notif: `notification_service.py` `_build_payload`; `mobile/src/components/NotificationListener.js`.
- New user: `core/models.py` `is_approved` default False; `core/views.py` LoginAPIView 403.

## Không chạy được unit test trong phiên QA này

Sandbox QA không có Django installed. Kết luận dựa trên đọc code + test suite hiện có (`matching/tests/test_booking.py`, `test_matching.py`, `test_gps_dispatch.py`, `test_locks.py`). Coding agent **bắt buộc** chạy `python manage.py test matching.tests` trước khi ship.
