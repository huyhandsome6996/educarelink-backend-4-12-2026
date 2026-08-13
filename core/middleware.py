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
    """

    EXEMPT_PREFIXES = ("/api/", "/static/", "/media/")
    GATE_PATH = "/site-gate/"
    SESSION_KEY = "site_gate_passed"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
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
