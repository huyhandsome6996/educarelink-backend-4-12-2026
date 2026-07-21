"""Helper functions dùng chung cho core/views/ package.

Tách ra file riêng để các view con có thể import mà không bị circular dependency.
"""

"""Auto-generated from core/views.py — tách theo domain (L5 refactor)."""

from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
import os
import logging
import requests
from django.db import models as db_models
from core.models import (User, Task, TaskApplication, ServiceCategory, Review,
                         CredentialSubmission, Notification, ProfileChangeRequest)
from core.serializers import (UserSerializer, TaskSerializer, TaskApplicationSerializer,
                              ServiceCategorySerializer, ReviewSerializer)
logger = logging.getLogger('educarelink.core.views')



def build_absolute_uri(request, url):
    """Tạo URL tuyệt đối, đảm bảo dùng HTTPS trên Render."""
    if not url:
        return None
    abs_url = request.build_absolute_uri(url)
    # Fix: trên Render, request.build_absolute_uri() sinh ra http:// thay vì https://
    if os.environ.get('RENDER', '') or request.is_secure():
        abs_url = abs_url.replace('http://', 'https://', 1)
    return abs_url




def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}



def send_expo_push_notification(token, title, body, data=None):
    """
    Gửi push notification qua Expo.
    Tự động config priority + sound + android_channel_id theo loại alert.

    Loại alert được xác định qua data.type:
    - 'device_offline'    → critical_alerts channel, priority=high, iOS sound=critical
    - 'geofence_exit'     → geofence_alerts channel, priority=high, iOS sound=default
    - 'sos_alert'         → sos_alerts channel, priority=high, iOS sound=default
    - 'geofence_enter'    → recovery_alerts channel, priority=default
    - 'device_recovered'  → recovery_alerts channel, priority=default
    - khác (mặc định)     → default channel, priority=default
    """
    if not token:
        return
    headers = {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
    }
    data = data or {}
    alert_type = data.get('type', '')

    # Mapping alert type → Android channel + iOS config
    ALERT_CONFIG = {
        'device_offline': {
            'android_channel_id': 'critical_alerts',
            'priority': 'high',
            'ios': {'sound': 'critical', 'priority': 'high', 'category': 'CRITICAL_ALERT'},
        },
        'geofence_exit': {
            'android_channel_id': 'geofence_alerts',
            'priority': 'high',
            'ios': {'sound': 'default', 'priority': 'high', 'category': 'GEOFENCE_ALERT'},
        },
        'geofence_warning': {
            'android_channel_id': 'geofence_alerts',
            'priority': 'high',
            'ios': {'sound': 'default', 'priority': 'high', 'category': 'GEOFENCE_WARNING'},
        },
        'sos_alert': {
            'android_channel_id': 'sos_alerts',
            'priority': 'high',
            'ios': {'sound': 'default', 'priority': 'high', 'category': 'SOS_ALERT'},
        },
        'geofence_enter': {
            'android_channel_id': 'recovery_alerts',
            'priority': 'default',
            'ios': {'sound': 'default', 'priority': 'default'},
        },
        'device_recovered': {
            'android_channel_id': 'recovery_alerts',
            'priority': 'default',
            'ios': {'sound': 'default', 'priority': 'default'},
        },
    }

    payload = {
        'to': token,
        'sound': 'default',
        'title': title,
        'body': body,
        'data': data,
    }

    # Apply alert-specific config
    config = ALERT_CONFIG.get(alert_type)
    if config:
        payload['android_channel_id'] = config['android_channel_id']
        payload['priority'] = config['priority']
        payload['ios'] = config['ios']

    try:
        requests.post('https://exp.host/--/api/v2/push/send', headers=headers, json=payload, timeout=5)
    except Exception as e:
        print(f"Lỗi gửi thông báo push: {e}")

# --- PHẦN 1: TÀI KHOẢN (ONBOARDING) ---



def haversine_distance(lat1, lon1, lat2, lon2):
    """Tính khoảng cách giữa 2 điểm trên Trái Đất bằng công thức Haversine (đơn vị: km)"""
    R = 6371  # Bán kính Trái Đất (km)
    dlat = math_module.radians(lat2 - lat1)
    dlon = math_module.radians(lon2 - lon1)
    a = math_module.sin(dlat / 2)**2 + math_module.cos(math_module.radians(lat1)) * math_module.cos(math_module.radians(lat2)) * math_module.sin(dlon / 2)**2
    c = 2 * math_module.asin(math_module.sqrt(a))
    return round(R * c, 2)



def _get_platform_stats():
    """Trích xuất thống kê nền tảng thực tế từ database để làm ngữ cảnh cho AI."""
    from django.utils import timezone
    now = timezone.now()
    today = now.date()
    week_ago = today - __import__('datetime').timedelta(days=7)

    total_users = User.objects.count()
    total_parents = User.objects.filter(role='parent').count()
    total_workers = User.objects.filter(role='worker').count()
    active_workers = User.objects.filter(role='worker', is_active=True, is_approved=True).count()
    pending_workers = User.objects.filter(role='worker', is_approved=False).count()
    banned_users = User.objects.filter(is_active=False).exclude(is_staff=True).count()
    unverified_workers = User.objects.filter(role='worker', is_verified=False, is_approved=True).count()
    new_users_week = User.objects.filter(date_joined__date__gte=week_ago).count()
    total_tasks = Task.objects.count()
    open_tasks = Task.objects.filter(status='open').count()
    in_progress_tasks = Task.objects.filter(status='in_progress').count()
    completed_tasks = Task.objects.filter(status='completed').count()
    cancelled_tasks = Task.objects.filter(status='cancelled').count()
    pending_credentials = CredentialSubmission.objects.filter(status='pending').count()
    pending_profile_changes = ProfileChangeRequest.objects.filter(status='pending').count()
    total_reviews = Review.objects.count()
    avg_rating = Review.objects.aggregate(avg=db_models.Avg('rating'))['avg']

    # Phát hiện bất thường (anomaly)
    anomalies = []

    # 1. Tài khoản không có ảnh CCCD nhưng đã được duyệt
    no_id_approved = User.objects.filter(
        role='worker', is_approved=True
    ).filter(
        db_models.Q(id_card_front='') | db_models.Q(id_card_front__isnull=True)
    ).count()
    if no_id_approved > 0:
        anomalies.append(f"⚠️ {no_id_approved} Carepartner đã duyệt nhưng KHÔNG có ảnh CCCD mặt trước")

    # 2. Tài khoản không có ảnh chân dung
    no_selfie = User.objects.filter(
        role='worker', is_approved=True
    ).filter(
        db_models.Q(selfie_photo='') | db_models.Q(selfie_photo__isnull=True)
    ).count()
    if no_selfie > 0:
        anomalies.append(f"⚠️ {no_selfie} Carepartner đã duyệt nhưng KHÔNG có ảnh chân dung")

    # 3. Tài khoản bị khóa (is_active=False)
    if banned_users > 0:
        banned_list = User.objects.filter(is_active=False).exclude(is_staff=True).values_list('username', flat=True)[:10]
        anomalies.append(f"⚠️ {banned_users} tài khoản đang bị khóa: {', '.join(list(banned_list))}")

    # 4. Nhiều đăng ký mới bất thường (>10 trong tuần)
    if new_users_week > 10:
        anomalies.append(f"⚠️ {new_users_week} người dùng mới trong 7 ngày qua — có thể cần kiểm tra spam")

    # 5. Carepartner đã duyệt nhưng chưa xác thực
    if unverified_workers > 0:
        anomalies.append(f"⚠️ {unverified_workers} Carepartner đã duyệt nhưng chưa xác thực CCCD")

    # 6. Bằng cấp chờ duyệt quá nhiều
    if pending_credentials > 5:
        anomalies.append(f"⚠️ {pending_credentials} bằng cấp đang chờ duyệt — cần xử lý kịp thời")

    # 7. Việc đăng nhưng không ai ứng tuyển
    old_open_tasks = Task.objects.filter(
        status='open',
        created_at__date__lt=week_ago
    ).count()
    if old_open_tasks > 0:
        anomalies.append(f"⚠️ {old_open_tasks} việc đã đăng >7 ngày vẫn chưa có người nhận")

    # 8. Đánh giá 1 sao
    one_star_reviews = Review.objects.filter(rating=1).count()
    if one_star_reviews > 0:
        anomalies.append(f"⚠️ {one_star_reviews} đánh giá 1 sao — cần kiểm tra chất lượng Carepartner")

    stats_text = f"""
THỐNG KÊ NỀN TẢNG ({today.strftime('%d/%m/%Y')}):
- Tổng người dùng: {total_users} (Phụ huynh: {total_parents}, Carepartner: {total_workers})
- Carepartner hoạt động: {active_workers} | Chờ duyệt: {pending_workers}
- Tài khoản bị khóa: {banned_users}
- Người dùng mới (7 ngày): {new_users_week}
- Tổng việc: {total_tasks} (Mở: {open_tasks}, Đang làm: {in_progress_tasks}, Xong: {completed_tasks}, Hủy: {cancelled_tasks})
- Bằng cấp chờ duyệt: {pending_credentials}
- Yêu cầu sửa hồ sơ chờ duyệt: {pending_profile_changes}
- Tổng đánh giá: {total_reviews} | Điểm TB: {round(avg_rating, 1) if avg_rating else 'Chưa có'}
"""
    if anomalies:
        stats_text += "\nPHÁT HIỆN BẤT THƯỜNG:\n" + "\n".join(anomalies)
    else:
        stats_text += "\nKhông phát hiện bất thường."

    return stats_text



def _execute_admin_action(command_text):
    """Phân tích lệnh từ admin và thực hiện hành động. Trả về (success, message)."""
    import re
    cmd = command_text.strip().lower()

    # Cấm/khóa tài khoản: "cấm user 5" hoặc "khóa user 5" hoặc "ban user 5"
    ban_match = re.search(r'(cấm|khóa|ban|lock)\s+(user\s+)?(\d+)', cmd)
    if ban_match:
        user_id = int(ban_match.group(3))
        try:
            target = User.objects.get(id=user_id)
            if target.is_staff:
                return False, f"Không thể khóa tài khoản admin (ID: {user_id})"
            if not target.is_active:
                return False, f"Tài khoản {target.username} (ID: {user_id}) đã bị khóa trước đó"
            target.is_active = False
            target.save(update_fields=['is_active'])
            return True, f"✅ Đã khóa tài khoản {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy user ID: {user_id}"

    # Mở khóa: "mở user 5" hoặc "unban user 5" hoặc "unlock user 5"
    unban_match = re.search(r'(mở|mở khóa|unban|unlock|kích hoạt)\s+(user\s+)?(\d+)', cmd)
    if unban_match:
        user_id = int(unban_match.group(3))
        try:
            target = User.objects.get(id=user_id)
            if target.is_active:
                return False, f"Tài khoản {target.username} (ID: {user_id}) đang hoạt động bình thường"
            target.is_active = True
            target.save(update_fields=['is_active'])
            return True, f"✅ Đã mở khóa tài khoản {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy user ID: {user_id}"

    # Duyệt tài khoản: "duyệt user 5" hoặc "approve user 5"
    approve_match = re.search(r'(duyệt|approve|chấp nhận)\s+(user\s+)?(\d+)', cmd)
    if approve_match:
        user_id = int(approve_match.group(3))
        try:
            target = User.objects.get(id=user_id, role='worker')
            if target.is_approved:
                return False, f"Carepartner {target.username} (ID: {user_id}) đã được duyệt trước đó"
            target.is_approved = True
            target.is_active = True
            target.save(update_fields=['is_approved', 'is_active'])
            # Gửi thông báo
            Notification.objects.create(
                recipient=target,
                title='Tài khoản đã được duyệt!',
                message='Chúc mừng! Tài khoản Carepartner của bạn đã được Admin duyệt. Bây giờ bạn có thể ứng tuyển việc.'
            )
            return True, f"✅ Đã duyệt Carepartner {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy Carepartner ID: {user_id}"

    # Từ chối tài khoản: "từ chối user 5" hoặc "reject user 5"
    reject_match = re.search(r'(từ chối|từchối|reject|refuse)\s+(user\s+)?(\d+)', cmd)
    if reject_match:
        user_id = int(reject_match.group(3))
        try:
            target = User.objects.get(id=user_id, role='worker')
            if not target.is_approved and target.is_active:
                return False, f"Carepartner {target.username} (ID: {user_id}) đã bị từ chối trước đó"
            target.is_approved = False
            target.is_active = False
            target.save(update_fields=['is_approved', 'is_active'])
            Notification.objects.create(
                recipient=target,
                title='Tài khoản chưa được duyệt',
                message='Rất tiếc, tài khoản Carepartner của bạn chưa được Admin duyệt. Vui lòng cập nhật hồ sơ và thử lại.'
            )
            return True, f"✅ Đã từ chối Carepartner {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy Carepartner ID: {user_id}"

    return None, None  # Không phải lệnh hành động

