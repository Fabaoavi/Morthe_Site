export default function PortfolioPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="py-24 px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Portfólio</h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Uma seleção dos nossos melhores trabalhos.
        </p>
      </section>

      {/* Placeholder — será preenchido com galeria visual + filtros */}
      <section className="max-w-6xl mx-auto px-4 pb-32">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse"
            />
          ))}
        </div>
        <p className="text-center text-zinc-600 text-sm mt-8">Em breve — galeria completa com filtros por nicho.</p>
      </section>
    </main>
  );
}
