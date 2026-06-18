"""
Management command — verify MoMo credentials work.

Usage:
    python manage.py test_momo_credentials

Should print "✅ MoMo credentials are working!" if everything is OK.
If you get "Chữ ký không hợp lệ" or 403, your credentials are wrong or
the test credentials have been deactivated by MoMo.
"""

import json
import uuid
import time
from django.core.management.base import BaseCommand

from payments.momo_client import (
    create_payment, is_configured, is_sandbox,
    _get_credentials, _sign_rsa,
)
import requests


class Command(BaseCommand):
    help = "Kiểm tra MoMo credentials có hoạt động không."

    def handle(self, *args, **opts):
        self.stdout.write(self.style.WARNING(
            "\n=== MoMo Credential Test ==="
        ))
        self.stdout.write(f"Configured: {is_configured()}")
        self.stdout.write(f"Environment: {'sandbox' if is_sandbox() else 'production'}")

        if not is_configured():
            self.stdout.write(self.style.ERROR(
                "\n❌ MoMo chưa cấu hình. Đặt MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, "
                "MOMO_SECRET_KEY trong .env hoặc environment variables."
            ))
            return

        partner_code, access_key, secret_key = _get_credentials()
        self.stdout.write(f"Partner Code: {partner_code}")
        self.stdout.write(f"Access Key:   {access_key}")
        self.stdout.write(f"Secret Key:   {secret_key[:6]}...{secret_key[-4:]} (len={len(secret_key)})")

        # Try to create a test payment
        order_id = f"EDUCARELINK_TEST_{int(time.time())}"
        self.stdout.write(self.style.WARNING(
            f"\nGọi create_payment(orderId={order_id}, amount=10000)..."
        ))

        try:
            resp = create_payment(
                order_id=order_id,
                amount=10000,
                order_info="EduCareLink credential test",
                return_url="https://example.com/return",
                ipn_url="https://example.com/ipn",
                request_id=f"{order_id}_{uuid.uuid4().hex[:8]}",
                extra_data="",
            )
            self.stdout.write(self.style.SUCCESS(
                "\n✅ MoMo credentials are working!"
            ))
            self.stdout.write(f"payUrl:    {resp.get('payUrl', '(none)')}")
            self.stdout.write(f"qrCodeUrl: {resp.get('qrCodeUrl', '(none)')}")
            self.stdout.write(f"resultCode: {resp.get('resultCode')}")
            self.stdout.write(f"message:    {resp.get('message')}")
        except Exception as e:
            self.stdout.write(self.style.ERROR(
                f"\n❌ MoMo test failed: {e}"
            ))
            if hasattr(e, 'raw') and e.raw:
                self.stdout.write(self.style.WARNING(
                    "\nRaw response from MoMo:"
                ))
                self.stdout.write(json.dumps(e.raw, indent=2, ensure_ascii=False))
            self.stdout.write(self.style.WARNING(
                "\nTroubleshooting:"
            ))
            self.stdout.write("  1. Kiểm tra lại Partner Code / Access Key / Secret Key từ https://business.momo.vn/")
            self.stdout.write("  2. Đảm bảo MOMO_ENVIRONMENT đúng ('sandbox' hoặc 'production')")
            self.stdout.write("  3. Nếu dùng test credentials công khai (MOMO/F8BBA842ECF85/K951B...),")
            self.stdout.write("     MoMo có thể đã vô hiệu hoá — cần đăng ký business riêng.")
            self.stdout.write("  4. Kiểm tra IP server có trong whitelist MoMo Business không.")
