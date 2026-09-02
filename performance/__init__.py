"""
╔══════════════════════════════════════════════════════════════════╗
║   EduCareLink — Performance Module                                 ║
║   Áp dụng cấu trúc dữ liệu & giải thuật để tối ưu hiệu năng        ║
║                                                                    ║
║   Cấu trúc dữ liệu áp dụng:                                        ║
║   - LRU Cache (OrderedDict) cho AI response memoization            ║
║   - Hash table (dict) cho request deduplication                    ║
║   - Heap (Priority Queue) cho ranking candidates                   ║
║   - Trie (prefix tree) cho search autocomplete                     ║
║   - Spatial hashing (GeoHash) cho geofence queries                 ║
║                                                                    ║
║   Giải thuật áp dụng:                                              ║
║   - Memoization (top-down DP) cho AI prompts                       ║
║   - Bounding box filter (O(n) → O(k)) cho spatial queries          ║
║   - Batch processing (amortized O(1) per item) cho notifications   ║
║   - Connection pooling (1 init, reuse) cho HTTP client              ║
║   - Async background processing cho non-critical AI calls           ║
╚══════════════════════════════════════════════════════════════════╝
"""

# Import các utility để dùng ở các module khác
from .lru_cache import LRUCache, cached
from .gemini_pool import get_pooled_gemini_client
from .spatial import (
    haversine_distance_optimized,
    bounding_box_filter,
    geohash_encode,
    geohash_neighbors,
)
from .request_dedup import deduplicate_request

__all__ = [
    'LRUCache', 'cached',
    'get_pooled_gemini_client',
    'haversine_distance_optimized',
    'bounding_box_filter',
    'geohash_encode', 'geohash_neighbors',
    'deduplicate_request',
]
