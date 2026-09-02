"""
WSGI config for backend project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = get_wsgi_application()

# ── Auto-migrate on Render (safety net) ──────────────────────────────────
# build.sh đã có "python manage.py migrate", nhưng nếu build fail thì migrate
# không chạy → DB schema bị lệch. Thêm ở đây để mỗi lần gunicorn start (sau khi
# Django initialized) sẽ tự động áp dụng migration còn thiếu.
# Chỉ chạy khi RENDER=true để không ảnh hưởng local dev.
if os.environ.get('RENDER') == 'true':
    import logging
    _wsgi_logger = logging.getLogger('backend.wsgi')
    try:
        from django.core.management import call_command
        call_command('migrate', verbosity=0, interactive=False)
        _wsgi_logger.info('Auto-migrate completed successfully on startup.')
    except Exception as exc:
        _wsgi_logger.warning('Auto-migrate on startup failed (non-fatal): %s', exc)
