"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, RotateCcw, Send, Hash, Workflow, FileText } from "lucide-react";
import {
  DEFAULT_FALLBACK,
  botStartCheck,
  fillBotText,
  matchOption,
  renderStep,
  type BotMedia,
  type BotNext,
  type StepKind,
} from "@/lib/chatbot/common";
import { KIND_META, fileUrl, kindOfStep, tagTone, waBold, type Draft, type Refs } from "./shared";

type Line =
  | { from: "lead"; text: string }
  | { from: "bot"; text: string }
  | { from: "media"; kind: Exclude<StepKind, "MENU">; media: BotMedia | null; caption: string }
  | { from: "sys"; text: string; tone?: "ok" | "warn" | "info" };

export function Simulator({ bot, refs, onActive }: { bot: Draft; refs: Refs; onActive: (stepId: string | null) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [stepId, setStepId] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [finished, setFinished] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [leadTags, setLeadTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const vars = { nome: "Maria" };

  const tagName = (id: string) => refs.tags.find((t) => t.id === id)?.name || "etiqueta";
  const colName = (id: string) => {
    for (const f of refs.funnels) {
      const c = f.columns.find((x) => x.id === id);
      if (c) return c.name;
    }
    return "coluna";
  };
  // Etiquetas que mudam o teste: as que iniciam e as que bloqueiam
  const relevantTags = useMemo(
    () => [...new Set([...(bot.trigger === "TAG" ? bot.tagIds : []), ...bot.skipTagIds])].filter((id) => refs.tags.some((t) => t.id === id)),
    [bot.trigger, bot.tagIds, bot.skipTagIds, refs.tags]
  );

  useEffect(() => {
    onActive(stepId);
  }, [stepId, onActive]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const finish = (next: Exclude<BotNext, "STEP">, out: Line[], agentId?: string | null) => {
    const agent = agentId ? refs.agents.find((a) => a.id === agentId)?.name : null;
    out.push({
      from: "sys",
      tone: "info",
      text:
        next === "HUMAN"
          ? "👤 Passado para a equipe — o chatbot para aqui"
          : next === "AI"
          ? refs.aiEnabled
            ? `✨ Passado para a IA${agent ? ` (agente ${agent})` : ""} — ela continua a conversa`
            : "✨ Passaria para a IA (a IA desta conta está desligada)"
          : "⏹ Chatbot encerrado",
    });
    setStepId(null);
    setFinished(true);
  };

  const enter = (id: string | null, out: Line[], depth = 0) => {
    const s = bot.steps.find((x) => x.id === id);
    if (!s) return finish("HUMAN", out);
    const kind = kindOfStep(s);
    if (kind === "MENU") {
      const t = renderStep(s, vars);
      if (t) out.push({ from: "bot", text: t });
    } else {
      out.push({ from: "media", kind, media: s.media || null, caption: kind === "AUDIO" ? "" : fillBotText(s.message || "", vars) });
    }
    if (kind === "MENU" && s.options.length) {
      setStepId(s.id);
      setTries(0);
      return;
    }
    if (s.next === "STEP" && s.nextStepId && depth < 15) return enter(s.nextStepId, out, depth + 1);
    finish(s.next === "STEP" ? "END" : s.next, out, s.agentId);
  };

  const reset = () => {
    setLines([]);
    setStepId(null);
    setTries(0);
    setFinished(false);
    setIsNew(true);
  };

  const send = (value: string) => {
    if (!value.trim()) return;
    const out: Line[] = [{ from: "lead", text: value }];
    const current = bot.steps.find((x) => x.id === stepId);

    if (!current) {
      // Ainda não começou (ou já terminou): confere o gatilho igual ao WhatsApp
      if (!bot.steps.length) {
        out.push({ from: "sys", tone: "warn", text: "Crie pelo menos um bloco." });
      } else if (finished && bot.trigger !== "KEYWORD") {
        out.push({ from: "sys", tone: "warn", text: `O chatbot acabou de terminar. Ele só recomeça depois de ${bot.restartHours}h sem conversa. Clique em Recomeçar para simular de novo.` });
      } else {
        const check = botStartCheck(bot, { message: value, isNew, leadTagIds: leadTags }, tagName);
        if (check.ok) {
          out.push({ from: "sys", tone: "ok", text: check.reason });
          setFinished(false);
          enter(bot.steps[0].id, out);
        } else {
          out.push({
            from: "sys",
            tone: "warn",
            text: `Não começou. ${check.reason} No WhatsApp, quem responderia é ${refs.aiEnabled ? "a IA" : "a equipe"}.`,
          });
        }
      }
      setIsNew(false);
      setLines((l) => [...l, ...out]);
      return;
    }

    const o = matchOption(current.options, value);
    if (!o) {
      const n = tries + 1;
      if (n > bot.maxTries) {
        if (bot.afterFail === "HUMAN") out.push({ from: "bot", text: "Tudo bem! Vou chamar alguém da equipe para te ajudar. 🙂" });
        finish(bot.afterFail, out);
      } else {
        setTries(n);
        out.push({ from: "bot", text: `${bot.fallbackMessage || DEFAULT_FALLBACK}\n\n${current.options.map((x) => `*${x.key}* - ${x.label}`).join("\n")}` });
      }
    } else {
      if (o.reply) out.push({ from: "bot", text: fillBotText(o.reply, vars) });
      o.addTagIds.forEach((t) => out.push({ from: "sys", text: `🏷 Etiqueta "${tagName(t)}" colocada` }));
      o.removeTagIds.forEach((t) => out.push({ from: "sys", text: `🏷 Etiqueta "${tagName(t)}" retirada` }));
      if (o.columnId) out.push({ from: "sys", text: `📋 Card movido para ${colName(o.columnId)}` });
      if (o.sellerId)
        out.push({ from: "sys", text: `👤 Vendedor: ${o.sellerId === "AUTO" ? "pelas regras de distribuição" : refs.sellers.find((x) => x.id === o.sellerId)?.name || "—"}` });
      if (o.next === "STEP" && o.stepId) enter(o.stepId, out);
      else finish(o.next === "STEP" ? "HUMAN" : o.sellerId && o.next !== "END" ? "HUMAN" : o.next, out, o.agentId);
    }
    setLines((l) => [...l, ...out]);
  };

  const current = bot.steps.find((x) => x.id === stepId);
  const hint =
    bot.trigger === "KEYWORD"
      ? `Escreva como o cliente. Ex.: "${bot.keywords[0] || "menu"}" (palavra-chave) ou "oi" para ver que não começa.`
      : bot.trigger === "TAG"
      ? "Marque abaixo se o lead tem a etiqueta e escreva como o cliente."
      : "Escreva a primeira mensagem do cliente, ex.: Oi, boa tarde!";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-900">Testar</p>
          <p className="text-xs text-slate-500">Simulação com as regras reais — nada é enviado</p>
        </div>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RotateCcw size={14} /> Recomeçar
        </button>
      </div>

      {/* Situação do lead no teste */}
      <div className="space-y-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
          Conversa nova (lead novo ou que voltou depois de {bot.restartHours}h)
        </label>
        {relevantTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            Lead tem:
            {relevantTags.map((id) => {
              const t = refs.tags.find((x) => x.id === id)!;
              const on = leadTags.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLeadTags((v) => (on ? v.filter((x) => x !== id) : [...v, id]))}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${on ? tagTone(t.color) : "border-slate-200 bg-white text-slate-400"}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div ref={scroll} className="min-h-[300px] flex-1 space-y-2 overflow-y-auto px-3 py-4" style={{ background: "#efeae2" }}>
        {lines.length === 0 && (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">
            <div>
              <Workflow size={28} className="mx-auto mb-2 text-slate-400" />
              {hint}
            </div>
          </div>
        )}
        {lines.map((l, i) => {
          if (l.from === "sys") {
            const tone =
              l.tone === "ok"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : l.tone === "warn"
                ? "bg-amber-50 text-amber-900 border-amber-200"
                : "bg-white/90 text-slate-700 border-slate-200";
            return (
              <p key={i} className={`mx-auto flex w-fit max-w-[92%] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold ${tone}`}>
                {l.tone === "ok" ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : l.tone === "warn" ? <AlertTriangle size={13} className="mt-px shrink-0" /> : null}
                <span>{l.text}</span>
              </p>
            );
          }
          if (l.from === "lead") {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[13.5px] text-slate-800 shadow-sm">{l.text}</div>
              </div>
            );
          }
          return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#d9fdd3] px-2 py-1.5 text-[13.5px] text-slate-800 shadow-sm">
                <p className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-semibold text-teal-700">
                  <Workflow size={10} /> Chatbot
                </p>
                {l.from === "bot" ? <div className="whitespace-pre-wrap px-1 pb-0.5">{waBold(l.text)}</div> : <MediaBubble line={l} />}
              </div>
            </div>
          );
        })}
      </div>

      {current && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 pt-2.5">
          {current.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => send(o.key)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Hash size={11} />
              {o.key} {o.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={current ? "Responda como o cliente..." : "Escreva como o cliente..."}
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button type="submit" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-white" aria-label="Enviar">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

function MediaBubble({ line }: { line: Extract<Line, { from: "media" }> }) {
  const M = KIND_META[line.kind];
  const m = line.media;
  if (!m) {
    return (
      <p className="flex items-center gap-1.5 px-1 pb-0.5 text-xs text-slate-500">
        <M.Icon size={13} /> [{M.label} sem arquivo — envie no bloco]
      </p>
    );
  }
  return (
    <div className="w-[230px]">
      {line.kind === "IMAGE" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(m.fileId)} alt="" className="max-h-56 w-full rounded-xl object-cover" />
      )}
      {line.kind === "VIDEO" && <video src={fileUrl(m.fileId)} controls className="max-h-56 w-full rounded-xl bg-black" />}
      {line.kind === "AUDIO" && <audio src={fileUrl(m.fileId)} controls className="h-10 w-full" />}
      {line.kind === "DOCUMENT" && (
        <a href={fileUrl(m.fileId)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-white/70 p-2 hover:bg-white">
          <FileText size={26} className="shrink-0 text-red-500" />
          <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{m.name}</span>
        </a>
      )}
      {line.caption && <p className="whitespace-pre-wrap px-1 pt-1 pb-0.5">{waBold(line.caption)}</p>}
    </div>
  );
}
