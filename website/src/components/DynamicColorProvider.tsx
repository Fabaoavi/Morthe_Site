"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface DynamicColorContextType {
  color: string;
  setColor: (color: string) => void;
}

const DynamicColorContext = createContext<DynamicColorContextType>({
  color: "#a0a0a0",
  setColor: () => {},
});

export function useDynamicColor() {
  return useContext(DynamicColorContext);
}

export default function DynamicColorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [color, setColor] = useState("#a0a0a0");

  const handleSetColor = useCallback((newColor: string) => {
    setColor(newColor);
  }, []);

  return (
    <DynamicColorContext.Provider value={{ color, setColor: handleSetColor }}>
      <div
        style={{ "--dynamic-color": color } as React.CSSProperties}
        className="flex flex-col min-h-screen"
      >
        {children}
      </div>
    </DynamicColorContext.Provider>
  );
}
