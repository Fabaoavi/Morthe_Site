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

export default function Header() {
  const { color } = useDynamicColor();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoAnimKey, setLogoAnimKey] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const isHovered = (path: string) => hoveredLink === path;

  return (
    <header className="sticky top-0 z-[70] w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md dynamic-transition">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center">

          {/* Mobile: Hamburger (left) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-9 h-9 rounded-md border border-zinc-700 hover:border-zinc-500 transition-colors bg-zinc-900/80 backdrop-blur-sm"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
          >
            <span className={`block w-4 h-0.5 bg-zinc-300 transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[3px]' : ''}`} />
            <span className={`block w-4 h-0.5 bg-zinc-300 transition-all duration-300 my-[3px] ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-4 h-0.5 bg-zinc-300 transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-[3px]' : ''}`} />
          </button>

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

            {/* Center logo — animated on hover (plays once, keeps last frame) */}
            <Link
              href="/"
              className="mx-8 flex-shrink-0"
              onMouseEnter={() => setLogoAnimKey(k => k + 1)}
            >
              <img
                key={logoAnimKey}
                src={logoAnimKey > 0 ? `/logo-anim.apng?v=${logoAnimKey}` : "/Logo_Branca.png"}
                alt="Morthe"
                className="h-11 w-auto object-contain transition-all duration-500 ease-out"
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

          {/* Mobile: Logo centered */}
          <Link href="/" className="md:hidden flex-1 flex justify-center">
            <img
              src="/Logo_Branca.png"
              alt="Morthe"
              className="h-9 w-auto object-contain"
            />
          </Link>

          {/* CTA — user icon, pushed to far right */}
          <div
            className="ml-auto relative"
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
              {/* User icon */}
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
              {/* Label — expands on hover */}
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

      {/* Mobile Drawer — slides from left */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] md:hidden transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? 'auto' : 'none',
        }}
        onClick={() => setMenuOpen(false)}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="fixed top-0 left-0 h-full w-[280px] z-[90] md:hidden flex flex-col transition-transform duration-300 ease-out"
        style={{
          transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          background: 'rgba(9, 9, 11, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: menuOpen ? '4px 0 25px rgba(0,0,0,0.5)' : 'none',
        }}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          if (delta < -60) setMenuOpen(false);
        }}
      >
        {/* Drawer header — logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/50">
          <Link href="/" onClick={() => setMenuOpen(false)}>
            <img src="/Logo_Branca.png" alt="Morthe" className="h-8 w-auto object-contain" />
          </Link>
          <button
            onClick={() => setMenuOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Fechar menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex flex-col gap-1 px-4 pt-6 flex-1">
          {[...leftLinks, ...rightLinks].map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-all duration-200"
              style={{
                animation: menuOpen ? `drawerSlideIn 0.3s ease-out ${i * 50}ms both` : 'none',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* CTA at bottom */}
        <div className="px-4 pb-8 pt-4 border-t border-zinc-800/50">
          <Link
            href="/cliente"
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-center gap-2 w-full rounded-full border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            style={{
              animation: menuOpen ? `drawerSlideIn 0.3s ease-out 250ms both` : 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Área do Cliente
          </Link>
        </div>

        <style>{`@keyframes drawerSlideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      </div>
    </header>
  );
}
