# Prompt 08 — Candidate List API hoàn thiện + Màn hình danh sách ứng viên (Mobile)

## Context
Step 3 định nghĩa UI danh sách ứng viên (tối đa 8 thẻ) parent nhìn thấy sau khi đăng việc. Prompt 07 đã có API engine; prompt này: (a) hoàn thiện response đúng 100% schema Step 2.4 kèm các trường UI cần, (b) dựng màn hình mobile `CandidateListScreen` mới theo đúng Step 3 (header, 12 phần tử/card, empty/loading/partial states, footer "Xem thêm"), thay thế vai trò `SmartMatchesScreen` trong luồng MỚI (không xóa màn hình cũ).

## Requirements (nguồn spec)
- `flow1-step3-candidate-list-ui.md` (toàn bộ):
  - Header: "Có {total_matched} CarePartner phù hợp với công việc của bạn. Hiển thị {n} người tốt nhất."; total ≤ 8 → "Có {total_matched} CarePartner phù hợp."; = 0 → empty "Hiện chưa có CarePartner phù hợp. Thử mở rộng thời gian hoặc địa điểm."
  - Card 12 phần tử: avatar 48px tròn (fallback chữ cái đầu), tên, trường/ngành, sao + "(mới)" nếu < 5 reviews, badge "X đơn hoàn thành", badge "X km", match_level màu, ≤3 skill chips, response tag, latest review nghiêng cắt 2 dòng, availability_fit text, nút "Chọn CarePartner này".
  - Card #1 ribbon "Đề xuất hàng đầu"; footer nếu > 8: "Xem thêm {total-8} CarePartner khác" → màn hình đầy đủ phân trang 20/trang.
  - Mapping tiếng Việt: very_high→"Rất phù hợp" (xanh lá), high→"Phù hợp cao" (xanh dương), medium→"Phù hợp" (xám), low→"Có thể cân nhắc" (xám nhạt); replies_fast→"Phản hồi nhanh"; always_on_time→"Thường đúng giờ"; full→"Trúng toàn bộ lịch"; partial→"Trúng một phần".
  - Loading: skeleton 8 card + "Đang tìm CarePartner phù hợp..."; Empty: minh họa + CTA "Sửa lại yêu cầu"; Partial: helper "Đây là tất cả CarePartner phù hợp hiện có."
- AC Step 3: đúng thứ hạng backend; Book button truyền `carepartner_id + job_id` sang luồng booking (Prompt 09); tap avatar/tên → profile CP.
- `flow1-step2-matching-engine.md` §2.4: response đủ field (Prompt 07 đã có phần — bổ sung `latest_review`, `response_tag`, `availability_fit`, `review_count`).

## Acceptance Criteria (Backend)
1. Response `POST /api/matching/candidates` đủ 100% field schema §2.4 + `review_count`; `top_skills` ≤ 3 (cắt từ skills matched); `latest_review` = review mới nhất có comment (luồng mới; rỗng → null).
2. `response_tag`: replies_fast nếu ≥ 70% ack trong SLA; always_on_time nếu completion đúng giờ ≥ 90%; null nếu newcomer (UI ẩn badge).
3. `availability_fit`: `full` khi candidate qua hard filter coverage 100% (luôn true ở filter) — trường này phục vụ màn "Xem thêm" khi nới lỏng; giá trị từ engine.
4. Endpoint phân trang đầy đủ: `GET /api/matching/candidates/full?job_id=&page=` 20/trang (dùng cho footer), chỉ parent owner của job.
5. Cache response 60s theo (job_id, job.updated_at) — chọn CP xong invalidate.

## Acceptance Criteria (Mobile — `mobile/src/screens/Parent/CandidateListScreen.js` mới)
6. Nhận params `{job_id}`; gọi API; render đúng 6 trạng thái: loading skeleton, empty, ≤8 partial, >8 (8 card + footer), error (retry), success.
7. Header text ĐÚNG 3 biến thể tiếng Việt theo total_matched; card có ĐỦ 12 phần tử đúng thứ tự spec; ribbon card #1.
8. Màu match_level: xanh lá/xanh dương/xám/xám nhạt dùng palette theme (`mobile/src/theme/colors.js` — thêm 4 constant nếu thiếu, không hardcode hex trong screen).
9. Nút "Chọn CarePartner này" → `navigation.navigate('BookingConfirm', {job_id, carepartner_id})` (route đăng ký trong `mobile/src/navigation/` — màn BookingConfirm do Prompt 15 dựng; ở đây đăng ký placeholder screen để không crash).
10. Tap avatar/tên → `CandidateProfileScreen` hiện có (`mobile/src/screens/Parent/CandidateProfileScreen.js`) với param carepartner_id.
11. Footer "Xem thêm" → màn hình đầy đủ (`CandidateListFullScreen` mới, phân trang 20/trang, FlatList + onEndReached).
12. Không có text hardcode tiếng Anh lộ ra UI; mọi label qua mapping constants file `mobile/src/utils/matchingLabels.js` (mới).

## Technical Approach
- Backend: mở rộng serializer ở `matching/api/matching.py`; batch query reviews gần nhất (`Prefetch` 1 query cho 8-20 CP).
- Mobile: Functional component + hooks, style theo `SmartMatchesScreen.js` hiện có (reuse component Card/Chip nếu `mobile/src/components/` có sẵn); skeleton = Animated placeholder; FlatList tối ưu `windowSize`.
- Đăng ký route trong navigator Parent stack (file navigation tương ứng `mobile/src/navigation/`).
- Animation entrance dùng `ANIM` từ theme (theo pattern screen hiện có).

## Code References
- Spec: `flow1-step3-candidate-list-ui.md`, `flow1-step2-matching-engine.md` §2.4.
- Backend sửa: `matching/api/matching.py`, `matching/serializers.py`.
- Mobile tạo: `screens/Parent/CandidateListScreen.js`, `screens/Parent/CandidateListFullScreen.js`, `utils/matchingLabels.js`; sửa: navigation stack, `theme/colors.js` (thêm constant màu mức phù hợp), `src/api/matching.js` (mới — client gọi candidates API).
- Tham chiếu UI: `mobile/src/screens/Parent/SmartMatchesScreen.js` (pattern fetch + card), `CandidateProfileScreen.js`.

## Testing Checklist
- Seed 0/1/5/8/12/47 ứng viên → 6 trạng thái UI render đúng (snapshot + logic test backend cho total_matched tương ứng).
- Thứ tự card = score desc (so khớp API).
- Màu + label map đúng cả 4 mức; "(mới)" hiện khi review_count < 5.
- Skeleton hiện trong lúc fetch; biến mất sau response.
- Footer chỉ hiện khi total > 8; text đếm đúng `total - 8`.
- Book button → đúng params; avatar tap → đúng profile.
- Latest review cắt 2 dòng; skills ≤ 3 chip.
- Backend: cache 60s — 2 call liên tiếp 1 query DB (test assertNumQueries lần 2 = 0 trừ auth).

## Edge Cases
- total_matched = 0 sau khi parent sửa job → pull-to-refresh cập nhật.
- CP không avatar → fallback initials màu từ hash id (ổn định).
- `latest_review` chứa emoji/newline → render an toàn (numberOfLines=2).
- Màn hình full list: CP bị chọn rồi → item mờ + disable nút.
- API lỗi 409 (job vừa được ai đó chọn CP) → navigate back + toast "Công việc đã có CarePartner".

## Dependencies
- Prompt 07 (engine + fields), Prompt 09 (BookingConfirm route — placeholder OK).
- Prompt 15 sẽ nối tiếp hoàn thiện (sound, real booking flow).
