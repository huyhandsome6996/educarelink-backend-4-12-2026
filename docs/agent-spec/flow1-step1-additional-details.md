# Additional Details for Flow 1 Step 1

This file contains helper texts, placeholders, and Vietnamese labels for the forms.

## Common
- UI language: Vietnamese
- Date picker: calendar UI, no manual typing
- Time picker: time UI, no manual typing
- Map picker: search address, current location button, manual pin
- Hourly rate: VND/hour, must be > 0

## A. Tutoring / Gia Su
1. `subject`
   - Label: "Môn học / Kỹ năng"
   - Helper: "Có thể nhập môn học hoặc kỹ năng. Ví dụ: Toán, Tiếng Việt, Tiếng Anh, MC, kỹ năng sống, đàn, vẽ."
   - Note: Not limited to school subjects.
2. `specific_requirements`
   - Label: "Yêu cầu cụ thể"
3. `dates`
   - Label: "Chọn ngày"
4. `time_from`
   - Label: "Bắt đầu từ"
5. `time_to`
   - Label: "Kết thúc lúc"
6. `location`
   - Label: "Chọn vị trí trên bản đồ"
7. `location_note`
   - Label: "Thông tin vị trí cụ thể"
   - Placeholder: "Chung cư X, sảnh B, nhà số..."
8. `hourly_rate`
   - Label: "Thù lao mỗi giờ (VNĐ)"

## B. Childcare / Trông Trẻ
1. `child_age_group`
   - Label: "Độ tuổi của trẻ"
   - Options: "0-12 tháng", "1-3 tuổi", "3-6 tuổi", "6-10 tuổi", "Trên 10 tuổi"
2. `number_of_children`
   - Label: "Số lượng trẻ"
3. `care_duties`
   - Label: "Công việc chăm sóc"
   - Options: "Chăm sóc chung", "Cho ăn", "Tắm rửa", "Trông ngủ", "Vui chơi", "Hỗ trợ bài tập", "Việc nhẹ liên quan trẻ"
4. `medical_allergy_notes`
   - Label: "Lưu ý sức khỏe / dị ứng"
   - Placeholder: "Dị ứng, bệnh lý, thuốc, lưu ý đặc biệt..."
5. `specific_requirements`
   - Label: "Yêu cầu cụ thể"
6. Other fields same as Tutoring.

## C. Pickup / Đón Trẻ
1. `school_or_pickup_place_name`
   - Label: "Trường / Nơi đón trẻ"
   - Placeholder: "Trường Tiểu học A, Lớp học thêm B..."
2. `child_age_group`, `number_of_children`: same as Childcare.
3. `pickup_dates`
   - Label: "Chọn ngày đón"
4. `pickup_time_from`
   - Label: "Có thể đón từ"
5. `pickup_time_to`
   - Label: "Kết thúc dự kiến"
6. `pickup_location`
   - Label: "Vị trí đón trẻ trên bản đồ"
7. `pickup_location_note`
   - Label: "Thông tin vị trí đón cụ thể"
   - Placeholder: "Cổng chính, lớp học, giờ trả trẻ..."
8. `destination_type`
   - Label: "Đưa trẻ đến"
   - Options: "Nhà phụ huynh", "Địa chỉ khác"
9. `destination_location`
   - Label: "Vị trí điểm đến trên bản đồ"
   - Required if destination_type is "Địa chỉ khác"
10. `destination_note`
    - Label: "Thông tin điểm đến cụ thể"
11. `transport_note`
    - Label: "Phương tiện / cách đưa đón"
    - Options: "Đi bộ", "CarePartner tự có phương tiện", "Phụ huynh sắp xếp"
12. `specific_requirements`
    - Label: "Yêu cầu cụ thể"
13. `hourly_rate`
    - Label: "Thù lao mỗi giờ (VNĐ)"

## Notes for Agent
- Use these labels and helpers for UI implementation.
- Ensure all pickers are mobile-friendly.
- Validate end time > start time.
- Prevent past dates.
