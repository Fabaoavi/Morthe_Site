"use client";

import { useEffect, useState } from "react";

interface PortfolioImage {
  id: string;
  imageUrl: string;
  colorPrimary: string;
  colorSecondary: string;
}

const categories = [
  "Identidade Visual",
  "Interface UI/UX",
  "Desenvolvimento Web",
  "Design de Produto",
  "Branding",
  "Motion Design",
];

export default function PortfolioGrid() {
  const [images, setImages] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDestaques() {
      try {
        const API = (
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        ).replace(/\/$/, "");
        const res = await fetch(`${API}/api/destaques`);
        if (res.ok) {
          const data: PortfolioImage[] = await res.json();
          setImages(data.slice(0, 6));
        }
      } catch (error) {
        console.error("[Portfolio] Failed to fetch:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchDestaques();
  }, []);

  const resolveUrl = (url: string) => {
    if (url.startsWith("/")) {
      return `${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}${url}`;
    }
    return url;
  };

  return (
    <section
      id="destaques"
      className="w-full max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-900 scroll-mt-20"
    >
      <div className="flex flex-col mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Nossos Destaques
        </h2>
        <p className="text-zinc-400 max-w-2xl">
          Explorando o limite entre a estética minimalista e o design focado em
          conversão.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[400px] w-full rounded-xl bg-zinc-900 animate-pulse"
            />
          ))
        ) : images.length > 0 ? (
          images.map((image, index) => (
            <div
              key={image.id}
              className="group relative h-[400px] w-full overflow-hidden rounded-xl bg-zinc-900"
            >
              <img
                src={resolveUrl(image.imageUrl)}
                alt={`Destaque ${index + 1}`}
                className="absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-out grayscale group-hover:grayscale-0 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100 z-10" />

              {/* Content on hover */}
              <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col items-start justify-end translate-y-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="text-xs font-semibold tracking-wider text-zinc-300 uppercase mb-2">
                  {categories[index % categories.length]}
                </span>
                <h3 className="text-xl font-medium text-white">
                  Projeto {String.fromCharCode(65 + index)}
                </h3>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-16">
            <p className="text-zinc-500 text-lg">
              Portfolio em construção — em breve nossos destaques estarão aqui.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
