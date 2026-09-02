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
        from django.db import connection

        # ── Schema-sanity check trước migrate ─────────────────────────
        # Vấn đề: django_migrations ghi migration đã chạy nhưng schema
        # thật không khớp → migrate nói "No migrations to apply" nhưng
        # code vẫn bị crash (UndefinedColumn).
        # Fix: kiểm tra cột quan trọng, nếu thiếu → xoá migration record
        # rồi migrate lại từ đầu.
        _fixed = False
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name='core_landingsurvey'"
            )
            table_exists = cursor.fetchone() is not None
            if table_exists:
                cursor.execute(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name='core_landingsurvey' AND column_name='role'"
                )
                col_exists = cursor.fetchone() is not None
                if not col_exists:
                    _wsgi_logger.warning(
                        'core_landingsurvey exists but missing "role" column. '
                        'Migration desync detected — dropping tables + resetting migration records.'
                    )
                    # Xoá bảng lỗi (chưa có data thật)
                    cursor.execute('DROP TABLE IF EXISTS core_landingsignup CASCADE')
                    cursor.execute('DROP TABLE IF EXISTS core_landingsurvey CASCADE')
                    cursor.execute('DROP TABLE IF EXISTS core_landingpagevisit CASCADE')
                    # Xoá migration records để Django chạy lại từ 0021
                    cursor.execute(
                        "DELETE FROM django_migrations "
                        "WHERE app='core' AND name IN ("
                        "  '0021_landing_survey_signup',"
                        "  '0022_landing_page_visit_and_survey_update'"
                        ")"
                    )
                    connection.commit()
                    _fixed = True

        call_command('migrate', verbosity=0, interactive=False)
        if _fixed:
            _wsgi_logger.info('Auto-migrate: schema desync fixed, migrations re-applied.')
        else:
            _wsgi_logger.info('Auto-migrate completed successfully on startup.')
    except Exception as exc:
        _wsgi_logger.warning('Auto-migrate on startup failed (non-fatal): %s', exc)
