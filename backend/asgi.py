"""
ASGI config — HTTP (Django) + WebSocket (Channels).

Deploy với Daphne:
  daphne -b 0.0.0.0 -p $PORT backend.asgi:application
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Django ASGI app must be initialized before importing routing / consumers
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from realtime.middleware import JWTAuthMiddlewareStack  # noqa: E402
from realtime.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOriginValidator(
        JWTAuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        )
    ),
})
