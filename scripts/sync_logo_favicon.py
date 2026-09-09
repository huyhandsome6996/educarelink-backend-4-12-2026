#!/usr/bin/env python
"""
Đồng bộ logo + favicon web theo PROMPT_SYNC_WEB_LOGO_ICON.md:
- Nguồn sự thật duy nhất: mobile/assets/logo.png (1024x1024 PNG RGBA — icon CH Play)
- Ghi đè frontend/static/images/logo.png (logo cũ là JPEG 52KB đổi đuôi .png)
- Đồng bộ mobile/assets/images/logo.png (logo nội bộ mobile)
- Tạo favicon-32.png, favicon-16.png (LANCZOS) + favicon.ico đa kích thước
- Nghiệm thu: in kích thước/mode + so md5 nguồn/đích
"""
import hashlib
import os
import shutil

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE)

SRC = os.path.join("mobile", "assets", "logo.png")
WEB = os.path.join("frontend", "static", "images")
MOBILE_IMG = os.path.join("mobile", "assets", "images")


def md5(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def main():
    if not os.path.exists(SRC):
        raise FileNotFoundError(f"Không tìm thấy nguồn: {SRC}")

    img = Image.open(SRC)
    print(f"[nguồn] {SRC}: {img.size} mode={img.mode} format={img.format} "
          f"{os.path.getsize(SRC)} bytes")
    if img.size != (1024, 1024) or img.mode != "RGBA":
        raise ValueError("Nguồn không đúng spec (cần 1024x1024 RGBA)")

    # 1. Ghi đè logo web
    dst_web = os.path.join(WEB, "logo.png")
    shutil.copyfile(SRC, dst_web)
    print(f"[1/5] Đã đồng bộ: {dst_web}")

    # 2. Đồng bộ logo nội bộ mobile
    dst_mb = os.path.join(MOBILE_IMG, "logo.png")
    os.makedirs(MOBILE_IMG, exist_ok=True)
    shutil.copyfile(SRC, dst_mb)
    print(f"[2/5] Đã đồng bộ: {dst_mb}")

    # 3. favicon-32 (LANCZOS)
    fav32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    fav32.save(os.path.join(WEB, "favicon-32.png"), "PNG")
    print("[3/5] Đã tạo favicon-32.png")

    # 4. favicon-16 (LANCZOS)
    fav16 = img.resize((16, 16), Image.Resampling.LANCZOS)
    fav16.save(os.path.join(WEB, "favicon-16.png"), "PNG")
    print("[4/5] Đã tạo favicon-16.png")

    # 5. favicon.ico đa kích thước (16/32/48/64)
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    img.save(os.path.join(WEB, "favicon.ico"), format="ICO", sizes=ico_sizes)
    print("[5/5] Đã tạo favicon.ico (16/32/48/64)")

    # ---------- Nghiệm thu ----------
    print("\n===== NGHIỆM THU =====")
    ok = True
    if md5(SRC) != md5(dst_web):
        print("FAIL: logo web khác nguồn!")
        ok = False
    else:
        print(f"PASS: logo web md5 = nguồn ({md5(dst_web)}) "
              f"~{os.path.getsize(dst_web)} bytes")
    if md5(SRC) != md5(dst_mb):
        print("FAIL: logo mobile nội bộ khác nguồn!")
        ok = False
    else:
        print("PASS: logo mobile nội bộ = nguồn")
    for name, size in [("favicon-32.png", (32, 32)), ("favicon-16.png", (16, 16))]:
        p = os.path.join(WEB, name)
        im = Image.open(p)
        good = im.size == size
        ok = ok and good
        print(f"{'PASS' if good else 'FAIL'}: {name} {im.size} {im.mode}")
    ico = Image.open(os.path.join(WEB, "favicon.ico"))
    print(f"INFO: favicon.ico sizes={getattr(ico, 'info', {}).get('sizes', 'n/a')} "
          f"base={ico.size}")
    print("\n=== ĐỒNG BỘ HOÀN TẤT THÀNH CÔNG! ===" if ok else "\n=== CÓ LỖI ===")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
