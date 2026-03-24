"use client";

import Link from 'next/link';
import { useDynamicColor } from './DynamicColorProvider';
import { useState, useEffect, useRef } from 'react';

const leftLinks = [
  { href: '/', label: 'Início' },
  { href: '#destaques', label: 'Destaques' },
];

const rightLinks = [
  { href: '#servicos', label: 'Serviços' },
  { href: '#quem-somos', label: 'Quem Somos' },
];

const mobileNavItems = [
  { href: '/', label: 'Início', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )},
  { href: '#destaques', label: 'Destaques', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )},
  { href: '#servicos', label: 'Serviços', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )},
  { href: '#quem-somos', label: 'Sobre', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )},
  { href: '/cliente', label: 'Cliente', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )},
];

export default function Header() {
  const { color } = useDynamicColor();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [logoAnimKey, setLogoAnimKey] = useState(0);
  const logoHovering = useRef(false);

  const isHovered = (path: string) => hoveredLink === path;

  return (
    <>
      <header className="sticky top-0 z-[70] w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md dynamic-transition">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center">

            {/* Desktop: Centered nav — absolute positioning for true center */}
            <div
              className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2"
              onMouseEnter={() => setNavExpanded(true)}
              onMouseLeave={() => { setNavExpanded(false); setHoveredLink(null); }}
            >
              {/* Left links */}
              <nav className="flex items-center gap-7 overflow-hidden">
                {leftLinks.map((link, i) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium whitespace-nowrap transition-all duration-500 ease-out"
                    style={{
                      color: isHovered(link.href) ? color : '#d4d4d8',
                      opacity: navExpanded ? 1 : 0,
                      transform: navExpanded ? 'translateX(0)' : 'translateX(40px)',
                      transitionDelay: navExpanded ? `${(leftLinks.length - 1 - i) * 60}ms` : '0ms',
                    }}
                    onMouseEnter={() => setHoveredLink(link.href)}
                    onMouseLeave={() => setHoveredLink(null)}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Center logo — plays once on hover, keeps last frame */}
              <Link
                href="/"
                className="mx-8 flex-shrink-0"
                onMouseEnter={() => {
                  if (!logoHovering.current) {
                    logoHovering.current = true;
                    setLogoAnimKey(k => k + 1);
                  }
                }}
                onMouseLeave={() => { logoHovering.current = false; }}
              >
                <img
                  key={logoAnimKey}
                  src={logoAnimKey > 0 ? `/logo-anim.apng?v=${logoAnimKey}` : "/logo-frame1.png"}
                  alt="Morthe"
                  className="h-[70px] w-auto object-contain"
                  style={{
                    filter: navExpanded ? `drop-shadow(0 0 10px ${color})` : 'none',
                  }}
                />
              </Link>

              {/* Right links */}
              <nav className="flex items-center gap-7 overflow-hidden">
                {rightLinks.map((link, i) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium whitespace-nowrap transition-all duration-500 ease-out"
                    style={{
                      color: isHovered(link.href) ? color : '#d4d4d8',
                      opacity: navExpanded ? 1 : 0,
                      transform: navExpanded ? 'translateX(0)' : 'translateX(-40px)',
                      transitionDelay: navExpanded ? `${i * 60}ms` : '0ms',
                    }}
                    onMouseEnter={() => setHoveredLink(link.href)}
                    onMouseLeave={() => setHoveredLink(null)}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Mobile: Logo centered (full width since no hamburger) */}
            <Link href="/" className="md:hidden flex-1 flex justify-center">
              <img
                src="/logo-frame1.png"
                alt="Morthe"
                className="h-12 w-auto object-contain"
              />
            </Link>

            {/* Desktop CTA — user icon, pushed to far right */}
            <div
              className="ml-auto relative hidden md:block"
              onMouseEnter={() => setCtaHovered(true)}
              onMouseLeave={() => setCtaHovered(false)}
            >
              <Link
                href="/cliente"
                className="inline-flex items-center gap-2 h-9 justify-center rounded-full transition-all duration-400 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 border border-zinc-700 hover:border-zinc-500"
                style={{
                  padding: ctaHovered ? '0 16px 0 10px' : '0 10px',
                  backgroundColor: ctaHovered ? color : 'transparent',
                  borderColor: ctaHovered ? color : undefined,
                  boxShadow: ctaHovered ? `0 4px 20px -5px ${color}` : 'none',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={ctaHovered ? '#09090b' : '#d4d4d8'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-colors duration-300 flex-shrink-0"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span
                  className="text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-400 ease-out"
                  style={{
                    maxWidth: ctaHovered ? '120px' : '0px',
                    opacity: ctaHovered ? 1 : 0,
                    color: ctaHovered ? '#09090b' : '#d4d4d8',
                  }}
                >
                  Área do Cliente
                </span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav Bar */}
      <MobileBottomNav />
    </>
  );
}

function MobileBottomNav() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Hide on scroll down, show on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      setVisible(current < lastScrollY.current || current < 50);
      lastScrollY.current = current;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[70]"
      style={{
        background: '#0a0a0a',
        borderTop: '1px solid #1a1a1a',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease-out',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: 56 }}>
        {mobileNavItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 12px',
              color: '#71717a',
              textDecoration: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1 }}>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
