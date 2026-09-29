"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Loader2, Mic, Plus, Square, Trash2, Upload, X, ChevronDown, ChevronUp, Info, Copy } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import {
  BOT_CHANNELS,
  DEFAULT_FALLBACK,
  STEP_KIND_ACCEPT,
  TRIGGER_LABEL,
  emptyOption,
  type BotMedia,
  type BotOption,
  type BotStep,
  type BotTrigger,
  type StepKind,
} from "@/lib/chatbot/common";
import { KIND_META, TagPicker, fileUrl, fmtBytes, kindOfStep, type Draft, type Refs, type TagRef } from "./shared";

const MAX_BYTES = 100 * 1024 * 1024;

// ============================================================================
// PAINEL DO BLOCO
// ============================================================================

export function BlockPanel({
  step,
  steps,
  refs,
  onChange,
  onRemove,
  onDuplicate,
  onCreateTag,
}: {
  step: BotStep;
  steps: BotStep[];
  refs: Refs;
  onChange: (patch: Partial<BotStep>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onCreateTag: (name: string) => Promise<TagRef>;
}) {
  const kind = kindOfStep(step);
  const M = KIND_META[kind];
  const [open, setOpen] = useState<string | null>(null);
  const renumber = (opts: BotOption[]) => opts.map((o, i) => ({ ...o, key: String(i + 1) }));
  const setOption = (id: string, patch: Partial<BotOption>) => onChange({ options: step.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const idx = steps.findIndex((s) => s.id === step.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: M.color }}>
          <M.Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: M.color }}>
            Bloco · {M.label}
            {idx === 0 ? " · início" : ""}
          </p>
          <input
            value={step.name}
            onChange={(e) => onChange({ name: e.target.value })}
            maxLength={60}
            className="w-full bg-transparent text-base font-bold text-slate-900 outline-none"
            placeholder="Nome do bloco"
          />
        </div>
        <button type="button" onClick={onDuplicate} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Duplicar bloco">
          <Copy size={16} />
        </button>
        <button type="button" onClick={onRemove} disabled={steps.length <= 1} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30" title="Excluir bloco">
          <Trash2 size={16} />
        </button>
      </div>

      {kind === "MENU" ? (
        <>
          <Field label="Mensagem" hint="Use {nome} para o primeiro nome do cliente e *texto* para negrito.">
            <Textarea rows={4} value={step.message} onChange={(e) => onChange({ message: e.target.value })} placeholder="Ex.: Olá, {nome}! 👋 Como podemos ajudar?" />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Opções do menu</p>
              <span className="text-[11px] text-slate-400">{step.options.length}/10</span>
            </div>
            {step.options.length === 0 && (
              <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Sem opções: a mensagem é enviada e o fluxo segue pela bolinha <b>Depois</b>.
              </p>
            )}
            <div className="space-y-2">
              {step.options.map((o) => {
                const isOpen = open === o.id;
                const extras = (o.reply ? 1 : 0) + o.addTagIds.length + o.removeTagIds.length + (o.columnId ? 1 : 0) + (o.sellerId ? 1 : 0);
                return (
                  <div key={o.id} className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 p-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-800 text-xs font-bold text-white">{o.key}</span>
                      <input
                        value={o.label}
                        onChange={(e) => setOption(o.id, { label: e.target.value })}
                        maxLength={80}
                        placeholder="Texto da opção"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : o.id)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                          isOpen ? "bg-[var(--accent)] text-white" : extras ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                        title="Responder, etiqueta, mover card, vendedor"
                      >
                        Ações{extras ? ` (${extras})` : ""} {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange({ options: renumber(step.options.filter((x) => x.id !== o.id)) })}
                        className="rounded p-1 text-slate-400 hover:text-red-500"
                        title="Excluir opção"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-3">
                        <Field label="Responder ao escolher" hint="Opcional. Enviada antes de seguir para o próximo bloco.">
                          <Textarea rows={2} value={o.reply} onChange={(e) => setOption(o.id, { reply: e.target.value })} />
                        </Field>
                        <div>
                          <p className="mb-1.5 text-xs font-semibold text-slate-700">Colocar etiqueta</p>
                          <TagPicker tags={refs.tags} value={o.addTagIds} onChange={(v) => setOption(o.id, { addTagIds: v })} onCreate={onCreateTag} />
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-semibold text-slate-700">Tirar etiqueta</p>
                          <TagPicker tags={refs.tags} value={o.removeTagIds} onChange={(v) => setOption(o.id, { removeTagIds: v })} />
                        </div>
                        <Field label="Mover o card para">
                          <Select value={o.columnId || ""} onChange={(e) => setOption(o.id, { columnId: e.target.value || null })}>
                            <option value="">Não mover</option>
                            {refs.funnels.map((f) => (
                              <optgroup key={f.id} label={`Funil ${f.name}`}>
                                {f.columns.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Vendedor" hint="Com vendedor definido, a conversa fica com a equipe.">
                          <Select value={o.sellerId || ""} onChange={(e) => setOption(o.id, { sellerId: e.target.value || null })}>
                            <option value="">Não definir</option>
                            <option value="AUTO">Pelas regras de distribuição</option>
                            {refs.sellers.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {step.options.length < 10 && (
              <button
                type="button"
                onClick={() => onChange({ options: renumber([...step.options, emptyOption(String(step.options.length + 1))]) })}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                <Plus size={15} /> Adicionar opção
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <MediaField kind={kind} media={step.media || null} storageReady={refs.storageReady} onChange={(media) => onChange({ media })} />
          {kind !== "AUDIO" && (
            <Field label="Legenda (opcional)" hint="Aparece junto com o arquivo. Use {nome} para o nome do cliente.">
              <Textarea rows={2} value={step.message} onChange={(e) => onChange({ message: e.target.value })} placeholder={kind === "DOCUMENT" ? "Ex.: Segue nosso catálogo completo 📄" : "Ex.: Olha que linda, {nome}! 😍"} />
            </Field>
          )}
          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            Depois de enviar, o fluxo segue pela bolinha <b>Depois</b>: ligue a outro bloco (ex.: um menu) ou escolha Equipe, IA ou Encerra.
          </p>
        </>
      )}
    </div>
  );
}

// ============================================================================
// ARQUIVO DO BLOCO (enviar ou gravar)
// ============================================================================

function MediaField({
  kind,
  media,
  storageReady,
  onChange,
}: {
  kind: Exclude<StepKind, "MENU">;
  media: BotMedia | null;
  storageReady: boolean;
  onChange: (m: BotMedia | null) => void;
}) {
  const M = KIND_META[kind];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const upload = (file: Blob, name: string) => {
    if (file.size > MAX_BYTES) return setError("Arquivo muito grande (máximo 100 MB).");
    setBusy(true);
    setError(null);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload/drive?folder=chatbot&name=${encodeURIComponent(name)}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setBusy(false);
      let data: { id?: string; name?: string; mimeType?: string; size?: number; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 300 || !data.id) return setError(data.error || "Não consegui enviar o arquivo.");
      onChange({ fileId: data.id, name: data.name || name, mime: data.mimeType || file.type, size: data.size || file.size });
    };
    xhr.onerror = () => {
      setBusy(false);
      setError("Falha de conexão ao enviar. Tente de novo.");
    };
    xhr.send(file);
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    upload(f, f.name);
  };

  if (!storageReady) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
        O armazenamento de arquivos (bucket) não está configurado no servidor, então não dá para usar {M.label.toLowerCase()} agora.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-800">{kind === "AUDIO" ? "Áudio" : kind === "DOCUMENT" ? "Arquivo (PDF)" : M.label}</p>

      {media ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="bg-slate-50">
            {kind === "IMAGE" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(media.fileId)} alt="" className="max-h-56 w-full object-contain" />
            )}
            {kind === "VIDEO" && <video src={fileUrl(media.fileId)} controls className="max-h-56 w-full bg-black" />}
            {kind === "AUDIO" && (
              <div className="p-3">
                <audio src={fileUrl(media.fileId)} controls className="w-full" />
              </div>
            )}
            {kind === "DOCUMENT" && (
              <a href={fileUrl(media.fileId)} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 hover:bg-slate-100">
                <span className="grid h-12 w-10 place-items-center rounded-md bg-white text-[10px] font-black text-red-600 shadow">PDF</span>
                <span className="text-sm font-semibold text-slate-700 underline-offset-2 hover:underline">Abrir arquivo</span>
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span className="min-w-0 flex-1 truncate">
              {media.name} · {fmtBytes(media.size)}
            </span>
            <button type="button" onClick={() => input.current?.click()} className="font-semibold text-[var(--accent)] hover:underline">
              Trocar
            </button>
            <button type="button" onClick={() => onChange(null)} className="font-semibold text-slate-400 hover:text-red-500">
              Tirar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            over ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-slate-300 bg-slate-50 hover:border-slate-400"
          }`}
        >
          {busy ? <Loader2 size={24} className="animate-spin text-slate-400" /> : <Upload size={24} className="text-slate-400" />}
          <span className="text-sm font-semibold text-slate-700">{busy ? `Enviando... ${progress}%` : "Clique ou arraste o arquivo aqui"}</span>
          <span className="text-xs text-slate-400">
            {kind === "IMAGE" ? "JPG, PNG ou WEBP" : kind === "VIDEO" ? "MP4 (até 16 MB vai como vídeo; maior vai como arquivo)" : kind === "AUDIO" ? "MP3, OGG, M4A, WAV..." : "PDF (ou Word/Excel)"}
          </span>
        </button>
      )}
      {busy && media && <p className="text-xs text-slate-500">Enviando... {progress}%</p>}

      {kind === "AUDIO" && <Recorder disabled={busy} onDone={(blob, ext) => upload(blob, `audio-chatbot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`)} />}

      <input ref={input} type="file" accept={STEP_KIND_ACCEPT[kind]} className="hidden" onChange={(e) => pick(e.target.files?.[0] || undefined)} />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-slate-400">O arquivo fica guardado no Drive, na pasta &quot;Chatbot&quot;.</p>
    </div>
  );
}

/** Gravar áudio pelo navegador (microfone) */
function Recorder({ onDone, disabled }: { onDone: (blob: Blob, ext: string) => void; disabled?: boolean }) {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type: type.split(";")[0] });
        const ext = /ogg/.test(type) ? "ogg" : /mp4/.test(type) ? "m4a" : "webm";
        setPreview({ blob, url: URL.createObjectURL(blob), ext });
      };
      rec.current = r;
      r.start();
      setSecs(0);
      setPreview(null);
      setRecording(true);
    } catch {
      setError("Não consegui usar o microfone. Libere o acesso ao microfone no navegador.");
    }
  };
  const stop = () => {
    rec.current?.stop();
    setRecording(false);
  };
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <p className="mb-2 text-xs font-semibold text-violet-800">Ou grave agora pelo microfone</p>
      {recording ? (
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <span className="font-mono text-sm font-semibold text-slate-700">{mmss}</span>
          <button type="button" onClick={stop} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">
            <Square size={13} className="fill-current" /> Parar
          </button>
        </div>
      ) : preview ? (
        <div className="space-y-2">
          <audio src={preview.url} controls className="w-full" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onDone(preview.blob, preview.ext);
                setPreview(null);
              }}
              className="flex-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Usar este áudio
            </button>
            <button type="button" onClick={start} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
              Gravar de novo
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={start} disabled={disabled} className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
          <Mic size={15} /> Gravar áudio
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-[11px] text-violet-700/80">O cliente recebe como áudio gravado na hora (com a bolinha de ouvir).</p>
    </div>
  );
}

// ============================================================================
// PAINEL DO INÍCIO (gatilho e regras gerais)
// ============================================================================

export function StartPanel({ d, set, refs, onCreateTag }: { d: Draft; set: (p: Partial<Draft>) => void; refs: Refs; onCreateTag: (name: string) => Promise<TagRef> }) {
  const [kw, setKw] = useState("");
  const addKw = () => {
    const v = kw.trim();
    if (v && !d.keywords.includes(v)) set({ keywords: [...d.keywords, v] });
    setKw("");
  };
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Início do fluxo</p>
        <p className="text-base font-bold text-slate-900">Quando o chatbot começa</p>
      </div>
      <div className="grid gap-2">
        {(["START", "KEYWORD", "TAG"] as BotTrigger[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => set({ trigger: t })}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
              d.trigger === t ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/15" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <Circle size={16} className={d.trigger === t ? "fill-[var(--accent)] text-[var(--accent)]" : "text-slate-300"} />
            <span>
              <span className={`block text-sm font-semibold ${d.trigger === t ? "text-[var(--accent)]" : "text-slate-800"}`}>{TRIGGER_LABEL[t]}</span>
              <span className="text-xs text-slate-500">
                {t === "START" ? "Lead novo ou que volta depois de um tempo" : t === "KEYWORD" ? "Quando o cliente escreve uma palavra, ex.: menu" : "Quando o lead tem uma etiqueta"}
              </span>
            </span>
          </button>
        ))}
      </div>

      {d.trigger === "KEYWORD" && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Palavras-chave</p>
          <div className="flex flex-wrap gap-1.5">
            {d.keywords.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-sm font-medium text-teal-800">
                {k}
                <button type="button" onClick={() => set({ keywords: d.keywords.filter((x) => x !== k) })} className="text-teal-400 hover:text-red-500" aria-label={`Tirar ${k}`}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addKw();
                }
              }}
              placeholder="Digite e aperte Enter"
            />
            <button type="button" onClick={addKw} className="shrink-0 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200">
              Incluir
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Começa se a mensagem tiver a palavra ou frase inteira, sem diferença de acento ou maiúscula. Teste no testador ao lado.</p>
        </div>
      )}

      {d.trigger === "TAG" && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Começa quando o lead tiver a etiqueta</p>
          <TagPicker tags={refs.tags} value={d.tagIds} onChange={(v) => set({ tagIds: v })} onCreate={onCreateTag} />
          <p className="mt-1 text-xs text-slate-400">Na próxima mensagem do cliente depois de receber a etiqueta.</p>
        </div>
      )}

      <Field label="Recomeçar depois de" hint="Se o cliente voltar depois desse tempo sem conversa, o menu começa de novo.">
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={720} value={d.restartHours} onChange={(e) => set({ restartHours: Number(e.target.value) || 1 })} className="!w-24" />
          <span className="text-sm text-slate-600">horas</span>
        </div>
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Canais</p>
        <div className="flex flex-wrap gap-3">
          {BOT_CHANNELS.map((c) => (
            <label key={c.key} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={d.channels.includes(c.key)}
                onChange={(e) => set({ channels: e.target.checked ? [...d.channels, c.key] : d.channels.filter((x) => x !== c.key) })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {c.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">No Instagram/Facebook, o áudio vai como arquivo de áudio e a legenda vai logo depois.</p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Não começar se o lead tiver a etiqueta</p>
        <TagPicker tags={refs.tags} value={d.skipTagIds} onChange={(v) => set({ skipTagIds: v })} onCreate={onCreateTag} />
      </div>

      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-semibold text-slate-800">Quando o cliente responde algo que não é uma opção</p>
        <div className="mt-2 space-y-3">
          <Field label="Mensagem" hint="Depois dela o menu é mostrado de novo.">
            <Input value={d.fallbackMessage || ""} onChange={(e) => set({ fallbackMessage: e.target.value })} placeholder={DEFAULT_FALLBACK} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tentativas">
              <Select value={String(d.maxTries)} onChange={(e) => set({ maxTries: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Depois">
              <Select value={d.afterFail} onChange={(e) => set({ afterFail: e.target.value as Draft["afterFail"] })}>
                <option value="HUMAN">Equipe</option>
                <option value="AI">IA</option>
                <option value="END">Encerrar</option>
              </Select>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}
