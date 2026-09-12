"""
╔══════════════════════════════════════════════════════════════╗
║     EduCareLink Social OAuth — Google & Facebook             ║
║     Chỉ cho Phụ huynh đăng nhập/đăng ký qua Social          ║
║                                                              ║
║  Flow:                                                       ║
║  1. Frontend gửi OAuth token (Google ID token / FB token)    ║
║  2. Backend xác thực token với Google/Facebook API           ║
║  3. Nếu user tồn tại → login (trả JWT)                      ║
║  4. Nếu chưa → tạo tài khoản Phụ huynh → trả JWT            ║
║  5. Phụ huynh muốn thành CP → nộp hồ sơ + đợi Admin duyệt  ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import logging
import requests as http_requests
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.utils import timezone

logger = logging.getLogger('educarelink.oauth')

User = get_user_model()

# Cấu hình từ env
# WEB client: dùng cho web (redirect https://educarelink-backend.onrender.com/accounts/google/login/callback/)
#   + làm audience mặc định cho ID token mobile.
# ANDROID client: client loại "Android" (package com.educarelink.app + SHA-1 signing)
#   — client Android KHÔNG có client_secret, redirect scheme riêng
#   com.googleusercontent.apps.<id>:/oauthredirect. Mobile expo-auth-session dùng id này.
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
GOOGLE_CLIENT_ID_ANDROID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID_ANDROID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '')
FACEBOOK_APP_ID = os.environ.get('FACEBOOK_APP_ID', '')
FACEBOOK_APP_SECRET = os.environ.get('FACEBOOK_APP_SECRET', '')


def _google_allowed_audiences():
    """Tập client_id hợp lệ làm audience của ID token Google (web + android)."""
    return {cid for cid in (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_ID_ANDROID) if cid}


def _generate_username(base):
    """Tạo username duy nhất từ email prefix."""
    prefix = base.split('@')[0] if '@' in base else base
    prefix = ''.join(c for c in prefix if c.isalnum() or c == '_')[:20]
    if not prefix:
        prefix = 'user'

    username = prefix
    counter = 1
    while User.objects.filter(username=username).exists():
        username = f"{prefix}_{counter}"
        counter += 1
    return username


def _create_jwt_response(user):
    """Tạo response với JWT tokens cho user."""
    refresh = RefreshToken.for_user(user)
    return Response({
        'tokens': {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        },
        'role': user.role,
        'is_staff': user.is_staff,
        'first_login': user.first_login,
        'username': user.username,
        'auth_provider': user.auth_provider,
        'avatar_url': user.avatar_url or '',
    })


def _verify_google_id_token(token):
    """Xác thực Google ID token qua tokeninfo endpoint. Trả về payload hoặc None."""
    resp = http_requests.get(
        f'https://oauth2.googleapis.com/tokeninfo?id_token={token}',
        timeout=10
    )
    if resp.status_code != 200:
        logger.warning(f"[Google OAuth] ID token verification failed: {resp.status_code}")
        return None

    payload = resp.json()

    # Kiểm tra audience — chấp nhận cả WEB client lẫn ANDROID client của dự án
    if payload.get('aud') not in _google_allowed_audiences():
        logger.warning(f"[Google OAuth] Audience mismatch: {payload.get('aud')}")
        return None

    return payload


def _verify_google_access_token(access_token):
    """Xác thực Google access token qua userinfo endpoint. Trả về payload hoặc None.

    Chống token-substitution (kẻ xấu đem access token của app KHÁC đến đây):
    introspect token qua tokeninfo và bắt buộc audience phải thuộc dự án.
    """
    introspect = http_requests.get(
        f'https://oauth2.googleapis.com/tokeninfo?access_token={access_token}',
        timeout=10
    )
    if introspect.status_code != 200:
        logger.warning("[Google OAuth] Access token introspection failed")
        return None
    info = introspect.json()
    if info.get('aud') not in _google_allowed_audiences():
        logger.warning(f"[Google OAuth] Access token audience mismatch: {info.get('aud')}")
        return None

    resp = http_requests.get(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=10
    )
    if resp.status_code != 200:
        logger.warning(f"[Google OAuth] Access token verification failed: {resp.status_code}")
        return None

    data = resp.json()
    # Chuyển đổi format cho đồng nhất với ID token payload
    return {
        'email': data.get('email', ''),
        'given_name': data.get('given_name', data.get('name', '').split(' ')[0] if data.get('name') else ''),
        'family_name': data.get('family_name', ''),
        'picture': data.get('picture', ''),
        'email_verified': data.get('email_verified', False),
    }


def _get_or_create_google_user(payload):
    """Logic dùng chung (API mobile + web flow): tìm/tạo user từ payload Google.

    Trả về (user, None) nếu thành công, hoặc (None, Response lỗi 4xx).
    Đảm bảo web và mobile hành vi GIỐNG NHAU tuyệt đối với cùng 1 email.
    """
    email = payload.get('email', '')
    given_name = payload.get('given_name', '')
    family_name = payload.get('family_name', '')
    picture = payload.get('picture', '')
    # tokeninfo trả "true"/"false" dạng CHUỖI, userinfo trả boolean —
    # coerce về bool thật để không làm crash BooleanField is_verified
    email_verified = payload.get('email_verified', False) in (True, 'true', 'True', 1, '1')

    if not email:
        return None, Response(
            {'error': 'Không lấy được email từ tài khoản Google.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tìm user theo email
    existing_user = User.objects.filter(email=email).first()

    if existing_user:
        if existing_user.auth_provider == 'google':
            if picture and not existing_user.avatar_url:
                existing_user.avatar_url = picture
                existing_user.save(update_fields=['avatar_url'])
            return existing_user, None

        elif existing_user.auth_provider == 'email':
            return None, Response(
                {
                    'error': f'Email {email} đã được đăng ký bằng mật khẩu. Vui lòng đăng nhập bằng email và mật khẩu.',
                    'code': 'EMAIL_ALREADY_REGISTERED'
                },
                status=status.HTTP_409_CONFLICT
            )

        elif existing_user.auth_provider == 'facebook':
            return None, Response(
                {
                    'error': f'Email {email} đã được liên kết với tài khoản Facebook. Vui lòng đăng nhập bằng Facebook.',
                    'code': 'EMAIL_LINKED_FACEBOOK'
                },
                status=status.HTTP_409_CONFLICT
            )

    # Tạo tài khoản Phụ huynh mới
    username = _generate_username(email)
    new_user = User.objects.create_user(
        username=username,
        email=email,
        first_name=given_name[:30] if given_name else '',
        last_name=family_name[:30] if family_name else '',
        role='parent',
        auth_provider='google',
        avatar_url=picture or '',
        is_verified=email_verified,
    )
    new_user.set_unusable_password()
    new_user.save()

    logger.info(f"[Google OAuth] New parent created: {username} ({email})")
    return new_user, None


class GoogleOAuthAPIView(APIView):
    """
    Đăng nhập/Đăng ký bằng Google.
    Frontend gửi Google ID token hoặc access token → Backend xác thực → Trả JWT.

    POST /api/auth/google/
    Body: { "token": "google_id_token" }  (One Tap / prompt)
          { "access_token": "google_access_token" }  (popup fallback)
    """
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('token')
        access_token = request.data.get('access_token')

        if not token and not access_token:
            return Response(
                {'error': 'Thiếu Google token. Vui lòng thử lại.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not GOOGLE_CLIENT_ID and not GOOGLE_CLIENT_ID_ANDROID:
            return Response(
                {'error': 'Đăng nhập Google chưa được cấu hình trên server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        # Xác thực token - thử ID token trước, rồi access token
        payload = None
        try:
            if token:
                payload = _verify_google_id_token(token)

            if payload is None and access_token:
                payload = _verify_google_access_token(access_token)

            if payload is None:
                return Response(
                    {'error': 'Token Google không hợp lệ hoặc đã hết hạn.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

        except http_requests.RequestException as e:
            logger.error(f"[Google OAuth] Request error: {e}")
            return Response(
                {'error': 'Không thể xác thực với Google. Vui lòng thử lại.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        user, error_response = _get_or_create_google_user(payload)
        if error_response is not None:
            return error_response
        return _create_jwt_response(user)


class FacebookOAuthAPIView(APIView):
    """
    Đăng nhập/Đăng ký bằng Facebook.
    Frontend gửi Facebook access token → Backend xác thực → Trả JWT.

    POST /api/auth/facebook/
    Body: { "access_token": "facebook_access_token_here" }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        access_token = request.data.get('access_token')
        if not access_token:
            return Response(
                {'error': 'Thiếu Facebook access token. Vui lòng thử lại.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not FACEBOOK_APP_ID or not FACEBOOK_APP_SECRET:
            return Response(
                {'error': 'Đăng nhập Facebook chưa được cấu hình trên server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        try:
            debug_resp = http_requests.get(
                f'https://graph.facebook.com/debug_token',
                params={
                    'input_token': access_token,
                    'access_token': f'{FACEBOOK_APP_ID}|{FACEBOOK_APP_SECRET}'
                },
                timeout=10
            )
            debug_data = debug_resp.json()

            if not debug_data.get('data', {}).get('is_valid', False):
                logger.warning(f"[Facebook OAuth] Invalid token: {debug_data}")
                return Response(
                    {'error': 'Token Facebook không hợp lệ hoặc đã hết hạn.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            app_id = debug_data['data'].get('app_id', '')
            if app_id != FACEBOOK_APP_ID:
                logger.warning(f"[Facebook OAuth] App ID mismatch: {app_id}")
                return Response(
                    {'error': 'Token Facebook không thuộc ứng dụng này.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            user_resp = http_requests.get(
                f'https://graph.facebook.com/me',
                params={
                    'fields': 'id,email,first_name,last_name,picture.width(200).height(200)',
                    'access_token': access_token,
                },
                timeout=10
            )
            user_data = user_resp.json()

            if 'error' in user_data:
                logger.warning(f"[Facebook OAuth] Graph API error: {user_data['error']}")
                return Response(
                    {'error': 'Không thể lấy thông tin từ Facebook.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            fb_id = user_data.get('id', '')
            email = user_data.get('email', '')
            first_name = user_data.get('first_name', '')
            last_name = user_data.get('last_name', '')
            picture = user_data.get('picture', {}).get('data', {}).get('url', '')

            if not email:
                return Response(
                    {'error': 'Tài khoản Facebook chưa xác minh email. Vui lòng thêm email vào Facebook và thử lại.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        except http_requests.RequestException as e:
            logger.error(f"[Facebook OAuth] Request error: {e}")
            return Response(
                {'error': 'Không thể xác thực với Facebook. Vui lòng thử lại.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        existing_user = User.objects.filter(email=email).first()

        if existing_user:
            if existing_user.auth_provider == 'facebook':
                if picture and not existing_user.avatar_url:
                    existing_user.avatar_url = picture
                    existing_user.save(update_fields=['avatar_url'])
                return _create_jwt_response(existing_user)

            elif existing_user.auth_provider == 'email':
                return Response(
                    {
                        'error': f'Email {email} đã được đăng ký bằng mật khẩu. Vui lòng đăng nhập bằng email và mật khẩu.',
                        'code': 'EMAIL_ALREADY_REGISTERED'
                    },
                    status=status.HTTP_409_CONFLICT
                )

            elif existing_user.auth_provider == 'google':
                return Response(
                    {
                        'error': f'Email {email} đã được liên kết với tài khoản Google. Vui lòng đăng nhập bằng Google.',
                        'code': 'EMAIL_LINKED_GOOGLE'
                    },
                    status=status.HTTP_409_CONFLICT
                )

        username = _generate_username(email or f'fb_{fb_id}')
        new_user = User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name[:30] if first_name else '',
            last_name=last_name[:30] if last_name else '',
            role='parent',
            auth_provider='facebook',
            avatar_url=picture or '',
        )
        new_user.set_unusable_password()
        new_user.save()

        logger.info(f"[Facebook OAuth] New parent created: {username} ({email})")
        return _create_jwt_response(new_user)


class OAuthConfigAPIView(APIView):
    """
    Trả về cấu hình OAuth cho frontend (client IDs, trạng thái bật/tắt).
    GET /api/auth/oauth-config/
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            'google': {
                'enabled': bool(GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID_ANDROID),
                'client_id': GOOGLE_CLIENT_ID,
                # Client loại Android (native sign-in flow cho app mobile) —
                # client web KHÔNG dùng được cho redirect scheme của app Android.
                'android_client_id': GOOGLE_CLIENT_ID_ANDROID,
            },
            'facebook': {
                'enabled': bool(FACEBOOK_APP_ID),
                'app_id': FACEBOOK_APP_ID,
            },
        })


class GoogleCompleteAPIView(APIView):
    """
    Đổi one-time code (lưu trong session sau web callback) lấy JWT cho web frontend.
    GET /api/auth/google/complete/ — dùng 1 lần, session không có code → 401.

    Response GIỐNG HỆT shape /api/auth/login/ để trang google_complete.html
    tái dùng đúng pattern localStorage của login.html.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        user_id = request.session.pop('google_complete_uid', None)
        if not user_id:
            return Response(
                {'error': 'Phiên đăng nhập Google không hợp lệ hoặc đã được dùng.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        user = User.objects.filter(pk=user_id, auth_provider='google').first()
        if not user:
            return Response(
                {'error': 'Không tìm thấy tài khoản Google tương ứng.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        request.session.modified = True
        return _create_jwt_response(user)
