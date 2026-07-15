"""
PayOS Client — Wrapper cho PayOS Python SDK.

PayOS là cổng thanh toán VietQR (chuyển khoản ngân hàng) — MIỄN PHÍ 100%,
đăng ký cá nhân chỉ cần CCCD. Thay thế MoMo cho user không có ví điện tử.

Docs: https://payos.vn/docs
SDK: pip install payos==1.1.0
"""

import logging
import time
from django.conf import settings
from typing import Optional, Dict, Any

logger = logging.getLogger('educarelink.payments.payos')

# Lazy import để không crash nếu chưa install payos
_PAYOS_CLIENT = None


def _get_payos_client():
    """Singleton PayOS client — chỉ init 1 lần."""
    global _PAYOS_CLIENT
    if _PAYOS_CLIENT is not None:
        return _PAYOS_CLIENT

    client_id = getattr(settings, 'PAYOS_CLIENT_ID', '')
    api_key = getattr(settings, 'PAYOS_API_KEY', '')
    checksum_key = getattr(settings, 'PAYOS_CHECKSUM_KEY', '')

    if not client_id or not api_key or not checksum_key:
        logger.warning('[PayOS] Credentials not configured — PayOS disabled')
        return None

    try:
        from payos import PayOS
        _PAYOS_CLIENT = PayOS(
            client_id=client_id,
            api_key=api_key,
            checksum_key=checksum_key,
        )
        logger.info('[PayOS] Client initialized successfully')
        return _PAYOS_CLIENT
    except Exception as e:
        logger.exception(f'[PayOS] Failed to init client: {e}')
        return None


def is_payos_enabled() -> bool:
    """Check if PayOS is configured and ready."""
    return getattr(settings, 'PAYOS_ENABLED', False) and _get_payos_client() is not None


def create_payment_link(
    order_code: int,
    amount: int,
    description: str,
    return_url: str = None,
    cancel_url: str = None,
    buyer_name: str = None,
    buyer_email: str = None,
    buyer_phone: str = None,
) -> Optional[Dict[str, Any]]:
    """
    Tạo payment link PayOS — phụ huynh mở link để quét QR VietQR.

    Args:
        order_code: Mã đơn hàng — dùng task.id hoặc timestamp
        amount: Số tiền VNĐ (int, không có dấu chấm)
        description: Mô tả — max 50 ký tự
        return_url: URL redirect sau khi parent pay thành công
        cancel_url: URL redirect khi parent hủy
        buyer_name: Tên phụ huynh (optional)
        buyer_email: Email phụ huynh (optional)
        buyer_phone: SĐT phụ huynh (optional)

    Returns:
        Dict với keys: checkout_url, payment_link_id, order_code
        None nếu lỗi
    """
    client = _get_payos_client()
    if not client:
        return None

    base_url = getattr(settings, 'PAYOS_RETURN_BASE_URL', 'https://educarelink-backend.onrender.com')
    if return_url is None:
        return_url = f'{base_url}/api/payments/payos-return/'
    if cancel_url is None:
        cancel_url = f'{base_url}/api/payments/payos-cancel/'

    try:
        from payos.types import CreatePaymentLinkRequest

        # Truncate description to 50 chars (PayOS limit)
        description = description[:50]

        payment_data = CreatePaymentLinkRequest(
            order_code=order_code,
            amount=int(amount),
            description=description,
            return_url=return_url,
            cancel_url=cancel_url,
        )

        # Add optional buyer info
        if buyer_name:
            payment_data.buyer_name = buyer_name[:50]
        if buyer_email:
            payment_data.buyer_email = buyer_email[:100]
        if buyer_phone:
            payment_data.buyer_phone = buyer_phone[:20]

        response = client.createPaymentLink(payment_data)

        result = {
            'checkout_url': response.checkout_url,
            'payment_link_id': response.payment_link_id if hasattr(response, 'payment_link_id') else None,
            'order_code': order_code,
            'amount': int(amount),
            'description': description,
        }
        logger.info(f'[PayOS] Payment link created: order_code={order_code} amount={amount}')
        return result

    except Exception as e:
        logger.exception(f'[PayOS] create_payment_link failed: {e}')
        return None


def verify_webhook(webhook_body: Dict) -> Optional[Dict[str, Any]]:
    """
    Verify webhook từ PayOS — kiểm tra HMAC signature.

    PayOS gọi webhook khi:
    - Parent chuyển khoản thành công → status=PAID
    - Parent hủy → status=CANCELLED

    Args:
        webhook_body: Raw body từ PayOS (dict)

    Returns:
        Dict với keys: order_code, amount, status, account_reference
        None nếu verify fail
    """
    client = _get_payos_client()
    if not client:
        return None

    try:
        data = client.verifyPaymentWebhookData(webhook_body)

        result = {
            'order_code': data.order_code if hasattr(data, 'order_code') else None,
            'amount': data.amount if hasattr(data, 'amount') else None,
            'status': data.status if hasattr(data, 'status') else None,
            'account_reference': data.account_reference if hasattr(data, 'account_reference') else None,
            'transaction_date_time': data.transaction_date_time if hasattr(data, 'transaction_date_time') else None,
        }
        logger.info(f'[PayOS] Webhook verified: order_code={result["order_code"]} status={result["status"]}')
        return result

    except Exception as e:
        logger.warning(f'[PayOS] Webhook verification failed: {e}')
        return None


def get_payment_link_info(order_code: int) -> Optional[Dict[str, Any]]:
    """
    Lấy thông tin payment link — check status (PENDING/PAID/CANCELLED/EXPIRED).

    Args:
        order_code: Mã đơn hàng

    Returns:
        Dict với payment link info, None nếu lỗi
    """
    client = _get_payos_client()
    if not client:
        return None

    try:
        response = client.getPaymentLinkInformation(order_code)
        result = {
            'order_code': response.order_code,
            'status': response.status,
            'amount': response.amount,
            'paid_at': response.paid_at if hasattr(response, 'paid_at') else None,
            'cancelled_at': response.cancelled_at if hasattr(response, 'cancelled_at') else None,
            'expires_at': response.expires_at if hasattr(response, 'expires_at') else None,
        }
        logger.info(f'[PayOS] Payment link info: order_code={order_code} status={result["status"]}')
        return result

    except Exception as e:
        logger.warning(f'[PayOS] get_payment_link_info failed: {e}')
        return None


def cancel_payment_link(order_code: int, reason: str = 'Task bị hủy') -> Optional[Dict[str, Any]]:
    """
    Hủy payment link — khi task bị hủy trước khi parent pay.

    Args:
        order_code: Mã đơn hàng
        reason: Lý do hủy

    Returns:
        Dict với cancel info, None nếu lỗi
    """
    client = _get_payos_client()
    if not client:
        return None

    try:
        response = client.cancelPaymentLink(order_code, reason[:128])
        logger.info(f'[PayOS] Payment link cancelled: order_code={order_code}')
        return {'order_code': order_code, 'status': 'CANCELLED'}
    except Exception as e:
        logger.warning(f'[PayOS] cancel_payment_link failed: {e}')
        return None


def confirm_webhook(webhook_url: str = None) -> bool:
    """
    Confirm webhook URL với PayOS — gọi 1 lần khi setup.

    Args:
        webhook_url: URL PayOS sẽ gọi khi có giao dịch

    Returns:
        True nếu thành công, False nếu lỗi
    """
    client = _get_payos_client()
    if not client:
        return False

    if webhook_url is None:
        webhook_url = getattr(settings, 'PAYOS_WEBHOOK_URL', '')

    if not webhook_url:
        logger.warning('[PayOS] No webhook URL configured')
        return False

    try:
        client.confirmWebhook(webhook_url)
        logger.info(f'[PayOS] Webhook confirmed: {webhook_url}')
        return True
    except Exception as e:
        logger.warning(f'[PayOS] confirm_webhook failed: {e}')
        return False


# ── PAYOUT (chuyển tiền cho carepartner) ────────────────────────────

def create_payout(
    amount: int,
    description: str,
    bank_account_number: str,
    bank_code: str,
    account_name: str,
    reference_id: str = None,
) -> Optional[Dict[str, Any]]:
    """
    Tạo payout — chuyển tiền từ tài khoản PayOS sang STK ngân hàng của carepartner.

    ⚠️ Cần PayOS Payout credentials (riêng với payment credentials).

    Args:
        amount: Số tiền VNĐ (int)
        description: Mô tả — max 100 ký tự
        bank_account_number: Số tài khoản ngân hàng carepartner
        bank_code: Mã ngân hàng (VCB, BIDV, MB, TCB...)
        account_name: Tên chủ tài khoản carepartner
        reference_id: Mã tham chiếu (optional)

    Returns:
        Dict với payout info, None nếu lỗi
    """
    # Payout cần credentials riêng — tạm thời không support auto payout
    # Cần upgrade gói PayOS + KYC doanh nghiệp
    logger.warning('[PayOS] Payout not yet supported — manual transfer required')
    return None
