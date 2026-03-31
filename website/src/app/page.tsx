"use client";

import Link from 'next/link';
import HeroSection from "@/components/HeroSection";
import PortfolioGrid from "@/components/PortfolioGrid";
import BackgroundSlideshow from "@/components/BackgroundSlideshow";
import Footer from "@/components/Footer";
import { useDynamicColor } from "@/components/DynamicColorProvider";

const nichos = [
  {
    href: '/servicos/arte',
    title: 'Arte & Entretenimento',
    desc: 'Direção criativa, styling, audiovisual, cobertura de eventos e mais.',
    gradient: 'from-purple-900/40 via-zinc-950 to-zinc-950',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    href: '/servicos/marcas',
    title: 'Marcas',
    desc: 'Identidade visual, campanhas, materiais promocionais e sites.',
    gradient: 'from-amber-900/40 via-zinc-950 to-zinc-950',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 18 9 18 9" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    ),
  },
  {
    href: '/servicos/hoteis',
    title: 'Hotéis, Gastronomia & Experiências',
    desc: 'Conteúdo audiovisual, cobertura, identidade e materiais visuais.',
    gradient: 'from-emerald-900/40 via-zinc-950 to-zinc-950',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
];

export default function Home() {
  const { setColor } = useDynamicColor();

  return (
    <div className="flex flex-col w-full relative">
      {/* Background slideshow behind hero */}
      <BackgroundSlideshow onColorChange={setColor} />

      {/* ── Hero ── */}
      <HeroSection />

      {/* ── Nichos de Serviço ── */}
      <section
        id="servicos"
        className="w-full bg-zinc-950 relative z-10 py-20 sm:py-28 scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">O que fazemos</h2>
            <p className="text-zinc-500 text-base sm:text-lg max-w-xl mx-auto">
              Arte, estratégia e identidade. Do conceito à imortalidade.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {nichos.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`group relative rounded-2xl border border-zinc-800/60 overflow-hidden bg-gradient-to-b ${n.gradient} p-7 sm:p-8 min-h-[200px] flex flex-col justify-between transition-all duration-400 hover:border-zinc-600 hover:scale-[1.02] hover:-translate-y-1`}
              >
                <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors mb-4">
                  {n.icon}
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-zinc-100 group-hover:text-white transition-colors mb-2">
                    {n.title}
                  </h3>
                  <p className="text-sm text-zinc-500 group-hover:text-zinc-400 transition-colors leading-relaxed">
                    {n.desc}
                  </p>
                </div>
                <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/servicos"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1.5"
            >
              Ver todos os serviços
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Destaques / Portfolio preview ── */}
      <section
        id="destaques"
        className="w-full bg-zinc-950 relative z-10 py-20 sm:py-28 border-t border-zinc-900/50 scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Destaques</h2>
            <p className="text-zinc-500 text-base sm:text-lg max-w-xl mx-auto">
              Uma seleção dos nossos melhores trabalhos.
            </p>
          </div>

          <PortfolioGrid />

          <div className="text-center mt-10">
            <Link
              href="/portfolio"
              className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-700 px-6 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 hover:border-zinc-500 transition-all duration-300"
            >
              Ver portfólio completo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Sobre resumido ── */}
      <section
        id="sobre"
        className="w-full bg-zinc-950 relative z-10 py-20 sm:py-28 border-t border-zinc-900/50 scroll-mt-20"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">Sobre a Morthe</h2>
          <p className="text-zinc-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-4">
            Toda marca carrega uma essência que poucos sabem ver. Fomos feitos pra enxergar exatamente isso.
          </p>
          <p className="text-zinc-500 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto mb-4">
            Não seguimos briefings... lemos entrelinhas. Mergulhamos no que ainda não tem nome e
            transformamos o intangível em identidade, presença e arte que comunica sem se explicar.
          </p>
          <p className="text-zinc-500 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto mb-10">
            Cada cliente é tratado como o que é: único. Inconfundível. E é exatamente assim que o mundo vai enxergá-lo.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Link
              href="/sobre"
              className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-700 px-6 text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 hover:border-zinc-500 transition-all duration-300"
            >
              Conheça a Morthe
            </Link>
            <a
              href="https://instagram.com/morthe.avi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              @morthe.avi
            </a>
          </div>
        </div>
      </section>

      {/* ── Contato / WhatsApp CTA ── */}
      <section
        id="contato"
        className="w-full bg-zinc-950 relative z-10 py-20 sm:py-28 border-t border-zinc-900/50 scroll-mt-20"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">A MORTHE TE ESPERA.</h2>
          <p className="text-zinc-400 text-base sm:text-lg mb-10 max-w-xl mx-auto">
            O próximo passo é seu. Sua identidade, sua essência e sua presença merecem ser imortalizadas.
          </p>

          <a
            href="https://wa.me/5516982662148?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20os%20servi%C3%A7os%20da%20Morthe."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full font-semibold text-base transition-all duration-300 hover:scale-105 active:scale-95"
            style={{ background: '#25D366', color: '#fff' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Entre em Contato
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
