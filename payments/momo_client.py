"""
╔══════════════════════════════════════════════════════════════════╗
║   MoMo Partner API Client — Payment App v2 + Transfer/Refund     ║
║                                                                   ║
║   Tài liệu:                                                       ║
║     - Pay App v2:   https://developers.momo.vn/v3/vi/docs/payment/║
║                      app/app-in-app/payment-link                  ║
║     - Refund:       https://developers.momo.vn/v3/vi/docs/payment/║
║                      app/app-in-app/refund                        ║
║     - Transfer:     yêu cầu đối tác MoMo Payout riêng             ║
║                                                                   ║
║   Sandbox credentials (test):                                     ║
║     Partner Code:  MOMO                                           ║
║     Access Key:    F8BBA842ECF85                                  ║
║     Secret Key:    K951B6PE1waDMi640xX08PD1lg5kvbbc              ║
║                                                                   ║
║   Production credentials: cung cấp bởi MoMo sau khi ký hợp đồng.  ║
╚══════════════════════════════════════════════════════════════════╝
"""

import hashlib
import hmac
import json
import time
import uuid
import logging
from decimal import Decimal

import requests
from django.conf import settings

logger = logging.getLogger('educarelink.momo')


# ────────────────────────────────────────────────────────────────────
#  ENDPOINT THEO ENVIRONMENT
# ────────────────────────────────────────────────────────────────────
SANDBOX_BASE = "https://test-payment.momo.vn"
PRODUCTION_BASE = "https://payment.momo.vn"

PAY_APP_PATH = "/v2/gateway/api/create"    # Pay App v2 — sinh payUrl/QR
QUERY_PATH = "/v2/gateway/api/query"        # Query trạng thái giao dịch
REFUND_PATH = "/v2/gateway/api/refund"      # Hoàn tiền
TRANSFER_PATH = "/v2/gateway/api/transfer"  # Chuyển tiền tới ví MoMo (Payout)


class MomoConfigError(Exception):
    """Thiếu cấu hình MoMo."""


class MomoAPIError(Exception):
    """MoMo trả về lỗi hoặc không phản hồi."""
    def __init__(self, message, result_code=None, raw=None):
        super().__init__(message)
        self.result_code = result_code
        self.raw = raw or {}


def _get_base_url():
    env = getattr(settings, 'MOMO_ENVIRONMENT', 'sandbox').lower()
    return PRODUCTION_BASE if env == 'production' else SANDBOX_BASE


def _get_credentials():
    """Trả về (partner_code, access_key, secret_key) — raise nếu thiếu."""
    partner_code = getattr(settings, 'MOMO_PARTNER_CODE', '')
    access_key = getattr(settings, 'MOMO_ACCESS_KEY', '')
    secret_key = getattr(settings, 'MOMO_SECRET_KEY', '')

    if not (partner_code and access_key and secret_key):
        raise MomoConfigError(
            "MoMo credentials chưa cấu hình. Thiết lập MOMO_PARTNER_CODE, "
            "MOMO_ACCESS_KEY, MOMO_SECRET_KEY trong environment variables."
        )
    return partner_code, access_key, secret_key


def _sign_rsa(data: str, secret_key: str) -> str:
    """
    MoMo v2 dùng HMAC-SHA256 với secret_key làm key.
    (Một số endpoint MoMo v2 có hỗ trợ RSA, nhưng HMAC-SHA256
     là chuẩn cho Pay App v2 và Refund.)
    """
    h = hmac.new(
        secret_key.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha256
    )
    return h.hexdigest()


def _verify_signature(payload: dict, secret_key: str) -> bool:
    """
    Verify chữ ký MoMo gửi về (IPN / return URL).

    Theo tài liệu MoMo v2:
      Chuỗi cần ký = accessKey=$accessKey&amount=$amount&extraData=$extraData
                     &message=$message&orderId=$orderId&orderInfo=$orderInfo
                     &orderType=$orderType&partnerCode=$partnerCode&payType=$payType
                     &requestId=$requestId&responseTime=$responseTime&resultCode=$resultCode
                     &transId=$transId
    """
    try:
        raw = (
            f"accessKey={payload.get('accessKey','')}"
            f"&amount={payload.get('amount','')}"
            f"&extraData={payload.get('extraData','')}"
            f"&message={payload.get('message','')}"
            f"&orderId={payload.get('orderId','')}"
            f"&orderInfo={payload.get('orderInfo','')}"
            f"&orderType={payload.get('orderType','')}"
            f"&partnerCode={payload.get('partnerCode','')}"
            f"&payType={payload.get('payType','')}"
            f"&requestId={payload.get('requestId','')}"
            f"&responseTime={payload.get('responseTime','')}"
            f"&resultCode={payload.get('resultCode','')}"
            f"&transId={payload.get('transId','')}"
        )
        expected = _sign_rsa(raw, secret_key)
        return hmac.compare_digest(expected, payload.get('signature', ''))
    except Exception as e:
        logger.warning(f"[MoMo] Verify signature failed: {e}")
        return False


# ────────────────────────────────────────────────────────────────────
#  PUBLIC API
# ────────────────────────────────────────────────────────────────────

def create_payment(
    *,
    order_id: str,
    amount: int,
    order_info: str,
    return_url: str,
    ipn_url: str,
    extra_data: str = "",
    request_id: str = None,
    auto_capture: bool = True,
    lang: str = "vi",
):
    """
    Gọi MoMo Pay App v2 — tạo một giao dịch, nhận về payUrl + qrCodeUrl.

    Args:
        order_id:     ID đơn hàng duy nhất (do EduCareLink sinh, VD: EduCareLink_42_1719000000)
        amount:       Số tiền VNĐ (int, không có lẻ)
        order_info:   Mô tả ngắn hiển thị trên MoMo app
        return_url:   URL redirect sau khi user pay xong
        ipn_url:      URL MoMo gọi về server-to-server khi giao dịch hoàn tất
        extra_data:   chuỗi base64 hoặc rỗng
        request_id:   ID request duy nhất (mặc định = order_id + uuid suffix)
        auto_capture: True = capture ngay sau khi user pay (mặc định)
        lang:         "vi" hoặc "en"

    Returns:
        dict raw response từ MoMo:
            {
              "partnerCode": "...",
              "orderId": "...",
              "requestId": "...",
              "amount": 100000,
              "responseTime": 1719...,
              "resultCode": 0,                  # 0 = thành công
              "message": "Successful",
              "payUrl": "https://...",          # redirect user tới đây
              "qrCodeUrl": "https://...",       # QR để hiển thị
              "signature": "..."
            }

    Raises:
        MomoConfigError: thiếu credentials
        MomoAPIError:    HTTP không OK hoặc resultCode != 0
    """
    partner_code, access_key, secret_key = _get_credentials()
    request_id = request_id or f"{order_id}_{uuid.uuid4().hex[:8]}"

    # Theo docs MoMo v2 Pay App:
    raw_signature = (
        f"accessKey={access_key}"
        f"&amount={amount}"
        f"&extraData={extra_data}"
        f"&ipnUrl={ipn_url}"
        f"&orderId={order_id}"
        f"&orderInfo={order_info}"
        f"&partnerCode={partner_code}"
        f"&redirectUrl={return_url}"
        f"&requestId={request_id}"
        f"&requestType=captureWallet"   # captureWallet = thu tiền ngay
    )
    signature = _sign_rsa(raw_signature, secret_key)

    body = {
        "partnerCode": partner_code,
        "partnerName": "EduCareLink",
        "storeId": getattr(settings, 'MOMO_STORE_ID', "EduCareLinkStore"),
        "requestId": request_id,
        "amount": int(amount),
        "orderId": order_id,
        "orderInfo": order_info,
        "redirectUrl": return_url,
        "ipnUrl": ipn_url,
        "lang": lang,
        "extraData": extra_data,
        "requestType": "captureWallet",
        "signature": signature,
    }

    url = _get_base_url() + PAY_APP_PATH
    try:
        resp = requests.post(url, json=body, timeout=15,
                             headers={"Content-Type": "application/json"})
        data = resp.json()
    except Exception as e:
        logger.error(f"[MoMo] create_payment HTTP error: {e}")
        raise MomoAPIError(f"MoMo HTTP error: {e}")

    logger.info(f"[MoMo] create_payment | orderId={order_id} | amount={amount} | "
                f"resultCode={data.get('resultCode')} | message={data.get('message')}")

    if data.get("resultCode") != 0:
        raise MomoAPIError(
            f"MoMo create_payment failed: {data.get('message')}",
            result_code=data.get("resultCode"),
            raw=data,
        )
    return data


def query_payment(order_id: str, request_id: str = None):
    """
    Query trạng thái giao dịch MoMo (dùng khi nghi ngờ IPN bị miss).
    """
    partner_code, access_key, secret_key = _get_credentials()
    request_id = request_id or f"{order_id}_query_{int(time.time())}"

    raw_signature = (
        f"accessKey={access_key}"
        f"&orderId={order_id}"
        f"&partnerCode={partner_code}"
        f"&requestId={request_id}"
    )
    signature = _sign_rsa(raw_signature, secret_key)

    body = {
        "partnerCode": partner_code,
        "requestId": request_id,
        "orderId": order_id,
        "lang": "vi",
        "signature": signature,
    }

    url = _get_base_url() + QUERY_PATH
    try:
        resp = requests.post(url, json=body, timeout=15)
        data = resp.json()
    except Exception as e:
        logger.error(f"[MoMo] query_payment HTTP error: {e}")
        raise MomoAPIError(f"MoMo HTTP error: {e}")

    return data


def refund_payment(*, order_id: str, trans_id: str, amount: int,
                    description: str = "Hoan tien task bi huy", request_id: str = None):
    """
    Hoàn tiền giao dịch MoMo về ví phụ huynh.

    Args:
        order_id:   orderId gốc lúc create_payment
        trans_id:   transId MoMo trả về lúc IPN
        amount:     Số tiền hoàn (thường = amount gốc)
        description: Lý do hoàn
        request_id: ID request duy nhất
    """
    partner_code, access_key, secret_key = _get_credentials()
    request_id = request_id or f"{order_id}_refund_{uuid.uuid4().hex[:8]}"

    raw_signature = (
        f"accessKey={access_key}"
        f"&amount={amount}"
        f"&description={description}"
        f"&orderId={order_id}"
        f"&partnerCode={partner_code}"
        f"&requestId={request_id}"
        f"&transId={trans_id}"
    )
    signature = _sign_rsa(raw_signature, secret_key)

    body = {
        "partnerCode": partner_code,
        "orderId": order_id,
        "requestId": request_id,
        "amount": int(amount),
        "transId": trans_id,
        "lang": "vi",
        "description": description,
        "signature": signature,
    }

    url = _get_base_url() + REFUND_PATH
    try:
        resp = requests.post(url, json=body, timeout=15)
        data = resp.json()
    except Exception as e:
        logger.error(f"[MoMo] refund HTTP error: {e}")
        raise MomoAPIError(f"MoMo HTTP error: {e}")

    logger.info(f"[MoMo] refund | orderId={order_id} | transId={trans_id} | "
                f"amount={amount} | resultCode={data.get('resultCode')}")

    if data.get("resultCode") != 0:
        raise MomoAPIError(
            f"MoMo refund failed: {data.get('message')}",
            result_code=data.get("resultCode"),
            raw=data,
        )
    return data


def transfer_to_wallet(*, request_id: str, amount: int, phone: str,
                        description: str, store_id: str = None):
    """
    Transfer Money — gửi tiền tới ví MoMo của Carepartner (giải ngân escrow).

    ⚠️ YÊU CẦU ĐẶC BIỆT:
       API này chỉ khả dụng khi đối tác đã đăng ký MoMo Payout Service
       (khác với Pay App). Nếu chưa đăng ký, MoMo sẽ trả resultCode != 0.
       Trong trường hợp đó, hệ thống sẽ đánh dấu Payment.payout_failed
       và thông báo Admin xử lý thủ công.

    Args:
        request_id:  ID duy nhất cho giao dịch transfer
        amount:      Số tiền VNĐ
        phone:       Số điện thoại ví MoMo nhận (thường = worker.phone_number)
        description: Mô tả
        store_id:    MoMo store ID
    """
    partner_code, access_key, secret_key = _get_credentials()
    store_id = store_id or getattr(settings, 'MOMO_STORE_ID', 'EduCareLinkStore')

    # MoMo Transfer v2 signature:
    raw_signature = (
        f"accessKey={access_key}"
        f"&amount={amount}"
        f"&description={description}"
        f"&partnerCode={partner_code}"
        f"&partnerRefId={request_id}"
        f"&partnerTransId={request_id}"
        f"&storeId={store_id}"
    )
    signature = _sign_rsa(raw_signature, secret_key)

    body = {
        "partnerCode": partner_code,
        "partnerTransId": request_id,
        "partnerRefId": request_id,
        "storeId": store_id,
        "amount": int(amount),
        "description": description,
        "signature": signature,
    }

    url = _get_base_url() + TRANSFER_PATH
    try:
        resp = requests.post(url, json=body, timeout=20)
        data = resp.json()
    except Exception as e:
        logger.error(f"[MoMo] transfer HTTP error: {e}")
        raise MomoAPIError(f"MoMo HTTP error: {e}")

    logger.info(f"[MoMo] transfer | requestId={request_id} | phone={phone} | "
                f"amount={amount} | resultCode={data.get('resultCode')}")

    # Transfer API resultCode 0 = thành công; khác 0 = lỗi
    return data


# ────────────────────────────────────────────────────────────────────
#  HELPERS
# ────────────────────────────────────────────────────────────────────

def is_configured() -> bool:
    """Kiểm tra MoMo đã được cấu hình credentials chưa."""
    try:
        _get_credentials()
        return True
    except MomoConfigError:
        return False


def is_sandbox() -> bool:
    return getattr(settings, 'MOMO_ENVIRONMENT', 'sandbox').lower() == 'sandbox'


def verify_ipn_signature(payload: dict) -> bool:
    """Wrapper public cho _verify_signature — dùng ở views."""
    try:
        _, _, secret_key = _get_credentials()
        return _verify_signature(payload, secret_key)
    except MomoConfigError:
        return False


def generate_order_id(task_id: int, prefix: str = "EduCareLink") -> str:
    """Sinh orderId duy nhất theo format: EduCareLink_<task_id>_<timestamp>"""
    return f"{prefix}_{task_id}_{int(time.time())}"


def generate_settlement_order_id(settlement_id: int) -> str:
    """Sinh orderId cho CommissionSettlement: EduCareLink_Settle_<id>_<ts>"""
    return f"EduCareLink_Settle_{settlement_id}_{int(time.time())}"
