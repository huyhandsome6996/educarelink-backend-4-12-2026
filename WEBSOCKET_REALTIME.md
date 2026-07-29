# WebSocket Realtime — EduCareLink

## Mục tiêu
Khi user A (web) tạo task / nhận thông báo / đổi status → user B (mobile) **cập nhật ngay** không cần kéo refresh (và ngược lại).

## Kiến trúc

```
Mobile / Web  ──WebSocket──►  Daphne (ASGI)
                                 │
                    channels.layers (InMemory | Redis)
                                 │
                    group: user_{id} | role_{role} | task_{id}
```

- **Endpoint:** `wss://educarelink-backend.onrender.com/ws/realtime/?token=<JWT_ACCESS>`
- **Auth:** cùng SimpleJWT access token như REST API
- **HTTP API không đổi** — WebSocket chỉ **bổ sung** push event

## Events server → client

| type | Khi nào |
|------|---------|
| `connected` | Handshake OK |
| `notification` | `Notification.objects.create(...)` |
| `task_created` | Task mới |
| `task_update` | Task status/title đổi |
| `pong` | Trả lời `ping` |

## Client → server

```json
{ "type": "ping" }
{ "type": "subscribe_task", "task_id": 123 }
{ "type": "unsubscribe_task", "task_id": 123 }
```

## Deploy Render (quan trọng)

Gunicorn **không** hỗ trợ WebSocket. Branch này dùng **Daphne**:

```
startCommand: daphne -b 0.0.0.0 -p $PORT backend.asgi:application
```

- Free tier: `InMemoryChannelLayer` (1 process) — đủ demo.
- Scale / multi-instance: thêm **Redis** + env `REDIS_URL` → tự chuyển `RedisChannelLayer`.

Sau merge PR: Render Settings → Start Command đổi sang Daphne (nếu `render.yaml` / Procfile chưa auto).

## Mobile

- `mobile/src/services/RealtimeService.js` — connect / reconnect / event bus
- `AuthContext` gọi `connect()` sau login, `disconnect()` khi logout
- `NotificationBell` có thể `RealtimeService.on('notification', ...)` để tăng badge ngay

## Web

- Script: `/static/js/realtime.js` → `EduCareRealtime.connect(accessToken)`
- Lắng nghe: `EduCareRealtime.on('notification', fn)`

## Local dev

```bash
pip install -r requirements.txt
daphne -b 0.0.0.0 -p 8000 backend.asgi:application
# hoặc: python manage.py runserver  (Channels + daphne app cũng serve WS)
```

## Giới hạn

1. Render free sleep → WS disconnect; client auto-reconnect.
2. InMemory không share giữa nhiều worker.
3. Push Expo vẫn cần cho app **background/killed**; WS chỉ khi app mở.
