'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  bg: '#0d1117', surface: '#161b22', border: '#30363d',
  text: '#e6edf3', muted: '#8b949e', blue: '#58a6ff',
};

const NAV_LINKS = [
  { label: '🏠 Panorama',  href: '/' },
  { label: '🧪 Backtest',  href: '/backtest' },
  { label: '📊 Dashboard', href: '/dashboard' },
  { label: '⚡ Múltiplas', href: '/multiple-analyzer' },
  { label: '🔬 Padrões',   href: '/patterns' },
  { label: '⚙️ Admin',     href: '/admin' },
];

interface NavHeaderProps {
  activePage: string;
  subtitle?: string;
}

export function NavHeader({ activePage, subtitle }: NavHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <style>{`
        .nav-header { padding: 20px 40px; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; justify-content: space-between; background: ${C.bg}; position: relative; }
        .nav-header__brand { color: ${C.blue}; font-weight: 900; font-size: 22px; }
        .nav-header__sub { color: ${C.muted}; font-size: 12px; margin-left: 12px; }
        .nav-header__links { display: flex; gap: 8px; }
        .nav-header__hamburger { display: none; background: transparent; border: 1px solid ${C.border}; border-radius: 6px; color: ${C.muted}; font-size: 22px; padding: 4px 10px; cursor: pointer; line-height: 1; }
        @media (max-width: 768px) {
          .nav-header { padding: 14px 16px; flex-wrap: wrap; }
          .nav-header__sub { display: none; }
          .nav-header__hamburger { display: block; }
          .nav-header__links { display: none; width: 100%; flex-direction: column; gap: 6px; padding-top: 12px; }
          .nav-header__links.open { display: flex; }
          .nav-header__links button { width: 100%; text-align: left; }
        }
      `}</style>
      <header className="nav-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="nav-header__brand">● LUCRATIVO</span>
          {subtitle && <span className="nav-header__sub">{subtitle}</span>}
        </div>
        <button className="nav-header__hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
          {menuOpen ? '✕' : '☰'}
        </button>
        <nav className={`nav-header__links${menuOpen ? ' open' : ''}`}>
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = href === activePage;
            return (
              <button
                key={href}
                onClick={() => { router.push(href); setMenuOpen(false); }}
                style={{
                  background: isActive ? C.blue : 'transparent',
                  color: isActive ? '#000' : C.muted,
                  border: `1px solid ${isActive ? C.blue : C.border}`,
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </header>
    </>
  );
}
