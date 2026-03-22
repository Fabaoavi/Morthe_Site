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
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const isHovered = (path: string) => hoveredLink === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md dynamic-transition">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

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

          {/* Desktop: Centered nav with logo in middle */}
          <div
            className="hidden md:flex items-center justify-center flex-1"
            onMouseEnter={() => setNavExpanded(true)}
            onMouseLeave={() => { setNavExpanded(false); setHoveredLink(null); }}
          >
            {/* Left links — slide in from center */}
            <nav className="flex items-center gap-6 overflow-hidden">
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

            {/* Center logo */}
            <Link
              href="/"
              className="mx-6 flex-shrink-0 relative group"
            >
              <img
                src="/Logo_Branca.png"
                alt="Morthe"
                className="h-9 w-auto object-contain transition-all duration-500 ease-out"
                style={{
                  filter: navExpanded ? `drop-shadow(0 0 8px ${color})` : 'none',
                }}
              />
            </Link>

            {/* Right links — slide in from center */}
            <nav className="flex items-center gap-6 overflow-hidden">
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
          <Link href="/" className="md:hidden flex-shrink-0">
            <img
              src="/Logo_Branca.png"
              alt="Morthe"
              className="h-8 w-auto object-contain"
            />
          </Link>

          {/* CTA Button (always visible) */}
          <Link
            href="/cliente"
            className="inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 border border-transparent"
            style={{
              backgroundColor: isHovered('/cliente') ? color : '#ffffff',
              color: '#09090b',
              borderColor: isHovered('/cliente') ? color : 'transparent',
              boxShadow: isHovered('/cliente') ? `0 4px 20px -5px ${color}` : 'none'
            }}
            onMouseEnter={() => setHoveredLink('/cliente')}
            onMouseLeave={() => setHoveredLink(null)}
          >
            Área do Cliente
          </Link>
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
