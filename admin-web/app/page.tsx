'use client';
// Trang đăng nhập SimpleJWT → sau khi login chuyển tới /elo-bands

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, getToken } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    router.replace('/elo-bands');
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await login(username, password);
    setLoading(false);
    if (ok) router.replace('/elo-bands');
    else setError('Sai tài khoản hoặc mật khẩu (cần tài khoản staff).');
  };

  return (
    <div className="login-box card">
      <h1>Đăng nhập quản trị</h1>
      <p className="sub">Tài khoản Django staff — xác thực SimpleJWT</p>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit}>
        <input placeholder="Tên đăng nhập" value={username}
          onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Mật khẩu" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <button className="primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
