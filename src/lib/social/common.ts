/**
 * Postagens no Instagram e Facebook — tipos, rótulos e regras (navegador, site e motor). Sem dependências.
 */

export type PostFormat = "REEL" | "FEED" | "CAROUSEL" | "STORY";
export type PostStatus = "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "PARTIAL" | "ERROR" | "CANCELED";

export interface PostMedia {
  fileId: string;
  /** image | video */
  kind: string;
  mime: string;
  name: string;
}

export interface PostResult {
  id?: string;
  permalink?: string;
  error?: string;
}

export const FORMAT_LABEL: Record<PostFormat, string> = {
  REEL: "Reels",
  FEED: "Feed (foto)",
  CAROUSEL: "Carrossel",
  STORY: "Stories",
};

export const FORMAT_HINT: Record<PostFormat, string> = {
  REEL: "1 vídeo vertical 9:16 (MP4), de 3 segundos a 15 minutos. Vai para o Reels e para o feed.",
  FEED: "1 foto. Ideal 1080×1350 (4:5) ou 1080×1080.",
  CAROUSEL: "De 2 a 10 fotos ou vídeos, na ordem em que aparecem. No Facebook, só fotos.",
  STORY: "1 foto ou vídeo vertical 9:16 (vídeo até 60 segundos). Stories não têm legenda.",
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  SCHEDULED: "Agendada",
  PUBLISHING: "Publicando…",
  PUBLISHED: "Publicada",
  PARTIAL: "Publicada em parte",
  ERROR: "Erro",
  CANCELED: "Cancelada",
};

export const STATUS_STYLE: Record<PostStatus, string> = {
  SCHEDULED: "bg-sky-50 text-sky-700 border-sky-200",
  PUBLISHING: "bg-amber-50 text-amber-700 border-amber-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-orange-50 text-orange-700 border-orange-200",
  ERROR: "bg-red-50 text-red-700 border-red-200",
  CANCELED: "bg-slate-100 text-slate-500 border-slate-200",
};

export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;

/** Confere a postagem antes de salvar. Devolve a mensagem de erro (vazio = ok). */
export function postProblem(p: { format: PostFormat; toInstagram: boolean; toFacebook: boolean; caption: string; media: PostMedia[]; hasInstagram: boolean }) {
  if (!p.toInstagram && !p.toFacebook) return "Escolha onde publicar: Instagram, Facebook ou os dois.";
  if (p.toInstagram && !p.hasInstagram) return "Esta página não tem Instagram ligado. Ligue o Instagram à página ou publique só no Facebook.";
  const n = p.media.length;
  const vids = p.media.filter((m) => m.kind === "video").length;
  const imgs = p.media.filter((m) => m.kind === "image").length;
  if (imgs + vids !== n) return "Use só fotos e vídeos.";
  if (p.format === "REEL" && (n !== 1 || vids !== 1)) return "O Reels precisa de 1 vídeo.";
  if (p.format === "FEED" && (n !== 1 || imgs !== 1)) return "O post de feed precisa de 1 foto. Para vídeo, use Reels.";
  if (p.format === "CAROUSEL") {
    if (n < 2 || n > 10) return "O carrossel precisa de 2 a 10 arquivos.";
    if (p.toFacebook && vids) return "No Facebook o carrossel aceita só fotos. Tire os vídeos ou publique só no Instagram.";
  }
  if (p.format === "STORY" && n !== 1) return "O Stories precisa de 1 foto ou 1 vídeo.";
  if (p.caption.length > CAPTION_MAX) return `A legenda passou de ${CAPTION_MAX} caracteres.`;
  if ((p.caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > HASHTAG_MAX) return `O Instagram aceita no máximo ${HASHTAG_MAX} hashtags.`;
  return "";
}
