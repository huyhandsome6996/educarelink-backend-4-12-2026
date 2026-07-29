"""
JWT authentication for Django Channels WebSocket connections.

Client connects to:
  wss://host/ws/realtime/?token=<access_jwt>

Token is the same SimpleJWT access token used by REST API.
"""
from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token: str):
    if not token:
        return AnonymousUser()
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        access = AccessToken(token)
        user_id = access.get('user_id')
        if not user_id:
            return AnonymousUser()
        return User.objects.get(id=user_id)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        params = parse_qs(query_string)
        token_list = params.get('token') or []
        token = token_list[0] if token_list else None

        # Also accept Authorization-style subprotocol / headers if present
        if not token:
            headers = dict(scope.get('headers') or [])
            auth = headers.get(b'authorization', b'').decode()
            if auth.lower().startswith('bearer '):
                token = auth[7:].strip()

        scope['user'] = await get_user_from_token(token)
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)
