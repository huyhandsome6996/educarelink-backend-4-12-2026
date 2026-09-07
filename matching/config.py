"""
matching/config.py — Helper đọc config nghiệp vụ từ bảng MatchingConfig.

Mọi con số (buffer, commitment window, sàn đền bù, max candidates...) PHẢI đọc
qua hàm này — không hardcode. Giá trị mặc định trong matching/constants.py
chỉ dùng khi seed chưa chạy.
"""

import json
import logging

from django.core.cache import cache

from .constants import DEFAULT_CONFIG

logger = logging.getLogger('educarelink.matching')

CACHE_KEY = 'matching:config:all'
CACHE_TTL = 60  # giây — đổi config có trễ tối đa 60s


def _load_all():
    """Load toàn bộ config từ DB (có cache 60s)."""
    data = cache.get(CACHE_KEY)
    if data is not None:
        return data
    from .models import MatchingConfig
    data = {}
    for row in MatchingConfig.objects.all():
        data[row.key] = row.value_json
    cache.set(CACHE_KEY, data, CACHE_TTL)
    return data


def get_config(key, default=None):
    """Đọc 1 config theo key. Trả default từ DEFAULT_CONFIG nếu chưa seed."""
    data = _load_all()
    if key in data:
        return data[key]
    return DEFAULT_CONFIG.get(key, default)


def get_int(key, default=0):
    val = get_config(key, default)
    try:
        return int(val)
    except (TypeError, ValueError):
        logger.warning('[MatchingConfig] key %s không phải số: %r — dùng default %s',
                       key, val, default)
        return default


def invalidate_cache():
    cache.delete(CACHE_KEY)


def to_json(value):
    """Serialize giá trị cho seed/UPDATE (dùng trong seed command)."""
    return json.loads(json.dumps(value)) if not isinstance(value, (int, float, str, bool, list, dict)) else value
