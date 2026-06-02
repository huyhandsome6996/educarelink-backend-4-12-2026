'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  SlidersHorizontal,
  BookOpen,
  Baby,
  Home as HomeIcon,
  Heart,
  ShoppingCart,
  MapPin,
  CalendarDays,
  Clock,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Briefcase,
  User as UserIcon,
  LogOut,
  Star,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  MessageSquare,
  ClipboardList,
  BadgeCheck,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAppStore, apiFetch } from '@/lib/store'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskItem {
  id: number
  category: number | { id: number; name: string }
  title: string
  description: string
  location: string
  scheduled_time: string
  price: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  parent: number | { id: number; username: string; first_name: string; last_name: string }
  parent_name?: string
  category_name?: string
}

interface ApplicationItem {
  id: number
  task: number
  worker: number
  status: 'pending' | 'accepted' | 'rejected'
  applied_at: string
  task_title?: string
  task_status?: string
  task_price?: string
  task_location?: string
  task_scheduled_time?: string
  task_description?: string
  parent_username?: string
  parent_name?: string
  worker_name?: string
}

interface WorkerProfile {
  id: number
  username: string
  first_name: string
  last_name: string
  is_verified: boolean
  ai_profile_summary: string
  avg_rating: number
  review_count: number
  qualifications: string[]
  reviews: Array<{
    id: number
    rating: number
    comment: string
    reviewer_username: string
    reviewer_name: string
    created_at: string
  }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const categoryMap: Record<number, { icon: React.ElementType; label: string; gradient: string }> = {
  1: { icon: BookOpen, label: 'Gia sư', gradient: 'from-amber-400 to-orange-500' },
  2: { icon: Baby, label: 'Đón trẻ', gradient: 'from-pink-400 to-rose-500' },
  3: { icon: HomeIcon, label: 'Dọn dẹp', gradient: 'from-teal-400 to-emerald-500' },
  4: { icon: Heart, label: 'Trông trẻ', gradient: 'from-violet-400 to-purple-500' },
  5: { icon: ShoppingCart, label: 'Mua sắm', gradient: 'from-sky-400 to-blue-500' },
}

const appStatusConfig: Record<ApplicationItem['status'], { label: string; color: string; bg: string; border: string }> = {
  pending: { label: 'Đang chờ duyệt', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  accepted: { label: 'Đã được chọn', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  rejected: { label: 'Bị từ chối', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
}

function formatPrice(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price
  return new Intl.NumberFormat('vi-VN').format(num) + ' VNĐ'
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })
  } catch {
    return dateStr
  }
}

function getCategoryInfo(cat: TaskItem['category']) {
  if (typeof cat === 'number') return categoryMap[cat] || null
  return null
}

function getCatName(task: TaskItem): string {
  if (task.category_name) return task.category_name
  if (typeof task.category === 'object' && task.category?.name) return task.category.name
  const info = getCategoryInfo(task.category)
  return info?.label || 'Dịch vụ'
}

function getParentName(task: TaskItem): string {
  if (task.parent_name) return task.parent_name
  if (typeof task.parent === 'object' && task.parent?.username) {
    const p = task.parent as { username: string; first_name: string; last_name: string }
    return p.first_name ? `${p.first_name} ${p.last_name}`.trim() : p.username
  }
  return 'Phụ huynh'
}

function getCatIcon(task: TaskItem) {
  const info = getCategoryInfo(task.category)
  return info?.icon || ClipboardList
}

function getCatGradient(task: TaskItem) {
  const info = getCategoryInfo(task.category)
  return info?.gradient || 'from-orange-400 to-amber-500'
}

// ─── Animation Variants ─────────────────────────────────────────────────────

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
}

// ─── 1. WorkerFeedScreen ────────────────────────────────────────────────────

export function WorkerFeedScreen() {
  const { user, navigate, toggleChat } = useAppStore()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'feed' | 'jobs' | 'profile'>('feed')
  const [appliedTaskIds, setAppliedTaskIds] = useState<Set<number>>(new Set())

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiFetch<TaskItem[]>('/tasks/')
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchApplied = useCallback(async () => {
    try {
      const data = await apiFetch<ApplicationItem[]>('/worker/my-jobs/')
      if (Array.isArray(data)) {
        setAppliedTaskIds(new Set(data.map((a: ApplicationItem) => typeof a.task === 'number' ? a.task : a.task)))
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchApplied()
  }, [fetchTasks, fetchApplied])

  const firstName = user?.first_name || 'bạn'
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Chào buổi sáng'
    if (hour < 18) return 'Chào buổi chiều'
    return 'Chào buổi tối'
  }

  const filteredTasks = tasks
    .filter((t) => t.status === 'open')
    .filter((t) => {
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        t.title.toLowerCase().includes(term) ||
        t.location.toLowerCase().includes(term) ||
        getCatName(t).toLowerCase().includes(term)
      )
    })

  const handleApply = async (taskId: number) => {
    if (!confirm('Bạn có chắc muốn ứng tuyển công việc này?')) return
    try {
      await apiFetch(`/worker/tasks/${taskId}/apply/`, { method: 'POST' })
      toast.success('Ứng tuyển thành công!', { description: 'Hãy chờ phụ huynh xét duyệt.' })
      setAppliedTaskIds((prev) => new Set([...prev, taskId]))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ứng tuyển thất bại.'
      toast.error('Ứng tuyển thất bại', { description: message })
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)' }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 pt-4 pb-3"
        style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #fffbf7 100%)', backdropFilter: 'blur(12px)' }}
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {getGreeting()}, {firstName}! 🌟
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Tìm việc làm phù hợp với bạn</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative w-10 h-10 rounded-full bg-white shadow-md border border-orange-100 flex items-center justify-center cursor-pointer"
              onClick={() => toast.info('Thông báo đang phát triển')}
            >
              <MessageSquare className="w-5 h-5 text-orange-500" />
            </motion.button>
          </div>

          {/* Search Bar */}
          {activeTab === 'feed' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                <Input
                  placeholder="Tìm kiếm việc làm..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/80 text-sm"
                />
              </div>
              <Button
                variant="outline"
                className="h-10 w-10 p-0 border-orange-200 hover:bg-orange-50 cursor-pointer"
                onClick={() => toast.info('Bộ lọc đang phát triển')}
              >
                <SlidersHorizontal className="w-4 h-4 text-orange-500" />
              </Button>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1 px-4 pb-24 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div
              key="feed"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4 mt-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">Việc làm mới nhất</h3>
                <span className="text-xs text-gray-500">{filteredTasks.length} việc</span>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-36 rounded-xl bg-orange-50/50 animate-pulse" />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-10"
                >
                  <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-orange-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Chưa có việc làm nào</p>
                  <p className="text-xs text-gray-500 mt-1">Hãy quay lại sau nhé!</p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {filteredTasks.map((task) => {
                    const CatIcon = getCatIcon(task)
                    const gradient = getCatGradient(task)
                    const isApplied = appliedTaskIds.has(task.id)
                    return (
                      <motion.div key={task.id} variants={staggerItem}>
                        <Card className="border border-orange-100/60 shadow-sm hover:shadow-md transition-shadow py-0 overflow-hidden">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${gradient}`}>
                                <CatIcon className="w-5 h-5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className="bg-orange-50 text-orange-600 border-orange-200 text-[10px] px-1.5 py-0 border">
                                    {getCatName(task)}
                                  </Badge>
                                  <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] px-1.5 py-0 border">
                                    MỚI
                                  </Badge>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
                                  {task.title}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                  {task.description}
                                </p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3 text-orange-400" />
                                    <span className="font-semibold text-orange-600">{formatPrice(task.price)}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate max-w-[80px]">{task.location}</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" />
                                    {formatDate(task.scheduled_time)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <UserIcon className="w-3 h-3" />
                                    {getParentName(task)}
                                  </span>
                                </div>
                                <div className="mt-3">
                                  {isApplied ? (
                                    <Button
                                      disabled
                                      className="w-full h-9 text-sm bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50 cursor-not-allowed"
                                      variant="outline"
                                    >
                                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                      Đã ứng tuyển
                                    </Button>
                                  ) : (
                                    <Button
                                      onClick={() => handleApply(task.id)}
                                      className="w-full h-9 text-sm text-white font-semibold cursor-pointer"
                                      style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                                    >
                                      <Send className="w-4 h-4 mr-1.5" />
                                      Ứng tuyển
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'jobs' && (
            <motion.div
              key="jobs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <WorkerMyJobsInline onBack={() => setActiveTab('feed')} />
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="py-4"
            >
              <WorkerProfileSection />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-lg border-t border-orange-100/50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-4">
          {[
            { id: 'feed' as const, icon: Search, label: 'Tìm việc' },
            { id: 'jobs' as const, icon: Briefcase, label: 'Việc của tôi' },
            { id: 'profile' as const, icon: UserIcon, label: 'Hồ sơ' },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center gap-0.5 py-1 px-3 cursor-pointer"
              >
                <div className="relative">
                  <tab.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400'}`} />
                  {isActive && (
                    <motion.div
                      layoutId="worker-nav-dot"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500"
                    />
                  )}
                </div>
                <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400'}`}>
                  {tab.label}
                </span>
              </motion.button>
            )
          })}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => useAppStore.getState().logout()}
            className="flex flex-col items-center gap-0.5 py-1 px-3 cursor-pointer"
          >
            <LogOut className="w-5 h-5 text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400">Thoát</span>
          </motion.button>
        </div>
      </nav>
    </div>
  )
}

// ─── WorkerMyJobsInline ──────────────────────────────────────────────────────

function WorkerMyJobsInline({ onBack }: { onBack: () => void }) {
  const [applications, setApplications] = useState<ApplicationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all')

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await apiFetch<ApplicationItem[]>('/worker/my-jobs/')
        setApplications(Array.isArray(data) ? data : [])
      } catch {
        setApplications([])
      } finally {
        setLoading(false)
      }
    }
    fetchJobs()
  }, [])

  const filtered = filter === 'all' ? applications : applications.filter((a) => a.status === filter)

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="cursor-pointer">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h2 className="text-base font-bold text-gray-900">Việc của tôi</h2>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'all' as const, label: 'Tất cả' },
          { id: 'pending' as const, label: 'Đang chờ' },
          { id: 'accepted' as const, label: 'Đã nhận' },
          { id: 'rejected' as const, label: 'Từ chối' },
        ] as const).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filter === f.id
                ? 'bg-orange-500 text-white shadow-md'
                : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-orange-50/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-orange-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Chưa có việc nào</p>
          <p className="text-xs text-gray-500 mt-1">Hãy ứng tuyển việc làm từ bảng tin!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            const cfg = appStatusConfig[app.status]
            return (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border border-orange-100/60 shadow-sm py-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 flex-1 mr-2">
                        {app.task_title || `Việc #${app.task}`}
                      </h4>
                      <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} text-[10px] px-1.5 py-0 border`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {app.task_price && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-orange-400" />
                          <span className="font-medium text-orange-600">{formatPrice(app.task_price)}</span>
                        </span>
                      )}
                      {app.task_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[100px]">{app.task_location}</span>
                        </span>
                      )}
                    </div>
                    {app.task_scheduled_time && (
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                        <CalendarDays className="w-3 h-3" />
                        {formatDate(app.task_scheduled_time)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── WorkerProfileSection ────────────────────────────────────────────────────

function WorkerProfileSection() {
  const { user, logout } = useAppStore()
  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchProfile = async () => {
      try {
        const data = await apiFetch<WorkerProfile>(`/worker/${user.id}/profile/`)
        setProfile(data)
      } catch {
        // Fallback to user data
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [user])

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || profile.username
    : user ? `${user.first_name} ${user.last_name}`.trim() || user.username : ''

  const avgRating = profile?.avg_rating || 5.0
  const reviewCount = profile?.review_count || 0
  const qualifications = profile?.qualifications || user?.qualifications || []
  const aiSummary = profile?.ai_profile_summary || user?.ai_profile_summary || 'Chưa có nhận xét từ AI.'
  const reviews = profile?.reviews || []

  return (
    <div className="space-y-5">
      {/* Profile Header */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
          <span className="text-2xl font-bold text-white">
            {displayName[0]?.toUpperCase() || 'W'}
          </span>
        </div>
        <h3 className="text-base font-bold text-gray-900">{displayName}</h3>
        <div className="flex items-center justify-center gap-2 mt-1">
          {profile?.is_verified && (
            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] px-2 py-0 border">
              <BadgeCheck className="w-3 h-3 mr-0.5" />
              Đã xác thực
            </Badge>
          )}
          <Badge className="bg-orange-50 text-orange-600 border-orange-200 text-[10px] px-2 py-0 border">
            Carepartner
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="text-lg font-bold text-amber-700">{avgRating.toFixed(1)}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Đánh giá</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-emerald-700">{reviewCount}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Nhận xét</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-orange-700">{qualifications.length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 font-medium">Bằng cấp</p>
        </div>
      </div>

      {/* Qualifications */}
      {qualifications.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-orange-500" />
            <h4 className="text-sm font-semibold text-gray-900">Bằng cấp & Chứng chỉ</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {qualifications.map((q, i) => (
              <Badge key={i} className="bg-orange-50 text-orange-700 border-orange-200 text-xs px-3 py-1">
                {q}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* AI Summary */}
      <Card className="border border-orange-100/60 shadow-sm py-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <h4 className="text-sm font-semibold text-gray-900">Nhận xét từ AI</h4>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{aiSummary}</p>
        </CardContent>
      </Card>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900">Đánh giá từ phụ huynh</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {reviews.map((r) => (
              <Card key={r.id} className="border border-orange-100/40 shadow-sm py-0">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{r.reviewer_name}</span>
                    <span className="text-[10px] text-gray-400">{r.created_at}</span>
                  </div>
                  <div className="flex items-center gap-0.5 mb-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3 h-3 ${s <= r.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-600">{r.comment}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Settings */}
      <div className="space-y-2">
        {[
          { icon: UserIcon, label: 'Thông tin cá nhân', color: 'text-orange-500' },
          { icon: ShieldCheck, label: 'Bảo mật', color: 'text-emerald-500' },
          { icon: MessageSquare, label: 'Trợ giúp', color: 'text-violet-500' },
        ].map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-orange-50/50 transition-colors cursor-pointer"
            onClick={() => toast.info('Chức năng đang phát triển')}
          >
            <item.icon className={`w-5 h-5 ${item.color}`} />
            <span className="text-sm font-medium text-gray-700">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        onClick={logout}
        className="w-full h-10 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Đăng xuất
      </Button>
    </div>
  )
}

// ─── 3. WorkerMyJobsScreen (standalone) ──────────────────────────────────────

export function WorkerMyJobsScreen() {
  const { navigate } = useAppStore()
  const [applications, setApplications] = useState<ApplicationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all')

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await apiFetch<ApplicationItem[]>('/worker/my-jobs/')
        setApplications(Array.isArray(data) ? data : [])
      } catch {
        setApplications([])
      } finally {
        setLoading(false)
      }
    }
    fetchJobs()
  }, [])

  const filtered = filter === 'all' ? applications : applications.filter((a) => a.status === filter)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)' }}
    >
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 py-3 border-b border-orange-100/50 bg-white/80 backdrop-blur-lg"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('worker-feed')}
            className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-orange-600" />
          </motion.button>
          <h1 className="text-base font-bold text-gray-900">Việc của tôi</h1>
        </div>
      </motion.header>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {([
            { id: 'all' as const, label: 'Tất cả' },
            { id: 'pending' as const, label: 'Đang chờ' },
            { id: 'accepted' as const, label: 'Đã nhận' },
            { id: 'rejected' as const, label: 'Từ chối' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filter === f.id
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-orange-50/50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-orange-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">Chưa có việc nào</p>
            <p className="text-xs text-gray-500 mt-1">Hãy ứng tuyển việc làm từ bảng tin!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((app) => {
              const cfg = appStatusConfig[app.status]
              return (
                <Card key={app.id} className="border border-orange-100/60 shadow-sm py-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 flex-1 mr-2">
                        {app.task_title || `Việc #${app.task}`}
                      </h4>
                      <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} text-[10px] px-1.5 py-0 border`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    {app.task_price && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <DollarSign className="w-3 h-3 text-orange-400" />
                        <span className="font-medium text-orange-600">{formatPrice(app.task_price)}</span>
                      </div>
                    )}
                    {app.task_location && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <MapPin className="w-3 h-3" />
                        {app.task_location}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── 4. WorkerProfileScreen (standalone) ─────────────────────────────────────

export function WorkerProfileScreen() {
  const { user, navigate, logout } = useAppStore()
  const [profile, setProfile] = useState<WorkerProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const workerId = (useAppStore.getState().screenParams?.worker_id as number) || user?.id
    if (!workerId) return
    const fetchProfile = async () => {
      try {
        const data = await apiFetch<WorkerProfile>(`/worker/${workerId}/profile/`)
        setProfile(data)
      } catch {
        // fallback
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [user])

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || profile.username
    : user ? `${user.first_name} ${user.last_name}`.trim() || user.username : ''

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)' }}
    >
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 py-3 border-b border-orange-100/50 bg-white/80 backdrop-blur-lg"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('worker-feed')}
            className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-orange-600" />
          </motion.button>
          <h1 className="text-base font-bold text-gray-900">Hồ sơ của tôi</h1>
        </div>
      </motion.header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="space-y-4">
            <div className="h-20 w-20 rounded-full bg-orange-100 animate-pulse mx-auto" />
            <div className="h-6 w-48 bg-orange-50 animate-pulse mx-auto rounded" />
          </div>
        ) : (
          <WorkerProfileSection />
        )}
      </main>
    </div>
  )
}
