"use client";

import Link from 'next/link';

const categories = [
  {
    title: 'Branding & Posicionamento',
    items: ['Posicionamento de marca', 'Estratégia visual', 'Tom de voz', 'Narrativa de marca'],
    gradient: 'from-violet-900/30 to-zinc-900/80',
  },
  {
    title: 'Direção & Estratégia',
    items: ['Direção criativa', 'Direção artística', 'Consultoria', 'Acompanhamento criativo'],
    gradient: 'from-purple-900/30 to-zinc-900/80',
  },
  {
    title: 'Identidade',
    items: ['Identidade visual', 'Logo', 'Elementos visuais'],
    gradient: 'from-fuchsia-900/30 to-zinc-900/80',
  },
  {
    title: 'Styling',
    items: ['Styling para fotos', 'Styling para vídeos', 'Styling para campanhas', 'Styling para eventos', 'Direcionamento de imagem'],
    gradient: 'from-pink-900/30 to-zinc-900/80',
  },
  {
    title: 'Audiovisual',
    items: ['Fotografia artística', 'Fotografia promocional', 'Captação de conteúdo', 'Vídeos curtos', 'Videosets', 'Videoclipe'],
    gradient: 'from-rose-900/30 to-zinc-900/80',
  },
  {
    title: 'Materiais Visuais & Promocionais',
    items: ['Mídia kit', 'Press kit', 'Artes de divulgação', 'Arte animada', 'Materiais para lançamentos'],
    gradient: 'from-orange-900/30 to-zinc-900/80',
  },
  {
    title: 'Visuais para Show / VJ',
    items: ['Visuais para telão e VJ', 'Loops e arte em movimento', 'Elementos gráficos para performance'],
    gradient: 'from-red-900/30 to-zinc-900/80',
  },
  {
    title: 'Cobertura de Eventos',
    items: ['Cobertura de shows', 'Bastidores', 'Cobertura de eventos culturais', 'Aftermovie', 'Acompanhamento de artista em evento'],
    gradient: 'from-amber-900/30 to-zinc-900/80',
  },
  {
    title: 'Sites',
    items: ['Site para artista', 'Site para projeto musical', 'Página de apresentação profissional'],
    gradient: 'from-yellow-900/30 to-zinc-900/80',
  },
];

export default function ArteEntretenimentoPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="py-20 px-4 text-center">
        <Link href="/servicos" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4 inline-block">
          ← Serviços
        </Link>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Arte & Entretenimento</h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Direção criativa, styling, audiovisual e tudo para elevar a arte.
        </p>
      </section>

      {/* Cards grid with scroll animation */}
      <section className="max-w-6xl mx-auto px-4 pb-32">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <ServiceCard key={cat.title} category={cat} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ServiceCard({ category }: { category: typeof categories[number] }) {
  return (
    <div
      className={`group relative rounded-2xl border border-zinc-800 overflow-hidden bg-gradient-to-br ${category.gradient} transition-all duration-500 hover:border-zinc-600 hover:scale-[1.02] cursor-default`}
    >
      {/* Card header */}
      <div className="p-6 pb-4">
        <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-white transition-colors">
          {category.title}
        </h3>
        <p className="text-xs text-zinc-500 mt-1">{category.items.length} serviços</p>
      </div>

      {/* Items */}
      <div className="px-6 pb-6">
        <div className="flex flex-col gap-2">
          {category.items.map((item) => (
            <div
              key={item}
              className="flex items-center gap-2.5 text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors"
            >
              <div className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Placeholder overlay for future image */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 bg-white pointer-events-none" />
    </div>
  );
}
