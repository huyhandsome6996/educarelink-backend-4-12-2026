"""
VietQR Service — Sinh mã QR để Carepartner thanh toán hoa hồng cho Admin.

Sử dụng VietQR.io API (miễn phí, không cần đăng ký):
  https://img.vietqr.io/image/{BANK_BIN}-{ACCOUNT_NO}-compact.png?amount={AMOUNT}&addInfo={MEMO}&accountName={NAME}

Trong đó:
  BANK_BIN   — Mã BIN ngân hàng, vd: 970436 = Vietcombank, 970418 = BIDV, 970407 = Techcombank
  ACCOUNT_NO — Số tài khoản ngân hàng của Admin (người nhận hoa hồng)
  AMOUNT     — Số tiền VNĐ (số nguyên, không có dấu phẩy)
  MEMO       — Nội dung chuyển khoản (URL-encoded) — vd: "ECL HUE 032026" để admin biết của ai
  NAME       — Tên chủ TK (URL-encoded, IN HOA KHÔNG DẤU)

  → Trả về URL ảnh PNG có thể hiện thẳng trong mobile/web bằng <Image src=.../>
  → Hoặc có thể render QR code client-side từ chuỗi `qr_payload` (EMVCo string).

CÁCH DÙNG:
  url, payload = build_vietqr_url(
      bank_bin='970436',
      account_no='0071001234567',
      account_name='NGUYEN VAN A',
      amount=Decimal('200000'),
      memo='ECL HUE 032026',
  )

  # url: ảnh PNG QR
  # payload: chuỗi QR raw (EMVCo) — dùng nếu frontend tự render QR
"""
import urllib.parse
from decimal import Decimal


# Cấu hình mặc định từ env (Admin bank account nhận hoa hồng)
import os
DEFAULT_BANK_BIN         = os.environ.get('PAYMENT_ADMIN_BANK_BIN',         '970436')   # VCB
DEFAULT_BANK_ACCOUNT     = os.environ.get('PAYMENT_ADMIN_BANK_ACCOUNT',    '')
DEFAULT_BANK_ACCOUNT_NAME = os.environ.get('PAYMENT_ADMIN_BANK_ACCOUNT_NAME', '')  # IN HOA KHÔNG DẤU

VIETQR_IMG_BASE = 'https://img.vietqr.io/image'


def build_vietqr_url(*, bank_bin: str = None, account_no: str = None,
                     account_name: str = None,
                     amount: Decimal, memo: str,
                     template: str = 'compact') -> tuple[str, str]:
    """
    Sinh URL ảnh QR VietQR + chuỗi payload EMV.

    Args:
        bank_bin:     Mã BIN ngân hàng (6 số). Default từ env.
        account_no:   Số tài khoản. Default từ env.
        account_name: Tên chủ TK (IN HOA KHÔNG DẤU). Default từ env.
        amount:       Số tiền (Decimal).
        memo:         Nội dung CK (sẽ được encode).
        template:     'compact' | 'qr_only' | 'print' — kiểu ảnh trả về.

    Returns:
        (image_url, qr_payload)
        image_url:   URL ảnh PNG sẵn sàng để embed
        qr_payload:  Chuỗi nội dung QR (EMVCo) — dùng nếu cần render QR client-side
    """
    bank_bin = bank_bin or DEFAULT_BANK_BIN
    account_no = account_no or DEFAULT_BANK_ACCOUNT
    account_name = account_name or DEFAULT_BANK_ACCOUNT_NAME

    if not bank_bin or not account_no:
        raise ValueError(
            "VietQR: thiếu bank_bin hoặc account_no — cần cấu hình "
            "PAYMENT_ADMIN_BANK_BIN và PAYMENT_ADMIN_BANK_ACCOUNT"
        )

    amount_int = int(Decimal(amount))
    # VietQR yêu cầu amount > 0; nếu =0 thì bỏ tham số
    params = {
        'amount': str(amount_int),
        'addInfo': memo,
        'accountName': account_name,
    }
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v})

    image_url = f"{VIETQR_IMG_BASE}/{bank_bin}-{account_no}-{template}.png?{qs}"

    # Payload EMV (đơn giản) — dùng cho app nào muốn tự render QR native
    qr_payload = (
        f"00020101021238{len(bank_bin)+len(account_no)+10:02d}"
        f"0010A00000072701200100{len(bank_bin):02d}{bank_bin}"
        f"0114{account_no.zfill(14)[:14]}"
        f"0308QRIBFTTA5303704540{len(str(amount_int)):02d}{amount_int}"
        f"5802VN62{len(memo):02d}{memo}6304"
    )

    return image_url, qr_payload


def build_commission_memo(worker_username: str, month_str: str) -> str:
    """
    Sinh nội dung chuyển khoản cho QR hoa hồng.

    VD: "ECL HUE 032026" → Admin biết: user HUE nộp hoa hồng tháng 03/2026.
    Giới hạn 35 ký tự (giới hạn của VietQR).
    """
    username_clean = ''.join(c for c in worker_username.upper() if c.isalnum())[:8]
    memo = f"ECL {username_clean} {month_str}"
    return memo[:35]
