'use client';
// /bookings — danh sách booking, lọc theo trạng thái

import { useEffect, useState } from 'react';
import { api, STATUS_VI } from '../../lib/api';

type Booking = {
  id: string; status: string; job_title: string; carepartner: string;
  parent: string; total_value_vnd: number; compensation_vnd: number;
  elo_delta_applied: number; cancel_reason_code: string; created_at: string;
};

const FILTERS = ['', 'awaiting_commitment', 'committed', 'in_progress',
  'completed', 'cancelled_by_carepartner', 'cancelled_by_parent', 'no_show'];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');

  const load = () => api<{ results: Booking[] }>(`/admin/bookings/?status=${status}`)
    .then((d) => setBookings(d.results))
    .catch((e) => setErr(String(e.message)));

  useEffect(() => { load(); }, [status]);

  return (
    <div>
      <h1>Bookings (ghép cặp)</h1>
      <p className="sub">Auto-commit: phụ huynh chọn CP là đơn tạo ngay ở trạng thái "Chờ cam kết".</p>
      {err && <p className="error">{err}</p>}
      <div className="card">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>{f ? (STATUS_VI[f] ?? f) : 'Tất cả trạng thái'}</option>
          ))}
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Công việc</th><th>CP</th><th>PH</th><th>Giá trị</th>
              <th>Đền bù</th><th>ELO</th><th>Trạng thái</th><th>Thời gian</th></tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td style={{ maxWidth: 200 }}>{b.job_title || '(chưa có tiêu đề)'}</td>
                <td>{b.carepartner}</td>
                <td>{b.parent}</td>
                <td>{b.total_value_vnd?.toLocaleString('vi-VN')}đ</td>
                <td>{b.compensation_vnd ? `${b.compensation_vnd.toLocaleString('vi-VN')}đ` : '—'}</td>
                <td>{b.elo_delta_applied ? `${b.elo_delta_applied > 0 ? '+' : ''}${b.elo_delta_applied}` : '—'}</td>
                <td><span className="badge">{STATUS_VI[b.status] ?? b.status}</span></td>
                <td className="muted">{new Date(b.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && <p className="muted">Không có booking nào.</p>}
      </div>
    </div>
  );
}
