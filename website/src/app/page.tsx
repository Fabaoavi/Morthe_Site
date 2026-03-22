"use client";

import HeroSection from "@/components/HeroSection";
import PortfolioGrid from "@/components/PortfolioGrid";
import BackgroundSlideshow from "@/components/BackgroundSlideshow";
import { useDynamicColor } from "@/components/DynamicColorProvider";

export default function Home() {
  const { setColor } = useDynamicColor();

  return (
    <div className="flex flex-col w-full relative">
      <BackgroundSlideshow onColorChange={setColor} />
      
      <HeroSection />

      <PortfolioGrid />

      {/* Adding backdrop layers natively to lower sections to keep text readable against potentially bright slideshows */}
      <section id="servicos" className="w-full max-w-6xl mx-auto py-24 border-t border-zinc-900/50 bg-zinc-950/80 backdrop-blur-sm relative z-10 px-4 sm:px-6 scroll-mt-20">
        <h2 className="text-3xl font-bold text-white mb-12 text-center md:text-left">Serviços</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md">
            <h3 className="text-xl font-medium text-white mb-4">Engenharia de Software</h3>
            <p className="text-zinc-400">Desenvolvimento de plataformas escaláveis e de alta performance utilizando as tecnologias mais avançadas do mercado, com foco em estabilidade.</p>
          </div>
          <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md">
            <h3 className="text-xl font-medium text-white mb-4">Design de Interface</h3>
            <p className="text-zinc-400">Criamos interfaces que aliam beleza estética a uma usabilidade impecável, focando no dark mode e no minimalismo tecnológico.</p>
          </div>
        </div>
      </section>

      <section id="quem-somos" className="w-full max-w-6xl mx-auto py-24 border-t border-zinc-900/50 bg-zinc-950/90 backdrop-blur-md relative z-10 px-4 sm:px-6 scroll-mt-20">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-4xl font-bold text-white mb-8">Quem Somos</h2>
          <p className="text-zinc-400 max-w-3xl text-lg md:text-xl leading-relaxed">
            Somos uma agência focada em transcender o comum. No universo digital, 
            acreditamos que o silêncio visual fala mais alto. Onde muitos veem vácuo, 
            nós vemos foco. Nossa missão é entregar resultados impecáveis com código limpo e design imersivo.
          </p>
        </div>
      </section>
    </div>
  );
}
