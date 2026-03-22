"use client";

import Link from 'next/link';
import { useDynamicColor } from './DynamicColorProvider';
import { useState, useEffect } from 'react';

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
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md dynamic-transition">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center">

          {/* Mobile: Hamburger (left) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-9 h-9 rounded-md border border-zinc-700 hover:border-zinc-500 transition-colors"
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

            {/* Center logo — larger */}
            <Link href="/" className="mx-8 flex-shrink-0">
              <img
                src="/Logo_Branca.png"
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

      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 top-16 z-40 bg-zinc-950/95 backdrop-blur-lg transition-all duration-300 md:hidden ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <nav className="flex flex-col items-center justify-center gap-8 pt-16">
          {[...leftLinks, ...rightLinks].map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-2xl font-medium transition-all duration-300"
              style={{
                color: isHovered(link.href) ? color : '#d4d4d8',
                transform: menuOpen ? 'translateY(0)' : `translateY(${(i + 1) * 10}px)`,
                opacity: menuOpen ? 1 : 0,
                transitionDelay: menuOpen ? `${i * 75}ms` : '0ms',
              }}
              onMouseEnter={() => setHoveredLink(link.href)}
              onMouseLeave={() => setHoveredLink(null)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
