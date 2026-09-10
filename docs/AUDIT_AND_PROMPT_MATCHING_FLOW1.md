# BÁO CÁO ĐỐI SOÁT VÀ PROMPT SỬA ĐỔI HỆ THỐNG GHÉP NỐI PHỤ HUYNH ↔ CAREPARTNER (FLOW 1)

> **Tài liệu chuẩn bị cho:** Claude & Coding Agent  
> **Dự án:** EduCareLink Backend & Mobile/Web Frontend  
> **Nguồn đối chiếu:** Bản mô tả đầy đủ 20 mục văn bản (`docs/agent-spec/` + database config)  
> **Ngày tạo:** 2026-09-10  

---

## MỤC LỤC

1. [TỔNG QUAN KẾT QUẢ ĐỐI SOÁT](#1-tổng-quan-kết-quả-đối-soát)
2. [BÁO CÁO ĐỐI SOÁT CHI TIẾT 20 MỤC](#2-báo-cáo-đối-soát-chi-tiết-20-mục)
3. [DANH SÁCH CÁC ĐIỂM SAI LỆCH CẦN SỬA CHỮA (GAPS)](#3-danh-sách-các-điểm-sai-lệch-cần-sửa-chữa-gaps)
4. [PROMPT HOÀN CHỈNH CHO CLAUDE ĐỂ VIẾT CHO CODING AGENT](#4-prompt-hoàn-chỉnh-cho-claude-để-viết-cho-coding-agent)

---

## 1. TỔNG QUAN KẾT QUẢ ĐỐI SOÁT

Hệ thống ghép cặp thông minh (Flow 1) đã được triển khai với nền tảng kiến trúc cực kỳ vững chắc, bao gồm:
- Toàn bộ máy trạng thái (13 trạng thái JobPost, 16 trạng thái Booking, `StateTransitionLog`).
- Cơ chế khóa chống trùng lịch đa tầng (Soft lock 5 phút, Database row-level lock `select_for_update`, nguyên tắc khóa tất cả hoặc không có gì).
- Hệ thống điểm tín nhiệm ẩn (Base 1200, dải 400–2000, 6 bậc ELO, sổ cái `EloLedger` chống trùng lặp, cơ chế nhạt dần penalty 30/90/180 ngày, thời gian thử thách 7 ngày giảm 50% điểm thưởng).
- Chính sách hủy phạt T0–T6, cơ chế bảo vệ bất khả kháng (chặn giải thích < 20 ký tự, đếm trên `Booking.cancel_reason`, giới hạn 2 lần/30 ngày), bồi thường credit ảo vào ví phụ huynh.
- Bộ 17 kiểm chứng nghiệp vụ `g13_checks.py`, demo E2E thực tế `e2e_matching_live_demo.py`, và 155 unit/integration tests trong `matching/tests/`.

Tuy nhiên, qua quá trình kiểm tra tỉ mỉ từng dòng mã so với **20 mục của bản mô tả văn bản**, đã phát hiện **5 điểm sai lệch cốt lõi cần được căn chỉnh ngay** để hệ thống hoàn toàn khớp với đặc tả của nhóm phát triển.

### Bảng tóm tắt đối soát 20 mục:

| STT | Mục đặc tả | Trạng thái | Ghi chú & Đánh giá |
|:---|:---|:---:|:---|
| 1 | MỘT. Tư tưởng nền tảng của cả hệ thống | ✅ ĐẠT | Đúng triết lý ghép nối 2 chiều, kỷ luật tín nhiệm ẩn, lịch rảnh chủ động |
| 2 | HAI. Luồng của phụ huynh — Đăng việc | ⚠️ SAI LỆCH | **3 sai lệch:** Nhóm tuổi trẻ (đang dùng under_3 thay vì 5 mức chuẩn), danh sách việc chăm sóc (đang thiếu 2 việc, thừa 1), phương tiện đón trẻ (đang là ô nhập tự do thay vì 3 lựa chọn chọn sẵn) |
| 3 | BA. Trí tuệ nhân tạo đọc hiểu bài đăng | ⚠️ CẦN BỔ SUNG | Gemini parse tốt + fallback tốt. Cần bổ sung thông báo công bằng khi AI tách giới tính ở Gia sư và luồng xác nhận câu hỏi làm rõ khi độ tin cậy < 0.6 |
| 4 | BỐN. Bộ máy tìm và chấm điểm ứng viên | ⚠️ SAI LỆCH | **2 sai lệch điểm số:** Sinh viên mới đang bị tính điểm đánh giá sao là 24 (do công thức blend) thay vì 60 trung tính; tỷ lệ hoàn thành đơn của người mới đang là 70% thay vì 100% |
| 5 | NĂM. Danh sách ứng viên hiển thị cho phụ huynh | ⚠️ SAI LỆCH | **Sai lệch ngưỡng nhãn:** Ngưỡng điểm match level đang code 85/70/55 thay vì 90/75/60 theo đặc tả; code đang tự động ép nhãn 'low' thành 'medium' khi pool >= 8 |
| 6 | SÁU. Chọn ứng viên và cơ chế chốt đơn tự động | ✅ ĐẠT | Chuỗi atomic lock, awaiting_commitment, loại proposal khác, idempotency key hoạt động chuẩn |
| 7 | BẢY. Sinh viên khai báo lịch rảnh và ràng buộc | ✅ ĐẠT | Khai báo lịch tuần, ngày bận đột xuất, chặn sửa/xóa khi có đơn, đổi giờ có ELO thưởng |
| 8 | TÁM. Thông báo và yêu cầu về âm thanh | ✅ ĐẠT | Channel `educarelink_critical`, sound `critical_alert.wav`, Expo plugin cấu hình chuẩn |
| 9 | CHÍN. Khoảng thời gian cho phép để hủy | ✅ ĐẠT | Cửa sổ động 60/30/15/5 phút, chặn trên 5 phút trước giờ làm, eager & lazy commit |
| 10 | MƯỜI. Điểm tín nhiệm ẩn | ✅ ĐẠT | Điểm chuẩn 1200, 6 band, sổ cái ELO, decay 30/90/180 ngày, thử thách 7 ngày giảm 50% reward |
| 11 | MƯỜI MỘT. Lý do bất khả kháng và quyền kháng cáo | ✅ ĐẠT | 8 mã, 5 mã bất khả kháng note >= 20 ký tự, đếm trên Booking, cap 2 lần/30 ngày, kháng cáo 7 ngày |
| 12 | MƯỜI HAI. Các bậc phạt khi hủy đơn & đền bù | ✅ ĐẠT | T0–T6 chuẩn, credit ảo, ví phụ huynh, sàn 50k cho T5, không rút tiền mặt |
| 13 | MƯỜI BA. Tự động phát hiện việc không đến làm | ✅ ĐẠT | Quét sau 15 phút, áp T5, phạt 150 điểm, kích hoạt 7 ngày thử thách, nút bấm phụ huynh |
| 14 | MƯỜI BỐN. Tự động tìm người thay thế | ✅ ĐẠT | Loại trừ CP hủy và band blocked, retry mỗi 30 phút trong 6 giờ, ghi nhật ký bản ghi |
| 15 | MƯỜI LĂM. Khi phụ huynh là người hủy | ✅ ĐẠT | >24h free, <=24h CP +5 ELO, <3h CP +10 ELO và gắn cờ cảnh báo phụ huynh |
| 16 | MƯỜI SÁU. Chống trùng lịch và khoảng nghỉ giữa 2 đơn | ✅ ĐẠT | Soft lock 5m, DB select_for_update, all-or-nothing, khoảng nghỉ bắt buộc 90 phút |
| 17 | MƯỜI BẢY. Các trạng thái đơn hàng & mối ghép | ✅ ĐẠT | 13 trạng thái JobPost, 16 trạng thái Booking, lưu vết chuyển trạng thái |
| 18 | MƯỜI TÁM. Những gì người dùng nhìn thấy trên app/web | ⚠️ CẦN BỔ SUNG | 12 màn hình di động, 11 trang web, trang quản trị. Cần đồng bộ các trường form vừa chuẩn hóa lên giao diện |
| 19 | MƯỜI CHÍN. Những giới hạn có chủ ý của giai đoạn này | ✅ ĐẠT | Đúng phạm vi MVP: credit ảo, ưu tiên Android, cờ cảnh báo phụ huynh, trọng số chỉnh tay |
| 20 | HAI MƯƠI. Những con số cần nhớ & điểm kiểm chứng | ✅ ĐẠT | Bộ test 17 assertions G13 và kiểm thử E2E trực tiếp đã bao phủ |

---

## 2. BÁO CÁO ĐỐI SOÁT CHI TIẾT 20 MỤC

### Mục 1: MỘT. TƯ TƯỞNG NỀN TẢNG CỦA CẢ HỆ THỐNG
- **Yêu cầu đặc tả:** Hệ thống môi giới thông minh 2 chiều. Phụ huynh nói nhu cầu -> AI bóc tách -> Lọc cứng & chấm điểm 7 tiêu chí -> Top 8 ứng viên. Sinh viên khai báo lịch rảnh trước; phụ huynh chọn là đơn tạo ngay ở trạng thái chờ cam kết, sinh viên không có nút "Đồng ý", chỉ có quyền hủy trong thời hạn và bị trừ điểm. Giữ kỷ luật bằng điểm tín nhiệm ẩn nhưng luôn có đường chuộc lỗi.
- **Hiện trạng mã nguồn:**
  - `matching/services/matching_service.py`: Lọc cứng 7 lý do + chấm điểm 7 tiêu chí + lấy top 8.
  - `matching/services/booking_service.py`: `select_carepartner()` tạo booking ngay `awaiting_commitment`, không có endpoint "chấp nhận việc" của CarePartner.
  - `matching/services/elo_service.py`: Hệ thống ELO ẩn đầy đủ.
- **Đánh giá:** ✅ **ĐẠT**. Khớp 100% tư tưởng thiết kế.

---

### Mục 2: HAI. LUỒNG CỦA PHỤ HUYNH — ĐĂNG VIỆC
- **Yêu cầu đặc tả:**
  1. Chỉ hỗ trợ đúng 3 loại việc: `tutoring` (Gia sư), `childcare` (Trông trẻ), `pickup` (Đón trẻ). Bất kỳ loại nào khác phải từ chối lỗi 400.
  2. Form Gia sư: Ô môn học/kỹ năng tự do (chấp nhận cả MC, kỹ năng sống, đàn piano, vẽ, bơi lội). Ô yêu cầu cụ thể bắt buộc. Bộ chọn lịch nhiều ngày (cấm ngày quá khứ). Giờ kết thúc > giờ bắt đầu. Bộ chọn bản đồ 3 cách nhập (tìm kiếm, GPS hiện tại, kéo ghim) + ô ghi chú vị trí. Thù lao/giờ > 0.
  3. Form Trông trẻ: Bổ sung 4 trường đặc thù:
     - **Độ tuổi của trẻ:** Đúng 5 mức chọn sẵn: (1) 0–12 tháng tuổi, (2) 1–3 tuổi, (3) 3–6 tuổi, (4) 6–10 tuổi, (5) Trên 10 tuổi.
     - **Số lượng trẻ:** Số nguyên >= 1.
     - **Danh sách công việc chăm sóc:** Chọn nhiều, bắt buộc >= 1 mục. Danh sách gồm 7 mục: Chăm sóc chung, Cho ăn, Tắm rửa, Trông ngủ, Vui chơi và tổ chức hoạt động, Hỗ trợ làm bài tập về nhà, Các việc nhẹ liên quan đến trẻ. Gửi danh sách rỗng phải báo lỗi tiếng Việt.
     - **Lưu ý sức khỏe/dị ứng:** Ô viết tự do, tùy chọn.
  4. Form Đón trẻ:
     - Tên trường/nơi đón trẻ, độ tuổi và số lượng trẻ.
     - Giờ đón linh hoạt (giờ đón sớm nhất - giờ kết thúc dự kiến).
     - Vị trí đón ghim bản đồ + ghi chú điểm đón cụ thể (cổng chính, cổng phụ...).
     - Đưa trẻ đến đâu: 2 lựa chọn: (a) Nhà phụ huynh (mặc định), (b) Địa chỉ khác (bắt buộc ghim vị trí điểm đến trên bản đồ).
     - **Phương tiện đưa đón:** Ô tùy chọn với đúng 3 lựa chọn: (1) Đi bộ, (2) CarePartner tự có phương tiện, (3) Phụ huynh sắp xếp phương tiện.
- **Hiện trạng mã nguồn & Sai lệch phát hiện:**
  - ❌ **Sai lệch 1 (Độ tuổi trẻ):** Trong `matching/services/job_schema.py` (dòng 13–19) đang định nghĩa:
    ```python
    CHILD_AGE_GROUPS = {
        'under_3': 'Dưới 3 tuổi',
        'preschool': 'Mầm non (3-6 tuổi)',
        'primary': 'Tiểu học (6-11 tuổi)',
        'secondary': 'THCS (11-15 tuổi)',
        'mixed': 'Nhiều độ tuổi',
    }
    ```
    Giao diện web (`dang_viec_trong_tre.html`, `dang_viec_don_tre.html`) và mobile (`ChildcareForm.js`, `PickupForm.js`) đều đang dùng danh sách này. Điều này vi phạm đặc tả 5 mức: 0-12 tháng, 1-3 tuổi, 3-6 tuổi, 6-10 tuổi, Trên 10 tuổi.
  - ❌ **Sai lệch 2 (Việc chăm sóc):** Trong `job_schema.py` (dòng 21–28) đang định nghĩa 6 mục:
    ```python
    CARE_DUTIES = {
        'feed': 'Cho ăn / bữa ăn',
        'bath': 'Tắm rửa / vệ sinh',
        'study': 'Hướng dẫn bài tập',
        'play': 'Chơi cùng bé',
        'sleep': 'Đưa bé ngủ',
        'transport': 'Đưa đón',
    }
    ```
    Thiếu: "Chăm sóc chung" và "Các việc nhẹ liên quan đến trẻ". Thừa mục "transport" (đưa đón thuộc về form đón trẻ).
  - ❌ **Sai lệch 3 (Phương tiện đón trẻ):** Trên web template `dang_viec_don_tre.html` (dòng 93–94) và mobile `PickupForm.js` (dòng 42) đang để một ô `TextInput` tự do:
    `<input id="transportNote" placeholder="VD: Xe máy, xe bus số 8, đi bộ…">`
    thay vì 3 tùy chọn định sẵn ("Đi bộ", "CarePartner tự có phương tiện", "Phụ huynh sắp xếp phương tiện").
- **Đánh giá:** ⚠️ **CẦN SỬA ĐỔI**. Cần chuẩn hóa lại enum backend và đồng bộ HTML/React Native.

---

### Mục 3: BA. TRÍ TUỆ NHÂN TẠO ĐỌC HIỂU BÀI ĐĂNG
- **Yêu cầu đặc tả:**
  - Gemini bóc tách ngôn ngữ tự nhiên -> JSON cấu trúc.
  - Yêu cầu giới tính chỉ áp dụng cho Trông trẻ và Đón trẻ. Đối với Gia sư, bỏ qua yêu cầu giới tính VÀ gửi kèm thông báo lịch sự giải thích tính công bằng.
  - Tự động sinh nhãn kỹ năng đối chiếu hồ sơ sinh viên.
  - Đánh giá độ tin cậy: nếu độ tin cậy thấp (< 0.6), phải hỏi lại phụ huynh xác nhận ("ý bạn là... đúng không?"). Chỉ khi xác nhận mới chuyển sang `ai_parsed`.
  - Có cơ chế rule-based fallback khi Gemini lỗi hoặc mất mạng.
- **Hiện trạng mã nguồn & Sai lệch phát hiện:**
  - `matching/services/gemini_service.py` có rule-based fallback rất tốt (`rule_based_parse()`).
  - Khi post bài đăng `tutoring` có giới tính, `jobs.py` đã trả `fairness_notice`. Tuy nhiên trong `gemini_service.py` khi AI trích xuất được `gender_preference` từ văn bản miêu tả của job gia sư thì chỉ gán `parsed['gender_preference'] = None` mà không trả về câu thông báo cho phụ huynh.
  - Khi `field_confidence < 0.6`, hệ thống đã sinh `clarification_questions`, nhưng trong `JobPostPublishAPIView` (dòng 173–180), hệ thống vẫn tự động chuyển thẳng job sang `JobPostStatus.AI_PARSED` thay vì yêu cầu phụ huynh confirm qua endpoint.
- **Đánh giá:** ⚠️ **CẦN BỔ SUNG**. Thêm cơ chế confirm câu hỏi làm rõ và trả thông báo công bằng nhất quán.

---

### Mục 4: BỐN. BỘ MÁY TÌM VÀ CHẤM ĐIỂM ỨNG VIÊN
- **Yêu cầu đặc tả:**
  - **7 Lý do loại cứng:** (1) Tài khoản không active/approved, (2) Không rảnh tất cả các slot yêu cầu, (3) Trùng lịch đơn khác, (4) Ngoài bán kính nhận việc (mặc định 20km), (5) Thiếu kỹ năng bắt buộc, (6) Thuộc band Blocked, (7) Thuộc band Restricted khi pool >= 8.
  - **7 Tiêu chí chấm điểm mềm (Tổng 100%):**
    1. Khớp lịch rảnh: 25%
    2. Khớp kỹ năng/chuyên ngành: 20%
    3. Khoảng cách địa lý: 15% (giảm tuyến tính về 0 ở biên bán kính)
    4. Đánh giá sao: 15% (quy đổi thang 100). **Sinh viên mới chưa có đánh giá được mặc định mức trung tính là 60/100**.
    5. Tỷ lệ hoàn thành đơn: 10%. **Sinh viên mới chưa có đơn nào được mặc định coi là 100%**.
    6. Điểm tín nhiệm ẩn: 10% (chuẩn hóa thang 100).
    7. Tốc độ phản hồi: 5%.
  - Nhân với hệ số bậc ELO (Band multiplier).
  - Phân định thứ tự khi bằng điểm (Tie-breaking): (1) ELO cao hơn xếp trước, (2) Ở gần hơn xếp trước, (3) Tỷ lệ hoàn thành đơn cao hơn xếp trước.
  - Toàn bộ trọng số lưu trong DB (`MatchingWeight`), sửa có hiệu lực ngay.
  - Thời gian xử lý < 2 giây.
- **Hiện trạng mã nguồn & Sai lệch phát hiện:**
  - ❌ **Sai lệch 1 (Đánh giá sao cho người mới):** Trong `matching/services/matching_service.py` dòng 102–106:
    ```python
    def subscore_rating(rating_avg, review_count):
        base = (rating_avg or 0) / 5.0 * 100.0
        if review_count < 3:
            return base * 0.6 + 60.0 * 0.4  # blend
        return base
    ```
    Nếu sinh viên mới có `review_count == 0`, `rating_avg == 0` -> `base = 0`, hàm trả về `0 * 0.6 + 60.0 * 0.4 = 24.0`! Đây là một lỗi logic khiến sinh viên mới bị chấm 24 điểm thay vì mức trung tính 60 điểm như văn bản mô tả.
  - ❌ **Sai lệch 2 (Tỷ lệ hoàn thành đơn cho người mới):** Trong `matching/services/matching_service.py` dòng 109–113:
    ```python
    def subscore_completion(completed, cancelled, no_show):
        total = completed + cancelled + no_show
        if total == 0:
            return 70.0  # newcomers cao hơn trung tính nhẹ
        return completed / total * 100.0
    ```
    Code đang trả về `70.0`, trong khi văn bản đặc tả mục 4 nêu rõ: *"Sinh viên mới chưa có đơn nào được mặc định coi là đạt tỷ lệ một trăm phần trăm (100%), cũng với tinh thần không penalize người mới."*
- **Đánh giá:** ⚠️ **CẦN SỬA ĐỔI**. Sửa logic tính điểm cho người mới trong `matching_service.py` và cập nhật lại test case tương ứng.

---

### Mục 5: NĂM. DANH SÁCH ỨNG VIÊN HIỂN THỊ CHO PHỤ HUYNH
- **Yêu cầu đặc tả:**
  - Tối đa đúng 8 ứng viên tốt nhất. Báo tổng số người đạt yêu cầu (ví dụ: "Có 47 CarePartner phù hợp với công việc của bạn, dưới đây là 8 người phù hợp nhất").
  - Thẻ hiển thị: avatar, tên, trường & ngành, sao trung bình, số đơn hoàn thành, khoảng cách km, nhãn mức độ phù hợp tiếng Việt, kỹ năng nổi bật, nhận xét gần nhất, nhãn phản hồi nhanh/đúng giờ.
  - **4 Nhãn mức độ phù hợp tiếng Việt:**
    - Điểm >= 90: **Rất phù hợp**
    - Điểm 75 đến 89: **Phù hợp cao**
    - Điểm 60 đến 74: **Phù hợp**
    - Điểm < 60: **Có thể cân nhắc**
  - Trạng thái rỗng thân thiện khi không có ai.
  - Kéo xuống để refresh (gọi lại engine).
  - **BẢO MẬT TUYỆT ĐỐI:** Không bao giờ để lộ số điểm tín nhiệm ẩn (ELO) trong bất kỳ API nào ra client.
- **Hiện trạng mã nguồn & Sai lệch phát hiện:**
  - Không có rò rỉ ELO (đã có guard test `scan_elo_leak` và `test_no_hardcoded_paths`).
  - ❌ **Sai lệch ngưỡng nhãn:** Trong `matching/services/matching_service.py` dòng 127–135:
    ```python
    def match_level_of(score, pool_size):
        if score >= 85:
            return 'very_high'
        if score >= 70:
            return 'high'
        if score >= 55:
            return 'medium'
        return 'low' if pool_size < MAX_CANDIDATES_DEFAULT else 'medium'
    ```
    Code đang đặt ngưỡng là 85, 70, 55 thay vì 90, 75, 60. Đồng thời code đang cưỡng ép biến `low` thành `medium` khi `pool_size >= 8`, trong khi đặc tả yêu cầu nhãn phản ánh đúng khoảng điểm thực tế của ứng viên.
- **Đánh giá:** ⚠️ **CẦN SỬA ĐỔI**. Điều chỉnh ngưỡng `match_level_of` thành 90 / 75 / 60 và loại bỏ logic ghi đè `low` -> `medium`.

---

### Mục 6: SÁU. CHỌN ỨNG VIÊN VÀ CƠ CHẾ CHỐT ĐƠN TỰ ĐỘNG
- **Yêu cầu đặc tả:**
  - Bấm chọn -> Thao tác nguyên tử (atomic transaction):
    1. Kiểm tra lại slot còn trống đối với sinh viên không.
    2. Tạo đơn ở trạng thái chờ cam kết (`awaiting_commitment`).
    3. Khóa cứng toàn bộ slot (all-or-nothing).
    4. Đánh dấu các ứng viên khác thành không được chọn (`not_selected`).
    5. Đổi trạng thái bài đăng sang `carepartner_selected`.
    6. Gửi thông báo đẩy Class 1 kèm âm thanh lớn tới sinh viên.
    7. Ghi nhật ký chuyển trạng thái (`StateTransitionLog`).
  - Không có bước sinh viên bấm "Đồng ý". Đơn có hiệu lực ngay lập tức.
  - Hỗ trợ khóa chống trùng lặp (`Idempotency-Key`).
  - Nếu bị người khác chọn trước: báo lỗi tiếng Việt rõ ràng, làm mới danh sách.
- **Hiện trạng mã nguồn:**
  - `matching/services/booking_service.py` dòng 89–200 triển khai chuẩn xác từng bước trong `@transaction.atomic`. Sử dụng `select_for_update` trên profile và job, bắt `IntegrityError` chống race condition 50 luồng đồng thời.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 7: BẢY. SINH VIÊN KHAI BÁO LỊCH RẢNH VÀ RÀNG BUỘC
- **Yêu cầu đặc tả:**
  - Khai báo lịch tuần: các ngày, nhiều khung giờ trong ngày.
  - Chưa có đơn: tự do sửa/xóa.
  - Đang có đơn trong khung giờ: cấm xóa/thu hẹp, trả về lỗi tiếng Việt, chỉ được thoát qua nút hủy đơn chính thức.
  - Cho phép gửi yêu cầu đổi giờ (Reschedule) cho phụ huynh duyệt, được thưởng ELO nhỏ nếu phụ huynh đồng ý.
  - Khai báo ngày bận đột xuất (Blackout): kiểm tra nếu trùng đơn có sẵn thì chặn. Nghỉ tối đa 14 ngày liên tiếp thì tạm dừng nhận việc.
- **Hiện trạng mã nguồn:**
  - `matching/services/availability_service.py` và `matching/services/lock_service.py` kiểm tra chặt chẽ `BUSY_BOOKING_STATUSES`.
  - Giao diện web `lich_ranh.html`, `ngay_ban.html` và mobile `AvailabilityScreen.js`, `BlackoutScreen.js` đều đã nối API.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 8: TÁM. THÔNG BÁO VÀ YÊU CẦU VỀ ÂM THANH
- **Yêu cầu đặc tả:**
  - 4 Cấp độ thông báo. Cấp 1 (Khẩn cấp/Quan trọng) phải phát âm thanh lớn cả khi tắt chuông/màn hình khóa.
  - Android: Phải có channel riêng với độ ưu tiên cao nhất (`MAX`), gắn tệp âm thanh vào thư mục tài nguyên cài đặt (`res/raw/`), component lắng nghe phải mount ngay khi khởi động app.
  - Web: Thông báo trình duyệt + thẻ `<audio>` phát tiếng + banner trong trang dự phòng.
  - Phía máy chủ gửi đúng `channelId: 'educarelink_critical'` cho push class 'critical'.
- **Hiện trạng mã nguồn:**
  - `mobile/app.json`: Đã cấu hình plugins `./plugins/withEmergencyAlarmSound` và `./plugins/withCriticalNotificationSound`.
  - `mobile/App.js`: Đã đăng ký channel `educarelink_critical` với file `critical_alert.wav` và gắn `<NotificationListener />` tại root.
  - `matching/services/notification_service.py`: Đã gắn `channel_id: 'educarelink_critical'` cho class critical.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 9: CHÍN. KHOẢNG THỜI GIAN CHO PHÉP ĐỂ HỦY
- **Yêu cầu đặc tả:**
  - Thời gian co giãn theo độ gấp của việc:
    + Bắt đầu > 24h: 60 phút
    + Bắt đầu 6h–24h: 30 phút
    + Bắt đầu 1h–6h: 15 phút
    + Bắt đầu < 1h: 5 phút
  - Chặn trên: phải kết thúc trước giờ bắt đầu ít nhất 5 phút. Nếu vi phạm -> window = 0, chuyển thẳng `committed`.
  - Tự động chuyển `committed`: 2 cơ chế song song (tiến trình nền quét mỗi phút + lazy check khi đọc đơn).
  - Dùng chuẩn múi giờ `Asia/Ho_Chi_Minh` (UTC+7).
- **Hiện trạng mã nguồn:**
  - `compute_commit_deadline()` trong `booking_service.py` đọc từ `MatchingConfig` với các key `COMMIT_WINDOW_24H`, `COMMIT_WINDOW_6H`, `COMMIT_WINDOW_1H`, `COMMIT_WINDOW_URGENT`, `COMMIT_MIN_MARGIN_MIN`.
  - Lazy check được cài trong `BookingDetailAPIView` và service state.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 10: MƯỜI. ĐIỂM TÍN NHIỆM ẨN
- **Yêu cầu đặc tả:**
  - Điểm khởi đầu 1200, dải 400–2000. 6 bậc: Bạch kim (>1600), Vàng (1400–1599), Bạc (1200–1399), Đồng (1000–1199), Cảnh báo (700–999), Hạn chế (<700). Cấu hình trong DB `EloBand`.
  - Sổ cái `EloLedger` ghi vết mọi thay đổi với ràng buộc chống trùng lặp.
  - Điểm cộng: Hoàn thành đúng giờ (+12), đánh giá 5 sao (+10), 4 sao (+6), 3 sao (+1), nhận xét tích cực (+4), chuỗi 3 đơn (+8), 5 đơn (+15), 10 đơn (+30), 30 ngày sạch bóng hủy (+10), điền đủ hồ sơ (+5, 1 lần), phản hồi nhanh (+2, max 1/ngày), đổi giờ thành công (+1), phụ huynh hủy sát giờ (+5 hoặc +10).
  - Điểm trừ: Hủy đơn T0–T6, phản hồi chậm 3 lần/7 ngày (-6), bị báo cáo xác minh (-25), kháng cáo lạm dụng 3 lần/30 ngày (-10), đánh giá 1-2 sao (-8).
  - Cơ chế nhạt dần (Decay) cho khoản phạt: 0–30 ngày (100%), 31–90 ngày (60%), 91–180 ngày (25%), >180 ngày (0%). Điểm thưởng giữ nguyên giá trị.
  - Thời gian thử thách (Probation): Sau bùng kèo (T5) hoặc vi phạm nặng (T6), 7 ngày thử thách mọi điểm thưởng chỉ tính 50% ở bước quy đổi effective.
- **Hiện trạng mã nguồn:**
  - `matching/services/elo_service.py` xử lý hoàn hảo công thức decay, probation cooldown 7 ngày, tính toán và lưu đệm trên `CarePartnerProfile`.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 11: MƯỜI MỘT. LÝ DO BẤT KHẢ KHÁNG VÀ QUYỀN KHÁNG CÁO
- **Yêu cầu đặc tả:**
  - 8 mã lý do: 5 mã bất khả kháng (trùng lịch học đột xuất, sức khỏe, gia đình khẩn cấp, tai nạn/sự cố di chuyển, thông tin việc sai lệch) -> giảm 50% điểm phạt ELO. 3 mã thông thường -> phạt 100%.
  - Lớp bảo vệ 1: Bất khả kháng bắt buộc viết giải thích >= 20 ký tự.
  - Lớp bảo vệ 2: Tối đa 2 lần giảm nhẹ trong 30 ngày. Lần thứ 3 áp dụng phạt 100%.
  - Bộ đếm bất khả kháng phải đọc từ `Booking.cancel_reason`, không được đọc từ `EloLedger`.
  - Kháng cáo trong vòng 7 ngày, tối đa 3 file minh chứng <= 5MB. Ban quản trị duyệt thủ công. Duyệt -> cộng bù điểm. Bác 3 lần/30 ngày -> phạt thêm 10 điểm.
- **Hiện trạng mã nguồn:**
  - `matching/services/cancellation_service.py` và `matching/services/elo_service.py` đã đọc trực tiếp từ `Booking.cancel_reason`.
  - `Appeal` model và API đã kiểm tra hạn 7 ngày, dung lượng file.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 12: MƯỜI HAI. CÁC BẬC PHẠT KHI HỦY ĐƠN VÀ VIỆC ĐỀN BÙ CHO PHỤ HUYNH
- **Yêu cầu đặc tả:**
  - 7 bậc phạt T0 đến T6:
    + T0: Trong cửa sổ cho phép, -5 ELO, 0% đền bù.
    + T1: Hủy trước > 24h, -15 ELO, 0% đền bù.
    + T2: Hủy 6h–24h, -30 ELO, 10% giá trị đơn.
    + T3: Hủy 1h–6h (hoặc 3h-6h), -50 ELO, 20% giá trị đơn.
    + T4: Hủy < 1h (hoặc < 3h), -80 ELO, 30% giá trị đơn.
    + T5: Bùng việc (no-show), -150 ELO, 7 ngày thử thách, 50% giá trị đơn (sàn tối thiểu 50.000 VNĐ).
    + T6: Vi phạm nghiêm trọng, -250 ELO, 100% giá trị đơn.
  - Đền bù bằng credit ảo trong ví, không rút ra tiền mặt, không được âm số dư.
  - Trừ điểm sinh viên và cộng credit phụ huynh diễn ra trong cùng 1 transaction. Giá trị đơn đóng băng từ lúc chọn người.
- **Hiện trạng mã nguồn:**
  - `matching/services/cancellation_service.py` kết hợp `matching/services/credits_service.py` thực thi trong atomic transaction.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 13: MƯỜI BA. TỰ ĐỘNG PHÁT HIỆN VIỆC KHÔNG ĐẾN LÀM
- **Yêu cầu đặc tả:**
  - Tiến trình nền chạy mỗi phút quét đơn `committed` quá 15 phút sau giờ hẹn mà chưa bấm bắt đầu -> tự động kết luận `no_show`.
  - Áp dụng T5 (-150 ELO, 7 ngày thử thách, đền bù credit sàn 50k, kích hoạt tìm người thay thế).
  - Phụ huynh có nút bấm "Báo không đến làm" trên màn hình chi tiết đơn.
- **Hiện trạng mã nguồn:**
  - `matching/services/scheduler.py` có hàm `scan_no_show_bookings()`.
  - API `POST /api/matching/bookings/{id}/report-no-show/` cho phụ huynh báo chủ động.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 14: MƯỜI BỐN. TỰ ĐỘNG TÌM NGƯỜI THAY THẾ
- **Yêu cầu đặc tả:**
  - Khi đơn hủy hoặc no-show: tự động kích hoạt matching lại.
  - Loại trừ sinh viên vừa hủy và những người thuộc band Blocked.
  - Thông báo cho phụ huynh số ứng viên mới tìm được.
  - Nếu chưa có ai: chuyển job sang `needs_replacement`, retry mỗi 30 phút trong vòng 6 giờ. Quá 6 giờ cảnh báo admin can thiệp.
  - Ghi bản ghi `ReplacementAttempt` mỗi lần chạy.
- **Hiện trạng mã nguồn:**
  - `matching/services/replacement_service.py` xử lý logic tìm người thay và retry loop.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 15: MƯỜI LĂM. KHI PHỤ HUYNH LÀ NGƯỜI HỦY
- **Yêu cầu đặc tả:**
  - Phụ huynh hủy > 24h: Bình thường, không phạt.
  - Phụ huynh hủy <= 24h: Sinh viên được cộng bù +5 ELO.
  - Phụ huynh hủy < 3h: Sinh viên được cộng bù +10 ELO và tài khoản phụ huynh bị gắn 1 cờ cảnh báo (`ParentTrustFlag`).
  - Sinh viên nhận thông báo khẩn cấp giải thích rõ đơn bị hủy từ phía phụ huynh và sinh viên không bị ảnh hưởng tín nhiệm.
- **Hiện trạng mã nguồn:**
  - `matching/services/cancellation_service.py` dòng 180–230 đã triển khai đúng các mốc thời gian và ghi `ParentTrustFlag`.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 16: MƯỜI SÁU. CHỐNG TRÙNG LỊCH VÀ KHOẢNG NGHỈ GIỮA HAI ĐƠN
- **Yêu cầu đặc tả:**
  - Cơ chế 2 tầng: Soft lock 5 phút khi xem chi tiết + Hard lock nguyên tử khi phụ huynh bấm chọn.
  - Kiểm tra đa luồng (Concurrency): 50 luồng đồng thời chỉ đúng 1 thành công.
  - Khóa slot all-or-nothing đối với việc nhiều buổi.
  - Giải phóng khóa khi đơn kết thúc hoặc hủy.
  - **Khoảng nghỉ giữa 2 đơn (Rest buffer):** Ít nhất 90 phút giữa 2 công việc liên tiếp trong ngày của cùng 1 sinh viên. Kiểm tra ngay lúc chọn người. Giá trị 90 phút lưu cấu hình DB (`MatchingConfig.BUFFER_MINUTES`).
- **Hiện trạng mã nguồn:**
  - `matching/services/lock_service.py` và `booking_service.py` kiểm tra `validate_buffer()` nghiêm ngặt.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 17: MƯỜI BẢY. CÁC TRẠNG THÁI CỦA ĐƠN HÀNG VÀ CỦA MỐI GHÉP
- **Yêu cầu đặc tả:**
  - 13 trạng thái JobPost + 16 trạng thái Booking.
  - Bảng chuyển trạng thái data-driven trong `constants.py`, cấm chuyển bừa bãi.
  - Mọi bước chuyển ghi nhận `StateTransitionLog`.
- **Hiện trạng mã nguồn:**
  - Khớp 100% với `JOBPOST_TRANSITIONS` và `BOOKING_TRANSITIONS` trong `matching/constants.py`.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 18: MƯỜI TÁM. NHỮNG GÌ NGƯỜI DÙNG NHÌN THẤY TRÊN ỨNG DỤNG VÀ TRÊN WEB
- **Yêu cầu đặc tả:**
  - Mobile: Màn hình chọn loại việc (3 nút), 3 màn hình form, danh sách ứng viên (tối đa 8 thẻ), hồ sơ ứng viên, chi tiết đơn (countdown, hủy 8 lý do, báo no-show), ví credit. Phía sinh viên: lịch rảnh tuần, ngày bận, danh sách đơn, chi tiết đơn, kháng cáo.
  - Tất cả màn hình phải đăng ký trong Navigator và có nút thật dẫn tới (trên Parent Home có 4 nút, trên Worker Profile có 4 nút).
  - Web: 11 trang template tiếng Việt không dấu.
  - Admin: Trang quản trị chỉnh ngưỡng ELO, trọng số, duyệt kháng cáo, xem log.
- **Hiện trạng mã nguồn & Sai lệch phát hiện:**
  - Cần cập nhật lại các trường form (độ tuổi trẻ, việc chăm sóc, phương tiện đón trẻ) trên cả web templates và mobile screens để đồng bộ với backend sau khi sửa.
- **Đánh giá:** ⚠️ **CẦN ĐỒNG BỘ GIAO DIỆN**.

---

### Mục 19: MƯỜI CHÍN. NHỮNG GIỚI HẠN CÓ CHỦ Ý CỦA GIAI ĐOẠN NÀY
- **Yêu cầu đặc tả:**
  - Ghi nhận rõ các giới hạn MVP: Đền bù bằng credit ảo, ưu tiên Android trước iOS, phụ huynh chỉ theo dõi bằng cờ cảnh báo (chưa có điểm ELO phụ huynh), xác nhận có mặt bằng bấm nút (chưa tích hợp GPS geofence tự động start), trọng số matching chỉnh tay qua admin.
- **Hiện trạng mã nguồn:**
  - Toàn bộ thiết kế hiện tại tuân thủ hoàn hảo các giới hạn này, không làm thừa thãi gây quá tải.
- **Đánh giá:** ✅ **ĐẠT**.

---

### Mục 20: HAI MƯƠI. NHỮNG CON SỐ CẦN NHỚ VÀ NHỮNG ĐIỂM AGENT PHẢI KIỂM CHỨNG
- **Yêu cầu đặc tả:**
  - Ba số then chốt: 8 (tối đa ứng viên), 90 (phút nghỉ giữa ca), 1200 (điểm ELO khởi đầu).
  - Danh sách kiểm chứng bắt buộc: Chặn job_type != 3 loại, gia sư nhận môn tự do, chặn ngày quá khứ, giờ kết thúc > bắt đầu, top 8 không vượt quá, nhãn tiếng Việt đúng 4 chuỗi, auto-commit không cần CP bấm, 50 thread race chỉ 1 thành công, commitment window tính chuẩn, lazy commit khi tắt background task, buffer 90 phút, hủy theo bậc, phát hiện no-show sau 15 phút, giải thích bất khả kháng >= 20 ký tự, lần 3 trong 30 ngày không giảm, decay penalty 30/90/180 ngày, probation giảm 50% reward, không lộ hidden_elo qua API, tệp âm thanh có mặt trong build, navigation không có màn hình mồ côi, chỉnh config DB có tác dụng ngay.
- **Hiện trạng mã nguồn:**
  - Script `scripts/g13_business_rules.py` (17 assertion) và `scripts/e2e_matching_live_demo.py` đã kiểm tra phần lớn các mục này.
- **Đánh giá:** ✅ **ĐẠT**.

---

## 3. DANH SÁCH CÁC ĐIỂM SAI LỆCH CẦN SỬA CHỮA (GAPS)

Dưới đây là 5 vị trí mã nguồn trọng yếu cần điều chỉnh ngay:

### 1. `matching/services/job_schema.py`
- **Độ tuổi trẻ (`CHILD_AGE_GROUPS`):**
  - Đổi từ 5 nhóm cũ sang **5 mức chuẩn theo văn bản đặc tả**:
    ```python
    CHILD_AGE_GROUPS = {
        '0_to_12_months': '0 - 12 tháng tuổi',
        '1_to_3_years': '1 - 3 tuổi',
        '3_to_6_years': '3 - 6 tuổi',
        '6_to_10_years': '6 - 10 tuổi',
        'over_10_years': 'Trên 10 tuổi',
    }
    ```
- **Việc chăm sóc trẻ (`CARE_DUTIES`):**
  - Đổi từ 6 mục cũ sang **7 mục chuẩn theo văn bản đặc tả**:
    ```python
    CARE_DUTIES = {
        'general_care': 'Chăm sóc chung',
        'feeding': 'Cho ăn',
        'bathing': 'Tắm rửa',
        'sleep_monitoring': 'Trông ngủ',
        'play_activities': 'Vui chơi và tổ chức hoạt động',
        'homework_help': 'Hỗ trợ làm bài tập về nhà',
        'light_chores': 'Các việc nhẹ liên quan đến trẻ',
    }
    ```
- **Phương tiện đón trẻ (Pickup `transport_method`):**
  - Thêm validate cho 3 lựa chọn chọn sẵn:
    ```python
    TRANSPORT_METHODS = {
        'walking': 'Đi bộ',
        'carepartner_vehicle': 'CarePartner tự có phương tiện',
        'parent_arranged': 'Phụ huynh sắp xếp phương tiện',
    }
    ```

### 2. `matching/services/matching_service.py`
- **Điểm đánh giá sao cho sinh viên mới:**
  - Sửa `subscore_rating`: Nếu `review_count == 0` thì trả về đúng mức **60.0** (trung tính).
- **Tỷ lệ hoàn thành đơn cho sinh viên mới:**
  - Sửa `subscore_completion`: Nếu `total == 0` thì trả về đúng **100.0%** (thay vì 70.0%).
- **Ngưỡng điểm xếp loại `match_level_of`:**
  - Điều chỉnh ngưỡng chuẩn:
    ```python
    def match_level_of(score, pool_size):
        if score >= 90:
            return 'very_high'
        if score >= 75:
            return 'high'
        if score >= 60:
            return 'medium'
        return 'low'
    ```
  - Xóa bỏ logic tự động ép `low` thành `medium` khi `total_matched >= 8` (dòng 264–268). Nhãn phải phản ánh trung thực điểm số của ứng viên.

### 3. Frontend Web Templates (`dang_viec_trong_tre.html`, `dang_viec_don_tre.html`)
- Cập nhật `<select id="ageGroup">` với 5 mức tuổi mới.
- Cập nhật các checkbox việc chăm sóc với 7 mục mới.
- Cập nhật mục phương tiện đón trẻ thành 3 radio/select thay vì text input tự do.

### 4. Mobile Frontend (`ChildcareForm.js`, `PickupForm.js`)
- Cập nhật hằng số `AGE_GROUPS` và `DUTIES` tương ứng.
- Cập nhật radio button phương tiện đón trẻ thành 3 tùy chọn định sẵn.

### 5. Test Suite & Verification Scripts
- Cập nhật `matching/tests/test_matching.py` để khớp với `subscore_completion(0, 0, 0) == 100.0`, `subscore_rating(0, 0) == 60.0`, và các mốc điểm 90 / 75 / 60.
- Chạy lại toàn bộ `python manage.py test matching.tests` và `python scripts/g13_business_rules.py`.

---

## 4. PROMPT HOÀN CHỈNH CHO CLAUDE ĐỂ VIẾT CHO CODING AGENT

> **Hướng dẫn sử dụng:** Sao chép toàn bộ khối markdown bên dưới gửi cho Claude (hoặc gửi trực tiếp cho coding agent) để thực hiện sửa đổi chính xác và an toàn mà không làm gãy bất kỳ tính năng hiện có nào.

```markdown
# TASK SPECIFICATION FOR CODING AGENT: SỬA ĐỔI VÀ ĐỒNG BỘ HỆ THỐNG GHÉP NỐI PHỤ HUYNH ↔ CAREPARTNER (FLOW 1)

Xin chào Coding Agent! Bạn được giao nhiệm vụ tinh chỉnh và căn chỉnh chính xác hệ thống ghép nối Phụ huynh ↔ CarePartner của dự án EduCareLink theo bản mô tả nghiệp vụ chuẩn gồm 20 mục.

## 1. MỤC TIÊU CỐT LÕI
Khắc phục triệt để 5 điểm sai lệch giữa mã nguồn hiện tại và tài liệu đặc tả nghiệp vụ:
1. Chuẩn hóa 5 nhóm tuổi trẻ và 7 việc chăm sóc trong form Trông trẻ & Đón trẻ.
2. Chuẩn hóa 3 tùy chọn phương tiện đưa đón trong form Đón trẻ.
3. Căn chỉnh công thức tính điểm cho CarePartner mới (sao trung tính = 60/100, tỷ lệ hoàn thành = 100%).
4. Căn chỉnh 4 ngưỡng điểm nhãn mức độ phù hợp: >=90 (Rất phù hợp), 75–89 (Phù hợp cao), 60–74 (Phù hợp), <60 (Có thể cân nhắc); không tự ý ép nhãn 'low' thành 'medium'.
5. Đồng bộ hóa toàn bộ thay đổi lên Web Templates, Mobile Screens (React Native), và cập nhật bộ Test suite (`test_matching.py`).

---

## 2. CHI TIẾT CÁC THAY ĐỔI CẦN THỰC HIỆN

### Bước 1: Cập nhật `matching/services/job_schema.py`
Mở file `matching/services/job_schema.py`:
1. Thay thế `CHILD_AGE_GROUPS` bằng 5 mức chuẩn:
```python
CHILD_AGE_GROUPS = {
    '0_to_12_months': '0 - 12 tháng tuổi',
    '1_to_3_years': '1 - 3 tuổi',
    '3_to_6_years': '3 - 6 tuổi',
    '6_to_10_years': '6 - 10 tuổi',
    'over_10_years': 'Trên 10 tuổi',
}
```
2. Thay thế `CARE_DUTIES` bằng 7 việc chuẩn:
```python
CARE_DUTIES = {
    'general_care': 'Chăm sóc chung',
    'feeding': 'Cho ăn',
    'bathing': 'Tắm rửa',
    'sleep_monitoring': 'Trông ngủ',
    'play_activities': 'Vui chơi và tổ chức hoạt động',
    'homework_help': 'Hỗ trợ làm bài tập về nhà',
    'light_chores': 'Các việc nhẹ liên quan đến trẻ',
}
```
3. Thêm tùy chọn phương tiện đưa đón chuẩn:
```python
TRANSPORT_METHODS = {
    'walking': 'Đi bộ',
    'carepartner_vehicle': 'CarePartner tự có phương tiện',
    'parent_arranged': 'Phụ huynh sắp xếp phương tiện',
}
```
4. Trong hàm `validate_job_payload()`:
- Đảm bảo kiểm tra `child_age_group` thuộc `CHILD_AGE_GROUPS`.
- Đảm bảo kiểm tra mọi phần tử trong `care_duties` thuộc `CARE_DUTIES` và danh sách không rỗng.
- Kiểm tra `transport_method` nếu có truyền lên thì thuộc `TRANSPORT_METHODS` (chấp nhận optional).

---

### Bước 2: Cập nhật `matching/services/matching_service.py`
Mở file `matching/services/matching_service.py`:
1. Sửa hàm `subscore_rating(rating_avg, review_count)`:
```python
def subscore_rating(rating_avg, review_count):
    # Người mới chưa có bất kỳ đánh giá nào: mặc định trung tính 60/100 theo đặc tả
    if not review_count or review_count == 0:
        return 60.0
    base = (rating_avg or 0) / 5.0 * 100.0
    if review_count < 3:
        return base * 0.6 + 60.0 * 0.4  # blend nhẹ cho 1-2 review đầu
    return base
```
2. Sửa hàm `subscore_completion(completed, cancelled, no_show)`:
```python
def subscore_completion(completed, cancelled, no_show):
    total = completed + cancelled + no_show
    # Người mới chưa có đơn nào: mặc định 100% hoàn thành theo đặc tả
    if total == 0:
        return 100.0
    return completed / total * 100.0
```
3. Sửa hàm `match_level_of(score, pool_size)`:
```python
def match_level_of(score, pool_size=0):
    if score >= 90:
        return 'very_high'
    if score >= 75:
        return 'high'
    if score >= 60:
        return 'medium'
    return 'low'
```
4. Trong hàm `find_candidates()`:
- Xóa bỏ đoạn mã ghi đè `cand['match_level'] = 'medium'` khi `total_matched >= MAX_CANDIDATES_DEFAULT` (dòng 264–268 cũ). Nhãn mức độ phù hợp phải giữ nguyên theo điểm số.

---

### Bước 3: Cập nhật Web Templates
1. Trong `frontend/templates/frontend/dang_viec_trong_tre.html`:
- Cập nhật `<select id="ageGroup">`:
  + `<option value="0_to_12_months">0 - 12 tháng tuổi</option>`
  + `<option value="1_to_3_years">1 - 3 tuổi</option>`
  + `<option value="3_to_6_years">3 - 6 tuổi</option>`
  + `<option value="6_to_10_years">6 - 10 tuổi</option>`
  + `<option value="over_10_years">Trên 10 tuổi</option>`
- Cập nhật các checkbox `care_duties` với 7 giá trị: `general_care`, `feeding`, `bathing`, `sleep_monitoring`, `play_activities`, `homework_help`, `light_chores`.

2. Trong `frontend/templates/frontend/dang_viec_don_tre.html`:
- Cập nhật `<select id="ageGroup">` với 5 mức tuổi như trên.
- Cập nhật mục `transportNote` thành 3 radio buttons hoặc `<select id="transportMethod">`:
  + `walking`: Đi bộ
  + `carepartner_vehicle`: CarePartner tự có phương tiện
  + `parent_arranged`: Phụ huynh sắp xếp phương tiện

---

### Bước 4: Cập nhật Mobile Screens (React Native)
1. Trong `mobile/src/screens/Parent/ChildcareForm.js`:
- Cập nhật mảng `AGE_GROUPS` với 5 code và label mới.
- Cập nhật mảng `DUTIES` với 7 code và label mới.
2. Trong `mobile/src/screens/Parent/PickupForm.js`:
- Cập nhật mảng `AGE_GROUPS` đủ 5 nhóm tuổi.
- Cung cấp component chọn 3 tùy chọn phương tiện thay vì nhập text tự do.

---

### Bước 5: Cập nhật Test Suite & Chạy Xác Minh
1. Mở `matching/tests/test_matching.py`:
- Cập nhật test `test_completion_newcomer_70` -> đổi tên thành `test_completion_newcomer_100` và `self.assertEqual(subscore_completion(0, 0, 0), 100.0)`.
- Cập nhật test `test_rating_newcomer_blend` kiểm tra `subscore_rating(0.0, 0) == 60.0`.
- Cập nhật các test case kiểm tra ngưỡng `match_level_of` theo 90 / 75 / 60.
2. Chạy toàn bộ test suites:
```powershell
python manage.py test matching.tests
python scripts/g13_business_rules.py
python scripts/e2e_matching_live_demo.py
```
Tất cả 155 test và 17 assertion G13 phải báo **PASS 100%**.
```
