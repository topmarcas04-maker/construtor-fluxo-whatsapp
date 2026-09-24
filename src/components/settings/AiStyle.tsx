"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Timer, Send, RotateCcw, Sparkles, Zap, UserRound, CalendarDays, MessageCircleMore } from "lucide-react";
import { Textarea } from "@/components/ui";
import { STYLE_PRESETS, LENGTH_OPTIONS, EMOJI_OPTIONS, SPEED_OPTIONS, replyDelayMs, typingMs } from "@/lib/ai/style";

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

type Line =
  | { from: "lead" | "ai" | "info"; text: string; at: string }
  | { from: "media"; kind: "image" | "video" | "text"; url: string | null; text: string; at: string };

const hhmm = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** *negrito* do WhatsApp */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|~[^~\n]+~)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*[^*\n]+\*$/.test(p) ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : /^~[^~\n]+~$/.test(p) ? (
          <s key={i}>{p.slice(1, -1)}</s>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** Conversa de teste com a IA usando o que está na tela (mesmo sem salvar), no visual do WhatsApp */
export function AiTester({ draft, disabled }: { draft: Record<string, unknown>; disabled?: string | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [realTime, setRealTime] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skip = useRef(false);
  /** O "cliente" do teste já informou nome/cidade (libera preço e detalhes) */
  const qualified = useRef(false);
  const session = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [lines, typing]);

  /** Espera que pode ser pulada pelo botão */
  const wait = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !skip.current) await sleep(Math.min(200, end - Date.now()));
  };

  const send = async (value: string) => {
    if (!value.trim() || busy) return;
    const my = session.current;
    const sentAt = Date.now();
    const next: Line[] = [...lines, { from: "lead", text: value.trim(), at: hhmm() }];
    setLines(next);
    setText("");
    setBusy(true);
    setError(null);
    skip.current = false;
    try {
      const history = next
        .filter((l) => l.from !== "info")
        .map((l) =>
          l.from === "media"
            ? { from: "ai", text: l.kind === "video" ? `[vídeo] ${l.text.replace(/\*/g, "")}` : l.text }
            : { from: l.from, text: l.text }
        );
      setTyping(!realTime);
      const res = await fetch("/api/sdr/settings/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, draft, qualified: qualified.current }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "A IA não respondeu");
      if (my !== session.current) return;
      if (d.qualified) qualified.current = true;
      const speed = (d.speed as string) || (draft.replySpeed as string);
      const parts = d.parts as string[];
      // Mesmo ritmo do WhatsApp: espera, "digitando...", uma mensagem de cada vez
      if (realTime && parts.length) {
        setTyping(true);
        await wait(replyDelayMs(speed, Date.now() - sentAt));
      }
      for (let i = 0; i < parts.length; i++) {
        if (my !== session.current) return;
        if (i > 0 && realTime) {
          setTyping(true);
          await wait(typingMs(speed, parts[i]));
        }
        setTyping(false);
        setLines((l) => [...l, { from: "ai", text: parts[i], at: hhmm() }]);
      }
      for (const m of (d.media || []) as { kind: "image" | "video" | "text"; url: string | null; caption: string }[]) {
        if (realTime) await wait(900);
        if (my !== session.current) return;
        setLines((l) => [...l, { from: "media", kind: m.kind, url: m.url, text: m.caption, at: hhmm() }]);
      }
      if (d.handoffMessage) {
        if (realTime) {
          setTyping(true);
          await wait(1200);
          setTyping(false);
        }
        if (my !== session.current) return;
        setLines((l) => [...l, { from: "ai", text: d.handoffMessage as string, at: hhmm() }]);
      }
      const info: Line[] = [];
      const at = hhmm();
      if (d.action) info.push({ from: "info", text: `⚡ Ação: ${d.action}`, at });
      if (d.appointment) info.push({ from: "info", text: `📅 Agendaria: ${d.appointment}`, at });
      if (d.handoff) info.push({ from: "info", text: "👤 Passaria para um vendedor", at });
      info.push({ from: "info", text: `Nota ${d.score}/100${d.summary ? ` · ${d.summary}` : ""}`, at });
      setLines((l) => [...l, ...info]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (my === session.current) {
        setTyping(false);
        setBusy(false);
      }
    }
  };

  const reset = () => {
    session.current++;
    qualified.current = false;
    setLines([]);
    setError(null);
    setTyping(false);
    setBusy(false);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <MessageCircleMore size={17} /> Testar a IA
          </p>
          <p className="text-xs text-white/75">
            Converse como se fosse o cliente. Usa o que está na tela (mesmo sem salvar). Nada é enviado nem salvo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold" title="Espera e mostra 'digitando...' igual ao WhatsApp">
            <input type="checkbox" checked={realTime} onChange={(e) => setRealTime(e.target.checked)} className="accent-emerald-400" />
            Tempo real
          </label>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
          >
            <RotateCcw size={14} /> Nova conversa
          </button>
        </div>
      </div>
      <div ref={scroll} className="h-[420px] space-y-1.5 overflow-y-auto bg-[#efeae2] px-3 py-4">
        {lines.length === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">
            <div>
              <Sparkles size={26} className="mx-auto mb-2 text-emerald-600" />
              Mande uma mensagem como um cliente, por exemplo:
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {["Oi, quanto custa a scooter?", "Tem em outra cor?", "Parcela em quantas vezes?", "Achei caro"].map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={Boolean(disabled)}
                    onClick={() => send(q)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-emerald-500 hover:text-emerald-700"
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
            <p key={i} className="mx-auto w-fit max-w-[90%] rounded-lg bg-amber-50 px-2.5 py-1 text-center text-[11px] font-semibold text-amber-800 shadow-sm">
              {l.text}
            </p>
          ) : (
            <div key={i} className={`flex ${l.from === "lead" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-2 pb-1 pt-1.5 text-[14px] text-slate-800 shadow-sm ${
                  l.from === "lead" ? "rounded-tl-none bg-white" : "rounded-tr-none bg-[#d9fdd3]"
                }`}
              >
                {l.from === "media" && l.url && l.kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.url} alt="" className="mb-1 max-h-64 w-full rounded-md object-cover" />
                )}
                {l.from === "media" && l.url && l.kind === "video" && (
                  <video controls preload="metadata" src={l.url} className="mb-1 max-h-64 w-full rounded-md bg-black" />
                )}
                <p className="whitespace-pre-wrap px-1">
                  <WaText text={l.text} />
                </p>
                <p className="mt-0.5 text-right text-[10px] text-slate-400">
                  {l.at}
                  {l.from !== "lead" && <span className="ml-1 text-sky-500">✓✓</span>}
                </p>
              </div>
            </div>
          )
        )}
        {typing && (
          <div className="flex items-center justify-end gap-2">
            {realTime && (
              <button type="button" onClick={() => (skip.current = true)} className="text-[11px] font-semibold text-slate-500 underline hover:text-slate-700">
                pular espera
              </button>
            )}
            <span className="rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-xs font-semibold italic text-emerald-700 shadow-sm">digitando...</span>
          </div>
        )}
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <form
        className="flex gap-2 border-t border-slate-100 bg-[#f0f2f5] p-3"
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
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-50"
        />
        <button type="submit" disabled={Boolean(disabled) || busy || !text.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-40">
          <Send size={15} />
        </button>
      </form>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
        <span>Fotos e vídeos aparecem como o cliente recebe.</span>
        <span className="inline-flex items-center gap-1"><Zap size={11} /> ações</span>
        <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> agenda</span>
        <span className="inline-flex items-center gap-1"><UserRound size={11} /> vendedor</span>
        <span>aparecem como avisos amarelos — no teste nada acontece de verdade.</span>
      </div>
    </div>
  );
}
