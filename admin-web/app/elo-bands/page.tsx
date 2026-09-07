'use client';
// /elo-bands — chỉnh threshold 6 band ELO → HIỆU LỰC NGAY, không cần deploy
// (Step 6 AC11). PUT /api/matching/admin/elo-bands/

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Band = {
  id: string; name: string; min_elo: number; max_elo: number;
  rank_multiplier: string; max_proposals_per_day: number | null;
  label_vi: string; excluded_from_matching: boolean;
  only_when_pool_below: number | null;
};

export default function EloBandsPage() {
  const [bands, setBands] = useState<Band[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => api<{ results: Band[] }>('/admin/elo-bands/')
    .then((d) => setBands(d.results))
    .catch((e) => setErr(String(e.message)));

  useEffect(() => { load(); }, []);

  const update = (name: string, field: string, value: any) => {
    api('/admin/elo-bands/', { method: 'PUT', body: { [name]: { [field]: value } } })
      .then(() => { setMsg(`Đã lưu ${name}.${field} — hiệu lực ngay.`); setErr(''); load(); })
      .catch((e) => { setErr(e.message); setMsg(''); });
  };

  return (
    <div>
      <h1>Bậc tin nhiệm (Hidden ELO)</h1>
      <p className="sub">
        Sửa ngưỡng/multiplier — matching đọc trực tiếp từ bảng này, KHÔNG cần deploy.
        Sau khi đổi nên chạy lệnh <code>recompute_elo_bands</code> để tính lại toàn bộ.
      </p>
      {msg && <p className="okmsg">{msg}</p>}
      {err && <p className="error">{err}</p>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Band</th><th>min_elo</th><th>max_elo</th><th>×multiplier</th>
              <th>Đề xuất/ngày</th><th>Nhãn tiếng Việt</th><th>Loại khỏi matching</th>
              <th>Chỉ hiện khi pool &lt;</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.id}>
                <td><span className="badge">{b.name}</span></td>
                <td><input defaultValue={b.min_elo} style={{ width: 70 }}
                  onBlur={(e) => Number(e.target.value) !== b.min_elo &&
                    update(b.name, 'min_elo', Number(e.target.value))} /></td>
                <td><input defaultValue={b.max_elo} style={{ width: 70 }}
                  onBlur={(e) => Number(e.target.value) !== b.max_elo &&
                    update(b.name, 'max_elo', Number(e.target.value))} /></td>
                <td><input defaultValue={b.rank_multiplier} style={{ width: 70 }}
                  onBlur={(e) => e.target.value !== b.rank_multiplier &&
                    update(b.name, 'rank_multiplier', e.target.value)} /></td>
                <td><input defaultValue={b.max_proposals_per_day ?? ''} style={{ width: 70 }}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== b.max_proposals_per_day) update(b.name, 'max_proposals_per_day', v);
                  }} /></td>
                <td><input defaultValue={b.label_vi} style={{ width: 190 }}
                  onBlur={(e) => e.target.value !== b.label_vi &&
                    update(b.name, 'label_vi', e.target.value)} /></td>
                <td>
                  <input type="checkbox" defaultChecked={b.excluded_from_matching}
                    onChange={(e) => update(b.name, 'excluded_from_matching', e.target.checked)} />
                </td>
                <td><input defaultValue={b.only_when_pool_below ?? ''} style={{ width: 70 }}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== b.only_when_pool_below) update(b.name, 'only_when_pool_below', v);
                  }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
