/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Dev: proxy API thẳng backend Django — tránh cấu hình CORS thêm
    const backend = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
    ];
  },
};

export default nextConfig;
