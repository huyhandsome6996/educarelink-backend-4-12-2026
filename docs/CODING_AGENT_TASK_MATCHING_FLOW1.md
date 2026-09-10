# NHIỆM VỤ DÀNH RIÊNG CHO CODING AGENT: CĂN CHỈNH HỆ THỐNG GHÉP NỐI PHỤ HUYNH ↔ CAREPARTNER (FLOW 1)

> **Dành cho:** Coding Agent (Cursor / Claude Code / Windsurf / Copilot / Aider...)  
> **Dự án:** EduCareLink Backend (Django 5.2 + DRF) & Frontend (Web Django Templates + Mobile React Native Expo)  
> **Mục tiêu:** Căn chỉnh mã nguồn để khớp 100% với bản đặc tả 20 mục văn bản của hệ thống ghép nối thông minh Flow 1, đồng thời giữ cho toàn bộ 155 unit test và 17 assertion G13 tiếp tục PASS 100%.  
> **Quy tắc bất di bất dịch:**  
> 1. KHÔNG hardcode các hằng số biến thiên (trọng số, ngưỡng ELO, mức phạt phải lấy từ Database/Config).  
> 2. Đảm bảo backward-compatibility (sử dụng alias mapping cho các hằng số schema để các test cũ không bị gãy).  
> 3. Toàn bộ thông báo lỗi trả về cho người dùng phải dùng **Tiếng Việt**.  
> 4. Sau khi sửa, chạy test và đảm bảo không có bất kỳ regression nào.

---

## 1. DANH SÁCH CÁC FILE CẦN SỬA ĐỔI

| STT | File | Nhiệm vụ chính |
|:---:|:---|:---|
| 1 | `matching/services/job_schema.py` | Chuẩn hóa 5 nhóm tuổi trẻ, 7 công việc chăm sóc trẻ, 3 phương thức đưa đón |
| 2 | `matching/services/matching_service.py` | Sửa điểm mặc định người mới (Rating = 60, Hoàn thành = 100%), sửa ngưỡng nhãn match level (90/75/60), bỏ ghi đè nhãn `low` |
| 3 | `frontend/templates/frontend/dang_viec_trong_tre.html` | Cập nhật form web: 5 nhóm tuổi chuẩn, 7 việc chăm sóc chuẩn |
| 4 | `frontend/templates/frontend/dang_viec_don_tre.html` | Cập nhật form web: 5 nhóm tuổi chuẩn, 3 lựa chọn phương tiện đưa đón |
| 5 | `mobile/src/screens/Parent/ChildcareForm.js` | Cập nhật form mobile: 5 nhóm tuổi, 7 việc chăm sóc |
| 6 | `mobile/src/screens/Parent/PickupForm.js` | Cập nhật form mobile: 5 nhóm tuổi, 3 lựa chọn phương tiện đưa đón |
| 7 | `matching/tests/test_matching.py` | Cập nhật test case: điểm rating người mới = 60, tỷ lệ hoàn thành = 100%, ngưỡng match level |

---

## 2. HƯỚNG DẪN CHI TIẾT TỪNG BƯỚC (STEP-BY-STEP)

### BƯỚC 1: CẬP NHẬT `matching/services/job_schema.py`

#### Mục tiêu:
Khớp đặc tả Mục 2 (HAI. Luồng của phụ huynh — Đăng việc):
1. Nhóm tuổi của trẻ phải gồm đúng 5 mức chọn sẵn:
   - `0_to_12_months`: "0 - 12 tháng tuổi"
   - `1_to_3_years`: "1 - 3 tuổi"
   - `3_to_6_years`: "3 - 6 tuổi"
   - `6_to_10_years`: "6 - 10 tuổi"
   - `over_10_years`: "Trên 10 tuổi"
   *(Vẫn giữ các key cũ như `under_3`, `preschool`, `primary`, `secondary`, `mixed` làm alias để bảo toàn test cũ).*
2. Danh sách công việc chăm sóc (`CARE_DUTIES`) gồm đúng 7 mục:
   - `general_care`: "Chăm sóc chung"
   - `feeding`: "Cho ăn"
   - `bathing`: "Tắm rửa"
   - `sleep_monitoring`: "Trông ngủ"
   - `play_activities`: "Vui chơi và tổ chức hoạt động"
   - `homework_help`: "Hỗ trợ làm bài tập về nhà"
   - `light_chores`: "Các việc nhẹ liên quan đến trẻ"
   *(Vẫn giữ các key cũ `feed`, `bath`, `study`, `play`, `sleep`, `transport` làm alias).*
3. Bổ sung từ điển phương tiện đưa đón (`TRANSPORT_METHODS`):
   - `walking`: "Đi bộ"
   - `carepartner_vehicle`: "CarePartner tự có phương tiện"
   - `parent_arranged`: "Phụ huynh sắp xếp phương tiện"

#### Đoạn code cần thay thế:
Mở file `matching/services/job_schema.py`:
Thay thế đoạn định nghĩa `CHILD_AGE_GROUPS` và `CARE_DUTIES` (dòng 13–28) bằng:

```python
# 5 nhóm tuổi trẻ chuẩn theo đặc tả Mục 2 + alias cho backward-compatibility
CHILD_AGE_GROUPS = {
    # 5 mức chuẩn theo đặc tả:
    '0_to_12_months': '0 - 12 tháng tuổi',
    '1_to_3_years': '1 - 3 tuổi',
    '3_to_6_years': '3 - 6 tuổi',
    '6_to_10_years': '6 - 10 tuổi',
    'over_10_years': 'Trên 10 tuổi',
    # Aliases tương thích ngược:
    'under_3': 'Dưới 3 tuổi',
    'preschool': 'Mầm non (3-6 tuổi)',
    'primary': 'Tiểu học (6-11 tuổi)',
    'secondary': 'THCS (11-15 tuổi)',
    'mixed': 'Nhiều độ tuổi',
}

# 7 việc chăm sóc trẻ chuẩn theo đặc tả Mục 2 + alias cho backward-compatibility
CARE_DUTIES = {
    # 7 việc chuẩn theo đặc tả:
    'general_care': 'Chăm sóc chung',
    'feeding': 'Cho ăn',
    'bathing': 'Tắm rửa',
    'sleep_monitoring': 'Trông ngủ',
    'play_activities': 'Vui chơi và tổ chức hoạt động',
    'homework_help': 'Hỗ trợ làm bài tập về nhà',
    'light_chores': 'Các việc nhẹ liên quan đến trẻ',
    # Aliases tương thích ngược:
    'feed': 'Cho ăn / bữa ăn',
    'bath': 'Tắm rửa / vệ sinh',
    'study': 'Hướng dẫn bài tập',
    'play': 'Chơi cùng bé',
    'sleep': 'Đưa bé ngủ',
    'transport': 'Đưa đón',
}

# 3 phương thức đưa đón trẻ theo đặc tả Mục 2
TRANSPORT_METHODS = {
    'walking': 'Đi bộ',
    'carepartner_vehicle': 'CarePartner tự có phương tiện',
    'parent_arranged': 'Phụ huynh sắp xếp phương tiện',
}
```

Trong `OPTIONAL_BY_TYPE` (dòng 42–46):
```python
OPTIONAL_BY_TYPE = {
    'tutoring': ['location_note'],
    'childcare': ['medical_allergy_notes', 'location_note'],
    'pickup': ['pickup_location_note', 'destination_note', 'transport_note', 'transport_method'],
}
```

Trong hàm `validate_job_payload` (khoảng dòng 122–130), tại khối xử lý `job_type == 'pickup'`, bổ sung kiểm tra `transport_method`:
```python
    if job_type == 'pickup':
        if clean.get('destination_type') not in ('parent_home', 'other_address'):
            errors['destination_type'] = 'Chọn điểm đến: về nhà hoặc địa chỉ khác.'
        if clean['destination_type'] == 'other_address' and not payload.get('destination_location'):
            errors['destination_location'] = 'Cần vị trí điểm đến trên bản đồ.'
        else:
            clean['destination_location'] = payload.get('destination_location')
            
        # Kiểm tra transport_method nếu có gửi lên
        transport_method = payload.get('transport_method')
        if transport_method and transport_method not in TRANSPORT_METHODS:
            errors['transport_method'] = 'Phương thức di chuyển không hợp lệ.'
        elif transport_method:
            clean['transport_method'] = transport_method
```

---

### BƯỚC 2: CẬP NHẬT `matching/services/matching_service.py`

#### Mục tiêu:
Khớp đặc tả Mục 4 (BỐN. Bộ máy tìm và chấm điểm ứng viên) và Mục 5 (NĂM. Danh sách ứng viên hiển thị cho phụ huynh):
1. **Điểm đánh giá sao cho người mới (`subscore_rating`):**
   - Người mới chưa có bất kỳ đánh giá nào (`review_count == 0`): Mặc định điểm trung tính là **60.0** trên thang 100.
   - Khi có 1 hoặc 2 đánh giá: Blend giữa điểm đánh giá thực tế và điểm trung tính: `base * 0.6 + 60.0 * 0.4`.
   - Từ 3 đánh giá trở lên: Tính 100% theo điểm thực tế.
2. **Tỷ lệ hoàn thành đơn cho người mới (`subscore_completion`):**
   - Người mới chưa có đơn nào (`total == 0`): Mặc định **100.0%** để không bị bất lợi khi tìm việc đầu tiên (đặc tả ghi rõ: "Người mới chưa có lịch sử đơn hàng nào được tính tỷ lệ hoàn thành mặc định là 100% để không bị bất lợi khi tìm việc đầu tiên").
3. **Ngưỡng nhãn mức độ phù hợp (`match_level_of`):**
   - Điểm >= 90: `'very_high'` (Rất phù hợp)
   - Điểm 75 <= score < 90: `'high'` (Phù hợp cao)
   - Điểm 60 <= score < 75: `'medium'` (Phù hợp)
   - Điểm < 60: `'low'` (Có thể cân nhắc)
4. **Xóa bỏ logic ghi đè nhãn `low`:**
   - Xóa bỏ đoạn mã ép `cand['match_level'] = 'medium'` khi `total_matched >= MAX_CANDIDATES_DEFAULT`. Nhãn mức độ phù hợp phải phản ánh đúng điểm số của ứng viên.

#### Đoạn code cần thay thế:
Mở file `matching/services/matching_service.py`:
1. Sửa hàm `subscore_rating` (khoảng dòng 102–106):
```python
def subscore_rating(rating_avg, review_count):
    # Người mới chưa có review nào: mặc định trung tính 60.0 (thang 100)
    if not review_count or review_count == 0:
        return 60.0
    base = (rating_avg or 0) / 5.0 * 100.0
    if review_count < 3:
        return base * 0.6 + 60.0 * 0.4  # blend cho 1-2 review đầu
    return base
```

2. Sửa hàm `subscore_completion` (khoảng dòng 109–114):
```python
def subscore_completion(completed, cancelled, no_show):
    total = completed + cancelled + no_show
    if total == 0:
        return 100.0  # người mới chưa có đơn: mặc định 100% theo đặc tả
    return completed / total * 100.0
```

3. Sửa hàm `match_level_of` (khoảng dòng 127–136):
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

4. Trong hàm `find_candidates` (khoảng dòng 263–268):
Tìm và xóa bỏ đoạn mã sau:
```python
    # match_level 'low' chỉ khi pool < 8 (re-check sau khi biết pool thật)
    if total_matched >= MAX_CANDIDATES_DEFAULT:
        for cand in top:
            if cand['match_level'] == 'low':
                cand['match_level'] = 'medium'
```
*(Xóa hoàn toàn 5 dòng này, giữ nguyên dòng `return {'total_matched': total_matched, 'candidates': top}`).*

---

### BƯỚC 3: CẬP NHẬT WEB TEMPLATES

#### 1. File `frontend/templates/frontend/dang_viec_trong_tre.html`:
- Sửa `<select id="ageGroup">` (khoảng dòng 40–47) thành 5 nhóm tuổi chuẩn:
```html
            <select id="ageGroup" class="mcm-input">
                <option value="">— Chọn độ tuổi —</option>
                <option value="0_to_12_months">0 - 12 tháng tuổi</option>
                <option value="1_to_3_years">1 - 3 tuổi</option>
                <option value="3_to_6_years">3 - 6 tuổi</option>
                <option value="6_to_10_years">6 - 10 tuổi</option>
                <option value="over_10_years">Trên 10 tuổi</option>
            </select>
```
- Sửa danh sách checkbox công việc chăm sóc (khoảng dòng 51–58) thành 7 việc chuẩn:
```html
            <div class="grid grid-cols-2 gap-2 text-sm">
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="general_care"> Chăm sóc chung</label>
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="feeding"> Cho ăn</label>
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="bathing"> Tắm rửa</label>
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="sleep_monitoring"> Trông ngủ</label>
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="play_activities"> Vui chơi &amp; vận động</label>
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="homework_help"> Hỗ trợ bài tập về nhà</label>
                <label class="flex items-center gap-2 p-2 bg-gray-50 hover:bg-orange-50/50 rounded-xl cursor-pointer transition border border-gray-100 col-span-2"><input type="checkbox" class="duty accent-[#F26522] w-4 h-4 rounded" value="light_chores"> Các việc nhẹ liên quan đến trẻ</label>
            </div>
```

#### 2. File `frontend/templates/frontend/dang_viec_don_tre.html`:
- Sửa `<select id="ageGroup">` (khoảng dòng 56–63) tương tự như trên với 5 nhóm tuổi chuẩn.
- Cập nhật mục Phương tiện đưa đón (khoảng dòng 93–95) để cung cấp 3 tùy chọn:
```html
            <label class="mcm-label" for="transportMethod">Phương tiện đưa đón (tuỳ chọn)</label>
            <select id="transportMethod" class="mcm-input mb-2">
                <option value="">— Chọn phương tiện —</option>
                <option value="walking">Đi bộ</option>
                <option value="carepartner_vehicle">CarePartner tự có phương tiện</option>
                <option value="parent_arranged">Phụ huynh sắp xếp phương tiện</option>
            </select>
            <input id="transportNote" class="mcm-input" placeholder="Ghi chú thêm về phương tiện (nếu có)…">
```
- Trong phần script submit form (khoảng dòng 170–190), thêm trường `transport_method`:
```javascript
    const transportMethod = document.getElementById('transportMethod').value;
    // Thêm vào payload nếu có:
    if (transportMethod) {
      payload.transport_method = transportMethod;
    }
```

---

### BƯỚC 4: CẬP NHẬT MOBILE REACT NATIVE SCREENS

#### 1. File `mobile/src/screens/Parent/ChildcareForm.js`:
Cập nhật `AGE_GROUPS` và `DUTIES` (dòng 22–37):
```javascript
const AGE_GROUPS = [
  { code: '0_to_12_months', label: '0 - 12 tháng tuổi' },
  { code: '1_to_3_years', label: '1 - 3 tuổi' },
  { code: '3_to_6_years', label: '3 - 6 tuổi' },
  { code: '6_to_10_years', label: '6 - 10 tuổi' },
  { code: 'over_10_years', label: 'Trên 10 tuổi' },
];

const DUTIES = [
  { code: 'general_care', label: 'Chăm sóc chung' },
  { code: 'feeding', label: 'Cho ăn' },
  { code: 'bathing', label: 'Tắm rửa' },
  { code: 'sleep_monitoring', label: 'Trông ngủ' },
  { code: 'play_activities', label: 'Vui chơi & hoạt động' },
  { code: 'homework_help', label: 'Hỗ trợ bài tập về nhà' },
  { code: 'light_chores', label: 'Việc nhẹ liên quan bé' },
];
```

#### 2. File `mobile/src/screens/Parent/PickupForm.js`:
- Cập nhật `AGE_GROUPS` (dòng 22–27) đủ 5 nhóm tuổi:
```javascript
const AGE_GROUPS = [
  { code: '0_to_12_months', label: '0 - 12 tháng tuổi' },
  { code: '1_to_3_years', label: '1 - 3 tuổi' },
  { code: '3_to_6_years', label: '3 - 6 tuổi' },
  { code: '6_to_10_years', label: '6 - 10 tuổi' },
  { code: 'over_10_years', label: 'Trên 10 tuổi' },
];

const TRANSPORT_METHODS = [
  { code: 'walking', label: 'Đi bộ' },
  { code: 'carepartner_vehicle', label: 'CP tự có xe' },
  { code: 'parent_arranged', label: 'Phụ huynh sắp xếp' },
];
```
- Bổ sung state `const [transportMethod, setTransportMethod] = useState('');`
- Trong JSX render chips chọn `transportMethod` trước ô nhập `transportNote`.
- Đưa `transport_method: transportMethod || undefined` vào payload gửi lên API.

---

### BƯỚC 5: CẬP NHẬT TEST SUITE `matching/tests/test_matching.py`

Mở file `matching/tests/test_matching.py`:
1. Sửa `test_completion_newcomer_70` (dòng 45–46):
```python
    def test_completion_newcomer_100(self):
        """Người mới chưa có đơn: mặc định 100.0% theo đặc tả."""
        self.assertEqual(subscore_completion(0, 0, 0), 100.0)
```
2. Sửa `test_rating_newcomer_blend` (dòng 37–40):
```python
    def test_rating_newcomer_blend(self):
        """review_count == 0 -> 60.0; review_count < 3 -> blend 0.6×base + 0.4×60."""
        self.assertEqual(subscore_rating(0.0, 0), 60.0)
        self.assertEqual(subscore_rating(None, 0), 60.0)
        self.assertEqual(subscore_rating(5.0, 1), 5.0 / 5 * 100 * 0.6 + 60 * 0.4)
        self.assertEqual(subscore_rating(4.0, 2), 80 * 0.6 + 24)
```
3. Thêm test kiểm tra ngưỡng `match_level_of`:
```python
    def test_match_level_thresholds(self):
        from matching.services.matching_service import match_level_of
        self.assertEqual(match_level_of(95), 'very_high')
        self.assertEqual(match_level_of(90), 'very_high')
        self.assertEqual(match_level_of(89), 'high')
        self.assertEqual(match_level_of(75), 'high')
        self.assertEqual(match_level_of(74), 'medium')
        self.assertEqual(match_level_of(60), 'medium')
        self.assertEqual(match_level_of(59), 'low')
        self.assertEqual(match_level_of(40), 'low')
```

---

## 3. LỆNH XÁC MINH (VERIFICATION)

Sau khi hoàn tất toàn bộ chỉnh sửa trên, coding agent BẮT BUỘC phải chạy 3 lệnh sau trong terminal và đảm bảo tất cả đều thoát với mã 0 (SUCCESS):

```powershell
# 1. Chạy 155 unit & integration tests của module matching
python manage.py test matching.tests

# 2. Chạy 17 assertions kiểm tra quy tắc nghiệp vụ khắt khe G13
python scripts/g13_business_rules.py

# 3. Chạy demo E2E thực tế kiểm tra luồng ghép nối thông minh
python scripts/e2e_matching_live_demo.py
```

### Tiêu chuẩn nghiệm thu (Acceptance Criteria):
1. `matching.tests`: Chạy thành công toàn bộ test cases (OK, Ran 155+ tests).
2. `scripts/g13_business_rules.py`: In ra dòng `═══ G13: 17/17 assertion PASS ═══`.
3. `scripts/e2e_matching_live_demo.py`: Hoàn thành toàn bộ kịch bản E2E thành công.
4. Đăng việc trông trẻ/đón trẻ từ web hoặc mobile với nhóm tuổi và công việc mới hoạt động mượt mà, lưu đúng vào DB.
