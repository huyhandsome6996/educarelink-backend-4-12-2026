"""
Google OAuth — Test suite cho đăng nhập bằng Gmail (mobile API + web flow).

Chạy: python manage.py test core.tests_oauth --verbosity=2

Test cases:
  - POST /api/auth/google/:
      + ID token (aud WEB) → 200, tự tạo user Phụ huynh auth_provider=google, trả JWT
      + ID token (aud ANDROID) → 200 (cả 2 client đều hợp lệ)
      + ID token audience lạ → 401
      + access_token (introspect aud OK + userinfo) → 200
      + access_token của app khác (aud lạ) → 401 (chống token-substitution)
      + email đã đăng ký bằng mật khẩu → 409 EMAIL_ALREADY_REGISTERED
      + user google đăng nhập lại → 200, KHÔNG tạo user mới
      + thiếu token → 400; chưa cấu hình → 503
  - GET /api/auth/oauth-config/: enabled, client_id, android_client_id
  - Web flow:
      + GET /accounts/google/login/ → 302 sang Google, state lưu session
      + callback state sai → 302 /login/?error=google_state
      + callback OK (mock exchange + tokeninfo) → tạo user + redirect complete
      + GET /accounts/google/complete/ → 200 render trang
      + GET /api/auth/google/complete/ → trả JWT 1 lần, lần 2 → 401
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core import oauth_views, oauth_web_views

User = get_user_model()

WEB_ID = '54820948365-web.apps.googleusercontent.com'
ANDROID_ID = '54820948365-android.apps.googleusercontent.com'


def google_payload(email='phuhuynh@gmail.com', aud=WEB_ID, **extra):
    base = {
        'aud': aud,
        'email': email,
        'given_name': 'An',
        'family_name': 'Nguyễn',
        'picture': 'https://lh3.googleusercontent.com/pic.jpg',
        'email_verified': 'true',
    }
    base.update(extra)
    return base


def _mock_response(status_code=200, json_data=None):
    resp = mock.Mock()
    resp.status_code = status_code
    resp.json = mock.Mock(return_value=json_data if json_data is not None else {})
    return resp


@mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID', WEB_ID)
@mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID_ANDROID', ANDROID_ID)
class GoogleOAuthAPITests(TestCase):
    """POST /api/auth/google/ — mobile đăng nhập bằng Google."""

    def setUp(self):
        self.client = APIClient()

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_id_token_web_audience_creates_parent(self, mock_get):
        mock_get.return_value = _mock_response(200, google_payload())
        resp = self.client.post('/api/auth/google/', {'token': 'fake-id-token'}, format='json')

        self.assertEqual(resp.status_code, 200)
        user = User.objects.get(email='phuhuynh@gmail.com')
        self.assertEqual(user.role, 'parent')
        self.assertEqual(user.auth_provider, 'google')
        self.assertEqual(user.first_name, 'An')
        self.assertTrue(user.avatar_url)
        self.assertIn('access', resp.data['tokens'])
        self.assertIn('refresh', resp.data['tokens'])
        self.assertEqual(resp.data['role'], 'parent')

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_id_token_android_audience_accepted(self, mock_get):
        """Mobile dùng ANDROID client → ID token aud = android client id."""
        mock_get.return_value = _mock_response(200, google_payload(aud=ANDROID_ID))
        resp = self.client.post('/api/auth/google/', {'token': 'fake-id-token'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.filter(email='phuhuynh@gmail.com').exists())

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_id_token_unknown_audience_rejected(self, mock_get):
        mock_get.return_value = _mock_response(200, google_payload(aud='evil-app.apps.googleusercontent.com'))
        resp = self.client.post('/api/auth/google/', {'token': 'fake-id-token'}, format='json')
        self.assertEqual(resp.status_code, 401)
        self.assertFalse(User.objects.filter(email='phuhuynh@gmail.com').exists())

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_access_token_valid_creates_parent(self, mock_get):
        """access_token path: introspect (aud OK) → userinfo → tạo user."""
        mock_get.side_effect = [
            _mock_response(200, {'aud': WEB_ID, 'email_verified': 'true'}),   # tokeninfo
            _mock_response(200, {                                             # userinfo
                'email': 'phuhuynh2@gmail.com', 'given_name': 'Bình',
                'family_name': 'Trần', 'picture': 'https://pic', 'email_verified': True,
            }),
        ]
        resp = self.client.post('/api/auth/google/', {'access_token': 'fake-access'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.filter(email='phuhuynh2@gmail.com').exists())

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_access_token_foreign_audience_rejected(self, mock_get):
        """Chống token-substitution: access token của app khác → 401."""
        mock_get.return_value = _mock_response(200, {'aud': 'other-app.apps.googleusercontent.com'})
        resp = self.client.post('/api/auth/google/', {'access_token': 'stolen-token'}, format='json')
        self.assertEqual(resp.status_code, 401)

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_email_registered_with_password_conflict(self, mock_get):
        User.objects.create_user(
            username='cu', email='phuhuynh@gmail.com', password='MatKhau@123',
            role='parent', auth_provider='email',
        )
        mock_get.return_value = _mock_response(200, google_payload())
        resp = self.client.post('/api/auth/google/', {'token': 'fake-id-token'}, format='json')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['code'], 'EMAIL_ALREADY_REGISTERED')

    @mock.patch.object(oauth_views.http_requests, 'get')
    def test_google_user_relogin_no_duplicate(self, mock_get):
        User.objects.create_user(
            username='ga', email='phuhuynh@gmail.com', role='parent',
            auth_provider='google',
        )
        mock_get.return_value = _mock_response(200, google_payload())
        resp = self.client.post('/api/auth/google/', {'token': 'fake-id-token'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(User.objects.filter(email='phuhuynh@gmail.com').count(), 1)

    def test_missing_token_400(self):
        resp = self.client.post('/api/auth/google/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_not_configured_503(self):
        with mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID', ''), \
             mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID_ANDROID', ''):
            resp = self.client.post('/api/auth/google/', {'token': 'x'}, format='json')
        self.assertEqual(resp.status_code, 503)


@mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID', WEB_ID)
@mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID_ANDROID', ANDROID_ID)
class OAuthConfigAPITests(TestCase):
    """GET /api/auth/oauth-config/ — frontend nhận client ids."""

    def setUp(self):
        self.client = APIClient()

    def test_config_contains_android_client_id(self):
        resp = self.client.get('/api/auth/oauth-config/')
        self.assertEqual(resp.status_code, 200)
        google = resp.data['google']
        self.assertTrue(google['enabled'])
        self.assertEqual(google['client_id'], WEB_ID)
        self.assertEqual(google['android_client_id'], ANDROID_ID)


@mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID', WEB_ID)
@mock.patch.object(oauth_views, 'GOOGLE_CLIENT_ID_ANDROID', ANDROID_ID)
@mock.patch.object(oauth_web_views, 'GOOGLE_CLIENT_ID', WEB_ID)
class GoogleWebFlowTests(TestCase):
    """Web flow /accounts/google/ — đăng nhập Google trên site Django."""

    def setUp(self):
        self.client = APIClient()

    def test_login_redirects_to_google_with_state(self):
        resp = self.client.get('/accounts/google/login/')
        self.assertEqual(resp.status_code, 302)
        location = resp['Location']
        self.assertIn('accounts.google.com/o/oauth2/v2/auth', location)
        self.assertIn(f'client_id={WEB_ID}', location)
        self.assertIn('response_type=code', location)
        # state phải được lưu session để callback kiểm tra
        self.assertIn('google_oauth_state', self.client.session)

    def test_login_not_configured_redirects_error(self):
        with mock.patch.object(oauth_web_views, 'GOOGLE_CLIENT_ID', ''):
            resp = self.client.get('/accounts/google/login/')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('error=google_not_configured', resp['Location'])

    def _get_state(self):
        self.client.get('/accounts/google/login/')
        return self.client.session['google_oauth_state']

    def test_callback_bad_state_rejected(self):
        resp = self.client.get(
            '/accounts/google/login/callback/',
            {'code': 'abc', 'state': 'wrong-state'},
        )
        self.assertEqual(resp.status_code, 302)
        self.assertIn('error=google_state', resp['Location'])
        self.assertFalse(User.objects.filter(auth_provider='google').exists())

    def test_callback_missing_code_rejected(self):
        state = self._get_state()
        resp = self.client.get('/accounts/google/login/callback/', {'state': state})
        self.assertEqual(resp.status_code, 302)
        self.assertIn('error=google_state', resp['Location'])

    @mock.patch.object(oauth_views.http_requests, 'get')
    @mock.patch.object(oauth_web_views.http_requests, 'post')
    def test_callback_success_creates_user_and_redirects(self, mock_post, mock_vget):
        state = self._get_state()
        mock_post.return_value = _mock_response(200, {
            'access_token': 'at', 'id_token': 'it',
        })
        mock_vget.return_value = _mock_response(200, google_payload())

        resp = self.client.get(
            '/accounts/google/login/callback/',
            {'code': 'auth-code', 'state': state},
        )
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp['Location'], '/accounts/google/complete/')
        self.assertTrue(User.objects.filter(email='phuhuynh@gmail.com').exists())
        self.assertIn('google_complete_uid', self.client.session)

    @mock.patch.object(oauth_views.http_requests, 'get')
    @mock.patch.object(oauth_web_views.http_requests, 'post')
    def test_callback_exchange_failure(self, mock_post, mock_vget):
        state = self._get_state()
        mock_post.return_value = _mock_response(400, {'error': 'invalid_grant'})
        resp = self.client.get(
            '/accounts/google/login/callback/',
            {'code': 'bad-code', 'state': state},
        )
        self.assertEqual(resp.status_code, 302)
        self.assertIn('error=google_exchange', resp['Location'])
        self.assertFalse(User.objects.filter(auth_provider='google').exists())

    def test_complete_page_renders(self):
        resp = self.client.get('/accounts/google/complete/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Đang hoàn tất đăng nhập bằng Google')

    def test_complete_api_returns_tokens_once(self):
        user = User.objects.create_user(
            username='ga', email='web@gmail.com', role='parent',
            auth_provider='google',
        )
        session = self.client.session
        session['google_complete_uid'] = user.pk
        session.save()

        resp = self.client.get('/api/auth/google/complete/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data['tokens'])
        self.assertEqual(resp.data['role'], 'parent')

        # Lần 2 — one-time đã pop → 401
        resp2 = self.client.get('/api/auth/google/complete/')
        self.assertEqual(resp2.status_code, 401)

    def test_complete_api_without_session_401(self):
        resp = self.client.get('/api/auth/google/complete/')
        self.assertEqual(resp.status_code, 401)

    @mock.patch.object(oauth_views.http_requests, 'get')
    @mock.patch.object(oauth_web_views.http_requests, 'post')
    def test_full_flow_same_email_conflict_redirects_error(self, mock_post, mock_vget):
        """Email đã đăng ký bằng mật khẩu → web redirect về login kèm lỗi."""
        User.objects.create_user(
            username='cu', email='phuhuynh@gmail.com', password='MatKhau@123',
            role='parent', auth_provider='email',
        )
        state = self._get_state()
        mock_post.return_value = _mock_response(200, {'id_token': 'it'})
        mock_vget.return_value = _mock_response(200, google_payload())
        resp = self.client.get(
            '/accounts/google/login/callback/',
            {'code': 'code', 'state': state},
        )
        self.assertEqual(resp.status_code, 302)
        self.assertIn('error=google_email_conflict', resp['Location'])
