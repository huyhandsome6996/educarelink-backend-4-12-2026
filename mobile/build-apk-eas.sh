#!/bin/bash
# ============================================================
# EduCareLink - Build APK Script (dùng EAS Build trên đám mây)
# Chạy lệnh: bash build-apk-eas.sh
# ============================================================

set -e

echo "============================================"
echo "  EduCareLink - Build APK bằng EAS Build"
echo "  (Build trên đám mây Expo, miễn phí)"
echo "============================================"
echo ""

# Bước 1: Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Bạn chưa cài Node.js. Vui lòng cài tại: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js: $(node -v)"

# Bước 2: Cài dependencies
echo ""
echo "📦 Đang cài dependencies..."
npm install --legacy-peer-deps

# Bước 3: Cài EAS CLI
if ! command -v eas &> /dev/null; then
    echo ""
    echo "📦 Đang cài EAS CLI..."
    npm install -g eas-cli
fi
echo "✅ EAS CLI: $(eas --version)"

# Bước 4: Đăng nhập
echo ""
echo "🔐 Kiểm tra đăng nhập Expo..."
if ! eas whoami &> /dev/null 2>&1; then
    echo "Bạn chưa đăng nhập Expo. Vui lòng đăng nhập:"
    echo "  + Nếu đã có tài khoản: eas login"
    echo "  + Nếu chưa có tài khoản: eas register"
    echo ""
    eas login
fi
echo "✅ Đã đăng nhập: $(eas whoami)"

# Bước 5: Build APK
echo ""
echo "🚀 Đang build APK trên đám mây Expo..."
echo "   (Quá trình này mất 5-15 phút, build trên server của Expo)"
echo ""
eas build --platform android --profile preview --non-interactive

echo ""
echo "============================================"
echo "  ✅ BUILD HOÀN TẤT!"
echo "============================================"
echo ""
echo "📱 Tải file APK tại:"
echo "   👉 Chạy lệnh: eas build:list"
echo "   👉 Hoặc truy cập: https://expo.dev/accounts/$(eas whoami)/projects/educarelink/builds"
echo ""
echo "📲 Cách cài APK cho ban giám khảo:"
echo "   1. Tải file .apk từ link trên"
echo "   2. Gửi file qua Google Drive / Zalo / USB"
echo "   3. Trên điện thoại Android: Bật 'Cài từ nguồn không xác định'"
echo "      (Settings → Security → Unknown Sources)"
echo "   4. Mở file APK → Cài đặt → Xong!"
echo ""
