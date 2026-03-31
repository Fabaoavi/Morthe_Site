import Link from 'next/link';

const nichos = [
  {
    href: '/servicos/arte',
    title: 'Arte & Entretenimento',
    desc: 'Direção criativa, styling, audiovisual, cobertura de eventos e mais.',
    gradient: 'from-purple-900/40 to-zinc-950',
  },
  {
    href: '/servicos/marcas',
    title: 'Marcas',
    desc: 'Identidade visual, campanhas, materiais promocionais e sites.',
    gradient: 'from-amber-900/40 to-zinc-950',
  },
  {
    href: '/servicos/hoteis',
    title: 'Hotéis, Gastronomia & Experiências',
    desc: 'Conteúdo audiovisual, cobertura, identidade e materiais visuais.',
    gradient: 'from-emerald-900/40 to-zinc-950',
  },
];

export default function ServicosPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="py-24 px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Serviços</h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Arte, estratégia e identidade. Do conceito à imortalidade.
        </p>
      </section>

      {/* Nichos */}
      <section className="max-w-5xl mx-auto px-4 pb-32 grid gap-6 sm:grid-cols-1 md:grid-cols-3">
        {nichos.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`group relative rounded-2xl border border-zinc-800 overflow-hidden bg-gradient-to-b ${n.gradient} p-8 min-h-[260px] flex flex-col justify-end transition-all duration-300 hover:border-zinc-600 hover:scale-[1.02]`}
          >
            <h2 className="text-xl font-semibold mb-2 group-hover:text-white transition-colors">
              {n.title}
            </h2>
            <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
              {n.desc}
            </p>
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
