import os
from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse


class SiteAccessGateMiddleware:
    """
    Lớp bảo vệ tạm thời cho toàn bộ giao diện web (frontend) và trang admin,
    yêu cầu nhập một mật khẩu chung trước khi được xem bất kỳ trang nào.

    KHÔNG áp dụng cho '/api/' để không ảnh hưởng tới app mobile (Expo/React Native)
    vốn gọi thẳng vào REST API.

    Mật khẩu lấy từ biến môi trường SITE_GATE_PASSWORD (khuyến nghị set trên Render).
    Nếu không set, sẽ dùng giá trị mặc định bên dưới (chỉ nên dùng tạm cho demo).

    ⚡ CÔNG TẮC MỞ/KHOÁ (2026-08-23 — mở khoá công khai cho nộp sản phẩm):
    Set SITE_GATE_ENABLED=false (hoặc bỏ biến này) → gate TẮT hoàn toàn,
    ai cũng truy cập web trực tiếp không cần mật khẩu.
    Muốn bật lại sau demo: set SITE_GATE_ENABLED=true trên Render.
    Vô hiệu qua env thay vì xoá middleware khỏi MIDDLEWARE list để:
      - Không phá các test đã set session bypass (frontend/tests.py)
      - Bật lại được ngay không cần deploy code
    """

    EXEMPT_PREFIXES = ("/api/", "/static/", "/media/", "/landing/")
    GATE_PATH = "/site-gate/"
    SESSION_KEY = "site_gate_passed"

    def __init__(self, get_response):
        self.get_response = get_response
        self.enabled = (
            os.environ.get("SITE_GATE_ENABLED", "false").lower() == "true"
        )

    def __call__(self, request):
        # Gate đang TẮT → cho qua mọi request (không redirect, không session)
        if not self.enabled:
            return self.get_response(request)

        path = request.path

        if path.startswith(self.EXEMPT_PREFIXES) or path == self.GATE_PATH:
            return self.get_response(request)

        if request.session.get(self.SESSION_KEY):
            return self.get_response(request)

        gate_url = self.GATE_PATH + "?next=" + path
        return redirect(gate_url)

    @staticmethod
    def get_gate_password():
        return os.environ.get("SITE_GATE_PASSWORD", "@Huyhandsome2006")


class NoCacheHTMLMiddleware:
    """
    Buộc trình duyệt luôn kiểm tra bản HTML mới nhất với server trước khi dùng
    bản trong cache (2026-09-15).

    Bối cảnh: sau khi deploy giao diện mới (trường 'Họ và tên' trên form khảo
    sát), người dùng vẫn thấy bản HTML CŨ vì tab trình duyệt mở từ trước deploy
    (bấm link anchor #khao-sat chỉ cuộn trang, không reload) hoặc cache heuristic.
    Header 'Cache-Control: no-cache, must-revalidate' trên mọi phản hồi text/html
    đảm bảo sau mỗi lần deploy, lần truy cập kế tiếp luôn nhận bản mới.

    CHỈ áp dụng cho text/html:
      - /api/* (JSON cho app mobile) → không đổi, app mobile tự quản lý cache.
      - static/media (whitenoise đã thêm Cache-Control riêng) → không ghi đè.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        content_type = response.get("Content-Type", "")
        if content_type.split(";")[0].strip() == "text/html":
            response["Cache-Control"] = "no-cache, must-revalidate"
        return response
