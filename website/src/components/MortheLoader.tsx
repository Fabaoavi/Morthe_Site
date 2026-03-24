"use client";

interface MortheLoaderProps {
  size?: "sm" | "md" | "lg";
  fullscreen?: boolean;
  message?: string;
}

const sizes = { sm: 60, md: 140, lg: 220 };

export default function MortheLoader({ size = "md", fullscreen = false, message }: MortheLoaderProps) {
  const px = sizes[size];

  const loader = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/loading.apng"
        alt="Carregando..."
        width={px}
        height={px}
        style={{ width: px, height: px, objectFit: "contain" }}
      />
      {message && (
        <p style={{ color: "#a1a1aa", fontSize: 14, fontWeight: 500, textAlign: "center", margin: 0 }}>
          {message}
        </p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(9, 9, 11, 0.92)",
          zIndex: 9999,
        }}
      >
        {loader}
      </div>
    );
  }

  return loader;
}
