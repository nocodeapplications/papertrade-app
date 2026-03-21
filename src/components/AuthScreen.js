import React, { useState } from 'react';
import { useUser } from '../UserContext';

const THEMES = [
  { id: 'warmgray', bg: '#FAFAFA', shadow: '0 0 0 1px rgba(0,0,0,0.18)', title: 'Warm Gray' },
  { id: 'coolgray', bg: '#ECEFF1', shadow: '0 0 0 1px rgba(0,0,0,0.13)', title: 'Cool Gray' },
  { id: 'cream',    bg: '#FDFBF7', shadow: '0 0 0 1px rgba(80,60,20,0.2)', title: 'Cream' },
  { id: 'dark',     bg: '#111111', shadow: 'none', title: 'Dark' },
  { id: 'oatmeal',  bg: '#F2EDE8', shadow: '0 0 0 1px rgba(90,65,40,0.2)', title: 'Oatmeal' },
];

export default function AuthScreen() {
  const { register, login, getUserCount, setTheme } = useUser();
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewTheme, setPreviewTheme] = useState('warmgray');

  const handleThemePreview = (id) => {
    setPreviewTheme(id);
    if (id === 'warmgray') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const fn = tab === 'login' ? login : register;
    const error = fn(username.trim(), password);
    if (error) { setErr(error); setLoading(false); return; }
    setTheme(previewTheme);
    setLoading(false);
  };

  const count = getUserCount();

  return (
    <div className="auth-screen">
      <div className="auth-logo">Paper<span>Trade</span></div>
      <div className="auth-tagline">AI-powered day trading simulator</div>

      <div className="auth-box">
        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => { setTab('login'); setErr(''); }}>Sign in</button>
          <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => { setTab('register'); setErr(''); }}>Create account</button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="auth-label">Username</label>
          <input className="auth-input" type="text" placeholder="your username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
          <label className="auth-label">Password</label>
          <input className="auth-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />

          {tab === 'register' && (
            <div style={{ marginBottom: 14 }}>
              <label className="auth-label">Choose a theme</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {THEMES.map(t => (
                  <button key={t.id} type="button" title={t.title}
                    onClick={() => handleThemePreview(t.id)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', border: `2.5px solid ${previewTheme === t.id ? 'var(--accent)' : 'transparent'}`,
                      background: t.bg, boxShadow: t.shadow, cursor: 'pointer', transition: 'transform 0.15s',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : tab === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <div className="auth-err">{err}</div>
        </form>
      </div>

      <div className="auth-users-hint">
        {count === 0
          ? 'No accounts yet — create the first one above'
          : `${count} trader${count !== 1 ? 's' : ''} registered · Share this URL with others`}
        <br />
        <span style={{ opacity: 0.7 }}>Each account has its own portfolio &amp; history</span>
      </div>
    </div>
  );
}
