"use client";

import Link from 'next/link';
import { useState } from 'react';

export default function HeroSection() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section 
      id="inicio" 
      className="relative w-full min-h-[90vh] flex items-center justify-center overflow-hidden border-b border-zinc-900/50"
    >
      {/* 
        The static radial background and texture were removed. 
        The global BackgroundSlideshow will serve as the actual background now.
      */}

      {/* Hero Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        
        {/* H1 Wrapper for Bloom Effect */}
        <div 
          className="relative inline-block mb-6"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Dynamic Bloom / Glow Layer */}
          <div 
            className="absolute left-[50%] top-[50%] w-[120%] h-[150%] pointer-events-none transition-all duration-700 ease-out z-[-1]"
            style={{
              background: 'radial-gradient(ellipse at center, var(--dynamic-color) 0%, transparent 60%)',
              filter: 'blur(50px)',
              opacity: isHovered ? 0.6 : 0,
              transform: `translate(-50%, -50%) scale(${isHovered ? 1 : 0.8})`,
            }}
          />

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white font-sans relative z-10 drop-shadow-md text-center">
            Elevando a criatividade.<br />
            Projetando o futuro.
          </h1>
        </div>
        
        <p className="text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl font-light drop-shadow">
          Construímos experiências digitais com altíssima performance, focadas no essencial, 
          unindo design imersivo ao dark mode tecnológico.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link 
            href="#reuniao" 
            className="inline-flex h-12 items-center justify-center rounded-md bg-white px-8 text-sm font-semibold text-zinc-950 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 active:scale-95 hover:brightness-90"
            style={{
              boxShadow: isHovered ? '0 0 30px -5px var(--dynamic-color)' : 'none',
              transition: 'box-shadow 0.5s ease-out, background-color 0.15s ease-out'
            }}
          >
            Agendar Reunião
          </Link>
          <Link 
            href="#projetos" 
            className="inline-flex h-12 items-center justify-center rounded-md border text-sm font-semibold px-8 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 active:scale-95 bg-zinc-950/40 backdrop-blur-sm"
            style={{
              borderColor: isHovered ? 'var(--dynamic-color)' : 'rgba(255,255,255,0.2)',
              color: isHovered ? 'var(--dynamic-color)' : '#ffffff',
              transition: 'border-color 0.5s ease-out, color 0.5s ease-out, background-color 0.15s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--dynamic-color)';
              e.currentTarget.style.color = '#000000'; // high contrast on hover fill
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(9, 9, 11, 0.4)'; // back to zinc-950/40
              e.currentTarget.style.color = isHovered ? 'var(--dynamic-color)' : '#ffffff';
            }}
          >
            Ver Projetos
          </Link>
        </div>
      </div>
    </section>
  );
}
