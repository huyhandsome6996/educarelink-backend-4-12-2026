"""
Django settings for backend project.
"""

from pathlib import Path
import os # Thêm thư viện hệ thống

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-YOUR_SECRET_KEY_HERE_REPLACE_LATER'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

# Cho phép tất cả các tên miền truy cập (Dùng cho môi trường Dev)
ALLOWED_HOSTS = ['*']


# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # --- CÁC THƯ VIỆN CÀI THÊM ---
    'rest_framework', # Thư viện làm API
    'corsheaders',    # Xử lý lỗi CORS khi Mobile gọi API
    
    # --- APP CỦA CHÚNG TA ---
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    
    # --- MIDDLEWARE CỦA CORS (Phải đặt trên CommonMiddleware) ---
    'corsheaders.middleware.CorsMiddleware', 
    
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'

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


# Database mặc định dùng SQLite cho nhanh (Có thể đổi sang PostgreSQL sau)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# --- CHỈ ĐỊNH MODEL USER TÙY CHỈNH ---
# Bước này cực kỳ quan trọng, báo cho Django biết ta sẽ dùng User của app core
AUTH_USER_MODEL = 'core.User'


# Internationalization
LANGUAGE_CODE = 'vi' # Chuyển ngôn ngữ mặc định sang Tiếng Việt
TIME_ZONE = 'Asia/Ho_Chi_Minh' # Chuyển múi giờ về Việt Nam
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- CẤU HÌNH CORS VÀ REST FRAMEWORK ---
CORS_ALLOW_ALL_ORIGINS = True # Cho phép mobile app kết nối mà không bị block

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny', # Tạm thời cho phép tất cả truy cập
    ]
}