# EduCareLink Admin Web — quản trị Flow 1 (ghép cặp)

Next.js 15 + TypeScript. Xác thực SimpleJWT. 7 trang:

| Trang | Đường dẫn | Chức năng |
|---|---|---|
| Login | `/` | Đăng nhập bằng tài khoản admin (JWT) |
| Elo Bands | `/elo-bands` | 6 bậc ELO (trusted/good/normal/watch/restricted/blocked) + hệ số × hệ số phạt |
| Matching Weights | `/matching-weights` | 7 trọng số điểm ghép cặp (tổng phải = 100) |
| Appeals | `/appeals` | Duyệt / từ chối kháng cáo (7 ngày, max 3/30 ngày) |
| State Logs | `/state-logs` | Audit mọi chuyển trạng thái JobPost / Booking |
| Bookings | `/bookings` | Danh sách + chi tiết đơn ghép cặp |
| Jobs | `/jobs` | Danh sách + chi tiết bài đăng (13 trạng thái) |

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `BACKEND_URL` | Khi deploy | URL backend Django — `next.config.mjs` rewrite `/api/*` → `${BACKEND_URL}/api/*` (proxy server-side, không cần CORS) |
| `NEXT_PUBLIC_API_BASE` | Không | Nếu muốn gọi thẳng backend (bypass proxy): VD `https://educarelink-backend.onrender.com/api/matching` |
| `NEXT_PUBLIC_LOGIN_URL` | Không | Đường dẫn lấy token (mặc định `/api/token/`) |

## Chạy local

```bash
cd admin-web
npm install
BACKEND_URL=http://127.0.0.1:8000 npm run dev
# Mở http://localhost:3000 — API được proxy tới Django
```

## Build production

```bash
npm install --no-audit --no-fund
npm run build
BACKEND_URL=https://educarelink-backend.onrender.com npm run start   # cổng 3000
```

## Deploy (Render)

Service `educarelink-admin-web` đã khai báo trong `render.yaml` (rootDir:
`admin-web`, build: `npm install && npm run build`, start: `npm run start`,
`BACKEND_URL=https://educarelink-backend.onrender.com`).
