"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, MessageSquare, Mic, Tag as TagIcon, Video } from "lucide-react";
import type { BotStep, Chatbot, StepKind } from "@/lib/chatbot/common";
import { stepKind } from "@/lib/chatbot/common";

export interface TagRef {
  id: string;
  name: string;
  color: string;
}
export interface Refs {
  tags: TagRef[];
  sellers: { id: string; name: string }[];
  funnels: { id: string; name: string; columns: { id: string; name: string }[] }[];
  aiEnabled: boolean;
  storageReady: boolean;
  agents: { id: string; name: string; isPrimary: boolean }[];
}

export type Draft = Omit<Chatbot, "id" | "sort"> & { id?: string };

export async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo deu errado");
  return data;
}

/** Cor e ícone de cada tipo de bloco */
export const KIND_META: Record<StepKind, { label: string; Icon: typeof ImageIcon; color: string; soft: string; text: string }> = {
  MENU: { label: "Mensagem", Icon: MessageSquare, color: "#0d9488", soft: "bg-teal-50", text: "text-teal-700" },
  IMAGE: { label: "Foto", Icon: ImageIcon, color: "#0284c7", soft: "bg-sky-50", text: "text-sky-700" },
  AUDIO: { label: "Áudio", Icon: Mic, color: "#7c3aed", soft: "bg-violet-50", text: "text-violet-700" },
  VIDEO: { label: "Vídeo", Icon: Video, color: "#e11d48", soft: "bg-rose-50", text: "text-rose-700" },
  DOCUMENT: { label: "PDF", Icon: FileText, color: "#d97706", soft: "bg-amber-50", text: "text-amber-700" },
};

export const kindOfStep = (s: BotStep) => stepKind(s);

/** Link para abrir/mostrar o arquivo do Drive */
export const fileUrl = (fileId: string) => `/api/drive/files/${fileId}`;

export function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

const TAG_TONE: Record<string, string> = {
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  orange: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-600 border-red-200",
  purple: "bg-violet-50 text-violet-700 border-violet-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
};
export const tagTone = (c: string) => TAG_TONE[c] || TAG_TONE.blue;

/** *negrito* do WhatsApp */
export function waBold(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>
  );
}

export function TagPicker({
  tags,
  value,
  onChange,
  onCreate,
}: {
  tags: TagRef[];
  value: string[];
  onChange: (v: string[]) => void;
  onCreate?: (name: string) => Promise<TagRef>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              on ? tagTone(t.color) + " ring-2 ring-offset-1 ring-[var(--accent)]/30" : "border-slate-200 bg-white text-slate-400 hover:text-slate-600"
            }`}
          >
            <TagIcon size={11} /> {t.name}
          </button>
        );
      })}
      {tags.length === 0 && !onCreate && <span className="text-xs text-slate-400">Nenhuma etiqueta criada.</span>}
      {onCreate && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && name.trim()) {
              e.preventDefault();
              setBusy(true);
              try {
                const t = await onCreate(name.trim());
                if (!value.includes(t.id)) onChange([...value, t.id]);
                setName("");
              } finally {
                setBusy(false);
              }
            }
          }}
          disabled={busy}
          placeholder="+ nova etiqueta"
          className="w-32 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs outline-none focus:border-[var(--accent)]"
        />
      )}
    </div>
  );
}
