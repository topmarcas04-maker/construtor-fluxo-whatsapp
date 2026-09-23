"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Timer, Send, RotateCcw, Sparkles, Image as ImageIcon, Zap, UserRound, CalendarDays, MessageCircleMore } from "lucide-react";
import { Textarea } from "@/components/ui";
import { STYLE_PRESETS, LENGTH_OPTIONS, EMOJI_OPTIONS, SPEED_OPTIONS } from "@/lib/ai/style";

export interface StyleValues {
  style: string;
  styleCustom: string | null;
  replyLength: string;
  emojiLevel: string;
  replySpeed: string;
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly { key: string; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key as T)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === o.key ? "bg-white text-[var(--accent)] shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Estilo de conversa (jeito de falar) + ritmo das respostas */
export function StyleCard({ v, onChange }: { v: StyleValues; onChange: (patch: Partial<StyleValues>) => void }) {
  const speed = SPEED_OPTIONS.find((o) => o.key === v.replySpeed) || SPEED_OPTIONS[1];
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <Palette size={17} /> Estilo de conversa
      </p>
      <p className="mt-1 text-sm text-slate-500">
        O jeito de falar é somado às instruções abaixo. Troque o modelo e teste: as informações da empresa continuam as mesmas.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STYLE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange({ style: p.key })}
            className={`rounded-xl border p-3 text-left transition ${
              v.style === p.key ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/15" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className={`text-sm font-semibold ${v.style === p.key ? "text-[var(--accent)]" : "text-slate-800"}`}>{p.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{p.hint}</p>
          </button>
        ))}
      </div>
      {v.style === "CUSTOM" ? (
        <Textarea
          rows={4}
          className="mt-3"
          value={v.styleCustom || ""}
          onChange={(e) => onChange({ styleCustom: e.target.value })}
          placeholder='Descreva o jeito de falar. Ex.: "Fale como um amigo que entende de scooter, com frases curtas e bem-humoradas..."'
        />
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
          {STYLE_PRESETS.find((p) => p.key === v.style)?.text}
        </p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Tamanho das respostas</p>
          <Seg value={v.replyLength} options={LENGTH_OPTIONS} onChange={(x) => onChange({ replyLength: x })} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Emojis</p>
          <Seg value={v.emojiLevel} options={EMOJI_OPTIONS} onChange={(x) => onChange({ emojiLevel: x })} />
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Timer size={15} /> Tempo para responder
        </p>
        <Seg value={v.replySpeed} options={SPEED_OPTIONS} onChange={(x) => onChange({ replySpeed: x })} />
        <p className="mt-1.5 text-xs text-slate-500">
          {speed.hint} Se o cliente mandar outra mensagem nesse meio-tempo, a IA espera e responde tudo junto.
        </p>
      </div>
    </div>
  );
}

type Line = { from: "lead" | "ai" | "info"; text: string };

/** Conversa de teste com a IA usando o que está na tela (mesmo sem salvar) */
export function AiTester({ draft, disabled }: { draft: Record<string, unknown>; disabled?: string | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [lines, busy]);

  const send = async (value: string) => {
    if (!value.trim() || busy) return;
    const next: Line[] = [...lines, { from: "lead", text: value.trim() }];
    setLines(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sdr/settings/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((l) => l.from !== "info").map((l) => ({ from: l.from, text: l.text })), draft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "A IA não respondeu");
      const add: Line[] = (d.parts as string[]).map((p) => ({ from: "ai" as const, text: p }));
      for (const ph of d.photos as string[]) add.push({ from: "info", text: `📷 Enviaria a foto: ${ph}` });
      if (d.action) add.push({ from: "info", text: `⚡ Ação: ${d.action}` });
      if (d.appointment) add.push({ from: "info", text: `📅 Agendaria: ${d.appointment}` });
      if (d.handoff) add.push({ from: "info", text: "👤 Passaria para um vendedor" });
      add.push({ from: "info", text: `Nota ${d.score}/100${d.summary ? ` · ${d.summary}` : ""}` });
      setLines((l) => [...l, ...add]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-violet-200">
      <div className="flex items-center justify-between gap-3 bg-violet-50/70 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <MessageCircleMore size={17} className="text-violet-600" /> Testar a IA
          </p>
          <p className="text-xs text-slate-500">Converse como se fosse o cliente. Usa o que está na tela (mesmo sem salvar). Nada é enviado nem salvo.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLines([]);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={14} /> Nova conversa
        </button>
      </div>
      <div ref={scroll} className="h-[380px] space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4">
        {lines.length === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">
            <div>
              <Sparkles size={26} className="mx-auto mb-2 text-violet-400" />
              Mande uma mensagem como um cliente, por exemplo:
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {["Oi, quanto custa a scooter?", "Tem em outra cor?", "Parcela em quantas vezes?", "Achei caro"].map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={Boolean(disabled)}
                    onClick={() => send(q)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-violet-400 hover:text-violet-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {lines.map((l, i) =>
          l.from === "info" ? (
            <p key={i} className="mx-auto w-fit max-w-[90%] rounded-lg bg-amber-50 px-2.5 py-1 text-center text-[11px] font-semibold text-amber-800">
              {l.text}
            </p>
          ) : (
            <div key={i} className={`flex ${l.from === "ai" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[14px] shadow-sm ${
                  l.from === "ai" ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md bg-white text-slate-800"
                }`}
              >
                {l.text}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="flex justify-end">
            <span className="rounded-2xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white/85">digitando...</span>
          </div>
        )}
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <form
        className="flex gap-2 border-t border-slate-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={Boolean(disabled) || busy}
          placeholder={disabled || "Escreva como o cliente..."}
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-violet-400 disabled:bg-slate-50"
        />
        <button type="submit" disabled={Boolean(disabled) || busy || !text.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-white disabled:opacity-40">
          <Send size={15} />
        </button>
      </form>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1"><ImageIcon size={11} /> fotos</span>
        <span className="inline-flex items-center gap-1"><Zap size={11} /> ações</span>
        <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> agenda</span>
        <span className="inline-flex items-center gap-1"><UserRound size={11} /> vendedor</span>
        <span>aparecem como avisos amarelos — no teste nada acontece de verdade.</span>
      </div>
    </div>
  );
}
