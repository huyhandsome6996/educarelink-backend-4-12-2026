"""
Django settings for backend project.
"""

from pathlib import Path
import os
from datetime import timedelta
from dotenv import load_dotenv
import dj_database_url

# Tải biến môi trường từ file .env (chỉ khi không chạy trên Render)
if os.environ.get('RENDER', '') != 'true':
    load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-fallback-for-dev-only'
    else:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured("SECRET_KEY environment variable must be set in production.")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'educarelink-backend.onrender.com,localhost,127.0.0.1').split(',')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # --- CÁC THƯ VIỆN CÀI THÊM ---
    'rest_framework',
    'rest_framework_simplejwt', # Thêm thư viện JWT cho Mobile App
    'rest_framework_simplejwt.token_blacklist', # Hỗ trợ blacklist refresh token cũ
    'corsheaders',
    
    # --- APP CỦA CHÚNG TA ---
    'core',
    'frontend',
    'payments',  # Module thanh toán MoMo + Escrow + Commission 20%
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware', 
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls' # Lưu ý: folder gốc của bạn tên là backend

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'

# --- CẤU HÌNH DATABASE ---
# Ưu tiên DATABASE_URL từ biến môi trường (PostgreSQL trên Neon/Render/Supabase)
# Nếu không có → fallback về SQLite cho development local
# Neon:   postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
# Supabase: postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
DATABASE_URL = os.environ.get('DATABASE_URL', '')

if DATABASE_URL and DATABASE_URL.startswith('postgres'):
    # Production: PostgreSQL (Neon / Supabase / Render)
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=60,
            conn_health_checks=True,
        )
    }
else:
    if not DEBUG:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured(
            "DATABASE_URL environment variable is required in production. "
            "Set it to your Neon/Render PostgreSQL connection string."
        )
    # Development local: SQLite (không cần cài gì thêm)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',},
]

AUTH_USER_MODEL = 'core.User'

LANGUAGE_CODE = 'vi'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'frontend' / 'static',
]
STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- CẤU HÌNH MEDIA (Upload ảnh CCCD, ảnh chân dung) ---
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'False') == 'True'
CORS_ALLOWED_ORIGINS = [
    'https://educarelink-backend.onrender.com',
    'http://localhost:8000',
]

# --- CẤU HÌNH REST FRAMEWORK & JWT ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication', # Dùng JWT cho API
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated', # Mặc định KHÓA tất cả API, ai gọi phải có Token
    ],
    # KHÔNG dùng phân trang toàn cục — các template JS xử lý response như mảng thẳng
    # Nếu cần phân trang, thêm PaginationClass riêng từng View thay vì toàn cục
}

# Cấu hình thời gian của Token
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),  # Access token sống 60 phút
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,       # Mỗi lần refresh → tạo refresh token mới
    'BLACKLIST_AFTER_ROTATION': True,    # Refresh token cũ bị blacklist sau khi dùng
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',), # Phía Mobile/Web sẽ gửi Header: "Authorization: Bearer <token>"
}

# --- CẤU HÌNH GEMINI AI ---
# Đặt API key trong file .env: GEMINI_API_KEY=your_key_here
# Lấy key miễn phí tại: https://aistudio.google.com/app/apikey
# --- CẤU HÌNH CHO RENDER DEPLOYMENT ---
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

CSRF_TRUSTED_ORIGINS = [
    'https://educarelink-backend.onrender.com',
    'http://localhost:8000',
]

# --- LOGGING ---
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# --- CẤU HÌNH SOCIAL OAUTH ---
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
FACEBOOK_APP_ID = os.environ.get('FACEBOOK_APP_ID', '')
FACEBOOK_APP_SECRET = os.environ.get('FACEBOOK_APP_SECRET', '')

# ───────────────────────────────────────────────────────────────
# CẤU HÌNH MODULE PAYMENTS (MoMo + Escrow + Commission 20%)
# ───────────────────────────────────────────────────────────────
# 1. MoMo Payment Gateway (test/prod)
MOMO_PARTNER_CODE = os.environ.get('MOMO_PARTNER_CODE', '')
MOMO_ACCESS_KEY   = os.environ.get('MOMO_ACCESS_KEY',   '')
MOMO_SECRET_KEY   = os.environ.get('MOMO_SECRET_KEY',   '')
MOMO_ENDPOINT     = os.environ.get(
    'MOMO_ENDPOINT',
    'https://test-payment.momo.vn/v2/gateway/api/create'
)
MOMO_RETURN_URL   = os.environ.get('MOMO_RETURN_URL', '')
# IPN URL — phải PUBLIC, MoMo gọi server-to-server
MOMO_NOTIFY_URL   = os.environ.get(
    'MOMO_NOTIFY_URL',
    'https://educarelink-backend.onrender.com/api/payments/momo/ipn/'
)
MOMO_PARTNER_NAME = os.environ.get('MOMO_PARTNER_NAME', 'EduCareLink')

# 2. MoMo Disbursement API (rút tiền cho Worker — cần đăng ký riêng với MoMo)
MOMO_DISBURSEMENT_ENDPOINT = os.environ.get(
    'MOMO_DISBURSEMENT_ENDPOINT',
    'https://test-payment.momo.vn/v2/gateway/api/disbursement'
)

# 3. Cấu hình hoa hồng & admin nhận hoa hồng
PAYMENT_COMMISSION_RATE = os.environ.get('PAYMENT_COMMISSION_RATE', '0.20')  # 20%
PAYMENT_ADMIN_USER_ID   = os.environ.get('PAYMENT_ADMIN_USER_ID', '')        # ID user admin nhận 20%

# 4. VietQR — Admin bank account nhận hoa hồng (cho luồng CASH cuối tháng)
PAYMENT_ADMIN_BANK_BIN         = os.environ.get('PAYMENT_ADMIN_BANK_BIN',         '970436')  # Vietcombank
PAYMENT_ADMIN_BANK_ACCOUNT     = os.environ.get('PAYMENT_ADMIN_BANK_ACCOUNT',    '')
PAYMENT_ADMIN_BANK_ACCOUNT_NAME = os.environ.get('PAYMENT_ADMIN_BANK_ACCOUNT_NAME', '')  # IN HOA KHÔNG DẤU

# 5. Scheduler enable
COMMISSION_SCHEDULER_ENABLED = os.environ.get('COMMISSION_SCHEDULER_ENABLED', 'true').lower() == 'true'
