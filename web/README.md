# EduCareLink - Giao diện Web (Next.js)

Giao diện web mới cho nền tảng EduCareLink, được xây dựng bằng **Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui**.

## Cài đặt & Chạy

```bash
# Cài đặt dependencies
bun install

# Chạy development server
bun run dev

# Mở trình duyệt tại http://localhost:3000
```

## Công nghệ sử dụng

- **Next.js 16** - React framework với App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS 4** - Utility-first CSS framework
- **shadcn/ui** - Component library dựa trên Radix UI
- **Zustand** - State management
- **Framer Motion** - Animation library
- **Lucide Icons** - Icon set
- **date-fns** - Date formatting

## Cấu trúc thư mục

```
web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Trang chính (SPA router)
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Global styles (warm theme)
│   ├── components/
│   │   ├── educare/           # EduCareLink business components
│   │   │   ├── AuthScreens.tsx      # Đăng nhập & Đăng ký
│   │   │   ├── ParentScreens.tsx    # Màn hình Phụ huynh
│   │   │   ├── WorkerScreens.tsx    # Màn hình Carepartner
│   │   │   ├── AdminDashboard.tsx   # Bảng điều khiển Admin
│   │   │   └── ChatbotWidget.tsx    # Widget Trợ lý AI
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/                 # Custom React hooks
│   └── lib/
│       ├── store.ts           # Zustand store & API helpers
│       └── utils.ts           # Utility functions
├── public/                    # Static assets
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

## Kết nối Backend

Giao diện web kết nối trực tiếp đến Django REST Framework API.

Cấu hình API URL trong file `.env`:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api
```

## Màn hình

### Trang chủ (Landing Page)
- Giới thiệu dịch vụ EduCareLink
- Đăng ký Phụ huynh / Carepartner

### Xác thực
- Đăng nhập (tài khoản chung)
- Đăng ký Phụ huynh
- Đăng ký Carepartner (kèm upload ảnh CCCD)

### Phụ huynh
- Trang chủ: Việc cần làm, thống kê nhanh
- Đăng việc mới: Chọn danh mục, nhập thông tin
- Việc của tôi: Danh sách việc đã đăng
- Duyệt ứng viên: Xem & chọn Carepartner
- Đánh giá: Đánh giá Carepartner sau hoàn thành
- Trợ lý AI Chatbot

### Carepartner (Worker)
- Bảng tin việc làm: Tìm kiếm & ứng tuyển
- Việc của tôi: Theo dõi ứng tuyển
- Hồ sơ: Xem đánh giá, bằng cấp

### Admin
- Duyệt tài khoản Carepartner
- Quản lý danh sách Carepartner
- Cập nhật bằng cấp

## Thiết kế

Giao diện được thiết kế với tông màu **ấm áp (warm)**:
- Màu chủ đạo: Orange (#f97316) + Amber
- Background ấm: #fffbf7, #fff7ed
- Border nhẹ: #fed7aa
- Animation mượt mà với Framer Motion
- Responsive trên mọi thiết bị

## Lưu ý

- Giao diện web này **KHÔNG** thay đổi code backend hay mobile app
- Chỉ là frontend mới, kết nối đến API backend hiện có
- Backend Django chạy tại port 8000, web chạy tại port 3000
