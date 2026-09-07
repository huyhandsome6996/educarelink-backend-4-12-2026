'use client';
// /jobs — xem JobPost + kết quả AI parse (Step 11: audit Gemini)

import { useEffect, useState } from 'react';
import { api, STATUS_VI } from '../../lib/api';

type Job = {
  id: string; job_type: string; title: string; parent: string; status: string;
  ai_parse_status: string; ai_parse_result: any; hourly_rate_vnd: number;
  needs_admin_review: boolean; total_matched: number | null; created_at: string;
};

const TYPE_VI: Record<string, string> = {
  tutoring: 'Gia sư', childcare: 'Trông trẻ', pickup: 'Đón trẻ',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [err, setErr] = useState('');

  const load = () => api<{ results: Job[] }>('/admin/jobs/')
    .then((d) => setJobs(d.results))
    .catch((e) => setErr(String(e.message)));

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1>Bài đăng + kết quả AI parse</h1>
      <p className="sub">ai_parse_status: ok (AI 1 lần) | repaired (sau retry) | fallback (rule-based).</p>
      {err && <p className="error">{err}</p>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Loại</th><th>Tiêu đề</th><th>PH</th><th>Giá/giờ</th>
              <th>Trạng thái</th><th>AI parse</th><th>Ứng viên</th><th>Thời gian</th><th></th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td><span className="badge">{TYPE_VI[j.job_type] ?? j.job_type}</span></td>
                <td style={{ maxWidth: 220 }}>{j.title || '(chưa có tiêu đề)'}</td>
                <td>{j.parent}</td>
                <td>{j.hourly_rate_vnd?.toLocaleString('vi-VN')}đ</td>
                <td>{STATUS_VI[j.status] ?? j.status}{j.needs_admin_review ? ' ⚠️' : ''}</td>
                <td>{j.ai_parse_status || '—'}</td>
                <td>{j.total_matched ?? '—'}</td>
                <td className="muted">{new Date(j.created_at).toLocaleString('vi-VN')}</td>
                <td><button className="ghost" onClick={() => setSelected(j)}>Xem AI</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && <p className="muted">Chưa có bài đăng nào.</p>}
      </div>

      {selected && (
        <div className="card">
          <h3>AI parse result — {selected.title}</h3>
          <pre style={{ fontSize: 12, overflowX: 'auto' }}>
            {JSON.stringify(selected.ai_parse_result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
