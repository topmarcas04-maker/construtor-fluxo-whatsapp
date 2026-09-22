"use client";

import { FileText, Download } from "lucide-react";
import type { Message } from "@/lib/types/sdr";

/** Mostra a mídia de uma mensagem: player de áudio, foto, vídeo ou documento */
export function MessageMedia({ msg, out }: { msg: Message; out: boolean }) {
  if (!msg.mediaUrl) {
    // Mídia que não pôde ser guardada (muito grande ou falhou o download)
    return msg.messageType && msg.messageType !== "text" ? (
      <p className="italic opacity-80">{msg.body}</p>
    ) : null;
  }
  const mime = msg.mediaMimeType || "";
  const type = msg.messageType || "";

  if (type === "audio" || mime.startsWith("audio/")) {
    return <audio controls preload="metadata" src={msg.mediaUrl} className="h-10 w-64 max-w-full" />;
  }
  if (type === "image" || type === "sticker" || mime.startsWith("image/")) {
    return (
      <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={msg.mediaUrl}
          alt="Imagem"
          loading="lazy"
          className={`max-h-72 rounded-xl object-contain ${type === "sticker" ? "w-32 bg-transparent" : "w-auto"}`}
        />
      </a>
    );
  }
  if (type === "video" || mime.startsWith("video/")) {
    return <video controls preload="none" src={msg.mediaUrl} className="max-h-72 rounded-xl" />;
  }
  return (
    <a
      href={msg.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${out ? "bg-white/15" : "bg-slate-100"}`}
    >
      <FileText size={18} />
      <span className="max-w-[220px] truncate">{msg.mediaFileName || "Documento"}</span>
      <Download size={15} className="opacity-70" />
    </a>
  );
}

/** Legenda (texto) que acompanha a mídia — some quando é só o marcador "[áudio]", "[imagem]" etc. */
export function mediaCaption(msg: Message) {
  if (!msg.body) return null;
  if (/^\[(áudio|imagem|vídeo|figurinha|documento|mídia)\]/i.test(msg.body.trim())) return null;
  return msg.body;
}
