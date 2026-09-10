import os
import io
import base64
from PIL import Image

def get_base64_data_uri(img_path, max_size=240, format='PNG'):
    img = Image.open(img_path)
    img_resized = img.resize((max_size, max_size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if format == 'JPEG':
        img_resized.convert('RGB').save(buf, format='JPEG', quality=85)
        mime = 'image/jpeg'
    else:
        img_resized.save(buf, format='PNG', optimize=True)
        mime = 'image/png'
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    return f"data:{mime};base64,{b64}"

def build_markdown():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    new_logo_path = os.path.join(root_dir, 'mobile', 'assets', 'logo.png')
    old_logo_path = os.path.join(root_dir, 'frontend', 'static', 'images', 'logo.png')

    data_uri_new = get_base64_data_uri(new_logo_path, max_size=240, format='PNG')
    data_uri_old = get_base64_data_uri(old_logo_path, max_size=240, format='JPEG')

    content = f"""# CHỈ THỊ CODING AGENT: ĐỒNG BỘ LOGO ICON & FAVICON TRÊN WEB VỚI APP MOBILE (CH PLAY)

> **Môi trường hoạt động:** Coding Agent chạy trên trình duyệt web (Claude / ChatGPT / Cursor / Windsurf / Replit / Codespaces / v0...)  
> **Dự án:** EduCareLink (Django 5.2 + DRF + React Native Mobile)  
> **Mục tiêu:** Đồng bộ nhận diện thương hiệu hình ảnh: Thay thế logo cũ trên giao diện Web bằng biểu tượng Logo chính thức của App Mobile (icon CH Play / Google Play Store), đồng thời tạo mới bộ favicon (16x16, 32x32, .ico) tương ứng.  
> **Nguồn icon chuẩn:** `mobile/assets/logo.png` (Kích thước 1024 × 1024, định dạng PNG RGBA trong suốt).  
> **Các file đích cần cập nhật:**  
> - `frontend/static/images/logo.png` (Logo chính trên toàn bộ trang Web)  
> - `frontend/static/images/favicon-32.png` (Favicon 32x32)  
> - `frontend/static/images/favicon-16.png` (Favicon 16x16)  
> - `frontend/static/images/favicon.ico` (Favicon trình duyệt định dạng .ico)  
> - `mobile/assets/images/logo.png` (Đồng bộ file logo nội bộ của mobile)  

---

## 1. HÌNH ẢNH BIỂU TƯỢNG APP TRỰC QUAN (NHÚNG TRỰC TIẾP TRÊN TRÌNH DUYỆT)

> 💡 **Lưu ý đặc biệt cho Web / Browser Coding Agent:**  
> Hình ảnh dưới đây được **nhúng trực tiếp bằng Base64 Data URI**. Bạn có thể xem hình ảnh trực quan ngay trên cửa sổ trình duyệt hoặc giao diện chat mà không gặp lỗi thiếu file hay đường dẫn cục bộ!

<div align="center" style="margin: 24px 0;">
  <img src="{data_uri_new}" alt="Biểu tượng App EduCareLink Mobile CH Play" width="200" height="200" style="border-radius: 42px; box-shadow: 0 12px 30px rgba(242, 101, 34, 0.4); border: 2px solid rgba(255, 255, 255, 0.8);" />
  <p style="margin-top: 12px; font-weight: 700; color: #1e293b; font-size: 16px;">
    Biểu tượng chính thức của App EduCareLink trên Google Play Store (CH Play)
  </p>
  <p style="color: #64748b; font-size: 13px; max-width: 500px;">
    Định dạng: PNG RGBA 1024×1024 | Squircle cong chuẩn thương hiệu | Gradient cam công nghệ (#F26522)
  </p>
</div>

### Đặc điểm nhận diện cốt lõi của biểu tượng:
* **Khung Squircle công nghệ:** Hình vuông bo tròn hiện đại, phủ dải màu chuyển sắc cam ấm áp đặc trưng của EduCareLink (`#F26522` kết hợp góc ánh sáng nổi 3D).
* **Huy hiệu trung tâm:** Hình tròn trắng tinh khiết bảo bọc hình ảnh chiếc mũ cử nhân (tri thức/giáo dục) được nâng niu bởi bàn tay yêu thương (chăm sóc/gia đình).
* **Chữ thương hiệu EduCareLink:** Dòng chữ trắng tương phản cao, phông chữ không chân hiện đại, nằm ngay ngắn và cân đối ở đáy biểu tượng.
* **Độ trong suốt (Alpha Channel):** Bốn góc ngoài của hình squircle là nền trong suốt hoàn toàn, giúp logo đặt lên bất kỳ thanh navbar hay nền sáng/tối nào đều không bị viền trắng thô.

---

## 2. ĐỐI CHIẾU TRỰC QUAN TRƯỚC VÀ SAU KHI ĐỒNG BỘ

Bảng so sánh trực quan hiển thị trực tiếp trên trình duyệt để Coding Agent đối chiếu:

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
      <th style="padding: 12px; text-align: center; width: 50%; color: #dc2626; font-size: 15px;">
        ❌ LOGO CŨ TRÊN WEB (CẦN LOẠI BỎ)
      </th>
      <th style="padding: 12px; text-align: center; width: 50%; color: #16a34a; font-size: 15px;">
        ✅ ICON CHUẨN TRÊN CH PLAY (ĐÍCH ĐẾN)
      </th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td align="center" style="padding: 20px; vertical-align: top;">
        <img src="{data_uri_old}" alt="Logo cũ trên Web" width="160" height="160" style="border-radius: 12px; border: 1px solid #cbd5e1; padding: 6px; background-color: #ffffff;" />
        <p style="margin-top: 10px; font-weight: 600; color: #475569;">
          File hiện tại: <code>frontend/static/images/logo.png</code> (Cũ)
        </p>
        <ul style="text-align: left; font-size: 13px; color: #64748b; margin-top: 8px; line-height: 1.5;">
          <li>Thực chất là định dạng JPEG bị đổi đuôi thành <code>.png</code>.</li>
          <li>Nền phẳng màu trắng đục, không có kênh trong suốt (Alpha).</li>
          <li>Chỉ có hình tròn đơn điệu, <b>không có tên thương hiệu EduCareLink</b>.</li>
          <li>Thiếu bo góc squircle, thiếu độ bóng đổ hiện đại của ứng dụng di động.</li>
        </ul>
      </td>
      <td align="center" style="padding: 20px; vertical-align: top; background-color: #f0fdf4;">
        <img src="{data_uri_new}" alt="Icon chuẩn Mobile CH Play" width="160" height="160" style="border-radius: 34px; box-shadow: 0 8px 22px rgba(242, 101, 34, 0.35);" />
        <p style="margin-top: 10px; font-weight: 700; color: #15803d;">
          File nguồn chuẩn: <code>mobile/assets/logo.png</code> (Mới)
        </p>
        <ul style="text-align: left; font-size: 13px; color: #166534; margin-top: 8px; line-height: 1.5;">
          <li>Chuẩn định dạng PNG RGBA 32-bit (1024×1024 pixel).</li>
          <li>Bốn góc trong suốt (transparent), hiển thị hoàn hảo trên thanh menu.</li>
          <li>Đầy đủ nhận diện: Logo tròn + Dòng chữ <b>EduCareLink</b> sắc nét.</li>
          <li>Đồng bộ 100% nhận diện giữa bản Web và ứng dụng CH Play.</li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

---

## 3. HƯỚNG DẪN THỰC HIỆN TỪNG BƯỚC CHO CODING AGENT

Coding Agent hãy chọn một trong hai cách dưới đây tùy thuộc vào môi trường đang làm việc:

### Cách 1: Chạy Script tự động (Khuyên dùng - Nhanh nhất)

Nếu bạn có quyền chạy lệnh terminal trong thư mục dự án, hãy chạy ngay file script đã được cấu hình sẵn tại `scripts/sync_web_logo.py`:

```powershell
python scripts/sync_web_logo.py
```

*Hoặc nếu muốn chạy lệnh Python 1 dòng trực tiếp qua terminal:*

```powershell
python -c "import os, shutil; from PIL import Image; src=os.path.join('mobile','assets','logo.png'); web=os.path.join('frontend','static','images'); shutil.copyfile(src, os.path.join(web,'logo.png')); im=Image.open(src); im.resize((32,32), Image.Resampling.LANCZOS).save(os.path.join(web,'favicon-32.png')); im.resize((16,16), Image.Resampling.LANCZOS).save(os.path.join(web,'favicon-16.png')); im.save(os.path.join(web,'favicon.ico'), format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64)]); print('>>> DONG BO LOGO & FAVICON THANH CONG!')"
```

---

### Cách 2: Chi tiết các bước thực hiện mã nguồn (Dành cho Agent tự sinh code)

Nếu bạn là Agent tự viết hoặc chỉnh sửa mã nguồn, hãy làm theo đúng 4 bước kỹ thuật sau:

#### Bước 2.1: Sao chép file gốc 1024×1024
Lấy file `mobile/assets/logo.png` ghi đè trực tiếp vào `frontend/static/images/logo.png`.  
Đồng thời ghi đè vào `mobile/assets/images/logo.png` (nếu thư mục này tồn tại) để đồng bộ nội bộ.

#### Bước 2.2: Sinh bộ Favicon đa kích thước bằng Pillow (LANCZOS resampling)
Sử dụng bộ lọc `Image.Resampling.LANCZOS` để đảm bảo khi thu nhỏ icon xuống các kích thước nhỏ, chi tiết mũ cử nhân và bàn tay vẫn nhìn rõ:
- **`frontend/static/images/favicon-32.png`**: Kích thước 32 × 32 pixel (PNG RGBA).
- **`frontend/static/images/favicon-16.png`**: Kích thước 16 × 16 pixel (PNG RGBA).
- **`frontend/static/images/favicon.ico`**: Định dạng ICO tích hợp đa tầng kích thước `[(16, 16), (32, 32), (48, 48), (64, 64)]`.

#### Bước 2.3: Chạy lệnh thu thập Static (Khi deploy Production)
```powershell
python manage.py collectstatic --noinput
```

---

## 4. DANH SÁCH MÀN HÌNH WEB SẼ TỰ ĐỘNG CẬP NHẬT

Vì tất cả giao diện Web của EduCareLink đều tham chiếu thống nhất qua đường dẫn static `images/logo.png` và `images/favicon.ico`, nên ngay khi hoàn thành các bước trên, các màn hình sau sẽ tự động mang diện mạo mới:

1. **Thanh Sidebar Phụ huynh (`_parent_sidebar.html` & `parent_home.html`):**
   - Icon logo ở góc trên bên trái menu điều hướng sẽ chuyển sang biểu tượng squircle cam bóng bẩy.
2. **Thanh Sidebar Carepartner / Sinh viên (`_worker_sidebar.html` & `worker_home.html`):**
   - Đồng bộ hoàn toàn icon thương hiệu khi ứng viên tìm việc và quản lý đơn.
3. **Màn hình Đăng nhập & Đăng ký (`login.html`, `register.html`):**
   - Logo thương hiệu nổi bật trên khung form đăng nhập, tăng độ tin cậy của phụ huynh và đối tác.
4. **Trang Giới thiệu & Onboarding (`landing.html`, `splash.html`):**
   - Hình ảnh hiển thị độ phân giải cao 1024×1024, không bị vỡ hạt trên màn hình Retina/4K.
5. **Favicon Tab Trình duyệt (`base.html`):**
   - Tab trình duyệt của người dùng sẽ hiển thị favicon sắc nét, dễ nhận biết giữa nhiều tab đang mở.

---

## 5. TIÊU CHUẨN NGHIỆM THU (ACCEPTANCE CRITERIA)

| Hạng mục | Tiêu chuẩn bắt buộc |
|---|---|
| **Định dạng logo chính** | `frontend/static/images/logo.png` phải là file PNG RGBA 1024×1024 (dung lượng ~759 KB), không còn là JPEG RGB 52 KB cũ |
| **Bo góc & Kênh trong suốt** | 4 góc ngoài của squircle trong suốt hoàn toàn, không có viền trắng chữ nhật bao quanh |
| **Bộ Favicon** | Đầy đủ `favicon-32.png`, `favicon-16.png`, `favicon.ico` trong thư mục `frontend/static/images/` |
| **Độ tương thích** | Chạy `python manage.py check` không báo lỗi tĩnh |

---
*Tài liệu này được biên soạn độc lập và sẵn sàng cung cấp trực tiếp cho bất kỳ Coding Agent nào.*
"""

    # 1. Write to docs/PROMPT_SYNC_WEB_LOGO_ICON.md
    out_docs = os.path.join(root_dir, 'docs', 'PROMPT_SYNC_WEB_LOGO_ICON.md')
    with open(out_docs, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Written to: {out_docs}")

    # 2. Write to Artifact directory
    artifact_dir = r"C:\Users\PC\.gemini\antigravity\brain\89abb596-b339-425c-9480-94fe8f910762"
    if os.path.exists(artifact_dir):
        out_artifact = os.path.join(artifact_dir, 'PROMPT_SYNC_WEB_LOGO_ICON.md')
        with open(out_artifact, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Written to: {out_artifact}")

if __name__ == '__main__':
    build_markdown()
