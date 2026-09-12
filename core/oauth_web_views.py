"""
╔══════════════════════════════════════════════════════════════════════╗
║  EduCareLink — Đăng nhập Google cho WEB (Django templates)           ║
║                                                                      ║
║  OAuth2 Authorization Code flow (server-side, dùng client_secret):  ║
║   1. GET /accounts/google/login/          → redirect sang Google     ║
║   2. GET /accounts/google/login/callback/ → Google quay về đây       ║
║      (redirect_uri KHỚP ĐÚNG URI đã đăng ký trong Google Console)    ║
║   3. Đổi code lấy token (server), xác minh ID token,                 ║
║      tìm/tạo user Phụ huynh (dùng chung logic với mobile API)        ║
║   4. Lưu user pk vào session (one-time) → redirect trang hoàn tất    ║
║   5. Trang hoàn tất JS gọi /api/auth/google/complete/ đổi JWT        ║
║      → lưu localStorage đúng pattern login.html → vào app            ║
║                                                                      ║
║  Không thêm dependency mới (requests có sẵn). Không đụng flow mobile.║
╚══════════════════════════════════════════════════════════════════════╝
"""

import logging
import secrets

import requests as http_requests
from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.shortcuts import redirect, render
from django.views import View

from .oauth_views import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    _get_or_create_google_user,
    _verify_google_id_token,
)

logger = logging.getLogger('educarelink.oauth')

User = get_user_model()

GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
LOGIN_URL = '/login/'


def _login_error_url(message_key):
    """Về trang login kèm tham số lỗi — login.html đọc ?error= để hiện toast."""
    return f"{LOGIN_URL}?error={message_key}"


class GoogleWebLoginView(View):
    """GET /accounts/google/login/ — chuyển user sang trang đồng ý của Google."""

    def get(self, request):
        if not GOOGLE_CLIENT_ID:
            return redirect(_login_error_url('google_not_configured'))

        state = secrets.token_urlsafe(24)
        request.session['google_oauth_state'] = state

        redirect_uri = request.build_absolute_uri('/accounts/google/login/callback/')
        params = {
            'client_id': GOOGLE_CLIENT_ID,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'scope': 'openid email profile',
            'state': state,
            'access_type': 'online',
            'prompt': 'select_account',
        }
        url = http_requests.Request('GET', GOOGLE_AUTH_ENDPOINT, params=params).prepare().url
        return HttpResponseRedirect(url)


class GoogleWebCallbackView(View):
    """GET /accounts/google/login/callback/ — Google redirect về đây với ?code=&state=."""

    def get(self, request):
        # 1) Google trả lỗi (user từ chối đồng ý, client bị khóa...)
        if request.GET.get('error'):
            logger.warning(f"[Google Web] Consent error: {request.GET.get('error')}")
            return redirect(_login_error_url('google_denied'))

        code = request.GET.get('code')
        state = request.GET.get('state')
        expected_state = request.session.pop('google_oauth_state', None)

        # 2) Chống CSRF: state phải khớp cái đã lưu trước khi redirect
        if not code or not state or not expected_state or state != expected_state:
            logger.warning("[Google Web] State mismatch hoặc thiếu code")
            return redirect(_login_error_url('google_state'))

        # 3) Đổi code lấy token (server-side, có client_secret)
        redirect_uri = request.build_absolute_uri('/accounts/google/login/callback/')
        try:
            token_resp = http_requests.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    'code': code,
                    'client_id': GOOGLE_CLIENT_ID,
                    'client_secret': GOOGLE_CLIENT_SECRET,
                    'redirect_uri': redirect_uri,
                    'grant_type': 'authorization_code',
                },
                timeout=10,
            )
            if token_resp.status_code != 200:
                logger.warning(f"[Google Web] Token exchange failed: {token_resp.status_code}")
                return redirect(_login_error_url('google_exchange'))
            tokens = token_resp.json()
        except http_requests.RequestException as e:
            logger.error(f"[Google Web] Token exchange error: {e}")
            return redirect(_login_error_url('google_exchange'))

        # 4) Xác minh ID token (aud = WEB client, email verified)
        id_token = tokens.get('id_token', '')
        payload = _verify_google_id_token(id_token) if id_token else None
        if payload is None:
            return redirect(_login_error_url('google_invalid'))

        # 5) Tìm/tạo user — dùng chung logic với mobile API (cùng 409 conflict...)
        user, error_response = _get_or_create_google_user(payload)
        if error_response is not None:
            error_code = getattr(error_response, 'data', {}).get('code', '')
            if error_code == 'EMAIL_LINKED_FACEBOOK':
                return redirect(_login_error_url('google_email_facebook'))
            return redirect(_login_error_url('google_email_conflict'))

        # 6) Lưu one-time vào session → trang hoàn tất đổi lấy JWT
        request.session['google_complete_uid'] = user.pk
        return redirect('/accounts/google/complete/')


class GoogleWebCompletePageView(View):
    """GET /accounts/google/complete/ — trang JS đổi session thành JWT localStorage."""

    template_name = 'frontend/google_complete.html'

    def get(self, request):
        return render(request, self.template_name)
