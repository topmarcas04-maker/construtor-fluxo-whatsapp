"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, Send, Trash2, Loader2, X, Package, Search, Film } from "lucide-react";
import type { QuickReply } from "@/lib/types/sdr";

export type OutgoingPayload =
  | { text: string }
  | { media: { kind: "image" | "audio"; dataUrl: string; fileName?: string }; caption?: string }
  | { productId: string; imageId?: string; video?: boolean };

interface PickerProduct {
  id: string;
  name: string;
  price: number | null;
  promoPrice: number | null;
  active: boolean;
  videoKey?: string | null;
  images: { id: string; url: string; label?: string | null; active?: boolean }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Reduz a foto (até 1600px, JPEG) para enviar rápido e não pesar */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function Composer({
  quickReplies,
  onSend,
  disabled,
}: {
  quickReplies: QuickReply[];
  onSend: (payload: OutgoingPayload) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<PickerProduct[] | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");

  const openPicker = async () => {
    setPickerOpen((o) => !o);
    if (catalog === null) {
      const r = await fetch("/api/products", { cache: "no-store" });
      const data = r.ok ? await r.json() : { products: [] };
      setCatalog((data.products || []).filter((p: PickerProduct) => p.active));
    }
  };

  const sendProduct = async (p: PickerProduct, imageId?: string) => {
    setPickerOpen(false);
    await send(imageId ? { productId: p.id, imageId } : { productId: p.id });
  };
  const sendVideo = async (p: PickerProduct) => {
    setPickerOpen(false);
    await send({ productId: p.id, video: true });
  };

  const shownCatalog = (catalog || []).filter((p) =>
    p.name.toLowerCase().includes(catalogQuery.trim().toLowerCase())
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const slashQuery = draft.startsWith("/") ? draft.slice(1).toLowerCase() : null;
  const suggestions =
    slashQuery !== null ? quickReplies.filter((q) => q.shortcut.toLowerCase().startsWith(slashQuery)).slice(0, 6) : [];

  const send = async (payload: OutgoingPayload) => {
    setSending(true);
    const ok = await onSend(payload);
    setSending(false);
    return ok;
  };

  const sendTextOrImage = async () => {
    if (sending) return;
    if (image) {
      const ok = await send({ media: { kind: "image", dataUrl: image, fileName: "foto.jpg" }, caption: draft.trim() || undefined });
      if (ok) {
        setImage(null);
        setDraft("");
      }
      return;
    }
    if (!draft.trim()) return;
    const text = draft;
    setDraft("");
    const ok = await send({ text });
    if (!ok) setDraft(text);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setImage(await compressImage(file));
  };

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      );
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        if (cancelRef.current || chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        await send({ media: { kind: "audio", dataUrl: await blobToDataUrl(blob) } });
      };
      recorderRef.current = rec;
      rec.start(250);
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= 300) recorderRef.current?.stop(); // máx. 5 minutos
          return s + 1;
        });
      }, 1000);
    } catch {
      setMicError("Não consegui acessar o microfone. Libere o microfone no navegador (ícone de cadeado na barra de endereço).");
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelRef.current = cancel;
    recorderRef.current?.stop();
  };

  return (
    <div className="relative">
      {suggestions.length > 0 && !image && (
        <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((q) => (
            <button key={q.id} onClick={() => setDraft(q.message)} className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50">
              <b className="text-[var(--accent)]">/{q.shortcut}</b> <span className="text-slate-600">{q.message.slice(0, 80)}</span>
            </button>
          ))}
        </div>
      )}
      {pickerOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              autoFocus
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Buscar produto..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <button onClick={() => setPickerOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Fechar">
              <X size={15} />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {catalog === null ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" /> Carregando produtos...
              </p>
            ) : shownCatalog.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                {catalog.length === 0 ? "Nenhum produto cadastrado. Cadastre no menu Produtos." : "Nenhum produto encontrado."}
              </p>
            ) : (
              shownCatalog.map((p) => (
                <div key={p.id} className="border-b border-slate-50 last:border-0">
                <button
                  onClick={() => sendProduct(p)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  title="Enviar foto, preço e descrição para o cliente"
                >
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0].url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <Package size={18} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                    <span className="block text-xs text-slate-500">
                      {p.promoPrice != null ? brl(p.promoPrice) : p.price != null ? brl(p.price) : "Sob consulta"}
                    </span>
                  </span>
                </button>
                {(p.videoKey || p.images.some((im) => im.label && im.active !== false)) && (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2 pl-[68px]">
                    {p.videoKey && (
                      <button
                        onClick={() => sendVideo(p)}
                        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 hover:border-violet-400"
                        title="Enviar o vídeo do produto"
                      >
                        <Film size={11} /> Enviar vídeo
                      </button>
                    )}
                    {p.images
                      .filter((im) => im.label && im.active !== false)
                      .map((im) => (
                        <button
                          key={im.id}
                          onClick={() => sendProduct(p, im.id)}
                          className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          title={`Enviar a foto ${im.label}`}
                        >
                          {im.label}
                        </button>
                      ))}
                  </div>
                )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {micError && <p className="mb-2 text-sm text-red-600">{micError}</p>}
      {image && (
        <div className="mb-2 inline-flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Foto a enviar" className="max-h-32 rounded-lg" />
          <button onClick={() => setImage(null)} className="rounded-full p-1 text-slate-500 hover:bg-slate-200" title="Remover foto">
            <X size={16} />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3">
          <button onClick={() => stopRecording(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" title="Cancelar">
            <Trash2 size={18} />
          </button>
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-[15px] text-red-700">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Gravando áudio... {fmt(seconds)}
          </div>
          <button onClick={() => stopRecording(false)} className="btn-primary flex h-11 w-11 items-center justify-center rounded-full" title="Parar e enviar">
            <Send size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            title="Enviar foto"
          >
            <ImagePlus size={20} />
          </button>
          <button
            onClick={openPicker}
            disabled={disabled || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            title="Enviar produto do catálogo"
          >
            <Package size={20} />
          </button>
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                pickImage(f);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendTextOrImage();
              }
            }}
            placeholder={image ? "Legenda (opcional)" : "Mensagem  (digite / para respostas rápidas)"}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[15px] outline-none focus:border-[var(--accent)] focus:bg-white"
          />
          {draft.trim() || image ? (
            <button onClick={sendTextOrImage} disabled={disabled || sending} className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full" aria-label="Enviar">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={disabled || sending}
              className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              title="Gravar áudio"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

