"use client";

import React, { useEffect, useState, useRef } from "react";
import { FastAverageColor } from "fast-average-color";

interface BackgroundSlideshowProps {
  onColorChange: (colorHex: string) => void;
}

interface ImageHighlight {
  id: string;
  imageUrl: string;
  colorPrimary: string;
  colorSecondary: string;
}

export default function BackgroundSlideshow({
  onColorChange,
}: BackgroundSlideshowProps) {
  const [images, setImages] = useState<ImageHighlight[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Reference to the Color extraction library
  const facRef = useRef<FastAverageColor | null>(null);

  // Fetch images from our FastAPI backend
  useEffect(() => {
    async function fetchImages() {
      const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
      const url = `${API}/api/destaques`;
      console.log("[Slideshow] Fetching from:", url);
      try {
        const response = await fetch(url);
        console.log("[Slideshow] Response status:", response.status);
        if (response.ok) {
          const data: ImageHighlight[] = await response.json();
          console.log("[Slideshow] Received", data.length, "images:", data.map(d => d.imageUrl));
          if (data && data.length > 0) {
            setImages(data);
          } else {
            console.warn("[Slideshow] API retornou array vazio. Verifique /api/destaques/status");
          }
        } else {
          console.error("[Slideshow] API error:", response.status, response.statusText);
        }
      } catch (error) {
        console.error("[Slideshow] Fetch failed:", error, "— URL tentada:", url);
      } finally {
        setIsLoading(false);
      }
    }
    fetchImages();
    // Initialize FastAverageColor
    facRef.current = new FastAverageColor();

    return () => {
      if (facRef.current) {
        facRef.current.destroy();
      }
    };
  }, []);

  // Set the dominant color whenever the current image changes
  useEffect(() => {
    if (images.length === 0 || !images[currentIndex]) return;

    const currentImage = images[currentIndex];

    // Se a API retornou a cor primária extraída pelo backend (ColorThief), nós a usamos!
    if (currentImage.colorPrimary) {
      onColorChange(currentImage.colorPrimary);
      return;
    }

    // Fallback: se a API não retornou a cor, tentamos extrair no client-side
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = currentImage.imageUrl;

    img.onload = () => {
      if (facRef.current) {
        try {
          const color = facRef.current.getColor(img);
          onColorChange(color.hex);
        } catch (e) {
          console.warn("Could not extract color:", e);
        }
      }
    };
  }, [currentIndex, images, onColorChange]);

  // Set up the interval for the slideshow
  useEffect(() => {
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 7000); // 7 seconds per slide

    return () => clearInterval(interval);
  }, [images.length]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 -z-10 bg-zinc-950 flex items-center justify-center">
        {/* Simple subtle loading indicator */}
        <div className="w-8 h-8 rounded-full border-t-2 border-zinc-700 animate-spin"></div>
      </div>
    );
  }

  if (images.length === 0) {
    // Fallback if no images are loaded from the API
    return <div className="fixed inset-0 -z-10 bg-zinc-950"></div>;
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-zinc-950">
      {/* Overlay to ensure text readability */}
      <div className="absolute inset-0 bg-zinc-950/60 z-10 transition-colors duration-1000"></div>

      {images.map((image, index) => (
        <div
          key={image.id}
          className={`absolute inset-0 transition-opacity duration-1500 ease-in-out ${
            index === currentIndex ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* We use standard img to easily deal with external Google Drive URLs instead of Next.js Image component */}
          <img
            src={image.imageUrl.startsWith('/') ? `${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}${image.imageUrl}` : image.imageUrl}
            alt={`Background slide ${index + 1}`}
            className="w-full h-full object-cover object-center scale-105"
            onError={(e) => {
              console.error("[Slideshow] Falha ao carregar imagem:", (e.target as HTMLImageElement).src);
            }}
          />
        </div>
      ))}
    </div>
  );
}
