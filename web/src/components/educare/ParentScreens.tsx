'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Search,
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
  AlertCircle,
  ClipboardList,
  MessageSquare,
  User as UserIcon,
  LogOut,
  Plus,
  Users,
  ShieldCheck,
  Star,
  Send,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { useAppStore, apiFetch } from '@/lib/store'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: number
  category: string
  title: string
  description: string
  location: string
  scheduled_time: string
  price: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  applicant_count?: number
  assigned_to?: number | null
}

interface Candidate {
  id: number
  user: {
    id: number
    first_name: string
    last_name: string
    avatar?: string
    is_verified: boolean
    qualifications: string[]
  }
  rating: number
  completed_jobs: number
  application_id: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusConfig: Record<
  Task['status'],
  { label: string; color: string; bg: string; border: string }
> = {
  open: {
    label: 'Đang tìm người',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  in_progress: {
    label: 'Đang thực hiện',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  completed: {
    label: 'Hoàn thành',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  cancelled: {
    label: 'Đã hủy',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
}

const categoryIcons: Record<string, { icon: React.ElementType; label: string; gradient: string }> = {
  tutoring: { icon: BookOpen, label: 'Gia sư', gradient: 'from-amber-400 to-orange-500' },
  pickup: { icon: Baby, label: 'Đón trẻ', gradient: 'from-pink-400 to-rose-500' },
  cleaning: { icon: HomeIcon, label: 'Dọn dẹp', gradient: 'from-teal-400 to-emerald-500' },
  babysitting: { icon: Heart, label: 'Trông trẻ', gradient: 'from-violet-400 to-purple-500' },
  shopping: { icon: ShoppingCart, label: 'Mua sắm', gradient: 'from-sky-400 to-blue-500' },
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

function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] || fullName
}

// ─── Animation Variants ─────────────────────────────────────────────────────

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
}

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.06 },
  },
}

const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
}

// ─── 1. ParentHomeScreen ─────────────────────────────────────────────────────

export function ParentHomeScreen() {
  const { user, navigate, toggleChat } = useAppStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'home' | 'tasks' | 'chat' | 'profile'>('home')

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiFetch<Task[]>('/parent/my-tasks/')
      setTasks(Array.isArray(data) ? data : [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const recentTasks = tasks.slice(0, 3)
  const firstName = user ? getFirstName(`${user.first_name} ${user.last_name}`) : 'bạn'

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Chào ngày mới'
    if (hour < 18) return 'Chào buổi chiều'
    return 'Chào buổi tối'
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)',
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 pt-4 pb-3"
        style={{
          background: 'linear-gradient(135deg, #fff7ed 0%, #fffbf7 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {getGreeting()}, {firstName} ơi! 🌅
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Hôm nay bạn cần hỗ trợ gì?
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-10 h-10 rounded-full bg-white shadow-md border border-orange-100 flex items-center justify-center cursor-pointer"
            onClick={() => toast.info('Thông báo đang được phát triển')}
          >
            <Bell className="w-5 h-5 text-orange-500" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
          </motion.button>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1 px-4 pb-24 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-5 mt-2"
            >
              {/* Hero CTA Card */}
              <motion.div variants={staggerItem}>
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate('parent-create-task')}
                  className="relative overflow-hidden rounded-2xl cursor-pointer shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.15, 0.05] }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                      className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-white/10"
                    />
                  </div>
                  <div className="relative p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-white">
                          Tìm Người Phụ Giúp
                        </h2>
                        <p className="text-sm text-orange-100 mt-1.5 leading-relaxed">
                          Tìm carepartner phù hợp chỉ trong 3 phút. Nhanh chóng, tin cậy!
                        </p>
                        <motion.div
                          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm cursor-pointer"
                          whileHover={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
                        >
                          <Plus className="w-4 h-4 text-white" />
                          <span className="text-sm font-semibold text-white">
                            Đăng việc ngay
                          </span>
                          <ArrowRight className="w-4 h-4 text-white" />
                        </motion.div>
                      </div>
                      <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ml-3">
                        <Sparkles className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              {/* Việc cần làm Section */}
              <motion.div variants={staggerItem}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-gray-900">Việc cần làm</h3>
                  {tasks.length > 0 && (
                    <button
                      onClick={() => setActiveTab('tasks')}
                      className="text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors cursor-pointer"
                    >
                      Xem tất cả →
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-28 rounded-xl bg-orange-50/50 animate-pulse"
                      />
                    ))}
                  </div>
                ) : recentTasks.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-10"
                  >
                    <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                      <ClipboardList className="w-8 h-8 text-orange-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">
                      Chưa có việc nào
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Hãy đăng việc mới để tìm carepartner phù hợp
                    </p>
                    <Button
                      onClick={() => navigate('parent-create-task')}
                      className="mt-4 h-9 text-sm text-white font-semibold cursor-pointer"
                      style={{
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Đăng việc mới
                    </Button>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {recentTasks.map((task) => {
                      const cfg = statusConfig[task.status]
                      const catInfo = categoryIcons[task.category]
                      return (
                        <motion.div
                          key={task.id}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => {
                            if (task.status === 'open') {
                              navigate('parent-candidates', { task_id: task.id })
                            } else {
                              navigate('parent-my-tasks')
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <Card className="border border-orange-100/60 shadow-sm hover:shadow-md transition-shadow py-0">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${catInfo?.gradient || 'from-orange-400 to-amber-500'}`}
                                >
                                  {catInfo ? (
                                    <catInfo.icon className="w-5 h-5 text-white" />
                                  ) : (
                                    <ClipboardList className="w-5 h-5 text-white" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-sm font-semibold text-gray-900 truncate">
                                      {task.title}
                                    </h4>
                                    <Badge
                                      className={`${cfg.bg} ${cfg.color} ${cfg.border} text-[10px] px-1.5 py-0 border`}
                                    >
                                      {cfg.label}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <DollarSign className="w-3 h-3 text-orange-400" />
                                      <span className="font-medium text-orange-600">
                                        {formatPrice(task.price)}
                                      </span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      <span className="truncate max-w-[100px]">
                                        {task.location}
                                      </span>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                    <span className="flex items-center gap-1">
                                      <CalendarDays className="w-3 h-3" />
                                      {formatDate(task.scheduled_time)}
                                    </span>
                                    {task.applicant_count !== undefined && task.applicant_count > 0 && (
                                      <span className="flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        {task.applicant_count} ứng viên
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </motion.div>

              {/* Quick Stats */}
              {tasks.length > 0 && (
                <motion.div variants={staggerItem}>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        label: 'Đang tìm',
                        count: tasks.filter((t) => t.status === 'open').length,
                        color: 'text-orange-600',
                        bg: 'bg-orange-50',
                      },
                      {
                        label: 'Đang làm',
                        count: tasks.filter((t) => t.status === 'in_progress').length,
                        color: 'text-emerald-600',
                        bg: 'bg-emerald-50',
                      },
                      {
                        label: 'Hoàn thành',
                        count: tasks.filter((t) => t.status === 'completed').length,
                        color: 'text-blue-600',
                        bg: 'bg-blue-50',
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className={`${stat.bg} rounded-xl p-3 text-center`}
                      >
                        <p className={`text-xl font-bold ${stat.color}`}>
                          {stat.count}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-medium">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'tasks' && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <ParentMyTasksInline onBack={() => setActiveTab('home')} />
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="py-10 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-orange-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">Tin nhắn</p>
              <p className="text-xs text-gray-500 mt-1">Chức năng đang phát triển</p>
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
              <ParentProfileSection />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-lg border-t border-orange-100/50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-4">
          {[
            { id: 'home' as const, icon: HomeIcon, label: 'Trang chủ' },
            { id: 'tasks' as const, icon: ClipboardList, label: 'Việc của tôi' },
            { id: 'chat' as const, icon: MessageSquare, label: 'Tin nhắn' },
            { id: 'profile' as const, icon: UserIcon, label: 'Cá nhân' },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  if (tab.id === 'chat') {
                    toggleChat()
                  } else {
                    setActiveTab(tab.id)
                  }
                }}
                className="flex flex-col items-center gap-0.5 py-1 px-3 cursor-pointer"
              >
                <div className="relative">
                  <tab.icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? 'text-orange-500' : 'text-gray-400'
                    }`}
                  />
                  {isActive && (
                    <motion.div
                      layoutId="nav-dot"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500"
                    />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    isActive ? 'text-orange-500' : 'text-gray-400'
                  }`}
                >
                  {tab.label}
                </span>
              </motion.button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// ─── Inline My Tasks (for bottom nav tab) ───────────────────────────────────

function ParentMyTasksInline({ onBack }: { onBack: () => void }) {
  const { navigate } = useAppStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await apiFetch<Task[]>('/parent/my-tasks/')
        setTasks(Array.isArray(data) ? data : [])
      } catch {
        setTasks([])
      } finally {
        setLoading(false)
      }
    }
    fetchTasks()
  }, [])

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="cursor-pointer">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h2 className="text-base font-bold text-gray-900">Việc của tôi</h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-orange-50/50 animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-orange-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Chưa có việc nào</p>
          <Button
            onClick={() => navigate('parent-create-task')}
            className="mt-4 h-9 text-sm text-white font-semibold cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Đăng việc mới
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const cfg = statusConfig[task.status]
            const catInfo = categoryIcons[task.category]
            return (
              <motion.div
                key={task.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate('parent-candidates', { task_id: task.id })}
                className="cursor-pointer"
              >
                <Card className="border border-orange-100/60 shadow-sm hover:shadow-md transition-shadow py-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${catInfo?.gradient || 'from-orange-400 to-amber-500'}`}
                      >
                        {catInfo ? (
                          <catInfo.icon className="w-5 h-5 text-white" />
                        ) : (
                          <ClipboardList className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-gray-900 truncate">
                            {task.title}
                          </h4>
                          <Badge
                            className={`${cfg.bg} ${cfg.color} ${cfg.border} text-[10px] px-1.5 py-0 border`}
                          >
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-orange-400" />
                            <span className="font-medium text-orange-600">
                              {formatPrice(task.price)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{task.location}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {formatDate(task.scheduled_time)}
                          </span>
                          {task.applicant_count !== undefined && task.applicant_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {task.applicant_count} ứng viên
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                    </div>
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

// ─── Profile Section (inline for bottom nav) ────────────────────────────────

function ParentProfileSection() {
  const { user, logout } = useAppStore()

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
          <span className="text-2xl font-bold text-white">
            {user?.first_name?.[0]?.toUpperCase() || 'P'}
          </span>
        </div>
        <h3 className="text-base font-bold text-gray-900">
          {user?.first_name} {user?.last_name}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
      </div>

      <Separator />

      <div className="space-y-2">
        {[
          { icon: UserIcon, label: 'Thông tin cá nhân', color: 'text-orange-500' },
          { icon: ShieldCheck, label: 'Bảo mật', color: 'text-emerald-500' },
          { icon: Bell, label: 'Thông báo', color: 'text-blue-500' },
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

      <Separator />

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

// ─── 2. CreateTaskScreen ─────────────────────────────────────────────────────

export function CreateTaskScreen() {
  const { navigate } = useAppStore()
  const [category, setCategory] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState('09:00')
  const [price, setPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const categories = [
    { id: 'tutoring', icon: BookOpen, label: 'Gia sư', gradient: 'from-amber-400 to-orange-500', desc: 'Dạy kèm học tập' },
    { id: 'pickup', icon: Baby, label: 'Đón trẻ', gradient: 'from-pink-400 to-rose-500', desc: 'Đón đưa em bé' },
    { id: 'cleaning', icon: HomeIcon, label: 'Dọn dẹp', gradient: 'from-teal-400 to-emerald-500', desc: 'Vệ sinh nhà cửa' },
    { id: 'babysitting', icon: Heart, label: 'Trông trẻ', gradient: 'from-violet-400 to-purple-500', desc: 'Chăm sóc trẻ nhỏ' },
    { id: 'shopping', icon: ShoppingCart, label: 'Mua sắm', gradient: 'from-sky-400 to-blue-500', desc: 'Mua sắm đồ đạc' },
  ]

  const priceSuggestions = ['100,000', '150,000', '200,000', '300,000', '500,000']

  const handleSubmit = async () => {
    if (!category) {
      toast.error('Vui lòng chọn danh mục')
      return
    }
    if (!title.trim()) {
      toast.error('Vui lòng nhập tiêu đề')
      return
    }
    if (!location.trim()) {
      toast.error('Vui lòng nhập địa điểm')
      return
    }
    if (!date) {
      toast.error('Vui lòng chọn ngày')
      return
    }
    if (!price.trim() || parseFloat(price) <= 0) {
      toast.error('Vui lòng nhập giá hợp lệ')
      return
    }

    setSubmitting(true)
    try {
      const scheduledTime = new Date(date)
      const [hours, minutes] = time.split(':')
      scheduledTime.setHours(parseInt(hours), parseInt(minutes))

      await apiFetch('/tasks/', {
        method: 'POST',
        body: JSON.stringify({
          category,
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          scheduled_time: scheduledTime.toISOString(),
          price: parseFloat(price),
        }),
      })

      toast.success('Đăng việc thành công!', {
        description: 'Việc của bạn đã được đăng lên cộng đồng.',
      })
      navigate('parent-my-tasks')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng việc thất bại.'
      toast.error('Đăng việc thất bại', { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)',
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 py-3 border-b border-orange-100/50 bg-white/80 backdrop-blur-lg"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('parent-home')}
            className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-orange-600" />
          </motion.button>
          <h1 className="text-base font-bold text-gray-900">Đăng việc mới</h1>
        </div>
      </motion.header>

      {/* Form */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-5"
        >
          {/* Category Selector */}
          <motion.div variants={staggerItem} className="space-y-2.5">
            <Label className="text-sm font-semibold text-gray-700">
              Chọn danh mục <span className="text-red-400">*</span>
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {categories.map((cat) => {
                const isSelected = category === cat.id
                return (
                  <motion.button
                    key={cat.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-orange-400 bg-orange-50 shadow-md'
                        : 'border-transparent bg-white shadow-sm hover:shadow-md'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${cat.gradient}`}
                    >
                      <cat.icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span
                      className={`text-[10px] font-semibold leading-tight ${
                        isSelected ? 'text-orange-600' : 'text-gray-600'
                      }`}
                    >
                      {cat.label}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>

          {/* Title */}
          <motion.div variants={staggerItem} className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Tiêu đề <span className="text-red-400">*</span>
            </Label>
            <Input
              placeholder="VD: Tìm gia sư toán cho bé lớp 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
            />
          </motion.div>

          {/* Description */}
          <motion.div variants={staggerItem} className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Mô tả chi tiết
            </Label>
            <Textarea
              placeholder="Mô tả yêu cầu, thời gian, lưu ý đặc biệt..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
            />
          </motion.div>

          {/* Location */}
          <motion.div variants={staggerItem} className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Địa điểm <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
              <Input
                placeholder="VD: Quận 1, TP.HCM"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-10 h-11 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
              />
            </div>
          </motion.div>

          {/* Date & Time */}
          <motion.div variants={staggerItem} className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">
                Ngày <span className="text-red-400">*</span>
              </Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-11 justify-start text-left border-orange-200 hover:bg-orange-50/50 font-normal cursor-pointer"
                  >
                    <CalendarDays className="w-4 h-4 text-orange-400 mr-2" />
                    {date ? format(date, 'dd/MM/yyyy', { locale: vi }) : 'Chọn ngày'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d)
                      setDatePickerOpen(false)
                    }}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">
                Giờ
              </Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-10 h-11 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
                />
              </div>
            </div>
          </motion.div>

          {/* Price */}
          <motion.div variants={staggerItem} className="space-y-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              Giá tiền (VNĐ) <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
              <Input
                type="number"
                placeholder="VD: 200000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="pl-10 h-11 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
              />
            </div>
            <div className="flex gap-2 flex-wrap mt-1.5">
              {priceSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPrice(suggestion.replace(/,/g, ''))}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors cursor-pointer"
                >
                  {suggestion}đ
                </button>
              ))}
            </div>
          </motion.div>

          {/* Submit */}
          <motion.div variants={staggerItem} className="pt-2 pb-6">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-12 text-white font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-70 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              }}
              onMouseEnter={(e) => {
                if (!submitting)
                  e.currentTarget.style.background =
                    'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
              }}
            >
              {submitting ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="mr-2"
                >
                  <Loader2 className="w-4 h-4" />
                </motion.div>
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {submitting ? 'Đang đăng...' : 'Đăng lên cộng đồng'}
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}

// ─── 3. ParentMyTasksScreen ──────────────────────────────────────────────────

export function ParentMyTasksScreen() {
  const { navigate } = useAppStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await apiFetch<Task[]>('/parent/my-tasks/')
        setTasks(Array.isArray(data) ? data : [])
      } catch {
        setTasks([])
      } finally {
        setLoading(false)
      }
    }
    fetchTasks()
  }, [])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)',
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 py-3 border-b border-orange-100/50 bg-white/80 backdrop-blur-lg"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('parent-home')}
            className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-orange-600" />
          </motion.button>
          <h1 className="text-base font-bold text-gray-900">Việc của tôi</h1>
        </div>
      </motion.header>

      {/* Task List */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {loading ? (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                variants={staggerItem}
                className="h-28 rounded-xl bg-orange-50/50 animate-pulse"
              />
            ))}
          </motion.div>
        ) : tasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-5">
              <ClipboardList className="w-10 h-10 text-orange-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Chưa có việc nào</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-[250px] mx-auto">
              Hãy đăng việc mới để tìm carepartner phù hợp cho gia đình bạn
            </p>
            <Button
              onClick={() => navigate('parent-create-task')}
              className="mt-6 h-11 px-6 text-white font-semibold cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Đăng việc mới
            </Button>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {tasks.map((task) => {
              const cfg = statusConfig[task.status]
              const catInfo = categoryIcons[task.category]
              return (
                <motion.div
                  key={task.id}
                  variants={staggerItem}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate('parent-candidates', { task_id: task.id })}
                  className="cursor-pointer"
                >
                  <Card className="border border-orange-100/60 shadow-sm hover:shadow-md transition-all py-0">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${catInfo?.gradient || 'from-orange-400 to-amber-500'}`}
                        >
                          {catInfo ? (
                            <catInfo.icon className="w-5 h-5 text-white" />
                          ) : (
                            <ClipboardList className="w-5 h-5 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-gray-900 truncate">
                              {task.title}
                            </h4>
                            <Badge
                              className={`${cfg.bg} ${cfg.color} ${cfg.border} text-[10px] px-1.5 py-0 border shrink-0`}
                            >
                              {cfg.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-orange-400" />
                              <span className="font-medium text-orange-600">
                                {formatPrice(task.price)}
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate max-w-[120px]">
                                {task.location}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {formatDate(task.scheduled_time)}
                            </span>
                            {task.applicant_count !== undefined && task.applicant_count > 0 && (
                              <span className="flex items-center gap-1 text-orange-500 font-medium">
                                <Users className="w-3 h-3" />
                                {task.applicant_count} ứng viên
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-2" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </main>

      {/* Floating Action Button */}
      {!loading && tasks.length > 0 && (
        <motion.div
          className="fixed bottom-6 right-6 z-20"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, delay: 0.3 }}
        >
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('parent-create-task')}
            className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            }}
          >
            <Plus className="w-6 h-6 text-white" />
          </motion.button>
        </motion.div>
      )}
    </div>
  )
}

// ─── 4. CandidatesScreen ─────────────────────────────────────────────────────

export function CandidatesScreen() {
  const { navigate, screenParams } = useAppStore()
  const taskId = screenParams?.task_id as number | undefined
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [taskInfo, setTaskInfo] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<number | null>(null)

  useEffect(() => {
    if (!taskId) {
      navigate('parent-my-tasks')
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<Candidate[]>(
          `/parent/tasks/${taskId}/candidates/`
        )
        setCandidates(Array.isArray(data) ? data : [])
      } catch {
        setCandidates([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [taskId, navigate])

  const handleApprove = async (applicationId: number) => {
    setApproving(applicationId)
    try {
      await apiFetch(`/parent/applications/${applicationId}/approve/`, {
        method: 'POST',
      })
      toast.success('Đã chấp nhận ứng viên!', {
        description: 'Ứng viên sẽ được thông báo và bắt đầu công việc.',
      })
      setCandidates((prev) => prev.filter((c) => c.application_id !== applicationId))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chấp nhận thất bại.'
      toast.error('Không thể chấp nhận', { description: message })
    } finally {
      setApproving(null)
    }
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${
          i < Math.round(rating)
            ? 'text-amber-400 fill-amber-400'
            : 'text-gray-200'
        }`}
      />
    ))
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)',
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 py-3 border-b border-orange-100/50 bg-white/80 backdrop-blur-lg"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('parent-my-tasks')}
            className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-orange-600" />
          </motion.button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">Ứng viên</h1>
            {taskInfo && (
              <p className="text-xs text-gray-500 truncate">{taskInfo.title}</p>
            )}
          </div>
          <Badge className="bg-orange-50 text-orange-700 border-orange-200 border text-xs">
            {candidates.length} người
          </Badge>
        </div>
      </motion.header>

      {/* Candidates List */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {loading ? (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                variants={staggerItem}
                className="h-36 rounded-xl bg-orange-50/50 animate-pulse"
              />
            ))}
          </motion.div>
        ) : candidates.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-5">
              <Users className="w-10 h-10 text-orange-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Chưa có ứng viên
            </h3>
            <p className="text-sm text-gray-500 mt-2 max-w-[250px] mx-auto">
              Ứng viên sẽ xuất hiện ở đây khi họ ứng tuyển vào việc của bạn
            </p>
            <Button
              onClick={() => navigate('parent-my-tasks')}
              variant="outline"
              className="mt-6 h-10 border-orange-200 text-orange-600 hover:bg-orange-50 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 mr-1.5" />
              Quay lại danh sách việc
            </Button>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-3"
          >
            {candidates.map((candidate) => {
              const fullName = `${candidate.user.first_name} ${candidate.user.last_name}`
              const initials = `${candidate.user.first_name?.[0] || ''}${candidate.user.last_name?.[0] || ''}`
              const isApproving = approving === candidate.application_id

              return (
                <motion.div
                  key={candidate.application_id}
                  variants={staggerItem}
                  whileHover={{ scale: 1.01 }}
                  className="cursor-pointer"
                >
                  <Card className="border border-orange-100/60 shadow-sm hover:shadow-md transition-all py-0">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <Avatar className="w-12 h-12 border-2 border-orange-100">
                            {candidate.user.avatar ? (
                              <AvatarImage
                                src={candidate.user.avatar}
                                alt={fullName}
                              />
                            ) : (
                              <AvatarFallback
                                className="text-sm font-bold"
                                style={{
                                  background:
                                    'linear-gradient(135deg, #f97316, #fb923c)',
                                  color: 'white',
                                }}
                              >
                                {initials.toUpperCase()}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          {candidate.user.is_verified && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                              <ShieldCheck className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-gray-900 truncate">
                              {fullName}
                            </h4>
                            {candidate.user.is_verified && (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border text-[9px] px-1.5 py-0">
                                Đã xác minh
                              </Badge>
                            )}
                          </div>

                          {/* Qualifications */}
                          {candidate.user.qualifications &&
                            candidate.user.qualifications.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                {candidate.user.qualifications
                                  .slice(0, 3)
                                  .map((qual, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.5 rounded bg-orange-50 text-[10px] font-medium text-orange-600 border border-orange-100"
                                    >
                                      {qual}
                                    </span>
                                  ))}
                                {candidate.user.qualifications.length > 3 && (
                                  <span className="px-1.5 py-0.5 rounded bg-gray-50 text-[10px] font-medium text-gray-500 border border-gray-100">
                                    +{candidate.user.qualifications.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                          {/* Rating & Jobs */}
                          <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1">
                              {renderStars(candidate.rating)}
                              <span className="text-gray-500 ml-0.5">
                                {candidate.rating.toFixed(1)}
                              </span>
                            </span>
                            <span className="text-gray-400">
                              {candidate.completed_jobs} việc đã làm
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleApprove(candidate.application_id)
                              }}
                              disabled={isApproving}
                              className="h-8 text-xs text-white font-semibold px-3 cursor-pointer disabled:opacity-70"
                              style={{
                                background:
                                  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                              }}
                            >
                              {isApproving ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                              )}
                              Chấp nhận
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 px-3 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                toast.info('Xem hồ sơ đang được phát triển')
                              }}
                            >
                              Xem hồ sơ
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </main>
    </div>
  )
}

// ─── 5. ReviewScreen ─────────────────────────────────────────────────────────

export function ReviewScreen() {
  const { navigate, screenParams, user } = useAppStore()
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const taskId = screenParams?.task_id as number | undefined
  const revieweeId = screenParams?.reviewee_id as number | undefined
  const revieweeName = (screenParams?.reviewee_name as string) || 'Carepartner'

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Vui lòng chọn số sao đánh giá')
      return
    }
    if (!taskId || !revieweeId) {
      toast.error('Thiếu thông tin để đánh giá')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/parent/review/', {
        method: 'POST',
        body: JSON.stringify({
          task: taskId,
          reviewee: revieweeId,
          rating,
          comment: comment.trim(),
        }),
      })
      toast.success('Đánh giá thành công!', {
        description: 'Cảm ơn bạn đã dành thời gian đánh giá.',
      })
      navigate('parent-my-tasks')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gửi đánh giá thất bại.'
      toast.error('Gửi đánh giá thất bại', { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  const ratingLabels = ['', 'Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Tuyệt vời']

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #fff7ed 0%, #fffbf7 30%, #ffffff 100%)',
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 px-4 py-3 border-b border-orange-100/50 bg-white/80 backdrop-blur-lg"
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('parent-my-tasks')}
            className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 text-orange-600" />
          </motion.button>
          <h1 className="text-base font-bold text-gray-900">
            Đánh giá Carepartner
          </h1>
        </div>
      </motion.header>

      {/* Review Form */}
      <main className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-8"
        >
          {/* Carepartner Info */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <span className="text-xl font-bold text-white">
                {revieweeName[0]?.toUpperCase() || 'C'}
              </span>
            </div>
            <h3 className="text-base font-bold text-gray-900">{revieweeName}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Việc #{taskId || '—'}
            </p>
          </div>

          <Separator />

          {/* Star Rating */}
          <div className="text-center space-y-3">
            <Label className="text-sm font-semibold text-gray-700">
              Bạn đánh giá bao nhiêu sao?
            </Label>
            <div className="flex items-center justify-center gap-3">
              {Array.from({ length: 5 }, (_, i) => {
                const starValue = i + 1
                const isFilled = starValue <= (hoverRating || rating)
                return (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onMouseEnter={() => setHoverRating(starValue)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(starValue)}
                    className="cursor-pointer p-1"
                  >
                    <motion.div
                      animate={{
                        scale: isFilled ? 1.1 : 1,
                        rotate: isFilled ? [0, -10, 10, 0] : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <Star
                        className={`w-10 h-10 transition-colors ${
                          isFilled
                            ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                            : 'text-gray-200'
                        }`}
                      />
                    </motion.div>
                  </motion.button>
                )
              })}
            </div>
            <AnimatePresence mode="wait">
              {(hoverRating || rating) > 0 && (
                <motion.p
                  key={hoverRating || rating}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-sm font-semibold text-orange-600"
                >
                  {ratingLabels[hoverRating || rating]}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Separator />

          {/* Comment */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">
              Nhận xét của bạn
            </Label>
            <Textarea
              placeholder="Chia sẻ trải nghiệm của bạn về carepartner này..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[100px] border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
            />
            <p className="text-[10px] text-gray-400">
              Nhận xét giúp carepartner cải thiện và phụ huynh khác tham khảo
            </p>
          </div>

          {/* Submit */}
          <div className="pt-2 pb-6">
            <Button
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              className="w-full h-12 text-white font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-70 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              }}
              onMouseEnter={(e) => {
                if (!submitting && rating > 0)
                  e.currentTarget.style.background =
                    'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
              }}
            >
              {submitting ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="mr-2"
                >
                  <Loader2 className="w-4 h-4" />
                </motion.div>
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
