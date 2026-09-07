import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'EduCareLink Admin — Ghép cặp',
  description: 'Quản trị Flow ghép cặp Phụ huynh ↔ CarePartner',
};

const NAV = [
  { href: '/elo-bands', label: 'Bậc tin nhiệm (ELO)' },
  { href: '/matching-weights', label: 'Trọng số matching' },
  { href: '/appeals', label: 'Kháng cáo' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/jobs', label: 'Bài đăng (AI parse)' },
  { href: '/state-logs', label: 'State logs' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <header className="topbar">
          <span className="brand">🎓 EduCareLink Admin</span>
          <nav className="nav">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
