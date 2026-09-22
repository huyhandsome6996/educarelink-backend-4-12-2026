"""
Script tạo bộ 4 mã QR đăng nhập tự động tài khoản Phụ huynh cho Ban Giám khảo.
Đầy đủ các định dạng:
  1. Mã QR đơn lẻ màu cam thương hiệu (nền trắng & nền trong suốt) cho Canva
  2. Mã QR đơn lẻ màu đen trắng (tương phản cao)
  3. Thẻ Giám khảo (Card) cao cấp đầy đủ thông tin để in ấn hoặc trình chiếu
  4. Banner 4-trong-1 (dải ngang) chèn trực tiếp vào slide Canva
  5. Trang index.html để test và duyệt nhanh
"""

import os
import sys

# Dam bao in tieng Viet va emoji khong loi tren Windows console
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import qrcode
from PIL import Image, ImageDraw, ImageFont

# Thư mục gốc dự án
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'qr_codes_giam_khao')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Thông tin 4 tài khoản Phụ huynh cho Ban Giám khảo
JUDGES = [
    {
        "id": 1,
        "label": "Giám khảo 1",
        "username": "phuhuynh_baolinh",
        "name": "Phạm Bảo Lĩnh",
        "phone": "0903 112 233",
        "credit": "1.800.000 VNĐ",
        "address": "KĐT An Cựu City, P. An Đông, TP. Huế",
        "role_desc": "Phụ huynh có 2 con, nhu cầu tìm gia sư Toán & đón trẻ",
    },
    {
        "id": 2,
        "label": "Giám khảo 2",
        "username": "phuhuynh_minhkhoi",
        "name": "Đặng Minh Khôi",
        "phone": "0903 445 566",
        "credit": "3.200.000 VNĐ",
        "address": "Vincom Plaza, 50A Hùng Vương, P. Phú Nhuận, TP. Huế",
        "role_desc": "Phụ huynh bận rộn, cần người trông trẻ & đưa đón hàng ngày",
    },
    {
        "id": 3,
        "label": "Giám khảo 3",
        "username": "phuhuynh_yenchi",
        "name": "Hồ Yến Chi",
        "phone": "0903 778 899",
        "credit": "1.500.000 VNĐ",
        "address": "15 Lê Lợi, P. Vĩnh Ninh, TP. Huế (gần BV TW Huế)",
        "role_desc": "Bác sĩ, ca trực đêm, cần tìm CarePartner nữ kinh nghiệm trông trẻ",
    },
    {
        "id": 4,
        "label": "Giám khảo 4",
        "username": "phuhuynh_congvinh",
        "name": "Trương Công Vinh",
        "phone": "0903 224 466",
        "credit": "900.000 VNĐ",
        "address": "Chung cư Xuân Phú, P. Xuân Phú, TP. Huế",
        "role_desc": "Giảng viên đại học, cần gia sư Tiếng Anh chuẩn bị cho kỳ thi",
    },
]

BASE_URL = "https://educarelink-backend.onrender.com"
TEST_PASSWORD = "Demo@2026"
BRAND_ORANGE = "#E66D05"  # Màu cam chuẩn của EduCareLink và slide Canva
BRAND_DARK = "#1E293B"    # Màu xanh than đậm / text
BRAND_MUTED = "#64748B"   # Màu xám ghi
BG_WARM = "#FFFDF9"       # Màu nền ấm nhẹ

# Fonts
WIN_FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
def get_font(name, size):
    path = os.path.join(WIN_FONTS, name)
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        return ImageFont.load_default()

font_title = get_font("segoeuib.ttf", 36)
font_sub = get_font("segoeui.ttf", 22)
font_judge_badge = get_font("segoeuib.ttf", 28)
font_card_name = get_font("segoeuib.ttf", 32)
font_card_info = get_font("segoeui.ttf", 20)
font_card_bold = get_font("segoeuib.ttf", 20)
font_url = get_font("consola.ttf", 16)
font_footer = get_font("segoeui.ttf", 18)

# Chuẩn bị Center Badge hoàn hảo không viền đen
badge_path = os.path.join(BASE_DIR, 'scripts', 'assets', 'educarelink_qr_badge_perfect.png')
if os.path.exists(badge_path):
    badge = Image.open(badge_path).convert('RGBA')
else:
    badge = None


def generate_single_qr(url, fill_color='#E66D05', back_color='white', box_size=18, border=2, add_badge=True):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color=fill_color, back_color=back_color).convert('RGBA')
    
    if add_badge and badge:
        # Resize badge vừa vặn ~15% chiều rộng QR để đảm bảo quét 100%
        target_badge_w = int(img.width * 0.16)
        b_resized = badge.resize((target_badge_w, target_badge_w), Image.Resampling.LANCZOS)
        pos = ((img.width - target_badge_w) // 2, (img.height - target_badge_w) // 2)
        img.paste(b_resized, pos, b_resized)
        
    return img


def make_transparent(img, bg_color=(255, 255, 255)):
    """Chuyển nền trắng thành trong suốt để kéo vào Canva dễ dàng"""
    rgba = img.convert('RGBA')
    datas = rgba.getdata()
    new_data = []
    for item in datas:
        # Nếu là pixel trắng hoặc gần trắng
        if item[0] > 245 and item[1] > 245 and item[2] > 245:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    rgba.putdata(new_data)
    return rgba


def generate_judge_card(judge, qr_img):
    """Tạo thẻ Giám khảo sang trọng (840 x 1180 px)"""
    w, h = 840, 1180
    card = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(card)
    
    # 1. Nền bo góc mềm mại + đổ bóng / viền cam thanh lịch
    margin = 16
    draw.rounded_rectangle(
        (margin, margin, w - margin, h - margin),
        radius=36,
        fill=BG_WARM,
        outline="#FED7AA",
        width=3
    )
    
    # 2. Header EduCareLink
    # Icon logo tròn ở góc trên
    logo_src = os.path.join(BASE_DIR, 'frontend', 'static', 'images', 'logo.png')
    if os.path.exists(logo_src):
        app_logo = Image.open(logo_src).convert('RGBA')
        app_logo = app_logo.resize((72, 72), Image.Resampling.LANCZOS)
        # Mặt nạ tròn
        mask = Image.new('L', (72, 72), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 72, 72), fill=255)
        card.paste(app_logo, (60, 52), mask)
    
    # Tiêu đề EduCareLink
    draw.text((148, 54), "EduCareLink", fill=BRAND_DARK, font=get_font("segoeuib.ttf", 34))
    draw.text((148, 94), "Nền tảng kết nối Phụ huynh & CarePartner", fill=BRAND_MUTED, font=get_font("segoeui.ttf", 19))
    
    # Dải màu phân cách cam - xanh
    draw.line((60, 140, 480, 140), fill="#F97316", width=4)
    draw.line((480, 140, 780, 140), fill="#22C55E", width=4)
    
    # 3. Badge Ban Giám khảo nổi bật
    badge_y = 162
    draw.rounded_rectangle(
        (60, badge_y, w - 60, badge_y + 54),
        radius=14,
        fill="#FFF7ED",
        outline="#FDBA74",
        width=2
    )
    badge_text = f"BAN {judge['label'].upper()} — {judge['name'].upper()}"
    bbox = draw.textbbox((0, 0), badge_text, font=get_font("segoeuib.ttf", 22))
    bw = bbox[2] - bbox[0]
    draw.text(((w - bw) // 2, badge_y + 13), badge_text, fill="#C2410C", font=get_font("segoeuib.ttf", 22))
    
    # 4. Đặt mã QR vào trung tâm với khung viền đứt đoạn
    qr_target_size = 460
    qr_resized = qr_img.resize((qr_target_size, qr_target_size), Image.Resampling.LANCZOS)
    qr_x = (w - qr_target_size) // 2
    qr_y = 236
    
    # Khung bo quanh QR
    frame_pad = 16
    draw.rounded_rectangle(
        (qr_x - frame_pad, qr_y - frame_pad, qr_x + qr_target_size + frame_pad, qr_y + qr_target_size + frame_pad),
        radius=20,
        fill="white",
        outline="#E2E8F0",
        width=2
    )
    card.paste(qr_resized, (qr_x, qr_y), qr_resized)
    
    # 5. Thông tin hướng dẫn & URL
    info_y = qr_y + qr_target_size + 36
    
    # Capsule URL
    url = f"{BASE_URL}/login/?u={judge['username']}&p={TEST_PASSWORD}&auto=1"
    draw.rounded_rectangle(
        (60, info_y, w - 60, info_y + 44),
        radius=22,
        fill="#FFEDD5"
    )
    display_url = f"educarelink-backend.onrender.com/login/?u={judge['username']}&auto=1"
    url_bbox = draw.textbbox((0, 0), display_url, font=get_font("segoeuib.ttf", 16))
    uw = url_bbox[2] - url_bbox[0]
    draw.text(((w - uw) // 2, info_y + 11), display_url, fill="#9A3412", font=get_font("segoeuib.ttf", 17))
    
    # Dòng chỉ dẫn quét
    guide_y = info_y + 58
    t1 = "Quét mã QR bằng Camera điện thoại để đăng nhập tức thì"
    b1 = draw.textbbox((0, 0), t1, font=get_font("segoeuib.ttf", 22))
    draw.text(((w - (b1[2]-b1[0])) // 2, guide_y), t1, fill="#0F172A", font=get_font("segoeuib.ttf", 22))
    
    t2 = "Không cần nhập mật khẩu • Tự động kích hoạt quyền Phụ huynh"
    b2 = draw.textbbox((0, 0), t2, font=get_font("segoeui.ttf", 18))
    draw.text(((w - (b2[2]-b2[0])) // 2, guide_y + 32), t2, fill="#64748B", font=get_font("segoeui.ttf", 18))
    
    # Khối tóm tắt tài khoản demo
    acc_box_y = guide_y + 74
    draw.rounded_rectangle(
        (60, acc_box_y, w - 60, acc_box_y + 138),
        radius=18,
        fill="white",
        outline="#E2E8F0",
        width=1
    )
    
    # Thông tin chi tiết trong hộp
    draw.text((86, acc_box_y + 18), f"Tài khoản: {judge['username']}", fill=BRAND_DARK, font=get_font("segoeuib.ttf", 19))
    draw.text((450, acc_box_y + 18), f"Mật khẩu: {TEST_PASSWORD}", fill=BRAND_DARK, font=get_font("segoeuib.ttf", 19))
    draw.text((86, acc_box_y + 54), f"Số dư ví Credit: {judge['credit']}", fill="#16A34A", font=get_font("segoeuib.ttf", 19))
    draw.text((450, acc_box_y + 54), f"Số điện thoại: {judge['phone']}", fill=BRAND_DARK, font=get_font("segoeui.ttf", 19))
    draw.text((86, acc_box_y + 90), f"Địa chỉ: {judge['address']}", fill="#475569", font=get_font("segoeui.ttf", 17))
    
    # Footer
    draw.text(((w - 420) // 2, h - 50), "© 2026 EduCareLink — Pitching Competition Edition", fill="#94A3B8", font=font_footer)
    
    return card


def generate_4_in_1_banner(judge_qrs):
    """Tạo ảnh ghép ngang 4 mã QR trên 1 dải banner (1920 x 700 px) sẵn sàng dán vào Canva Slide 4"""
    bw, bh = 1920, 720
    banner = Image.new('RGBA', (bw, bh), (255, 255, 255, 255))
    draw = ImageDraw.Draw(banner)
    
    # Nền gradient ấm nhẹ
    draw.rectangle((0, 0, bw, bh), fill="#FFFDF8")
    
    # Tiêu đề trên cùng
    t_main = "QUÉT MÃ QR — TRẢI NGHIỆM TỰ ĐỘNG DÀNH CHO BAN GIÁM KHẢO"
    t_main_bbox = draw.textbbox((0, 0), t_main, font=get_font("segoeuib.ttf", 28))
    draw.text(((bw - (t_main_bbox[2]-t_main_bbox[0])) // 2, 28), t_main, fill="#C2410C", font=get_font("segoeuib.ttf", 28))
    
    t_sub = "Mỗi Giám khảo quét 1 mã tương ứng để đăng nhập độc lập • Không trùng lặp phiên làm việc"
    t_sub_bbox = draw.textbbox((0, 0), t_sub, font=get_font("segoeui.ttf", 19))
    draw.text(((bw - (t_sub_bbox[2]-t_sub_bbox[0])) // 2, 70), t_sub, fill="#64748B", font=get_font("segoeui.ttf", 19))
    
    # 4 cột
    col_w = 420
    qr_size = 320
    gap = (bw - (col_w * 4)) // 5
    
    for i, j in enumerate(JUDGES):
        col_x = gap + i * (col_w + gap)
        col_y = 115
        
        # Thẻ từng cột
        draw.rounded_rectangle(
            (col_x, col_y, col_x + col_w, col_y + 560),
            radius=20,
            fill="white",
            outline="#FDBA74",
            width=2
        )
        
        # Tiêu đề cột
        badge_title = f"{j['label'].upper()}"
        draw.rounded_rectangle(
            (col_x + 20, col_y + 16, col_x + col_w - 20, col_y + 60),
            radius=12,
            fill="#FFF7ED"
        )
        bt_bbox = draw.textbbox((0, 0), badge_title, font=get_font("segoeuib.ttf", 22))
        draw.text((col_x + (col_w - (bt_bbox[2]-bt_bbox[0])) // 2, col_y + 24), badge_title, fill="#EA580C", font=get_font("segoeuib.ttf", 22))
        
        # Họ tên
        name_bbox = draw.textbbox((0, 0), j['name'], font=get_font("segoeuib.ttf", 20))
        draw.text((col_x + (col_w - (name_bbox[2]-name_bbox[0])) // 2, col_y + 70), j['name'], fill="#1E293B", font=get_font("segoeuib.ttf", 20))
        
        # QR Code
        qr_img = judge_qrs[i].resize((qr_size, qr_size), Image.Resampling.LANCZOS)
        banner.paste(qr_img, (col_x + (col_w - qr_size) // 2, col_y + 104), qr_img)
        
        # Thông tin bên dưới QR
        draw.text((col_x + 30, col_y + 440), f"Tài khoản: {j['username']}", fill="#334155", font=get_font("segoeui.ttf", 16))
        draw.text((col_x + 30, col_y + 468), f"Mật khẩu dự phòng: {TEST_PASSWORD}", fill="#64748B", font=get_font("segoeui.ttf", 16))
        draw.text((col_x + 30, col_y + 496), f"Ví khả dụng: {j['credit']}", fill="#16A34A", font=get_font("segoeuib.ttf", 16))
        draw.text((col_x + 30, col_y + 524), f"Khu vực: {j['address'][:28]}...", fill="#64748B", font=get_font("segoeui.ttf", 15))
        
    return banner


def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU TẠO BỘ 4 MÃ QR ĐĂNG NHẬP PHỤ HUYNH CHO BAN GIÁM KHẢO")
    print("=" * 70)
    
    judge_qrs_for_banner = []
    
    for idx, j in enumerate(JUDGES, 1):
        username = j['username']
        url = f"{BASE_URL}/login/?u={username}&p={TEST_PASSWORD}&auto=1"
        print(f"\n[{idx}/4] Đang tạo mã QR cho {j['label']} ({j['name']} - {username})...")
        print(f"      URL đích: {url}")
        
        slug = f"giam_khao_{idx}"
        
        # 1. QR Cam thương hiệu (Nền trắng)
        fn_orange = f"0{idx}_qr_{slug}_{username}_orange.png"
        path_orange = os.path.join(OUTPUT_DIR, fn_orange)
        qr_orange = generate_single_qr(url, fill_color=BRAND_ORANGE, back_color='white', box_size=18, border=2, add_badge=True)
        qr_orange.save(path_orange)
        print(f"      ✅ Đã lưu: {fn_orange}")
        
        # 2. QR Cam thương hiệu (Nền trong suốt) - Tối ưu nhất cho Canva
        fn_orange_trans = f"0{idx}_qr_{slug}_{username}_orange_transparent.png"
        path_orange_trans = os.path.join(OUTPUT_DIR, fn_orange_trans)
        qr_orange_trans = make_transparent(qr_orange)
        qr_orange_trans.save(path_orange_trans)
        print(f"      ✅ Đã lưu (Canva Transparent): {fn_orange_trans}")
        
        # 3. QR Đen Trắng kinh điển (Tương phản cao)
        fn_black = f"0{idx}_qr_{slug}_{username}_black.png"
        path_black = os.path.join(OUTPUT_DIR, fn_black)
        qr_black = generate_single_qr(url, fill_color='#000000', back_color='white', box_size=18, border=2, add_badge=True)
        qr_black.save(path_black)
        print(f"      ✅ Đã lưu: {fn_black}")
        
        # 4. Thẻ Giám khảo chuyên nghiệp (Card 840x1180px)
        fn_card = f"the_giam_khao_0{idx}_{username}.png"
        path_card = os.path.join(OUTPUT_DIR, fn_card)
        card_img = generate_judge_card(j, qr_orange)
        card_img.save(path_card)
        print(f"      ✅ Đã lưu (Thẻ in ấn / trình chiếu): {fn_card}")
        
        judge_qrs_for_banner.append(qr_orange)

    # 5. Sinh Banner 4-trong-1
    print("\n[5/6] Đang ghép Banner dải ngang 4-trong-1 (Slide-ready)...")
    banner_img = generate_4_in_1_banner(judge_qrs_for_banner)
    banner_path = os.path.join(OUTPUT_DIR, "banner_4_giam_khao_canva_slide.png")
    banner_img.save(banner_path)
    print(f"      ✅ Đã lưu: banner_4_giam_khao_canva_slide.png (1920x720)")
    
    # 6. Sinh file index.html để xem và click test trực tiếp
    print("\n[6/6] Đang sinh trang web kiểm thử trực quan index.html...")
    generate_html_hub(OUTPUT_DIR)
    print("      ✅ Đã lưu: index.html")
    
    # 7. Sinh file README hướng dẫn sử dụng
    generate_readme(OUTPUT_DIR)
    print("      ✅ Đã lưu: HUONG_DAN_SU_DUNG.md")
    
    print("\n" + "=" * 70)
    print("🎉 HOÀN TẤT 100%! TOÀN BỘ MÃ QR ĐÃ ĐƯỢC LƯU TẠI:")
    print(f"   📂 {OUTPUT_DIR}")
    print("=" * 70)


def generate_html_hub(output_dir):
    cards_html = ""
    for idx, j in enumerate(JUDGES, 1):
        url = f"{BASE_URL}/login/?u={j['username']}&p={TEST_PASSWORD}&auto=1"
        slug = f"giam_khao_{idx}"
        img_orange = f"0{idx}_qr_{slug}_{j['username']}_orange.png"
        img_trans = f"0{idx}_qr_{slug}_{j['username']}_orange_transparent.png"
        img_card = f"the_giam_khao_0{idx}_{j['username']}.png"
        
        cards_html += f"""
        <div class="bg-white rounded-2xl shadow-lg border border-orange-100 overflow-hidden flex flex-col hover:shadow-xl transition-shadow">
            <div class="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4 text-center">
                <span class="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider mb-1">Ban Giám Khảo #{idx}</span>
                <h3 class="text-xl font-bold">{j['name']}</h3>
                <p class="text-xs text-orange-100">{j['role_desc']}</p>
            </div>
            
            <div class="p-6 flex flex-col items-center flex-1">
                <div class="p-2 border-2 border-dashed border-orange-200 rounded-2xl bg-orange-50/50 mb-4">
                    <img src="{img_orange}" alt="{j['label']}" class="w-56 h-56 object-contain rounded-xl shadow-sm">
                </div>
                
                <div class="w-full bg-slate-50 rounded-xl p-3 text-xs space-y-1.5 mb-4 text-slate-700">
                    <div class="flex justify-between">
                        <span class="text-slate-500">Tài khoản:</span>
                        <code class="font-bold text-orange-600 font-mono">{j['username']}</code>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Mật khẩu:</span>
                        <code class="font-bold font-mono">{TEST_PASSWORD}</code>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Ví Credit:</span>
                        <span class="font-bold text-emerald-600">{j['credit']}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Khu vực:</span>
                        <span class="truncate max-w-[180px]" title="{j['address']}">{j['address']}</span>
                    </div>
                </div>
                
                <div class="w-full space-y-2 mt-auto">
                    <a href="{url}" target="_blank" class="w-full block py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl text-center shadow-md transition-colors">
                        🚀 Mở thử trên Web (Auto-login)
                    </a>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <a href="{img_trans}" download class="py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-center font-medium border border-amber-200">
                            📥 Tải QR Canva
                        </a>
                        <a href="{img_card}" download class="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-center font-medium border border-slate-300">
                            🪪 Tải Thẻ In Ấn
                        </a>
                    </div>
                </div>
            </div>
        </div>
        """

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EduCareLink — Bộ Mã QR Đăng Nhập Ban Giám Khảo</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>body {{ font-family: 'Plus Jakarta Sans', sans-serif; }}</style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen py-10 px-4">
    <div class="max-w-6xl mx-auto space-y-8">
        <!-- Header -->
        <div class="text-center space-y-3">
            <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-100 text-orange-800 rounded-full text-sm font-bold">
                <span>🎓</span> EduCareLink Pitching Kit
            </div>
            <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Bộ 4 Mã QR Đăng Nhập Tự Động Cho Ban Giám Khảo
            </h1>
            <p class="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base">
                Quét mã bằng camera điện thoại để vào thẳng tài khoản Phụ huynh trong 0.5s. 
                Không cần đăng ký, không cần gõ mật khẩu, mỗi giám khảo trải nghiệm trên một tài khoản độc lập.
            </p>
        </div>

        <!-- Canva Quick Asset -->
        <div class="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="space-y-1">
                <span class="px-2.5 py-0.5 bg-orange-600 text-white rounded text-xs font-bold uppercase">Khuyên Dùng Cho Slide</span>
                <h2 class="text-xl font-bold text-orange-950">Ảnh Banner Dải Ngang 4-trong-1 (Slide 4 Canva)</h2>
                <p class="text-sm text-slate-600">Đã căn chỉnh sẵn 4 mã cạnh nhau, kéo thả 1 lần duy nhất vào Canva để thay thế mã cũ trên Slide.</p>
            </div>
            <div class="flex gap-3">
                <a href="banner_4_giam_khao_canva_slide.png" target="_blank" class="px-4 py-2 bg-white text-orange-700 font-semibold rounded-xl border border-orange-300 hover:bg-orange-100 text-sm shadow-sm transition">
                    👁️ Xem Banner
                </a>
                <a href="banner_4_giam_khao_canva_slide.png" download class="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl text-sm shadow-md transition">
                    ⬇️ Tải Banner 1920x720
                </a>
            </div>
        </div>

        <!-- 4 Cards Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards_html}
        </div>

        <!-- Note & Guide -->
        <div class="bg-white rounded-2xl p-6 border border-slate-200 text-sm space-y-3 text-slate-600">
            <h3 class="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>💡</span> Hướng dẫn sử dụng cho buổi Pitching:
            </h3>
            <ul class="list-disc list-inside space-y-1 text-slate-700 pl-2">
                <li><strong>Cách 1 (Khuyên dùng trên Slide):</strong> Tải file <code class="bg-slate-100 px-1.5 py-0.5 rounded text-orange-600">banner_4_giam_khao_canva_slide.png</code> hoặc các file mã QR lẻ có đuôi <code class="bg-slate-100 px-1.5 py-0.5 rounded text-orange-600">_orange_transparent.png</code> (nền trong suốt) để thay thế mã QR ở giữa Slide 4.</li>
                <li><strong>Cách 2 (In ấn bàn Giám khảo):</strong> Tải các file <code class="bg-slate-100 px-1.5 py-0.5 rounded text-orange-600">the_giam_khao_0*.png</code> để in màu kích thước A6 hoặc A5 đặt tại bàn chấm thi của từng vị giám khảo.</li>
                <li><strong>Mật khẩu dự phòng:</strong> Nếu thiết bị của giám khảo quét nhưng không tự đăng nhập do chặn JavaScript, giám khảo có thể gõ trực tiếp tài khoản hiển thị trên thẻ kèm mật khẩu <strong class="text-orange-600">Demo@2026</strong>.</li>
            </ul>
        </div>
        
        <div class="text-center text-xs text-slate-400">
            EduCareLink Backend Monolith • Render Production • Asia/Ho_Chi_Minh
        </div>
    </div>
</body>
</html>
"""
    with open(os.path.join(output_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def generate_readme(output_dir):
    md = f"""# Bộ 4 Mã QR Đăng Nhập Phụ Huynh Cho Ban Giám Khảo

Thư mục này chứa toàn bộ các mã QR tự động đăng nhập dành cho Ban Giám khảo chấm thi pitching sản phẩm **EduCareLink**.

---

## 1. Danh sách 4 Tài khoản Giám khảo

| STT | Tên hiển thị | Username | Mật khẩu dự phòng | Số dư ví Credit | Địa chỉ tại Huế |
|---|---|---|---|---|---|
| **1** | Ban Giám Khảo #1 | `phuhuynh_baolinh` | `Demo@2026` | 1.800.000đ | KĐT An Cựu City |
| **2** | Ban Giám Khảo #2 | `phuhuynh_minhkhoi` | `Demo@2026` | 3.200.000đ | Vincom Plaza Huế |
| **3** | Ban Giám Khảo #3 | `phuhuynh_yenchi` | `Demo@2026` | 1.500.000đ | 15 Lê Lợi |
| **4** | Ban Giám Khảo #4 | `phuhuynh_congvinh` | `Demo@2026` | 900.000đ | CC Xuân Phú |

---

## 2. Các file ảnh trong thư mục

### 🎨 Dành cho Canva Slide (Thay thế mã QR trên Slide 4):
- **`banner_4_giam_khao_canva_slide.png`**: Dải ngang 1920x720 chứa cả 4 mã QR kèm nhãn, kéo thả 1 lần vào Canva là xong.
- **Mã QR đơn lẻ nền trong suốt (Khuyên dùng)**:
  - `01_qr_giám_khảo_1_phuhuynh_baolinh_orange_transparent.png`
  - `02_qr_giám_khảo_2_phuhuynh_minhkhoi_orange_transparent.png`
  - `03_qr_giám_khảo_3_phuhuynh_yenchi_orange_transparent.png`
  - `04_qr_giám_khảo_4_phuhuynh_congvinh_orange_transparent.png`
- **Mã QR đơn lẻ nền trắng**:
  - `01_..._orange.png` đến `04_..._orange.png`
- **Mã QR đen trắng kinh điển** (Độ tương phản cao nhất cho máy chiếu tối):
  - `01_..._black.png` đến `04_..._black.png`

### 🪪 Dành cho In ấn / Đặt bàn Ban Giám khảo:
- `the_giam_khao_01_phuhuynh_baolinh.png`
- `the_giam_khao_02_phuhuynh_minhkhoi.png`
- `the_giam_khao_03_phuhuynh_yenchi.png`
- `the_giam_khao_04_phuhuynh_congvinh.png`

### 🌐 Trình xem và thử nghiệm:
- **`index.html`**: Mở file này bằng trình duyệt Chrome/Edge trên máy tính để xem toàn bộ thẻ và click thử link đăng nhập tự động.

---

## 3. Cách thay thế mã QR trên Canva:
1. Mở slide Canva pitching của bạn.
2. Tại **Slide 4** ("QUÉT MÃ QR - TRẢI NGHIỆM SẢN PHẨM"), xoá mã QR cam hiện tại.
3. Kéo thả file **`banner_4_giam_khao_canva_slide.png`** (nếu muốn cả 4 giám khảo cùng quét) hoặc 1 trong 4 file **`*_orange_transparent.png`** vào vị trí trung tâm.
4. Điều chỉnh kích thước cho cân đối.
"""
    with open(os.path.join(output_dir, "HUONG_DAN_SU_DUNG.md"), "w", encoding="utf-8") as f:
        f.write(md)


if __name__ == '__main__':
    main()
