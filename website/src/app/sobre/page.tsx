export default function SobrePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="py-24 px-4 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">Sobre a Morthe</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Estúdio criativo especializado em direção artística, produção audiovisual e identidade visual.
          Atuamos no universo da arte, entretenimento, marcas e experiências gastronômicas.
        </p>
      </section>

      {/* Placeholder — será expandido com história, equipe, valores */}
      <section className="max-w-4xl mx-auto px-4 pb-32">
        <div className="grid gap-6 sm:grid-cols-2">
          {['Visão', 'Missão', 'Valores', 'Equipe'].map((item) => (
            <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h3 className="text-lg font-semibold mb-2">{item}</h3>
              <p className="text-sm text-zinc-500">Conteúdo em breve.</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
