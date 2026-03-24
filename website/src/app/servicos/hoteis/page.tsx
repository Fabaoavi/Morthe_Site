"use client";

import Link from 'next/link';

const categories = [
  {
    title: 'Conteúdo Audiovisual',
    items: ['Fotografia de ambiente', 'Fotografia de experiência', 'Vídeos curtos', 'Vídeos institucionais', 'Vídeos comerciais', 'Captação para redes sociais', 'Conteúdo UGC'],
    gradient: 'from-emerald-900/30 to-zinc-900/80',
  },
  {
    title: 'Cobertura',
    items: ['Cobertura de eventos', 'Cobertura de ativações', 'Registros de experiência', 'Aftermovie de eventos'],
    gradient: 'from-teal-900/30 to-zinc-900/80',
  },
  {
    title: 'Identidade & Materiais Visuais',
    items: ['Mídia kit', 'Logo', 'Criação de portfólio', 'Apresentação institucional'],
    gradient: 'from-cyan-900/30 to-zinc-900/80',
  },
  {
    title: 'Sites',
    items: ['Site', 'Página institucional'],
    gradient: 'from-sky-900/30 to-zinc-900/80',
  },
];

export default function HoteisPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="py-20 px-4 text-center">
        <Link href="/servicos" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4 inline-block">
          ← Serviços
        </Link>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Hotéis, Gastronomia & Experiências</h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Conteúdo audiovisual, cobertura e identidade para experiências únicas.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-32">
        <div className="grid gap-6 sm:grid-cols-2">
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
