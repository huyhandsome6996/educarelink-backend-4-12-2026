import os
from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse


# Từ khoá nhận diện bot/crawler/healthcheck — dùng chung cho tracking visit.
# Giữ bản sao cục bộ (không import từ core.views) để tránh circular import
# lúc Django nạp MIDDLEWARE.
_BOT_UA_KEYWORDS = [
    'bot', 'crawl', 'spider', 'scrape', 'curl', 'wget', 'python-requests',
    'httpclient', 'java/', 'node-fetch', 'axios', 'postmanruntime',
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
    'yandexbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
    # Healthcheck / monitor của Render, UptimeRobot, Ping... (không phải người)
    'healthcheck', 'uptimerobot', 'pingdom', 'betteruptime', 'monitoring',
    'headlesschrome', 'phantomjs', 'lighthouse', 'google page speed',
]


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


class SiteVisitTrackingMiddleware:
    """Đếm lượt truy cập TOÀN BỘ website — không chỉ landing page (2026-09-16).

    Bối cảnh: trước đây chỉ trang /landing/ tự gọi beacon JS để đếm visit,
    nên số "Lượt truy cập" trên dashboard bỏ sót người truy cập trực tiếp
    /login/, /register/, /dang-viec/… Yêu cầu của Huy: đếm MỌI NGƯỜI vào web,
    và KHÔNG hiển thị IP trên dashboard (IP vẫn lưu nội bộ để hệ thống
    hiểu ngầm, chống spam — chỉ là không show ra ngoài).

    Quy tắc đếm (giữ số liệu thật, không ảo):
      - Chỉ đếm response HTML 200 của request GET — API JSON, static, media,
        redirect, lỗi 4xx/5xx đều không đếm.
      - 1 session × 1 ngày = 1 lượt (người quay lại ngày hôm sau được tính
        1 lượt mới — giống cách GA4 đếm session theo ngày).
      - Bỏ qua bot/crawler/healthcheck (user-agent) và thiếu Accept: text/html
        (ping máy chủ không bao giờ xin HTML như trình duyệt thật).
      - Bỏ qua admin/staff (không đếm chính người quản trị duyệt web).
      - Chống spam: tối đa 1 lượt / 30 giây / IP (giữ logic cũ của beacon).
    """

    # Trang nội bộ của quản trị — không tính là "khách truy cập web"
    SKIP_PREFIXES = ("/admin-dashboard/", "/admin/", "/api/", "/static/",
                     "/media/", "/service-worker.js")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._track(request, response)
        except Exception:
            # Tracking tuyệt đối không được làm hỏng response của người dùng
            pass
        return response

    def _track(self, request, response):
        if request.method != "GET" or response.status_code != 200:
            return
        content_type = response.get("Content-Type", "").split(";")[0].strip()
        if content_type != "text/html":
            return

        path = request.path
        for prefix in self.SKIP_PREFIXES:
            if path.startswith(prefix):
                return

        # Healthcheck/máy chủ ping thường không xin text/html; trình duyệt
        # thật LUÔN gửi Accept chứa text/html khi mở trang web.
        accept = request.META.get("HTTP_ACCEPT", "")
        if "text/html" not in accept:
            return

        ua = request.META.get("HTTP_USER_AGENT", "")
        if not ua:
            return
        ua_lower = ua.lower()
        for kw in _BOT_UA_KEYWORDS:
            if kw in ua_lower:
                return

        # Không đếm chính quản trị viên (staff) duyệt web
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False) \
                and getattr(user, "is_staff", False):
            return

        from django.utils import timezone

        session = getattr(request, "session", None)
        if session is None:
            return
        if not session.session_key:
            session.create()  # tạo session cho khách mới (cookie sẽ được set)
        session_key = session.session_key or ""
        if not session_key:
            return

        # Dedup: 1 session × 1 ngày chỉ ghi 1 lần
        day_tag = timezone.localdate().strftime("%Y%m%d")
        dedup_sid = f"{session_key}:{day_tag}"[:64]  # giới hạn max_length=64

        from core.models import LandingPageVisit
        if LandingPageVisit.objects.filter(session_id=dedup_sid).exists():
            return

        # Rate-limit per IP: tối đa 1 lượt / 30 giây (chống inflate — như cũ)
        ip = self._get_client_ip(request)
        if ip:
            cutoff = timezone.now() - timezone.timedelta(seconds=30)
            recent = LandingPageVisit.objects.filter(
                ip_address=ip, visited_at__gte=cutoff
            ).exists()
            if recent:
                return

        LandingPageVisit.objects.create(
            session_id=dedup_sid,
            ip_address=ip,
            user_agent=ua[:500],
            referrer=(request.META.get("HTTP_REFERER") or "")[:500],
        )

    @staticmethod
    def _get_client_ip(request):
        """IP thật của client qua proxy (Render đặt X-Forwarded-For)."""
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR") or None
