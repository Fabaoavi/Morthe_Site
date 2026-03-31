export default function SobrePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="py-24 px-4 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-8">Sobre a Morthe</h1>
        <p className="text-zinc-300 text-lg sm:text-xl leading-relaxed mb-4">
          Toda marca carrega uma essência que poucos sabem ver. Fomos feitos pra enxergar exatamente isso.
        </p>
        <p className="text-zinc-500 text-base sm:text-lg leading-relaxed mb-4">
          Não seguimos briefings... lemos entrelinhas. Mergulhamos no que ainda não tem nome e
          transformamos o intangível em identidade, presença e arte que comunica sem se explicar.
        </p>
        <p className="text-zinc-500 text-base sm:text-lg leading-relaxed">
          Cada cliente é tratado como o que é: único. Inconfundível. E é exatamente assim que o mundo vai enxergá-lo.
        </p>
      </section>

      {/* Missão, Visão, Valores */}
      <section className="max-w-5xl mx-auto px-4 pb-32">
        <div className="grid gap-6 sm:grid-cols-3">
          {/* Missão */}
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-purple-900/20 to-zinc-950 p-7">
            <h3 className="text-lg font-semibold mb-4 text-white">Missão</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Revelar o que há de único em cada marca e transformar isso em identidade, presença e arte que impacta
              — porque o mundo não precisa de mais um. Precisa de você.
            </p>
          </div>

          {/* Visão */}
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-amber-900/20 to-zinc-950 p-7">
            <h3 className="text-lg font-semibold mb-4 text-white">Visão</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Transformar essências em arte tão única e poderosa que se torna impossível de ignorar,
              impossível de esquecer.
            </p>
          </div>

          {/* Valores */}
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-emerald-900/20 to-zinc-950 p-7">
            <h3 className="text-lg font-semibold mb-4 text-white">Valores</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Autenticidade que provoca, disrupção que posiciona. Porque identidade de verdade não se copia
              — se constrói.
            </p>
          </div>
        </div>

        {/* Instagram */}
        <div className="text-center mt-16">
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
      </section>
    </main>
  );
}
