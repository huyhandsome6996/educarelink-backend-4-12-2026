'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart,
  GraduationCap,
  User,
  Lock,
  Eye,
  EyeOff,
  Camera,
  Upload,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAppStore, apiFetch, apiUpload } from '@/lib/store'
import type { UserRole } from '@/lib/store'
import { toast } from 'sonner'

interface AuthResponse {
  tokens: { access: string; refresh: string }
  user_id: number
  username: string
  role: string
}

interface ProfileResponse {
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

export default function AuthScreen() {
  const { setAuth, navigate } = useAppStore()

  // Tab state
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')

  // Login state
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [registerRole, setRegisterRole] = useState<UserRole | null>(null)
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName, setRegLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [regTermsAccepted, setRegTermsAccepted] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)

  // Photo uploads for worker
  const [idCardFront, setIdCardFront] = useState<File | null>(null)
  const [idCardBack, setIdCardBack] = useState<File | null>(null)
  const [selfiePhoto, setSelfiePhoto] = useState<File | null>(null)
  const [idCardFrontPreview, setIdCardFrontPreview] = useState<string | null>(null)
  const [idCardBackPreview, setIdCardBackPreview] = useState<string | null>(null)
  const [selfiePhotoPreview, setSelfiePhotoPreview] = useState<string | null>(null)

  const idCardFrontRef = useRef<HTMLInputElement>(null)
  const idCardBackRef = useRef<HTMLInputElement>(null)
  const selfiePhotoRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      setFile: (f: File | null) => void,
      setPreview: (p: string | null) => void
    ) => {
      const file = e.target.files?.[0]
      if (file) {
        setFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setPreview(reader.result as string)
        reader.readAsDataURL(file)
      }
    },
    []
  )

  const resetRegisterForm = useCallback(() => {
    setRegisterRole(null)
    setRegUsername('')
    setRegPassword('')
    setRegFirstName('')
    setRegLastName('')
    setRegEmail('')
    setRegPhone('')
    setShowRegPassword(false)
    setRegTermsAccepted(false)
    setIdCardFront(null)
    setIdCardBack(null)
    setSelfiePhoto(null)
    setIdCardFrontPreview(null)
    setIdCardBackPreview(null)
    setSelfiePhotoPreview(null)
    setRegisterSuccess(false)
  }, [])

  // Login handler
  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      toast.error('Vui lòng nhập đầy đủ thông tin đăng nhập.')
      return
    }

    setLoginLoading(true)
    try {
      const data = await apiFetch<AuthResponse>('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      })

      // Store the JWT access token
      const token = data.tokens.access
      useAppStore.setState({ token })

      try {
        const profile = await apiFetch<ProfileResponse>('/profile/')
        setAuth(token, {
          id: profile.id,
          username: profile.username,
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          role: profile.role,
          phone_number: profile.phone_number,
          address: profile.address,
          is_verified: profile.is_verified,
          is_approved: profile.is_approved,
          ai_profile_summary: profile.ai_profile_summary,
          qualifications: profile.qualifications,
          expo_push_token: profile.expo_push_token,
        })
        toast.success('Đăng nhập thành công!', {
          description: 'Chào mừng bạn trở lại EduCareLink!',
        })
      } catch {
        // If profile fetch fails, still set auth with minimal data
        useAppStore.setState({ token: null })
        toast.error('Không thể tải thông tin tài khoản.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng nhập thất bại.'
      toast.error('Đăng nhập thất bại', { description: message })
    } finally {
      setLoginLoading(false)
    }
  }

  // Register handler
  const handleRegister = async () => {
    if (!registerRole) {
      toast.error('Vui lòng chọn vai trò của bạn.')
      return
    }
    if (!regUsername.trim() || !regPassword.trim() || !regFirstName.trim() || !regLastName.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc.')
      return
    }
    if (registerRole === 'parent' && (!regEmail.trim() || !regPhone.trim())) {
      toast.error('Phụ huynh cần cung cấp email và số điện thoại.')
      return
    }
    if (!regTermsAccepted) {
      toast.error('Vui lòng đồng ý với điều khoản sử dụng.')
      return
    }

    setRegisterLoading(true)
    try {
      if (registerRole === 'worker') {
        // Worker registration uses FormData for photo uploads
        const formData = new FormData()
        formData.append('username', regUsername)
        formData.append('password', regPassword)
        formData.append('first_name', regFirstName)
        formData.append('last_name', regLastName)
        formData.append('role', 'worker')
        if (regEmail.trim()) formData.append('email', regEmail)
        if (regPhone.trim()) formData.append('phone_number', regPhone)
        if (idCardFront) formData.append('id_card_front', idCardFront)
        if (idCardBack) formData.append('id_card_back', idCardBack)
        if (selfiePhoto) formData.append('selfie_photo', selfiePhoto)

        await apiUpload<{ message: string }>('/auth/register/', formData)
      } else {
        // Parent registration uses JSON
        await apiFetch<{ message: string }>('/auth/register/', {
          method: 'POST',
          body: JSON.stringify({
            username: regUsername,
            password: regPassword,
            first_name: regFirstName,
            last_name: regLastName,
            role: 'parent',
            email: regEmail,
            phone_number: regPhone,
          }),
        })
      }

      setRegisterSuccess(true)
      toast.success('Đăng ký thành công!', {
        description:
          registerRole === 'worker'
            ? 'Tài khoản của bạn đang chờ phê duyệt. Chúng tôi sẽ thông báo khi được duyệt.'
            : 'Bạn có thể đăng nhập ngay bây giờ!',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng ký thất bại.'
      toast.error('Đăng ký thất bại', { description: message })
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleLoginKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  const handleRegisterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRegister()
  }

  // Animation variants
  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  }

  const staggerContainer = {
    animate: {
      transition: { staggerChildren: 0.07 },
    },
  }

  const staggerItem = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
  }

  // Photo upload component
  const PhotoUploadField = ({
    label,
    preview,
    fileRef,
    onChange,
    icon: Icon,
  }: {
    label: string
    preview: string | null
    fileRef: React.RefObject<HTMLInputElement | null>
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    icon: React.ElementType
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <input
        type="file"
        ref={fileRef}
        accept="image/*"
        onChange={onChange}
        className="hidden"
      />
      {preview ? (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative group cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <div className="w-full h-28 rounded-xl overflow-hidden border-2 border-orange-200 bg-orange-50">
            <img
              src={preview}
              alt={label}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-6 h-6 text-white" />
          </div>
        </motion.div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full h-28 rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/50 hover:bg-orange-100/50 hover:border-orange-300 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer"
        >
          <Icon className="w-6 h-6 text-orange-400" />
          <span className="text-xs text-orange-500 font-medium">Tải ảnh lên</span>
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #fffbf7 0%, #fff7ed 50%, #fef3c7 100%)' }}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.12) 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 70%)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        {/* Header */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Heart className="w-8 h-8 text-white fill-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-900">EduCareLink</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kết nối tri thức, nuôi dưỡng tương lai
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-orange-100/50 overflow-hidden"
          whileHover={{ boxShadow: '0 20px 60px rgba(249,115,22,0.1)' }}
          transition={{ duration: 0.3 }}
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'login' | 'register')}
          >
            <TabsList className="w-full rounded-none border-b border-orange-100 bg-transparent p-0 h-auto">
              <TabsTrigger
                value="login"
                className="flex-1 py-3.5 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-semibold transition-all data-[state=active]:text-orange-600 text-gray-500"
              >
                Đăng nhập
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="flex-1 py-3.5 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm font-semibold transition-all data-[state=active]:text-orange-600 text-gray-500"
              >
                Đăng ký
              </TabsTrigger>
            </TabsList>

            {/* LOGIN TAB */}
            <TabsContent value="login" className="m-0">
              <div className="p-6">
                <motion.div
                  key="login-form"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-5"
                >
                  <motion.div variants={staggerItem} className="text-center">
                    <h2 className="text-xl font-bold text-gray-900">
                      Chào mừng trở lại!
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Kết nối tri thức, nuôi dưỡng tương lai cùng EduCareLink
                    </p>
                  </motion.div>

                  <motion.div variants={staggerItem} className="space-y-2">
                    <Label htmlFor="login-username" className="text-sm font-medium text-gray-700">
                      Tên đăng nhập
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                      <Input
                        id="login-username"
                        placeholder="Nhập tên đăng nhập"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        onKeyDown={handleLoginKeyDown}
                        className="pl-10 h-11 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
                      />
                    </div>
                  </motion.div>

                  <motion.div variants={staggerItem} className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm font-medium text-gray-700">
                      Mật khẩu
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="Nhập mật khẩu"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        onKeyDown={handleLoginKeyDown}
                        className="pl-10 pr-10 h-11 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                        aria-label={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>

                  <motion.div variants={staggerItem}>
                    <Button
                      onClick={handleLogin}
                      disabled={loginLoading}
                      className="w-full h-11 text-white font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-70 cursor-pointer"
                      style={{
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loginLoading)
                          e.currentTarget.style.background =
                            'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                      }}
                    >
                      {loginLoading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="mr-2"
                        >
                          <Loader2 className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <ArrowRight className="w-4 h-4 mr-2" />
                      )}
                      {loginLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </Button>
                  </motion.div>

                  <motion.div
                    variants={staggerItem}
                    className="text-center"
                  >
                    <p className="text-xs text-gray-400">
                      Chưa có tài khoản?{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('register')}
                        className="text-orange-500 hover:text-orange-600 font-medium transition-colors"
                      >
                        Đăng ký ngay
                      </button>
                    </p>
                  </motion.div>
                </motion.div>
              </div>
            </TabsContent>

            {/* REGISTER TAB */}
            <TabsContent value="register" className="m-0">
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {registerSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-center py-8 space-y-4"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                        className="inline-flex items-center justify-center w-16 h-16 rounded-full"
                        style={{
                          background: 'linear-gradient(135deg, #f97316, #fb923c)',
                        }}
                      >
                        <CheckCircle2 className="w-8 h-8 text-white" />
                      </motion.div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Đăng ký thành công!
                      </h3>
                      {registerRole === 'worker' ? (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-600">
                            Tài khoản Carepartner của bạn đang chờ phê duyệt.
                          </p>
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
                            <Shield className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-medium text-amber-700">
                              Chúng tôi sẽ thông báo qua email khi được duyệt
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          Bạn có thể đăng nhập ngay bây giờ!
                        </p>
                      )}
                      <Button
                        onClick={() => {
                          resetRegisterForm()
                          setActiveTab('login')
                        }}
                        className="mt-4 h-10 text-white font-semibold text-sm cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        }}
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Đi đến đăng nhập
                      </Button>
                    </motion.div>
                  ) : registerRole === null ? (
                    /* Role Selection */
                    <motion.div
                      key="role-select"
                      variants={fadeInUp}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{ duration: 0.3 }}
                      className="space-y-5"
                    >
                      <div className="text-center">
                        <h2 className="text-xl font-bold text-gray-900">
                          Tạo tài khoản mới
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                          Chọn vai trò của bạn để bắt đầu
                        </p>
                      </div>

                      <div className="space-y-3">
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Card
                            className="cursor-pointer border-2 border-transparent hover:border-orange-300 transition-all bg-gradient-to-br from-orange-50 to-amber-50/50 shadow-sm hover:shadow-md py-0"
                            onClick={() => setRegisterRole('parent')}
                          >
                            <CardContent className="p-5 flex items-center gap-4">
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                style={{
                                  background: 'linear-gradient(135deg, #f97316, #fb923c)',
                                }}
                              >
                                <Heart className="w-6 h-6 text-white fill-white" />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-900">
                                  Phụ huynh
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Tìm kiếm carepartner phù hợp cho con bạn
                                </p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-orange-400" />
                            </CardContent>
                          </Card>
                        </motion.div>

                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Card
                            className="cursor-pointer border-2 border-transparent hover:border-orange-300 transition-all bg-gradient-to-br from-orange-50 to-amber-50/50 shadow-sm hover:shadow-md py-0"
                            onClick={() => setRegisterRole('worker')}
                          >
                            <CardContent className="p-5 flex items-center gap-4">
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                style={{
                                  background: 'linear-gradient(135deg, #ea580c, #f97316)',
                                }}
                              >
                                <GraduationCap className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-900">
                                  Carepartner
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Cung cấp dịch vụ chăm sóc và gia sư
                                </p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-orange-400" />
                            </CardContent>
                          </Card>
                        </motion.div>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-gray-400">
                          Đã có tài khoản?{' '}
                          <button
                            type="button"
                            onClick={() => setActiveTab('login')}
                            className="text-orange-500 hover:text-orange-600 font-medium transition-colors"
                          >
                            Đăng nhập
                          </button>
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    /* Registration Form */
                    <motion.div
                      key="register-form"
                      variants={staggerContainer}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="space-y-4"
                      onKeyDown={handleRegisterKeyDown}
                    >
                      <motion.div variants={staggerItem} className="text-center">
                        <div className="inline-flex items-center gap-2 mb-1">
                          <button
                            type="button"
                            onClick={() => setRegisterRole(null)}
                            className="text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
                          >
                            ← Quay lại
                          </button>
                          <span className="text-gray-300">|</span>
                          <span className="text-xs font-medium text-gray-500">
                            {registerRole === 'parent' ? 'Phụ huynh' : 'Carepartner'}
                          </span>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">
                          {registerRole === 'parent'
                            ? 'Đăng ký Phụ huynh'
                            : 'Đăng ký Carepartner'}
                        </h2>
                      </motion.div>

                      <motion.div variants={staggerItem} className="space-y-3">
                        {/* First name and last name */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-gray-700">
                              Họ <span className="text-red-400">*</span>
                            </Label>
                            <Input
                              placeholder="Nguyễn"
                              value={regLastName}
                              onChange={(e) => setRegLastName(e.target.value)}
                              className="h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-gray-700">
                              Tên <span className="text-red-400">*</span>
                            </Label>
                            <Input
                              placeholder="Văn A"
                              value={regFirstName}
                              onChange={(e) => setRegFirstName(e.target.value)}
                              className="h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50 text-sm"
                            />
                          </div>
                        </div>

                        {/* Username */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-700">
                            Tên đăng nhập <span className="text-red-400">*</span>
                          </Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                            <Input
                              placeholder="nguyenvana"
                              value={regUsername}
                              onChange={(e) => setRegUsername(e.target.value)}
                              className="pl-10 h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50 text-sm"
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-700">
                            Email{' '}
                            {registerRole === 'parent' && (
                              <span className="text-red-400">*</span>
                            )}
                          </Label>
                          <Input
                            type="email"
                            placeholder="email@example.com"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            className="h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50 text-sm"
                          />
                        </div>

                        {/* Phone */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-700">
                            Số điện thoại{' '}
                            {registerRole === 'parent' && (
                              <span className="text-red-400">*</span>
                            )}
                          </Label>
                          <Input
                            type="tel"
                            placeholder="0901 234 567"
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            className="h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50 text-sm"
                          />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-700">
                            Mật khẩu <span className="text-red-400">*</span>
                          </Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                            <Input
                              type={showRegPassword ? 'text' : 'password'}
                              placeholder="Tối thiểu 6 ký tự"
                              value={regPassword}
                              onChange={(e) => setRegPassword(e.target.value)}
                              className="pl-10 pr-10 h-10 border-orange-200 focus-visible:border-orange-400 focus-visible:ring-orange-400/20 bg-white/50 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowRegPassword(!showRegPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                              aria-label={showRegPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            >
                              {showRegPassword ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Worker-specific: Photo uploads */}
                        {registerRole === 'worker' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3"
                          >
                            <div className="flex items-center gap-2 pt-2">
                              <Shield className="w-4 h-4 text-orange-500" />
                              <span className="text-xs font-semibold text-gray-700">
                                Xác minh danh tính
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Tải lên ảnh để xác minh danh tính của bạn. Điều này giúp phụ huynh tin tưởng hơn.
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                              <PhotoUploadField
                                label="CCCD mặt trước"
                                preview={idCardFrontPreview}
                                fileRef={idCardFrontRef}
                                onChange={(e) =>
                                  handleFileChange(e, setIdCardFront, setIdCardFrontPreview)
                                }
                                icon={Upload}
                              />
                              <PhotoUploadField
                                label="CCCD mặt sau"
                                preview={idCardBackPreview}
                                fileRef={idCardBackRef}
                                onChange={(e) =>
                                  handleFileChange(e, setIdCardBack, setIdCardBackPreview)
                                }
                                icon={Upload}
                              />
                              <PhotoUploadField
                                label="Ảnh chân dung"
                                preview={selfiePhotoPreview}
                                fileRef={selfiePhotoRef}
                                onChange={(e) =>
                                  handleFileChange(e, setSelfiePhoto, setSelfiePhotoPreview)
                                }
                                icon={Camera}
                              />
                            </div>
                          </motion.div>
                        )}

                        {/* Terms checkbox */}
                        <div className="flex items-start gap-2.5 pt-1">
                          <Checkbox
                            id="terms"
                            checked={regTermsAccepted}
                            onCheckedChange={(checked) =>
                              setRegTermsAccepted(checked === true)
                            }
                            className="mt-0.5 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                          />
                          <Label
                            htmlFor="terms"
                            className="text-xs text-gray-600 leading-relaxed cursor-pointer"
                          >
                            Tôi đồng ý với{' '}
                            <span className="text-orange-500 font-medium underline underline-offset-2">
                              Điều khoản sử dụng
                            </span>{' '}
                            và{' '}
                            <span className="text-orange-500 font-medium underline underline-offset-2">
                              Chính sách bảo mật
                            </span>{' '}
                            của EduCareLink
                          </Label>
                        </div>
                      </motion.div>

                      <motion.div variants={staggerItem}>
                        <Button
                          onClick={handleRegister}
                          disabled={registerLoading}
                          className="w-full h-11 text-white font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-70 cursor-pointer"
                          style={{
                            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                          }}
                          onMouseEnter={(e) => {
                            if (!registerLoading)
                              e.currentTarget.style.background =
                                'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                          }}
                        >
                          {registerLoading ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="mr-2"
                            >
                              <Loader2 className="w-4 h-4" />
                            </motion.div>
                          ) : (
                            <ArrowRight className="w-4 h-4 mr-2" />
                          )}
                          {registerLoading ? 'Đang đăng ký...' : 'Đăng ký ngay'}
                        </Button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-xs text-gray-400 mt-6"
        >
          © 2024 EduCareLink. Kết nối tri thức, nuôi dưỡng tương lai.
        </motion.p>
      </motion.div>
    </div>
  )
}
