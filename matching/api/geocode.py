"""
matching/api/geocode.py — Proxy geocoding Nominatim chạy SERVER-SIDE.

Vấn đề gốc (QA 2026-09-10, ảnh màn hình /dang-viec/don-tre/):
  Trước đây trang web/mobile gọi THẲNG https://nominatim.openstreetmap.org
  từ browser. Nhiều mạng/ISP/adblock chặn miền *.openstreetmap.org → cả tile
  lẫn tìm địa chỉ fail → toast đỏ "Lỗi tìm kiếm địa chỉ." mỗi lần nhập vị trí.

Giải pháp:
  - Browser chỉ gọi /api/matching/geocode/search/ + /geocode/reverse/ trên
    chính backend của app (cùng origin — không thể bị chặn bởi adblock domain).
  - Backend gọi Nominatim bằng requests với User-Agent chuẩn theo chính sách
    sử dụng của OSM, timeout ngắn, cache 6h để tiết kiệm quota.
  - Nếu Nominatim sập → trả 502 với thông báo tiếng Việt; client tự fallback
    gọi thẳng Nominatim (giữ tương lai dễ đổi provider).
"""

import hashlib
import logging

import requests
from django.core.cache import cache
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger('educarelink.matching.geocode')

NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
# User-Agent nhận diện ứng dụng theo chính sách sử dụng Nominatim
USER_AGENT = 'EduCareLink/1.0 (https://educarelink-backend.onrender.com)'
CACHE_TTL = 60 * 60 * 6  # 6 giờ — đúng tinh thần "cache heavy" của OSM policy
TIMEOUT_S = 6
# Giới hạn nhẹ chống lạm dụng proxy công khai: 60 req/phút/IP
RATE_LIMIT = 60
RATE_WINDOW_S = 60


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', '') or 'unknown')


def _rate_limited(request):
    """Throttle nhỏ gọn dựa trên cache — không cần cấu hình thêm."""
    key = 'geo:thr:' + hashlib.md5(_client_ip(request).encode()).hexdigest()
    count = cache.get(key)
    if count is None:
        cache.set(key, 1, RATE_WINDOW_S)
        return False
    if count >= RATE_LIMIT:
        return True
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, RATE_WINDOW_S)
    return False


def _nominatim(path, params):
    resp = requests.get(
        f'{NOMINATIM_BASE}{path}', params=params, timeout=TIMEOUT_S,
        headers={'User-Agent': USER_AGENT, 'Accept-Language': 'vi'})
    resp.raise_for_status()
    return resp.json()


def _cached_json(key, producer):
    hit = cache.get(key)
    if hit is not None:
        return hit
    data = producer()
    cache.set(key, data, CACHE_TTL)
    return data


class GeocodeSearchAPIView(APIView):
    """GET /api/matching/geocode/search/?q=...  →  {results: [...]}

    Cho phép public (web gọi bằng fetch thường, chưa kèm JWT) — chống lạm
    dụng bằng throttle IP phía dưới + cache 6h.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response(
                {'detail': 'Cần từ khoá tìm địa chỉ tối thiểu 2 ký tự.', 'results': []},
                status=400)
        if _rate_limited(request):
            return Response(
                {'detail': 'Bạn tìm địa chỉ quá nhanh. Vui lòng thử lại sau một phút.',
                 'results': []},
                status=429)
        key = 'geo:search:' + hashlib.md5(q.lower().encode()).hexdigest()
        try:
            results = _cached_json(key, lambda: _nominatim('/search', {
                'format': 'json', 'limit': 5, 'q': q, 'accept-language': 'vi',
            }))
        except requests.RequestException as exc:
            logger.warning('[Geocode] search fail cho q=%r: %s', q[:80], exc)
            return Response(
                {'detail': 'Dịch vụ tìm địa chỉ đang bận. Vui lòng thử lại sau.',
                 'results': []},
                status=502)
        return Response({'results': results})


class GeocodeReverseAPIView(APIView):
    """GET /api/matching/geocode/reverse/?lat=..&lon=..  →  {display_name, ...}"""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            lat = float(request.query_params.get('lat'))
            lon = float(request.query_params.get('lon'))
        except (TypeError, ValueError):
            return Response({'detail': 'Toạ độ không hợp lệ.'}, status=400)
        if _rate_limited(request):
            return Response(
                {'detail': 'Bạn tra toạ độ quá nhanh. Vui lòng thử lại sau một phút.'},
                status=429)
        key = 'geo:reverse:' + hashlib.md5(f'{lat:.5f},{lon:.5f}'.encode()).hexdigest()
        try:
            data = _cached_json(key, lambda: _nominatim('/reverse', {
                'format': 'json', 'lat': lat, 'lon': lon, 'accept-language': 'vi',
            }))
        except requests.RequestException as exc:
            logger.warning('[Geocode] reverse fail cho (%.4f, %.4f): %s', lat, lon, exc)
            return Response(
                {'detail': 'Dịch vụ tra địa chỉ đang bận. Vui lòng thử lại sau.'},
                status=502)
        return Response(data)
