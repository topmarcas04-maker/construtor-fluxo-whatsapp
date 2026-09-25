"use client";

import { FileText, Film, Image as ImageIcon, Music } from "lucide-react";
import type { DriveKind } from "@/lib/drive/common";

const MAP = {
  image: { Icon: ImageIcon, cls: "bg-sky-50 text-sky-600" },
  video: { Icon: Film, cls: "bg-violet-50 text-violet-600" },
  audio: { Icon: Music, cls: "bg-amber-50 text-amber-600" },
  document: { Icon: FileText, cls: "bg-slate-100 text-slate-600" },
};

export function FileIcon({ kind, size = 18 }: { kind: DriveKind; size?: number }) {
  const m = MAP[kind] || MAP.document;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.cls}`}>
      <m.Icon size={size} />
    </span>
  );
}
