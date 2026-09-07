'use client';
// /matching-weights — chỉnh 7 trọng số 7-factor (Step 11.6)
// Backend validate tổng = 100 trước khi ghi — sai → hiện lỗi, không lưu.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const FACTOR_VI: Record<string, string> = {
  availability: 'Khung giờ phù hợp',
  skills: 'Kỹ năng / chuyên ngành',
  distance: 'Khoảng cách',
  rating: 'Đánh giá sao',
  completion: 'Tỷ lệ hoàn thành',
  elo: 'Điểm tin nhiệm',
  response: 'Tốc độ phản hồi',
};

type Weight = { factor: string; weight_pct: number; is_active: boolean };

export default function MatchingWeightsPage() {
  const [weights, setWeights] = useState<Weight[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => api<{ results: Weight[] }>('/admin/matching-weights/')
    .then((d) => setWeights(d.results))
    .catch((e) => setErr(String(e.message)));

  useEffect(() => { load(); }, []);

  const total = weights.reduce((s, w) => s + w.weight_pct, 0);

  const save = async (factor: string, pct: number) => {
    try {
      await api('/admin/matching-weights/', { method: 'PUT', body: { [factor]: pct } });
      setMsg(`Đã lưu ${factor} = ${pct}% — ranking thay đổi ngay.`);
      setErr('');
      load();
    } catch (e: any) {
      setErr(e.message);
      setMsg('');
    }
  };

  return (
    <div>
      <h1>Trọng số matching (7 factor)</h1>
      <p className="sub">Tổng các trọng số đang bật phải = 100. Tổng hiện tại:
        <b> {total}</b> {total !== 100 ? '⚠️ chưa đủ 100' : '✓'}</p>
      {msg && <p className="okmsg">{msg}</p>}
      {err && <p className="error">{err}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Factor</th><th>Nhãn</th><th>Trọng số (%)</th><th>Bật</th></tr></thead>
          <tbody>
            {weights.map((w) => (
              <tr key={w.factor}>
                <td><span className="badge">{w.factor}</span></td>
                <td>{FACTOR_VI[w.factor] ?? w.factor}</td>
                <td><input defaultValue={w.weight_pct} style={{ width: 70 }}
                  onBlur={(e) => Number(e.target.value) !== w.weight_pct &&
                    save(w.factor, Number(e.target.value))} /></td>
                <td><input type="checkbox" defaultChecked={w.is_active} readOnly /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
