"use client";

import Link from 'next/link';
import { useDynamicColor } from './DynamicColorProvider';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ── Menu structure ── */
const leftLinks = [
  { href: '/', label: 'Início' },
  { href: '/servicos', label: 'Serviços', hasDropdown: true },
  { href: '/portfolio', label: 'Portfólio' },
];

const rightLinks = [
  { href: '/sobre', label: 'Sobre' },
  { href: '/contato', label: 'Contato' },
];

const servicosDropdown = [
  { href: '/servicos/arte', label: 'Arte & Entretenimento', desc: 'Direção criativa, styling, audiovisual' },
  { href: '/servicos/marcas', label: 'Marcas', desc: 'Identidade, campanhas, materiais' },
  { href: '/servicos/hoteis', label: 'Hotéis, Gastronomia & Experiências', desc: 'Conteúdo, cobertura, identidade' },
];

/* ── Mobile bottom nav ── */
const mobileNavItems = [
  { href: '/', label: 'Home', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )},
  { href: '/servicos', label: 'Serviços', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )},
  { href: '/portfolio', label: 'Portfólio', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )},
  { href: '/sobre', label: 'Sobre', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )},
  { href: '/contato', label: 'Contato', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )},
];

export default function Header() {
  const { color } = useDynamicColor();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Logo animation: both images always in DOM, swap via opacity ── */
  const [logoPlaying, setLogoPlaying] = useState(false);
  const [logoAnimSrc, setLogoAnimSrc] = useState("/logo-anim.apng");
  const logoAnimRef = useRef<HTMLImageElement>(null);
  const logoPlayingRef = useRef(false);

  // Preload APNG on mount so there's no flash
  useEffect(() => {
    const img = new Image();
    img.src = "/logo-anim.apng";
  }, []);

  const handleLogoEnter = useCallback(() => {
    if (logoPlayingRef.current) return;
    logoPlayingRef.current = true;
    // Force reload the APNG by cache-busting to restart animation
    setLogoAnimSrc(`/logo-anim.apng?t=${Date.now()}`);
    setLogoPlaying(true);
  }, []);

  const handleLogoLeave = useCallback(() => {
    logoPlayingRef.current = false;
    // Keep showing the last frame (don't reset to static)
  }, []);

  const openDropdown = () => {
    if (dropdownTimer.current) clearTimeout(dropdownTimer.current);
    setDropdownOpen(true);
  };
  const closeDropdown = () => {
    dropdownTimer.current = setTimeout(() => setDropdownOpen(false), 200);
  };

  const isHovered = (path: string) => hoveredLink === path;

  return (
    <>
      <header className="sticky top-0 z-[70] w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md dynamic-transition">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center">

            {/* ── Desktop: Centered nav with expanding links ── */}
            <div
              className="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2"
              onMouseEnter={() => setNavExpanded(true)}
              onMouseLeave={() => { setNavExpanded(false); setHoveredLink(null); setDropdownOpen(false); }}
            >
              {/* Left links */}
              <nav className="flex items-center gap-7 overflow-hidden">
                {leftLinks.map((link, i) => (
                  <div
                    key={link.href}
                    className="relative"
                    onMouseEnter={() => {
                      setHoveredLink(link.href);
                      if (link.hasDropdown) openDropdown();
                    }}
                    onMouseLeave={() => {
                      setHoveredLink(null);
                      if (link.hasDropdown) closeDropdown();
                    }}
                  >
                    <Link
                      href={link.href}
                      className="text-sm font-medium whitespace-nowrap transition-all duration-500 ease-out block"
                      style={{
                        color: isHovered(link.href) ? color : '#d4d4d8',
                        opacity: navExpanded ? 1 : 0,
                        transform: navExpanded ? 'translateX(0)' : 'translateX(40px)',
                        transitionDelay: navExpanded ? `${(leftLinks.length - 1 - i) * 60}ms` : '0ms',
                      }}
                    >
                      {link.label}
                      {link.hasDropdown && (
                        <svg
                          width="10" height="10" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className="inline-block ml-1 transition-transform duration-200"
                          style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      )}
                    </Link>

                    {/* Serviços dropdown */}
                    {link.hasDropdown && (
                      <div
                        className="absolute top-full left-1/2 -translate-x-1/2 pt-3"
                        style={{
                          opacity: dropdownOpen ? 1 : 0,
                          transform: dropdownOpen ? 'translateY(0)' : 'translateY(-8px)',
                          pointerEvents: dropdownOpen ? 'auto' : 'none',
                          transition: 'opacity 0.25s ease, transform 0.25s ease',
                        }}
                        onMouseEnter={openDropdown}
                        onMouseLeave={closeDropdown}
                      >
                        <div
                          className="rounded-xl border border-zinc-800 overflow-hidden"
                          style={{
                            background: 'rgba(9, 9, 11, 0.95)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            minWidth: 280,
                          }}
                        >
                          {servicosDropdown.map((item, idx) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              className="block px-5 py-3.5 transition-colors duration-200 hover:bg-zinc-800/60"
                              style={{
                                borderTop: idx > 0 ? '1px solid rgba(63,63,70,0.3)' : 'none',
                              }}
                            >
                              <div className="text-sm font-medium text-zinc-200">{item.label}</div>
                              <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </nav>

              {/* Center logo — both images stacked, swap via opacity (no flash) */}
              <Link
                href="/"
                className="mx-8 flex-shrink-0 relative"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none',
                }}
                onMouseEnter={handleLogoEnter}
                onMouseLeave={handleLogoLeave}
                draggable={false}
              >
                {/* Static first frame — visible until animation starts */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-frame1.png"
                  alt="Morthe"
                  className="h-[70px] w-auto object-contain"
                  style={{
                    opacity: logoPlaying ? 0 : 1,
                    transition: 'opacity 0.05s ease',
                    filter: navExpanded ? `drop-shadow(0 0 10px ${color})` : 'none',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                  } as React.CSSProperties}
                  draggable={false}
                />
                {/* Animated APNG — overlaid on top, shown when playing */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={logoAnimRef}
                  src={logoAnimSrc}
                  alt=""
                  className="h-[70px] w-auto object-contain absolute inset-0"
                  style={{
                    opacity: logoPlaying ? 1 : 0,
                    transition: 'opacity 0.05s ease',
                    filter: navExpanded ? `drop-shadow(0 0 10px ${color})` : 'none',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                  } as React.CSSProperties}
                  draggable={false}
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

            {/* ── Mobile: Logo centered — bigger ── */}
            <Link
              href="/"
              className="md:hidden flex-1 flex justify-center"
              style={{
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-frame1.png"
                alt="Morthe"
                className="h-16 w-auto object-contain"
                style={{ userSelect: 'none' }}
                draggable={false}
              />
            </Link>

            {/* ── Desktop CTA — user icon, pushed to far right ── */}
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
                  width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke={ctaHovered ? '#09090b' : '#d4d4d8'} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
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

      {/* ── Mobile Bottom Nav Bar ── */}
      <MobileBottomNav />
    </>
  );
}

function MobileBottomNav() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

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
