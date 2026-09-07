'use client';
// /state-logs — xem StateTransitionLog (Step 12.4, read-only)

import { useEffect, useState } from 'react';
import { api, STATUS_VI } from '../../lib/api';

type Log = {
  id: string; entity: string; entity_id: string;
  from_status: string; to_status: string;
  actor: string; reason: string; created_at: string;
};

export default function StateLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [entity, setEntity] = useState('');
  const [err, setErr] = useState('');

  const load = () => api<{ results: Log[] }>(`/admin/state-logs/?entity=${entity}`)
    .then((d) => setLogs(d.results))
    .catch((e) => setErr(String(e.message)));

  useEffect(() => { load(); }, [entity]);

  return (
    <div>
      <h1>Nhật ký chuyển trạng thái</h1>
      <p className="sub">Mỗi lần JobPost/Booking đổi trạng thái ghi đúng 1 dòng — audit không thể sửa.</p>
      {err && <p className="error">{err}</p>}
      <div className="card">
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Tất cả</option>
          <option value="job_post">JobPost</option>
          <option value="booking">Booking</option>
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Entity</th><th>ID</th><th>Từ</th><th>→</th><th>Actor</th><th>Lý do</th><th>Thời gian</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.entity}</td>
                <td className="muted">{l.entity_id.slice(0, 8)}…</td>
                <td>{STATUS_VI[l.from_status] ?? l.from_status}</td>
                <td><b>{STATUS_VI[l.to_status] ?? l.to_status}</b></td>
                <td>{l.actor}</td>
                <td style={{ maxWidth: 220 }}>{l.reason}</td>
                <td className="muted">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="muted">Chưa có log nào.</p>}
      </div>
    </div>
  );
}
