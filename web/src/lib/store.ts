import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'parent' | 'worker' | 'admin'
export type Screen =
  | 'landing'
  | 'splash'
  | 'login'
  | 'register'
  | 'parent-home'
  | 'parent-create-task'
  | 'parent-my-tasks'
  | 'parent-candidates'
  | 'parent-review'
  | 'worker-feed'
  | 'worker-task-detail'
  | 'worker-my-jobs'
  | 'worker-profile'
  | 'admin'
  | 'chatbot'

interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
  phone_number: string
  address: string
  is_verified: boolean
  is_approved: boolean
  ai_profile_summary: string | null
  qualifications: string[]
  expo_push_token: string | null
}

interface AppState {
  // Auth
  token: string | null
  user: User | null
  isAuthenticated: boolean

  // Navigation
  screen: Screen
  screenParams: Record<string, unknown>

  // Chatbot
  chatOpen: boolean

  // Actions
  setAuth: (token: string, user: User) => void
  logout: () => void
  navigate: (screen: Screen, params?: Record<string, unknown>) => void
  toggleChat: () => void
  setUser: (user: User) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      screen: 'landing',
      screenParams: {},
      chatOpen: false,

      setAuth: (token, user) =>
        set({
          token,
          user,
          isAuthenticated: true,
          screen: user.role === 'admin' ? 'admin' : user.role === 'parent' ? 'parent-home' : 'worker-feed',
        }),

      logout: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          screen: 'landing',
          chatOpen: false,
        }),

      navigate: (screen, params = {}) =>
        set({ screen, screenParams: params }),

      toggleChat: () =>
        set((state) => ({ chatOpen: !state.chatOpen })),

      setUser: (user) =>
        set({ user }),
    }),
    {
      name: 'educarelink-store',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// API Configuration
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api'

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const store = useAppStore.getState()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (store.token) {
    headers['Authorization'] = `Bearer ${store.token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    store.logout()
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Lỗi kết nối server.' }))
    throw new Error(err.error || err.detail || 'Lỗi không xác định.')
  }

  return res.json()
}

export async function apiUpload<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const store = useAppStore.getState()
  const headers: Record<string, string> = {}
  if (store.token) {
    headers['Authorization'] = `Bearer ${store.token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (res.status === 401) {
    store.logout()
    throw new Error('Phiên đăng nhập đã hết hạn.')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Lỗi kết nối server.' }))
    throw new Error(err.error || err.detail || 'Lỗi không xác định.')
  }

  return res.json()
}
