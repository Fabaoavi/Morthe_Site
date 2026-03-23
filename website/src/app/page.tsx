"use client";

import HeroSection from "@/components/HeroSection";
import PortfolioGrid from "@/components/PortfolioGrid";
import BackgroundSlideshow from "@/components/BackgroundSlideshow";
import Footer from "@/components/Footer";
import { useDynamicColor } from "@/components/DynamicColorProvider";

const services = [
  {
    title: "Fotografia",
    description:
      "Capturamos momentos com olhar artístico e técnica apurada, transformando cada ensaio em uma narrativa visual única.",
  },
  {
    title: "Direção Criativa",
    description:
      "Conceituamos e dirigimos projetos visuais do início ao fim, garantindo coesão estética e impacto em cada entrega.",
  },
  {
    title: "Design",
    description:
      "Criamos peças visuais que comunicam com clareza e elegância — do digital ao impresso, com foco no minimalismo.",
  },
  {
    title: "Identidade Visual",
    description:
      "Desenvolvemos marcas com personalidade própria: logotipos, paletas, tipografia e guidelines completos.",
  },
  {
    title: "Criação de Site",
    description:
      "Sites de alta performance com design imersivo, dark mode e tecnologia de ponta para posicionar sua marca online.",
  },
];

export default function Home() {
  const { setColor } = useDynamicColor();

  return (
    <div className="flex flex-col w-full relative">
      <BackgroundSlideshow onColorChange={setColor} />

      <HeroSection />

      <PortfolioGrid />

      {/* Serviços */}
      <section
        id="servicos"
        className="w-full max-w-6xl mx-auto py-24 border-t border-zinc-900/50 bg-zinc-950/80 backdrop-blur-sm relative z-10 px-4 sm:px-6 scroll-mt-20"
      >
        <h2 className="text-3xl font-bold text-white mb-4 text-center md:text-left">
          Serviços
        </h2>
        <p className="text-zinc-500 mb-12 text-center md:text-left">
          Do conceito à execução — tudo o que sua marca precisa.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.title}
              className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md hover:border-zinc-700/60 transition-colors duration-300"
            >
              <h3 className="text-lg font-medium text-white mb-3">
                {service.title}
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quem Somos */}
      <section
        id="quem-somos"
        className="w-full max-w-6xl mx-auto py-24 border-t border-zinc-900/50 bg-zinc-950/90 backdrop-blur-md relative z-10 px-4 sm:px-6 scroll-mt-20"
      >
        <div className="flex flex-col items-center text-center">
          <h2 className="text-4xl font-bold text-white mb-8">Quem Somos</h2>
          <p className="text-zinc-400 max-w-3xl text-lg md:text-xl leading-relaxed mb-10">
            Somos uma agência focada em transcender o comum. No universo digital,
            acreditamos que o silêncio visual fala mais alto. Onde muitos veem vácuo,
            nós vemos foco. Nossa missão é entregar resultados impecáveis com código
            limpo e design imersivo.
          </p>

          {/* Redes sociais */}
          <a
            href="https://instagram.com/morthe.avi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors duration-300 group"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-colors"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            <span className="text-sm font-medium">@morthe.avi</span>
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
