'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Award,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  RefreshCw,
  UserPlus,
  UserX,
  GraduationCap,
  Camera,
  FileText,
  Star,
  AlertCircle,
  Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppStore, apiFetch } from '@/lib/store'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkerItem {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  phone_number: string
  is_approved: boolean
  date_joined: string
  id_card_front: string | null
  id_card_back: string | null
  selfie_photo: string | null
  certificate_photo: string | null
  qualifications: string[]
}

// ─── Animation Variants ─────────────────────────────────────────────────────

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
}

const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

// ─── AdminDashboardScreen ────────────────────────────────────────────────────

export function AdminDashboardScreen() {
  const { navigate } = useAppStore()
  const [pendingWorkers, setPendingWorkers] = useState<WorkerItem[]>([])
  const [allWorkers, setAllWorkers] = useState<WorkerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWorker, setSelectedWorker] = useState<WorkerItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [qualInput, setQualInput] = useState('')
  const [newQual, setNewQual] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true)
      const [pending, all] = await Promise.all([
        apiFetch<WorkerItem[]>('/admin/pending-workers/'),
        apiFetch<WorkerItem[]>('/admin/all-workers/'),
      ])
      setPendingWorkers(Array.isArray(pending) ? pending : [])
      setAllWorkers(Array.isArray(all) ? all : [])
    } catch {
      toast.error('Không thể tải dữ liệu')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData(false)
  }

  const handleAction = async (workerId: number, action: 'approve' | 'reject' | 'update_qualifications', qualifications?: string[]) => {
    setActionLoading(true)
    try {
      await apiFetch(`/admin/workers/${workerId}/action/`, {
        method: 'POST',
        body: JSON.stringify({ action, qualifications }),
      })
      toast.success(
        action === 'approve'
          ? 'Đã duyệt tài khoản!'
          : action === 'reject'
            ? 'Đã từ chối tài khoản.'
            : 'Đã cập nhật bằng cấp!'
      )
      setDetailOpen(false)
      setSelectedWorker(null)
      fetchData(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Thao tác thất bại.'
      toast.error('Lỗi', { description: message })
    } finally {
      setActionLoading(false)
    }
  }

  const openDetail = (worker: WorkerItem) => {
    setSelectedWorker(worker)
    setQualInput(worker.qualifications?.join('\n') || '')
    setNewQual('')
    setDetailOpen(true)
  }

  const addQualification = () => {
    if (!newQual.trim()) return
    setQualInput((prev) => (prev ? prev + '\n' + newQual.trim() : newQual.trim()))
    setNewQual('')
  }

  const displayWorkers = tab === 'pending' ? pendingWorkers : allWorkers
  const filteredWorkers = searchTerm
    ? displayWorkers.filter(
        (w) =>
          w.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          `${w.first_name} ${w.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
          w.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : displayWorkers

  const approvedCount = allWorkers.filter((w) => w.is_approved).length
  const pendingCount = pendingWorkers.length

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 w-60 h-screen bg-[#1e293b] border-r border-[#334155] flex flex-col z-20">
        <div className="p-5 border-b border-[#334155]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">EduCareLink</p>
              <p className="text-[10px] text-slate-400">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => setTab('pending')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              tab === 'pending' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Chờ duyệt
            {pendingCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('all')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              tab === 'all' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Tất cả Carepartner
          </button>
        </nav>

        <div className="p-3 border-t border-[#334155]">
          <button
            onClick={() => useAppStore.getState().logout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-all cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-2xl font-black text-slate-100">
              {tab === 'pending' ? 'Chờ xét duyệt' : 'Tất cả Carepartner'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">Quản lý tài khoản Carepartner</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          <Card className="bg-[#1e293b] border-slate-700 py-0">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-500/15">
                <Users className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-100">{pendingCount}</p>
                <p className="text-xs text-slate-500 font-semibold">Chờ duyệt</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#1e293b] border-slate-700 py-0">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/15">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-100">{approvedCount}</p>
                <p className="text-xs text-slate-500 font-semibold">Đã duyệt</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#1e293b] border-slate-700 py-0">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-violet-500/15">
                <GraduationCap className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-100">{allWorkers.length}</p>
                <p className="text-xs text-slate-500 font-semibold">Tổng cộng</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-5 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Tìm kiếm theo tên, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10 bg-[#1e293b] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:border-orange-500 focus-visible:ring-orange-500/20"
          />
        </div>

        {/* Workers Table */}
        <Card className="bg-[#1e293b] border-slate-700 overflow-hidden py-0">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">
              {tab === 'pending' ? 'Danh sách chờ duyệt' : 'Tất cả Carepartner'}
            </h3>
            <Badge className="bg-slate-700 text-slate-300 border-slate-600 text-xs">
              {filteredWorkers.length} người
            </Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 text-orange-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-500 mt-2">Đang tải...</p>
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Không có dữ liệu</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Người dùng</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Liên hệ</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ảnh</th>
                    <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ngày đăng ký</th>
                    <th className="text-right px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkers.map((worker) => (
                    <tr
                      key={worker.id}
                      className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold">
                            {worker.first_name?.[0] || worker.username[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-200">
                              {worker.first_name} {worker.last_name}
                            </p>
                            <p className="text-xs text-slate-500">@{worker.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-slate-400">{worker.email || '-'}</p>
                        <p className="text-xs text-slate-500">{worker.phone_number || '-'}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        {worker.is_approved ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Đã duyệt
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Chờ duyệt
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-1.5">
                          {worker.selfie_photo && (
                            <img
                              src={worker.selfie_photo}
                              alt="Selfie"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-600 cursor-pointer hover:border-orange-400 transition-colors"
                              onClick={() => openDetail(worker)}
                            />
                          )}
                          {worker.id_card_front && (
                            <img
                              src={worker.id_card_front}
                              alt="CCCD"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-600 cursor-pointer hover:border-orange-400 transition-colors"
                              onClick={() => openDetail(worker)}
                            />
                          )}
                          {worker.certificate_photo && (
                            <img
                              src={worker.certificate_photo}
                              alt="Chứng chỉ"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-600 cursor-pointer hover:border-orange-400 transition-colors"
                              onClick={() => openDetail(worker)}
                            />
                          )}
                          {!worker.selfie_photo && !worker.id_card_front && !worker.certificate_photo && (
                            <span className="text-xs text-slate-600">Không có</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">{worker.date_joined}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-slate-400 hover:text-orange-400 cursor-pointer"
                            onClick={() => openDetail(worker)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Xem
                          </Button>
                          {!worker.is_approved && (
                            <Button
                              size="sm"
                              className="h-8 text-xs text-white font-semibold cursor-pointer"
                              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
                              onClick={() => handleAction(worker.id, 'approve', worker.qualifications)}
                              disabled={actionLoading}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Duyệt
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      {/* Worker Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="bg-[#1e293b] border-slate-700 text-slate-200 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-orange-400" />
              Hồ sơ Carepartner
            </DialogTitle>
          </DialogHeader>

          {selectedWorker && (
            <div className="space-y-5 mt-2">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xl font-bold">
                  {selectedWorker.first_name?.[0] || selectedWorker.username[0]}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {selectedWorker.first_name} {selectedWorker.last_name}
                  </h3>
                  <p className="text-xs text-slate-400">@{selectedWorker.username}</p>
                  <p className="text-xs text-slate-500">{selectedWorker.email} • {selectedWorker.phone_number}</p>
                </div>
              </div>

              <Separator className="bg-slate-700" />

              {/* Photos */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-orange-400" />
                  Ảnh xác minh
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { src: selectedWorker.selfie_photo, label: 'Ảnh chân dung' },
                    { src: selectedWorker.id_card_front, label: 'CCCD mặt trước' },
                    { src: selectedWorker.id_card_back, label: 'CCCD mặt sau' },
                  ].map((photo, i) => (
                    <div key={i} className="space-y-1">
                      {photo.src ? (
                        <a href={photo.src} target="_blank" rel="noopener noreferrer">
                          <img
                            src={photo.src}
                            alt={photo.label}
                            className="w-full h-32 rounded-lg object-cover border border-slate-600 hover:border-orange-400 transition-colors cursor-pointer"
                          />
                        </a>
                      ) : (
                        <div className="w-full h-32 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <span className="text-xs text-slate-600">Không có</span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-500 text-center">{photo.label}</p>
                    </div>
                  ))}
                </div>

                {selectedWorker.certificate_photo && (
                  <div className="space-y-1">
                    <a href={selectedWorker.certificate_photo} target="_blank" rel="noopener noreferrer">
                      <img
                        src={selectedWorker.certificate_photo}
                        alt="Ảnh chứng chỉ"
                        className="w-full h-32 rounded-lg object-cover border border-slate-600 hover:border-orange-400 transition-colors cursor-pointer"
                      />
                    </a>
                    <p className="text-[10px] text-slate-500">Ảnh bằng cấp/chứng chỉ</p>
                  </div>
                )}
              </div>

              <Separator className="bg-slate-700" />

              {/* Qualifications */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Award className="w-4 h-4 text-orange-400" />
                  Bằng cấp & Chứng chỉ
                </h4>
                <Textarea
                  value={qualInput}
                  onChange={(e) => setQualInput(e.target.value)}
                  placeholder="Mỗi dòng 1 bằng cấp..."
                  className="min-h-[80px] bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:border-orange-500 focus-visible:ring-orange-500/20 text-sm"
                />
                <div className="flex gap-2">
                  <Input
                    value={newQual}
                    onChange={(e) => setNewQual(e.target.value)}
                    placeholder="Thêm bằng cấp mới..."
                    className="flex-1 h-9 bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 text-sm focus-visible:border-orange-500 focus-visible:ring-orange-500/20"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addQualification()
                      }
                    }}
                  />
                  <Button
                    onClick={addQualification}
                    variant="outline"
                    className="h-9 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 cursor-pointer"
                  >
                    Thêm
                  </Button>
                </div>
              </div>

              <Separator className="bg-slate-700" />

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {!selectedWorker.is_approved && (
                  <Button
                    onClick={() => handleAction(selectedWorker.id, 'approve', qualInput.split('\n').filter(Boolean))}
                    disabled={actionLoading}
                    className="flex-1 h-10 text-white font-semibold cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Duyệt tài khoản
                  </Button>
                )}
                <Button
                  onClick={() => handleAction(selectedWorker.id, 'update_qualifications', qualInput.split('\n').filter(Boolean))}
                  disabled={actionLoading}
                  variant="outline"
                  className="flex-1 h-10 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 cursor-pointer"
                >
                  <Award className="w-4 h-4 mr-2" />
                  Cập nhật bằng cấp
                </Button>
                {!selectedWorker.is_approved && (
                  <Button
                    onClick={() => {
                      if (confirm('Bạn có chắc muốn từ chối và xóa tài khoản này?')) {
                        handleAction(selectedWorker.id, 'reject')
                      }
                    }}
                    disabled={actionLoading}
                    variant="outline"
                    className="h-10 border-red-500/50 text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Từ chối
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
