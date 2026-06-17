"""
MoMo Payment Gateway v2 — Service Layer
=========================================

Tích hợp API "Thanh toán qua MoMo" (Payment Gateway v2) theo tài liệu chính thức:
https://developers.momo.vn/v3/vi/docs/payment/api/results-handling/payment-results

CÁC LUỒNG:
  1. create_payment_order(task, parent)  → gọi API create → trả về payUrl
  2. verify_ipn_signature(payload)       → kiểm chữ ký HMAC-SHA256 từ MoMo IPN
  3. parse_ipn_result(payload)           → parse resultCode + extraData

CẤU HÌNH ENV (settings.py):
  MOMO_PARTNER_CODE   — Mã đối tác (vd: MOMOxxx)
  MOMO_ACCESS_KEY     — Access key
  MOMO_SECRET_KEY     — Secret key (DÙNG ĐỂ KÝ HMAC, KHÔNG BAO GIỜ lộ cho frontend)
  MOMO_ENDPOINT       — https://test-payment.momo.vn/v2/gateway/api/create (test)
                        https://payment.momo.vn/v2/gateway/api/create      (prod)
  MOMO_RETURN_URL     — URL frontend quay về sau khi user thanh toán
  MOMO_NOTIFY_URL     — URL backend nhận IPN (phải public, vd: https://educarelink-backend.onrender.com/api/payments/momo/ipn/)
  MOMO_REDIRECT_URL   — (tuỳ chọn) URL frontend khi user bấm "Quay về ứng dụng"

LƯU Ý:
  - `extraData` được dùng để đính kèm `payment_order_id` (base64 JSON) để khi IPN về
    biết đơn nào cần cập nhật trạng thái.
  - `orderId` phải unique mỗi lần gọi MoMo → dùng f"ECL-{payment_order_id}-{timestamp}"
  - `requestId` phải unique → dùng UUID4
  - `signature` = HMAC-SHA256(secretKey, "accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType")
"""
import base64
import json
import uuid
import hmac
import hashlib
import logging
import os
from decimal import Decimal
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('educarelink.momo')

# ───────────────────────────────────────────────────────────────────
# CẤU HÌNH
# ───────────────────────────────────────────────────────────────────
PARTNER_CODE  = getattr(settings, 'MOMO_PARTNER_CODE',  os.environ.get('MOMO_PARTNER_CODE', ''))
ACCESS_KEY    = getattr(settings, 'MOMO_ACCESS_KEY',    os.environ.get('MOMO_ACCESS_KEY', ''))
SECRET_KEY    = getattr(settings, 'MOMO_SECRET_KEY',    os.environ.get('MOMO_SECRET_KEY', ''))
ENDPOINT      = getattr(settings, 'MOMO_ENDPOINT',      os.environ.get('MOMO_ENDPOINT',
                                                                       'https://test-payment.momo.vn/v2/gateway/api/create'))
RETURN_URL    = getattr(settings, 'MOMO_RETURN_URL',    os.environ.get('MOMO_RETURN_URL', ''))
NOTIFY_URL    = getattr(settings, 'MOMO_NOTIFY_URL',    os.environ.get('MOMO_NOTIFY_URL', ''))
PARTNER_NAME  = getattr(settings, 'MOMO_PARTNER_NAME',  os.environ.get('MOMO_PARTNER_NAME', 'EduCareLink'))
LANG          = 'vi'

# Request type — capture payment ngay (không 2-phase)
REQUEST_TYPE_CAPTURE = 'captureWallet'
REQUEST_TYPE_QR      = 'link'  # thanh toán bằng QR (cho user không có app MoMo)


# ───────────────────────────────────────────────────────────────────
# UTILS
# ───────────────────────────────────────────────────────────────────
def _sign_rsa_sha256(data: str) -> str:
    """MoMo v2 dùng HMAC-SHA256 (không phải RSA). Trả về hex digest lowercase."""
    return hmac.new(
        SECRET_KEY.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def _build_signature_raw(params: dict) -> str:
    """Build chuỗi raw để ký theo thứ tự alphabet của key, bỏ giá trị rỗng."""
    parts = []
    for key in sorted(params.keys()):
        val = params[key]
        if val is None or val == '':
            continue
        parts.append(f"{key}={val}")
    return "&".join(parts)


def _b64_extra_data(payload: dict) -> str:
    """Mã hoá extraData dạng base64(JSON). MoMo yêu cầu base64."""
    if not payload:
        return ""
    raw = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    return base64.b64encode(raw).decode('ascii')


def _decode_extra_data(b64: str) -> dict:
    try:
        raw = base64.b64decode(b64 or "").decode('utf-8')
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


# ───────────────────────────────────────────────────────────────────
# PUBLIC API
# ───────────────────────────────────────────────────────────────────
def is_configured() -> bool:
    """Kiểm tra MoMo đã được cấu hình đủ để gọi API hay chưa."""
    return bool(PARTNER_CODE and ACCESS_KEY and SECRET_KEY and ENDPOINT and NOTIFY_URL)


def create_payment_url(*, payment_order_id: int, task_id: int, parent_id: int,
                       amount: Decimal, order_info: str,
                       request_type: str = REQUEST_TYPE_CAPTURE) -> dict:
    """
    Gọi MoMo API `create` để tạo payment URL cho 1 PaymentOrder.

    Trả về dict:
      {
        'success': bool,
        'pay_url': str | None,
        'order_id': str,           # MoMo orderId
        'request_id': str,
        'momo_response': dict,     # Toàn bộ response (cho debug)
        'error': str | None,
      }
    """
    if not is_configured():
        return {
            'success': False, 'pay_url': None,
            'order_id': None, 'request_id': None,
            'momo_response': {}, 'error': 'MoMo chưa được cấu hình (thiếu env).'
        }

    # Đặt orderId unique — MoMo yêu cầu unique trong vòng 24h
    momo_order_id = f"ECL-{payment_order_id}-{int(timezone.now().timestamp())}"
    request_id = str(uuid.uuid4())
    amount_int = int(Decimal(amount))  # MoMo yêu cầu số nguyên (VNĐ)

    extra_data = _b64_extra_data({
        'payment_order_id': payment_order_id,
        'task_id': task_id,
        'parent_id': parent_id,
    })

    # MoMo v2 yêu cầu exactly các key sau trong raw signature (theo docs):
    raw_params = {
        'accessKey':   ACCESS_KEY,
        'amount':      str(amount_int),
        'extraData':   extra_data,
        'ipnUrl':      NOTIFY_URL,
        'orderId':     momo_order_id,
        'orderInfo':   order_info,
        'partnerCode': PARTNER_CODE,
        'redirectUrl': RETURN_URL,
        'requestId':   request_id,
        'requestType': request_type,
    }
    raw = _build_signature_raw(raw_params)
    signature = _sign_rsa_sha256(raw)

    body = {
        'partnerCode': PARTNER_CODE,
        'partnerName': PARTNER_NAME,
        'storeId':     PARTNER_CODE,
        'requestType': request_type,
        'ipnUrl':      NOTIFY_URL,
        'redirectUrl': RETURN_URL,
        'orderId':     momo_order_id,
        'amount':      amount_int,
        'lang':        LANG,
        'orderInfo':   order_info,
        'requestId':   request_id,
        'extraData':   extra_data,
        'signature':   signature,
    }

    try:
        resp = requests.post(ENDPOINT, json=body, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        logger.exception(f"[MoMo] create_payment_url HTTP error: {e}")
        return {
            'success': False, 'pay_url': None,
            'order_id': momo_order_id, 'request_id': request_id,
            'momo_response': {}, 'error': f'HTTP error: {e}'
        }
    except ValueError as e:
        logger.exception(f"[MoMo] create_payment_url JSON parse error: {e}")
        return {
            'success': False, 'pay_url': None,
            'order_id': momo_order_id, 'request_id': request_id,
            'momo_response': {}, 'error': f'JSON parse error: {e}'
        }

    # MoMo trả về resultCode=0 → thành công
    result_code = data.get('resultCode')
    pay_url = data.get('payUrl')
    success = (result_code == 0 and bool(pay_url))

    if not success:
        logger.warning(
            f"[MoMo] create_payment_url FAILED | order={momo_order_id} | "
            f"resultCode={result_code} | message={data.get('message')}"
        )

    return {
        'success': success,
        'pay_url': pay_url,
        'order_id': momo_order_id,
        'request_id': request_id,
        'momo_response': data,
        'error': None if success else data.get('message', 'Unknown MoMo error'),
    }


def verify_ipn_signature(payload: dict) -> bool:
    """
    Verify chữ ký HMAC-SHA256 từ MoMo IPN.

    MoMo gửi POST với body JSON chứa:
      partnerCode, orderId, requestId, amount, orderInfo, orderType, transId,
      resultCode, message, payType, responseTime, extraData, signature

    Chuỗi raw để verify:
      accessKey=$accessKey&amount=$amount&extraData=$extraData&message=$message
      &orderId=$orderId&orderInfo=$orderInfo&orderType=$orderType&partnerCode=$partnerCode
      &payType=$payType&requestId=$requestId&responseTime=$responseTime&resultCode=$resultCode
      &transId=$transId
    """
    if not SECRET_KEY:
        logger.error("[MoMo] verify_ipn_signature: SECRET_KEY chưa cấu hình")
        return False

    signature_received = payload.get('signature')
    if not signature_received:
        return False

    raw_params = {
        'accessKey':    ACCESS_KEY,
        'amount':       payload.get('amount', ''),
        'extraData':    payload.get('extraData', ''),
        'message':      payload.get('message', ''),
        'orderId':      payload.get('orderId', ''),
        'orderInfo':    payload.get('orderInfo', ''),
        'orderType':    payload.get('orderType', ''),
        'partnerCode':  payload.get('partnerCode', ''),
        'payType':      payload.get('payType', ''),
        'requestId':    payload.get('requestId', ''),
        'responseTime': payload.get('responseTime', ''),
        'resultCode':   payload.get('resultCode', ''),
        'transId':      payload.get('transId', ''),
    }
    raw = _build_signature_raw(raw_params)
    expected = _sign_rsa_sha256(raw)
    return hmac.compare_digest(expected, signature_received)


def parse_ipn_result(payload: dict) -> dict:
    """
    Parse MoMo IPN payload → dict có ý nghĩa cho service layer.

    Trả về:
      {
        'success': bool,
        'momo_trans_id': str | None,
        'momo_order_id': str | None,
        'amount': Decimal | None,
        'extra_data': dict,        # decode base64 → JSON
        'result_code': int,
        'message': str,
      }
    """
    result_code = payload.get('resultCode')
    return {
        'success': result_code == 0,
        'momo_trans_id': str(payload.get('transId')) if payload.get('transId') else None,
        'momo_order_id': payload.get('orderId'),
        'amount': Decimal(str(payload.get('amount', 0))) if payload.get('amount') else None,
        'extra_data': _decode_extra_data(payload.get('extraData', '')),
        'result_code': result_code,
        'message': payload.get('message', ''),
    }


def build_ipn_ack_response(success: bool) -> dict:
    """MoMo yêu cầu server phải trả về JSON ack sau khi nhận IPN:
       {"resultCode": 0, "message": "Thành công"} nếu xử lý OK.
    """
    return {
        'resultCode': 0 if success else 99,
        'message': 'Thành công' if success else 'Xử lý thất bại',
    }


# ───────────────────────────────────────────────────────────────────
# MoMo DISBURSEMENT (rút tiền cho Worker) — OPTIONAL
# ───────────────────────────────────────────────────────────────────
# MoMo có "Disbursement API" (Payout) cho phép chuyển tiền từ ví doanh nghiệp
# sang ví MoMo cá nhân. Yêu cầu đăng ký riêng với MoMo.
# Hiện tại để skeleton — nếu user chưa đăng ký Payout, Worker chỉ thấy số dư trong app,
# admin có thể chuyển tay (bank transfer) dựa trên thông tin Wallet.

DISBURSEMENT_ENDPOINT = getattr(
    settings, 'MOMO_DISBURSEMENT_ENDPOINT',
    os.environ.get('MOMO_DISBURSEMENT_ENDPOINT',
                   'https://test-payment.momo.vn/v2/gateway/api/disbursement'))


def request_disbursement(*, amount: Decimal, receiver_phone: str, order_info: str) -> dict:
    """
    Gọi MoMo Disbursement API để chuyển tiền từ ví doanh nghiệp → ví MoMo cá nhân.

    Yêu cầu MoMo đã cấp quyền Disbursement cho partner.
    Trả về:
      {
        'success': bool,
        'momo_trans_id': str | None,
        'momo_response': dict,
        'error': str | None,
      }
    """
    if not is_configured():
        return {'success': False, 'momo_trans_id': None, 'momo_response': {}, 'error': 'MoMo chưa cấu hình'}

    request_id = str(uuid.uuid4())
    order_id = f"ECL-DISB-{int(timezone.now().timestamp())}-{uuid.uuid4().hex[:6]}"
    amount_int = int(Decimal(amount))

    raw_params = {
        'accessKey':   ACCESS_KEY,
        'amount':      str(amount_int),
        'orderId':     order_id,
        'orderInfo':   order_info,
        'partnerCode': PARTNER_CODE,
        'requestId':   request_id,
        'receiverType': '0',  # 0 = số điện thoại MoMo
        'receiver':    receiver_phone,
    }
    raw = _build_signature_raw(raw_params)
    signature = _sign_rsa_sha256(raw)

    body = {
        'partnerCode': PARTNER_CODE,
        'requestId':   request_id,
        'orderId':     order_id,
        'amount':      amount_int,
        'receiverType': '0',
        'receiver':    receiver_phone,
        'orderInfo':   order_info,
        'signature':   signature,
        'lang':        LANG,
    }

    try:
        resp = requests.post(DISBURSEMENT_ENDPOINT, json=body, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.exception(f"[MoMo] request_disbursement HTTP error: {e}")
        return {'success': False, 'momo_trans_id': None, 'momo_response': {}, 'error': str(e)}

    result_code = data.get('resultCode')
    return {
        'success': result_code == 0,
        'momo_trans_id': str(data.get('transId')) if data.get('transId') else None,
        'momo_response': data,
        'error': None if result_code == 0 else data.get('message', 'Unknown error'),
    }
