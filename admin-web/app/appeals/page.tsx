'use client';
// /appeals — duyệt kháng cáo CarePartner (Step 7.6)
// approve → đảo ELO (giữ đền bù PH); partially → đảo 50%; rejected → giữ phạt.

import { useEffect, useState } from 'react';
import { api, STATUS_VI } from '../../lib/api';

type Appeal = {
  id: string; status: string; carepartner: string; booking_id: string;
  reason_code: string; note: string; ai_precheck: any;
  created_at: string; decided_at: string | null; admin_note: string;
};

export default function AppealsPage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [status, setStatus] = useState('pending');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api<{ results: Appeal[] }>(`/admin/appeals/?status=${status}`)
    .then((d) => setAppeals(d.results))
    .catch((e) => setErr(String(e.message)));

  useEffect(() => { load(); }, [status]);

  const decide = async (id: string, decision: string) => {
    try {
      await api(`/admin/appeals/${id}/decide/`, { method: 'POST', body: { decision } });
      setMsg(`Đã xử lý kháng cáo: ${decision}.`);
      setErr('');
      load();
    } catch (e: any) {
      setErr(e.message);
      setMsg('');
    }
  };

  return (
    <div>
      <h1>Duyệt kháng cáo</h1>
      <p className="sub">
        Approve = đảo phạt ELO, GIỮ phần đền bù của phụ huynh. Tối đa 3 đơn/30 ngày
        — đơn thứ 4 tự động từ chối với lý do lạm dụng.
      </p>
      {msg && <p className="okmsg">{msg}</p>}
      {err && <p className="error">{err}</p>}
      <div className="card">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Đang chờ</option>
          <option value="approved">Đã chấp nhận</option>
          <option value="partially_approved">Chấp nhận một phần</option>
          <option value="rejected">Đã từ chối</option>
          <option value="all">Tất cả</option>
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>CP</th><th>Lý do</th><th>Mô tả</th><th>Trạng thái</th>
              <th>AI precheck</th><th>Thời gian</th><th></th></tr>
          </thead>
          <tbody>
            {appeals.map((a) => (
              <tr key={a.id}>
                <td>{a.carepartner}</td>
                <td><span className="badge">{a.reason_code}</span></td>
                <td style={{ maxWidth: 260 }}>{a.note}</td>
                <td>{a.status}</td>
                <td className="muted">{a.ai_precheck?.verdict ?? '—'}</td>
                <td className="muted">{new Date(a.created_at).toLocaleString('vi-VN')}</td>
                <td>
                  {a.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ok" onClick={() => decide(a.id, 'approved')}>Duyệt</button>
                      <button className="primary" onClick={() => decide(a.id, 'partially_approved')}>50%</button>
                      <button className="warn" onClick={() => decide(a.id, 'rejected')}>Từ chối</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {appeals.length === 0 && <p className="muted">Không có kháng cáo nào.</p>}
      </div>
    </div>
  );
}
