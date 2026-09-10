"""
Script tu dong dong bo Logo Icon va sinh bo Favicon cho EduCareLink Web.
Nguon chuan: mobile/assets/logo.png (1024x1024 PNG RGBA)
Dich: frontend/static/images/ (logo.png, favicon-32.png, favicon-16.png, favicon.ico)
"""
import os
import sys
import shutil
from PIL import Image

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_logo = os.path.join(root_dir, 'mobile', 'assets', 'logo.png')
    web_img_dir = os.path.join(root_dir, 'frontend', 'static', 'images')
    mobile_img_dir = os.path.join(root_dir, 'mobile', 'assets', 'images')

    if not os.path.exists(src_logo):
        print(f"ERROR: Khong tim thay file nguon: {src_logo}")
        sys.exit(1)

    os.makedirs(web_img_dir, exist_ok=True)
    os.makedirs(mobile_img_dir, exist_ok=True)

    print(f"[1/5] Dang doc file nguon: {src_logo}")
    img = Image.open(src_logo)
    print(f"      Kich thuoc: {img.size}, Dinh dang: {img.format}, Mode: {img.mode}")

    # 1. Ghi de frontend/static/images/logo.png (1024x1024 RGBA)
    dst_web_logo = os.path.join(web_img_dir, 'logo.png')
    shutil.copyfile(src_logo, dst_web_logo)
    print(f"[2/5] Da dong bo logo web: {dst_web_logo}")

    # 2. Dong bo file logo trong mobile/assets/images/logo.png neu co
    dst_mobile_logo = os.path.join(mobile_img_dir, 'logo.png')
    shutil.copyfile(src_logo, dst_mobile_logo)
    print(f"[3/5] Da dong bo logo mobile phu: {dst_mobile_logo}")

    # 3. Tao favicon-32.png va favicon-16.png
    fav32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    fav32.save(os.path.join(web_img_dir, 'favicon-32.png'), 'PNG')
    print(f"[4/5] Da tao favicon-32.png (32x32)")

    fav16 = img.resize((16, 16), Image.Resampling.LANCZOS)
    fav16.save(os.path.join(web_img_dir, 'favicon-16.png'), 'PNG')
    print(f"      Da tao favicon-16.png (16x16)")

    # 4. Tao favicon.ico da kich thuoc (16, 32, 48, 64)
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    img.save(os.path.join(web_img_dir, 'favicon.ico'), format='ICO', sizes=ico_sizes)
    print(f"[5/5] Da tao favicon.ico da kich thuoc (16, 32, 48, 64)")

    print("\n==============================================")
    print(">>> DONG BO LOGO ICON VA FAVICON HOAN TAT THANH CONG!")
    print("==============================================")

if __name__ == '__main__':
    main()
