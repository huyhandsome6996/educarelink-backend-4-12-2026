'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import AuthScreen from '@/components/educare/AuthScreens'
import {
  ParentHomeScreen,
  CreateTaskScreen,
  ParentMyTasksScreen,
  CandidatesScreen,
  ReviewScreen,
} from '@/components/educare/ParentScreens'
import {
  WorkerFeedScreen,
  WorkerMyJobsScreen,
  WorkerProfileScreen,
} from '@/components/educare/WorkerScreens'
import { AdminDashboardScreen } from '@/components/educare/AdminDashboard'
import { ChatbotWidget } from '@/components/educare/ChatbotWidget'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Baby,
  MapPin,
  Sparkles,
  ArrowRight,
  Users,
  Star,
  Shield,
  Heart,
  CheckCircle,
  ChevronRight,
  GraduationCap,
  Handshake,
  Clock,
} from 'lucide-react'

/* ──────────────────────────────────────────────
   Animated Section Wrapper
   ────────────────────────────────────────────── */
function AnimatedSection({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ──────────────────────────────────────────────
   Landing Page
   ────────────────────────────────────────────── */
function LandingPage() {
  const { navigate } = useAppStore()

  const features = [
    {
      icon: BookOpen,
      title: 'Gia sư',
      desc: 'Gia sư tận tâm, giúp con phát triển toàn diện với phương pháp giáo dục hiện đại.',
      color: 'from-orange-400 to-amber-400',
      bg: 'bg-orange-50',
    },
    {
      icon: Baby,
      title: 'Trông trẻ',
      desc: 'Người trông trẻ đáng tin cậy, yêu thương và chăm sóc bé như người thân.',
      color: 'from-rose-400 to-pink-400',
      bg: 'bg-rose-50',
    },
    {
      icon: MapPin,
      title: 'Đón trẻ',
      desc: 'Dịch vụ đón và đưa trẻ an toàn, đúng giờ từ trường học về nhà.',
      color: 'from-emerald-400 to-teal-400',
      bg: 'bg-emerald-50',
    },
    {
      icon: Sparkles,
      title: 'Dọn dẹp',
      desc: 'Giúp việc nhà sạch sẽ, gọn gàng để bạn có thêm thời gian bên gia đình.',
      color: 'from-violet-400 to-purple-400',
      bg: 'bg-violet-50',
    },
  ]

  const steps = [
    {
      num: '01',
      icon: GraduationCap,
      title: 'Đăng việc',
      desc: 'Phụ huynh đăng nhu cầu chăm sóc, gia sư hoặc giúp việc theo yêu cầu.',
    },
    {
      num: '02',
      icon: Handshake,
      title: 'Chọn Carepartner',
      desc: 'Duyệt hồ sơ, đánh giá và chọn Carepartner phù hợp nhất cho gia đình.',
    },
    {
      num: '03',
      icon: CheckCircle,
      title: 'Hoàn thành',
      desc: 'Carepartner thực hiện dịch vụ, bạn đánh giá và thanh toán dễ dàng.',
    },
  ]

  const trustStats = [
    { icon: Users, value: '2,500+', label: 'Carepartner tin cậy' },
    { icon: Star, value: '4.9/5', label: 'Đánh giá trung bình' },
    { icon: Shield, value: '100%', label: 'Xác minh danh tính' },
    { icon: Heart, value: '10,000+', label: 'Gia đình hài lòng' },
  ]

  const testimonials = [
    {
      name: 'Chị Minh Anh',
      role: 'Phụ huynh tại Hà Nội',
      text: 'Tìm được gia sư tuyệt vời cho con chỉ trong vài ngày. Con tôi tiến bộ rất nhiều!',
      rating: 5,
    },
    {
      name: 'Anh Đức Huy',
      role: 'Phụ huynh tại TP.HCM',
      text: 'Dịch vụ trông trẻ rất chuyên nghiệp. Tôi yên tâm khi đi làm biết con được chăm sóc tốt.',
      rating: 5,
    },
    {
      name: 'Chị Thu Hà',
      role: 'Phụ huynh tại Đà Nẵng',
      text: 'Tiết kiệm rất nhiều thời gian tìm người giúp việc. Đáng tin cậy và tiện lợi!',
      rating: 5,
    },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-orange-50/50 via-white to-amber-50/30">
      {/* ── Header ── */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-orange-100/60"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
              }}
            >
              <svg
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">
              EduCareLink
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('login')}
              className="text-gray-600 hover:text-orange-600 hover:bg-orange-50"
            >
              Đăng nhập
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('register')}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md shadow-orange-200 border-0"
            >
              Đăng ký
            </Button>
          </div>
        </div>
      </motion.header>

      <main className="flex-1">
        {/* ── Hero Section ── */}
        <section className="relative overflow-hidden">
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-amber-200/30 rounded-full blur-3xl" />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 lg:pt-28 pb-16 sm:pb-24">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
              {/* Left: Text */}
              <div className="text-center lg:text-left">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Badge
                    variant="secondary"
                    className="mb-4 sm:mb-6 bg-orange-100 text-orange-700 border-orange-200 px-3 py-1 text-sm font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    Nền tảng #1 cho gia đình Việt
                  </Badge>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight tracking-tight"
                >
                  Kết nối tri thức,{' '}
                  <span
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        'linear-gradient(135deg, #f97316, #ea580c, #d97706)',
                    }}
                  >
                    nuôi dưỡng
                  </span>{' '}
                  tương lai
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="mt-4 sm:mt-6 text-base sm:text-lg text-gray-600 leading-relaxed max-w-lg mx-auto lg:mx-0"
                >
                  EduCareLink kết nối phụ huynh với Carepartner tận tâm — gia sư,
                  trông trẻ, đón trẻ, dọn dẹp. An tâm chăm sóc gia đình, tiết
                  kiệm thời gian quý báu.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
                >
                  <Button
                    size="lg"
                    onClick={() => navigate('register')}
                    className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-200/50 border-0 text-base px-8 h-12"
                  >
                    Đăng ký Phụ huynh
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigate('register')}
                    className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 hover:border-orange-300 text-base px-8 h-12"
                  >
                    Trở thành Carepartner
                  </Button>
                </motion.div>
              </div>

              {/* Right: Visual */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative hidden lg:block"
              >
                <div className="relative">
                  {/* Main illustration card */}
                  <div
                    className="rounded-3xl p-8 shadow-2xl"
                    style={{
                      background:
                        'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)',
                    }}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      {features.map((f, i) => (
                        <motion.div
                          key={f.title}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: 0.5 + i * 0.15 }}
                          className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div
                            className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-3`}
                          >
                            <f.icon
                              className={`w-6 h-6 bg-clip-text`}
                              style={{
                                color:
                                  f.title === 'Gia sư'
                                    ? '#f97316'
                                    : f.title === 'Trông trẻ'
                                      ? '#f43f5e'
                                      : f.title === 'Đón trẻ'
                                        ? '#10b981'
                                        : '#8b5cf6',
                              }}
                            />
                          </div>
                          <h3 className="font-bold text-gray-900 text-sm">
                            {f.title}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                            {f.desc.split('.')[0]}.
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Floating badge */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 1 }}
                    className="absolute -right-4 top-8 bg-white rounded-2xl shadow-lg p-3 flex items-center gap-2"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">Đã xác minh</p>
                      <p className="text-[10px] text-gray-500">Danh tính & bằng cấp</p>
                    </div>
                  </motion.div>

                  {/* Floating rating */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 1.2 }}
                    className="absolute -left-4 bottom-12 bg-white rounded-2xl shadow-lg p-3 flex items-center gap-2"
                  >
                    <div className="flex -space-x-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-7 h-7 rounded-full border-2 border-white"
                          style={{
                            background: `linear-gradient(135deg, ${
                              i === 1 ? '#fb923c' : i === 2 ? '#f97316' : '#ea580c'
                            }, ${
                              i === 1 ? '#fdba74' : i === 2 ? '#fb923c' : '#f97316'
                            })`,
                          }}
                        />
                      ))}
                    </div>
                    <div>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className="w-3 h-3 text-amber-400 fill-amber-400"
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500">2,500+ đánh giá</p>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Trust Indicators ── */}
        <section className="py-10 sm:py-14 bg-white/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {trustStats.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className="text-center p-4 sm:p-6 rounded-2xl bg-white/80 border border-orange-100/60 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <stat.icon className="w-7 h-7 sm:w-8 sm:h-8 mx-auto mb-2 text-orange-500" />
                    <p className="text-2xl sm:text-3xl font-black text-gray-900">
                      {stat.value}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ── Features Section ── */}
        <section className="py-14 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection className="text-center mb-10 sm:mb-14">
              <Badge
                variant="secondary"
                className="mb-3 bg-orange-100 text-orange-700 border-orange-200"
              >
                Dịch vụ
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900">
                Mọi dịch vụ cho gia đình bạn
              </h2>
              <p className="mt-3 text-gray-500 text-sm sm:text-base max-w-2xl mx-auto">
                Từ gia sư đến giúp việc — EduCareLink mang đến giải pháp toàn diện
                để chăm sóc gia đình bạn một cách chuyên nghiệp.
              </p>
            </AnimatedSection>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <Card className="h-full border-orange-100/60 hover:border-orange-200 hover:shadow-lg transition-all duration-300 group cursor-pointer overflow-hidden">
                    <CardContent className="p-5 sm:p-6">
                      <div
                        className={`w-14 h-14 rounded-2xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                      >
                        <f.icon
                          className="w-7 h-7"
                          style={{
                            color:
                              f.title === 'Gia sư'
                                ? '#f97316'
                                : f.title === 'Trông trẻ'
                                  ? '#f43f5e'
                                  : f.title === 'Đón trẻ'
                                    ? '#10b981'
                                    : '#8b5cf6',
                          }}
                        />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">
                        {f.title}
                      </h3>
                      <p className="text-sm text-gray-500 leading-relaxed">
                        {f.desc}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-14 sm:py-20 bg-white/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection className="text-center mb-10 sm:mb-14">
              <Badge
                variant="secondary"
                className="mb-3 bg-orange-100 text-orange-700 border-orange-200"
              >
                Cách hoạt động
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900">
                Đơn giản, nhanh chóng
              </h2>
              <p className="mt-3 text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
                Chỉ 3 bước để kết nối với Carepartner phù hợp cho gia đình bạn.
              </p>
            </AnimatedSection>

            <div className="grid md:grid-cols-3 gap-6 sm:gap-8 relative">
              {/* Connecting line (desktop only) */}
              <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-orange-200 via-amber-200 to-orange-200" />

              {steps.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  className="text-center relative"
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200/50 mb-5 relative z-10">
                    <step.icon className="w-7 h-7" />
                  </div>
                  <div className="text-xs font-bold text-orange-400 mb-1 tracking-wider">
                    BƯỚC {step.num}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                    {step.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section className="py-14 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection className="text-center mb-10 sm:mb-14">
              <Badge
                variant="secondary"
                className="mb-3 bg-orange-100 text-orange-700 border-orange-200"
              >
                Đánh giá
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900">
                Gia đình nói gì về chúng tôi
              </h2>
            </AnimatedSection>

            <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <Card className="h-full border-orange-100/60 hover:shadow-lg transition-shadow">
                    <CardContent className="p-5 sm:p-6">
                      <div className="flex gap-0.5 mb-4">
                        {Array.from({ length: t.rating }).map((_, s) => (
                          <Star
                            key={s}
                            className="w-4 h-4 text-amber-400 fill-amber-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed mb-4 italic">
                        &ldquo;{t.text}&rdquo;
                      </p>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                          style={{
                            background: `linear-gradient(135deg, #f97316, #fb923c)`,
                          }}
                        >
                          {t.name.charAt(4)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{t.name}</p>
                          <p className="text-xs text-gray-500">{t.role}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Section ── */}
        <section className="py-14 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <div
                className="rounded-3xl p-8 sm:p-12 lg:p-16 text-center relative overflow-hidden"
                style={{
                  background:
                    'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
                }}
              >
                {/* Decorative circles */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-6"
                  >
                    <Heart className="w-8 h-8 text-white" />
                  </motion.div>

                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mb-4">
                    Sẵn sàng chăm sóc gia đình tốt hơn?
                  </h2>
                  <p className="text-orange-100 text-sm sm:text-base max-w-xl mx-auto mb-8">
                    Tham gia cộng đồng hơn 10,000 gia đình đã tin tưởng EduCareLink.
                    Đăng ký miễn phí và tìm Carepartner phù hợp ngay hôm nay.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      size="lg"
                      onClick={() => navigate('register')}
                      className="bg-white text-orange-700 hover:bg-orange-50 shadow-lg h-12 text-base px-8 font-bold"
                    >
                      Đăng ký Phụ huynh
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => navigate('register')}
                      className="border-white/40 text-white hover:bg-white/10 hover:text-white h-12 text-base px-8 font-bold"
                    >
                      Trở thành Carepartner
                    </Button>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-400 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background:
                      'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
                  }}
                >
                  <svg
                    className="w-4 h-4 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <span className="text-lg font-bold text-white">EduCareLink</span>
              </div>
              <p className="text-sm leading-relaxed">
                Kết nối tri thức, nuôi dưỡng tương lai. Nền tảng hàng đầu kết nối
                phụ huynh với Carepartner tận tâm.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-white font-bold text-sm mb-4">Dịch vụ</h4>
              <ul className="space-y-2 text-sm">
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Gia sư</li>
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Trông trẻ</li>
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Đón trẻ</li>
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Dọn dẹp</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold text-sm mb-4">Về chúng tôi</h4>
              <ul className="space-y-2 text-sm">
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Giới thiệu</li>
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Chính sách</li>
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Hỗ trợ</li>
                <li className="hover:text-orange-400 transition-colors cursor-pointer">Liên hệ</li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold text-sm mb-4">Liên hệ</h4>
              <ul className="space-y-2 text-sm">
                <li>contact@educarelink.vn</li>
                <li>1900-xxxx</li>
                <li>Hà Nội, Việt Nam</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-500">
              &copy; {new Date().getFullYear()} EduCareLink. Tất cả quyền được bảo lưu.
            </p>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>Làm với</span>
              <Heart className="w-3 h-3 text-orange-500 fill-orange-500" />
              <span>tại Việt Nam</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Splash Screen (for returning authenticated users)
   ────────────────────────────────────────────── */
function SplashScreen() {
  const { navigate } = useAppStore()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('login')
    }, 2000)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background:
          'linear-gradient(135deg, #fffbf7 0%, #fff7ed 50%, #fef3c7 100%)',
      }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-center"
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [1, 0.8, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 shadow-xl"
          style={{
            background:
              'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
          }}
        >
          <svg
            className="w-10 h-10 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-black text-gray-900"
        >
          EduCareLink
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-gray-500 mt-2"
        >
          Trợ lý gia đình, Việc làm linh hoạt
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8"
        >
          <div className="w-8 h-8 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin mx-auto" />
        </motion.div>
      </motion.div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main Home Component
   ────────────────────────────────────────────── */
export default function Home() {
  const { screen, isAuthenticated, user } = useAppStore()

  // Auto-navigate on load: if authenticated, go to appropriate dashboard
  useEffect(() => {
    if (isAuthenticated && user && (screen === 'splash' || screen === 'landing')) {
      useAppStore.getState().navigate(
        user.role === 'admin' ? 'admin' : user.role === 'parent' ? 'parent-home' : 'worker-feed'
      )
    }
  }, [isAuthenticated, user, screen])

  const renderScreen = () => {
    switch (screen) {
      case 'landing':
        return <LandingPage />

      case 'splash':
        return <SplashScreen />

      case 'login':
      case 'register':
        return <AuthScreen />

      // Parent screens
      case 'parent-home':
        return <ParentHomeScreen />
      case 'parent-create-task':
        return <CreateTaskScreen />
      case 'parent-my-tasks':
        return <ParentMyTasksScreen />
      case 'parent-candidates':
        return <CandidatesScreen />
      case 'parent-review':
        return <ReviewScreen />

      // Worker screens
      case 'worker-feed':
        return <WorkerFeedScreen />
      case 'worker-task-detail':
        return <WorkerFeedScreen />
      case 'worker-my-jobs':
        return <WorkerMyJobsScreen />
      case 'worker-profile':
        return <WorkerProfileScreen />

      // Admin
      case 'admin':
        return <AdminDashboardScreen />

      default:
        return <LandingPage />
    }
  }

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>

      {/* Chatbot widget - visible for authenticated parents */}
      {isAuthenticated && user?.role === 'parent' && <ChatbotWidget />}
    </>
  )
}
