import Image from 'next/image';

const portfolioItems = [
  {
    id: 1,
    title: 'Projeto Alpha',
    category: 'Identidade Visual',
    imageSrc: '/logo_orange.svg',
  },
  {
    id: 2,
    title: 'Projeto Beta',
    category: 'Interface UI/UX',
    imageSrc: '/logo_orange.svg',
  },
  {
    id: 3,
    title: 'Projeto Gamma',
    category: 'Desenvolvimento Web',
    imageSrc: '/logo_orange.svg',
  },
];

export default function PortfolioGrid() {
  return (
    <section id="destaques" className="w-full max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-900">
      <div className="flex flex-col mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Nossos Destaques</h2>
        <p className="text-zinc-400 max-w-2xl">
          Explorando o limite entre a estética minimalista e o design focado em conversão.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {portfolioItems.map((item) => (
          <div 
            key={item.id} 
            className="group relative h-[400px] w-full overflow-hidden rounded-xl bg-zinc-900"
          >
            {/* Imagem de Fundo */}
            <Image
              src={item.imageSrc}
              alt={item.title}
              fill
              className="object-cover transition-all duration-500 ease-out grayscale group-hover:grayscale-0 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            
            {/* Gradiente de Proteção para o Texto (Aparece no hover ou permanente) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100 z-10" />

            {/* Conteúdo / Texto sobre a imagem */}
            <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col items-start justify-end translate-y-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
              <span className="text-xs font-semibold tracking-wider text-zinc-300 uppercase mb-2">
                {item.category}
              </span>
              <h3 className="text-xl font-medium text-white">
                {item.title}
              </h3>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
