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
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
FACEBOOK_APP_ID = os.environ.get('FACEBOOK_APP_ID', '')
FACEBOOK_APP_SECRET = os.environ.get('FACEBOOK_APP_SECRET', '')


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

    # Kiểm tra audience (client_id)
    if payload.get('aud') != GOOGLE_CLIENT_ID:
        logger.warning(f"[Google OAuth] Audience mismatch: {payload.get('aud')}")
        return None

    return payload


def _verify_google_access_token(access_token):
    """Xác thực Google access token qua userinfo endpoint. Trả về payload hoặc None."""
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

        if not GOOGLE_CLIENT_ID:
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

            email = payload.get('email', '')
            given_name = payload.get('given_name', '')
            family_name = payload.get('family_name', '')
            picture = payload.get('picture', '')
            email_verified = payload.get('email_verified', False)

            if not email:
                return Response(
                    {'error': 'Không lấy được email từ tài khoản Google.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        except http_requests.RequestException as e:
            logger.error(f"[Google OAuth] Request error: {e}")
            return Response(
                {'error': 'Không thể xác thực với Google. Vui lòng thử lại.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        # Tìm user theo email
        existing_user = User.objects.filter(email=email).first()

        if existing_user:
            if existing_user.auth_provider == 'google':
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

            elif existing_user.auth_provider == 'facebook':
                return Response(
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
        return _create_jwt_response(new_user)


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
                'enabled': bool(GOOGLE_CLIENT_ID),
                'client_id': GOOGLE_CLIENT_ID,
            },
            'facebook': {
                'enabled': bool(FACEBOOK_APP_ID),
                'app_id': FACEBOOK_APP_ID,
            },
        })


class UpgradeToCarepartnerAPIView(APIView):
    """
    Phụ huynh (tạo từ Social Auth) nộp hồ sơ để nâng cấp thành Carepartner.
    Phải cung cấp: CCCD mặt trước, CCCD mặt sau, ảnh chân dung.
    Sau khi nộp → chờ Admin duyệt (giống đăng ký Carepartner bình thường).

    Lưu ý: Role vẫn là 'parent' cho đến khi Admin duyệt, nên phụ huynh
    vẫn sử dụng được các chức năng phụ huynh bình thường trong lúc chờ.

    POST /api/auth/upgrade-carepartner/
    Body (multipart/form-data):
      - id_card_front: ảnh CCCD mặt trước (bắt buộc)
      - id_card_back: ảnh CCCD mặt sau (bắt buộc)
      - selfie_photo: ảnh chân dung (bắt buộc)
      - certificate_photo: ảnh bằng cấp (tùy chọn)
      - phone_number: số điện thoại (bắt buộc)
      - address: địa chỉ (bắt buộc)
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        from .models import CredentialSubmission, Notification

        user = request.user

        # Chỉ phụ huynh mới được nâng cấp
        if user.role != 'parent':
            return Response(
                {'error': 'Chỉ tài khoản Phụ huynh mới có thể nâng cấp thành Carepartner.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Kiểm tra đã nộp hồ sơ chưa (còn pending)
        pending_submission = CredentialSubmission.objects.filter(
            worker=user, status='pending'
        ).first()
        if pending_submission:
            return Response(
                {'error': 'Bạn đã nộp hồ sơ nâng cấp và đang chờ Admin duyệt. Vui lòng đợi.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate các trường bắt buộc
        id_card_front = request.FILES.get('id_card_front')
        id_card_back = request.FILES.get('id_card_back')
        selfie_photo = request.FILES.get('selfie_photo')
        phone_number = request.data.get('phone_number', '').strip()
        address = request.data.get('address', '').strip()

        errors = []
        if not id_card_front:
            errors.append('Vui lòng tải lên ảnh mặt trước CCCD.')
        if not id_card_back:
            errors.append('Vui lòng tải lên ảnh mặt sau CCCD.')
        if not selfie_photo:
            errors.append('Vui lòng tải lên ảnh chân dung.')
        if not phone_number:
            errors.append('Vui lòng nhập số điện thoại.')
        if not address:
            errors.append('Vui lòng nhập địa chỉ.')

        if errors:
            return Response({'error': ' '.join(errors)}, status=status.HTTP_400_BAD_REQUEST)

        # Cập nhật hồ sơ user (lưu CCCD + chân dung)
        user.id_card_front = id_card_front
        user.id_card_back = id_card_back
        user.selfie_photo = selfie_photo
        user.phone_number = phone_number
        user.address = address

        # Bằng cấp (optional)
        certificate_photo = request.FILES.get('certificate_photo')
        if certificate_photo:
            user.certificate_photo = certificate_photo

        user.save()

        # Tạo CredentialSubmission để Admin duyệt
        CredentialSubmission.objects.create(
            worker=user,
            certificate_photo=certificate_photo,
            description=f'[NÂNG CẤP] Phụ huynh đăng ký qua {user.get_auth_provider_display()} muốn trở thành Carepartner. SĐT: {phone_number}',
            status='pending',
        )

        # Gửi thông báo cho tất cả admin
        admin_users = User.objects.filter(is_staff=True)
        for admin in admin_users:
            Notification.objects.create(
                recipient=admin,
                title='Yêu cầu nâng cấp Carepartner',
                message=f'Phụ huynh {user.username} (đăng ký qua {user.get_auth_provider_display()}) muốn nâng cấp thành Carepartner. Vui lòng kiểm tra và duyệt hồ sơ.',
            )

        logger.info(f"[Upgrade] Parent {user.username} requested Carepartner upgrade")

        return Response({
            'message': 'Hồ sơ nâng cấp đã được gửi thành công! Vui lòng đợi Admin duyệt.',
            'status': 'pending_approval',
        })


class UpgradeStatusAPIView(APIView):
    """
    Kiểm tra trạng thái yêu cầu nâng cấp lên Carepartner.
    GET /api/auth/upgrade-status/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import CredentialSubmission

        user = request.user
        if user.role != 'parent':
            return Response({'can_upgrade': False, 'reason': 'not_parent'})

        # Kiểm tra có submission nào không
        latest_submission = CredentialSubmission.objects.filter(
            worker=user
        ).order_by('-created_at').first()

        if not latest_submission:
            return Response({
                'can_upgrade': True,
                'status': 'none',
                'message': 'Chưa nộp hồ sơ nâng cấp.',
            })

        if latest_submission.status == 'pending':
            return Response({
                'can_upgrade': False,
                'status': 'pending',
                'message': 'Hồ sơ nâng cấp đang chờ Admin duyệt.',
            })
        elif latest_submission.status == 'rejected':
            return Response({
                'can_upgrade': True,
                'status': 'rejected',
                'message': 'Hồ sơ nâng cấp đã bị từ chối. Bạn có thể nộp lại.',
            })
        elif latest_submission.status == 'approved':
            return Response({
                'can_upgrade': False,
                'status': 'approved',
                'message': 'Hồ sơ đã được duyệt.',
            })

        return Response({'can_upgrade': True, 'status': 'none'})
