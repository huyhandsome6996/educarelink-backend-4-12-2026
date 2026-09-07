// lib/api.ts — Fetch helper với SimpleJWT (login → access/refresh vào localStorage)
//
// Nơi định tuyến API calls:
//   - Mặc định gọi đường dẫn tương đối `/api/matching` → được next.config.mjs
//     rewrite (proxy server-side) tới `BACKEND_URL` (env var, Render khai báo).
//     Proxy giúp không cần cấu hình CORS trên Django.
//   - Nếu deploy static hoặc muốn gọi thẳng (bypass proxy), set
//     NEXT_PUBLIC_API_BASE (VD: https://educarelink-backend.onrender.com/api/matching)
//     → api.ts sẽ dùng tuyệt đối.

const TOKEN_KEY = 'educarelink_admin_access';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/matching';
const LOGIN_URL = process.env.NEXT_PUBLIC_LOGIN_URL || '/api/token/';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (resp.status === 401) {
    setToken(null);
    window.location.href = '/';
    throw new Error('Phiên đăng nhập hết hạn.');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.detail ?? `Lỗi ${resp.status}`);
  }
  return data as T;
}

export async function login(username: string, password: string): Promise<boolean> {
  const resp = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) return false;
  const data = await resp.json();
  setToken(data.access);
  return true;
}

export const STATUS_VI: Record<string, string> = {
  draft: 'Bản nháp', published: 'Đã đăng', ai_parsing: 'AI đang phân tích',
  ai_parsed: 'Đã phân tích xong', ai_failed: 'Cần kiểm tra lại',
  needs_admin_review: 'Đang chờ kiểm duyệt', matching: 'Đang tìm CarePartner',
  carepartner_selected: 'Đã chọn CarePartner', needs_replacement: 'Cần người thay thế',
  in_progress: 'Đang thực hiện', completed: 'Hoàn thành', expired: 'Hết hạn', proposed: 'Được đề xuất', not_selected: 'Không được chọn',
  awaiting_commitment: 'Chờ cam kết', committed: 'Đã cam kết',
  reschedule_requested: 'Đang xin đổi giờ', awaiting_review: 'Chờ đánh giá',
  declined_in_window: 'Đã từ chối trong thời hạn',
  cancelled_by_carepartner: 'CarePartner đã hủy', suspected_no_show: 'Nghi ngờ không đến',
  no_show: 'Không đến làm', no_show_unconfirmed: 'Chưa xác nhận không đến',
  cancelled_by_parent: 'Phụ huynh đã hủy', expired_no_response: 'Hết hạn phản hồi',
  disputed: 'Có tranh chấp',
};
