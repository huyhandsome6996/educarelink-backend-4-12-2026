"""API Views cho performance module — monitor cache + optimization stats."""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser

logger = logging.getLogger('educarelink.performance.api')


class PerformanceStatsAPIView(APIView):
    """
    GET /api/performance/stats/

    Trả về thống kê hiệu năng:
    - AI response cache hit rate
    - Moderation cache hit rate
    - Gemini client pool status
    - DB connection stats
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        stats = {
            'ai_response_cache': {},
            'moderation_cache': {},
            'gemini_pool': {},
            'django_cache': {},
        }

        # AI cache stats
        try:
            from performance.lru_cache import get_ai_cache_stats, get_moderation_cache_stats
            stats['ai_response_cache'] = get_ai_cache_stats()
            stats['moderation_cache'] = get_moderation_cache_stats()
        except Exception as e:
            stats['ai_response_cache'] = {'error': str(e)}

        # Gemini pool stats
        try:
            from performance.gemini_pool import _gemini_client_singleton, _gemini_init_attempted
            stats['gemini_pool'] = {
                'initialized': _gemini_client_singleton is not None,
                'init_attempted': _gemini_init_attempted,
            }
        except Exception as e:
            stats['gemini_pool'] = {'error': str(e)}

        # Django cache stats (LocMem không có API stats, nhưng check được backend)
        try:
            from django.core.cache import cache
            stats['django_cache'] = {
                'backend': cache.__class__.__name__,
                'location': getattr(cache, 'location', 'default'),
            }
        except Exception as e:
            stats['django_cache'] = {'error': str(e)}

        return Response(stats)


class ClearCacheAPIView(APIView):
    """
    POST /api/performance/clear-cache/
    Body: { cache: 'ai' | 'moderation' | 'django' | 'all' }

    Clear cache để force refresh data.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        cache_type = request.data.get('cache', 'all')
        cleared = []

        if cache_type in ('ai', 'all'):
            try:
                from performance.lru_cache import _AI_RESPONSE_CACHE
                _AI_RESPONSE_CACHE.clear()
                cleared.append('ai_response')
            except Exception as e:
                logger.warning(f'Clear AI cache failed: {e}')

        if cache_type in ('moderation', 'all'):
            try:
                from performance.lru_cache import _MODERATION_CACHE
                _MODERATION_CACHE.clear()
                cleared.append('moderation')
            except Exception as e:
                logger.warning(f'Clear moderation cache failed: {e}')

        if cache_type in ('django', 'all'):
            try:
                from django.core.cache import cache
                cache.clear()
                cleared.append('django')
            except Exception as e:
                logger.warning(f'Clear django cache failed: {e}')

        return Response({
            'message': f'Đã clear cache: {", ".join(cleared)}',
            'cleared': cleared,
        })
