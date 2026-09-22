"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

const FullscreenContext = createContext<{ expanded: boolean; setExpanded: (v: boolean) => void }>({
  expanded: false,
  setExpanded: () => {},
});

export function FullscreenProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <FullscreenContext.Provider value={{ expanded, setExpanded }}>{children}</FullscreenContext.Provider>
  );
}

export function useFullscreen() {
  return useContext(FullscreenContext);
}

/** Botão expandir/recolher: esconde menu lateral e topo para a tela usar o espaço todo */
export function ExpandButton() {
  const { expanded, setExpanded } = useFullscreen();
  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      title={expanded ? "Recolher (Esc)" : "Expandir"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
    >
      {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
    </button>
  );
}
