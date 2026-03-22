"use client";

import Link from 'next/link';
import { useDynamicColor } from './DynamicColorProvider';
import { useState } from 'react';

export default function Header() {
  const { color } = useDynamicColor();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  // Helper check for the current color to show up smoothly
  const isHovered = (path: string) => hoveredLink === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md dynamic-transition">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo Section */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <img 
                src="/logo-header.png" 
                alt="Logo" 
                className="h-8 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <Link 
              href="/" 
              className="text-sm font-medium transition-colors duration-300"
              style={{ color: isHovered('/') ? color : '#d4d4d8' }} // zinc-300 default
              onMouseEnter={() => setHoveredLink('/')}
              onMouseLeave={() => setHoveredLink(null)}
            >
              Início
            </Link>
            <Link 
              href="#destaques" 
              className="text-sm font-medium transition-colors duration-300"
              style={{ color: isHovered('#destaques') ? color : '#d4d4d8' }}
              onMouseEnter={() => setHoveredLink('#destaques')}
              onMouseLeave={() => setHoveredLink(null)}
            >
              Destaques
            </Link>
            <Link 
              href="#servicos" 
              className="text-sm font-medium transition-colors duration-300"
              style={{ color: isHovered('#servicos') ? color : '#d4d4d8' }}
              onMouseEnter={() => setHoveredLink('#servicos')}
              onMouseLeave={() => setHoveredLink(null)}
            >
              Serviços
            </Link>
            <Link 
              href="#quem-somos" 
              className="text-sm font-medium transition-colors duration-300"
              style={{ color: isHovered('#quem-somos') ? color : '#d4d4d8' }}
              onMouseEnter={() => setHoveredLink('#quem-somos')}
              onMouseLeave={() => setHoveredLink(null)}
            >
              Quem Somos
            </Link>
          </nav>

          {/* Call to Action Button */}
          <div className="flex items-center relative group">
            <Link 
              href="/cliente" 
              className="inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 border border-transparent"
              style={{ 
                backgroundColor: isHovered('/cliente') ? color : '#ffffff',
                color: isHovered('/cliente') ? '#09090b' : '#09090b',
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
      </div>
    </header>
  );
}
