"use client";

import Link from 'next/link';

const categories = [
  {
    title: 'Branding & Posicionamento',
    items: ['Posicionamento de marca', 'Estratégia de marca', 'Tom de voz', 'Narrativa institucional'],
    gradient: 'from-amber-900/30 to-zinc-900/80',
  },
  {
    title: 'Direção',
    items: ['Direção criativa', 'Direção de campanha'],
    gradient: 'from-orange-900/30 to-zinc-900/80',
  },
  {
    title: 'Identidade',
    items: ['Identidade visual', 'Logo', 'Elementos gráficos', 'Materiais institucionais'],
    gradient: 'from-yellow-900/30 to-zinc-900/80',
  },
  {
    title: 'Audiovisual',
    items: ['Fotografia de produtos', 'Vídeos institucionais', 'Vídeos promocionais', 'Captação de conteúdo', 'Cobertura de ações e eventos'],
    gradient: 'from-lime-900/30 to-zinc-900/80',
  },
  {
    title: 'Materiais Promocionais',
    items: ['Criação de portfólio', 'Apresentações visuais', 'Peças de divulgação', 'Materiais para campanhas'],
    gradient: 'from-green-900/30 to-zinc-900/80',
  },
  {
    title: 'Sites',
    items: ['Site institucional', 'Landing page', 'Site de apresentação'],
    gradient: 'from-emerald-900/30 to-zinc-900/80',
  },
];

export default function MarcasPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="py-20 px-4 text-center">
        <Link href="/servicos" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4 inline-block">
          ← Serviços
        </Link>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Marcas</h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Identidade, campanhas e materiais para posicionar sua marca.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-32">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div
              key={cat.title}
              className={`group relative rounded-2xl border border-zinc-800 overflow-hidden bg-gradient-to-br ${cat.gradient} transition-all duration-500 hover:border-zinc-600 hover:scale-[1.02] cursor-default`}
            >
              <div className="p-6 pb-4">
                <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-white transition-colors">{cat.title}</h3>
                <p className="text-xs text-zinc-500 mt-1">{cat.items.length} serviços</p>
              </div>
              <div className="px-6 pb-6 flex flex-col gap-2">
                {cat.items.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    <div className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 bg-white pointer-events-none" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
