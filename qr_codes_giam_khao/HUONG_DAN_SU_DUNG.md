# Bộ Mã QR Đăng Nhập Tự Động Cho Ban Giám Khảo & CarePartner

Thư mục này chứa toàn bộ các mã QR tự động đăng nhập dành cho Ban Giám khảo chấm thi pitching sản phẩm **EduCareLink**.

---

## 1. Danh sách 4 Tài khoản Phụ huynh (Ban Giám khảo)

| STT | Vị trí Giám khảo | Họ và tên | Username | Mật khẩu dự phòng | Số dư ví Credit | Địa chỉ tại Huế |
|:---:|---|---|---|:---:|:---:|---|
| **1** | Ban Giám Khảo #1 | Phạm Bảo Lĩnh | `phuhuynh_baolinh` | `Demo@2026` | **1.800.000 VNĐ** | KĐT An Cựu City, P. An Đông |
| **2** | Ban Giám Khảo #2 | Đặng Minh Khôi | `phuhuynh_minhkhoi` | `Demo@2026` | **3.200.000 VNĐ** | Vincom Plaza, 50A Hùng Vương |
| **3** | Ban Giám Khảo #3 | Hồ Yến Chi | `phuhuynh_yenchi` | `Demo@2026` | **1.500.000 VNĐ** | 15 Lê Lợi, P. Vĩnh Ninh |
| **4** | Ban Giám Khảo #4 | Trương Công Vinh | `phuhuynh_congvinh` | `Demo@2026` | **900.000 VNĐ** | Chung cư Xuân Phú, P. Xuân Phú |

> Khi quét, hệ thống tự động đăng nhập và chuyển thẳng vào **Trang chủ Phụ huynh (`/parent/`)**.

---

## 2. Tài khoản Người chăm sóc (CarePartner)

| STT | Vai trò | Họ và tên | Username | Mật khẩu dự phòng | Đánh giá | Trình độ & Bằng cấp |
|:---:|---|---|---|:---:|:---:|---|
| **5** | **CarePartner Tiêu Biểu** | Nguyễn Minh Anh | `sinhvien_test` | `Demo@2026` | **5.0 ★ (18 việc)** | ĐH Sư Phạm Huế, IELTS 7.5, Sơ cấp cứu Nhi |

> Khi quét, hệ thống tự động đăng nhập và chuyển thẳng vào **Bảng tin việc làm CarePartner (`/worker/`)** với 50+ công việc mẫu, ca làm việc và theo dõi thu nhập.

---

## 3. Danh mục file ảnh trong thư mục

### 🎨 Dành cho Slide Canva (Thay thế mã QR trên Slide 4):
- **`banner_4_giam_khao_canva_slide.png`**: Dải banner ngang 1920x720 chứa cả 4 mã Giám khảo cạnh nhau, kéo thả 1 lần vào Canva là xong.
- **Mã QR Phụ huynh đơn lẻ nền trong suốt (Khuyên dùng)**:
  - `01_qr_giam_khao_1_phuhuynh_baolinh_orange_transparent.png`
  - `02_qr_giam_khao_2_phuhuynh_minhkhoi_orange_transparent.png`
  - `03_qr_giam_khao_3_phuhuynh_yenchi_orange_transparent.png`
  - `04_qr_giam_khao_4_phuhuynh_congvinh_orange_transparent.png`
- **Mã QR CarePartner (Người chăm sóc)**:
  - `05_qr_carepartner_sinhvien_test_green_transparent.png` (Xanh ngọc thương hiệu CarePartner)
  - `05_qr_carepartner_sinhvien_test_orange_transparent.png` (Màu cam đồng bộ slide Canva)
  - `05_qr_carepartner_sinhvien_test_green.png` / `_black.png`
- **Mã QR Phụ huynh nền trắng & đen trắng**:
  - `01_..._orange.png` đến `04_..._orange.png`
  - `01_..._black.png` đến `04_..._black.png`

### 🪪 Dành cho In ấn / Đặt bàn Ban Giám khảo & Người trải nghiệm:
- `the_giam_khao_01_phuhuynh_baolinh.png`
- `the_giam_khao_02_phuhuynh_minhkhoi.png`
- `the_giam_khao_03_phuhuynh_yenchi.png`
- `the_giam_khao_04_phuhuynh_congvinh.png`
- `the_carepartner_05_sinhvien_test.png` (Thẻ CarePartner sang trọng)

### 🌐 Trình xem và thử nghiệm:
- **`index.html`**: Mở file này bằng trình duyệt Chrome/Edge trên máy tính để xem toàn bộ thẻ và click thử link đăng nhập tự động.

---

## 4. Cách thay thế mã QR trên Canva:
1. Mở slide Canva pitching của bạn.
2. Tại **Slide 4** ("QUÉT MÃ QR - TRẢI NGHIỆM SẢN PHẨM"), xoá mã QR cam hiện tại.
3. Kéo thả file **`banner_4_giam_khao_canva_slide.png`** (nếu muốn cả 4 giám khảo cùng quét) hoặc file **`*_orange_transparent.png`** vào vị trí trung tâm.
4. Nếu muốn demo cả vai trò CarePartner, có thể kéo thêm mã **`05_qr_carepartner_sinhvien_test_green_transparent.png`** sang cạnh hoặc trang demo riêng.
