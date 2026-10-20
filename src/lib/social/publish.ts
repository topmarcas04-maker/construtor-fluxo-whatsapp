/**
 * Publica no Instagram (Graph API) e na página do Facebook. Usado pelo motor. Sem imports "@/".
 *
 * Instagram: cria o "container" com o link público do arquivo, espera o processamento (vídeo) e publica.
 * Facebook: foto, várias fotos (post com álbum), Reels (envio em 3 fases) e Stories.
 * Os links dos arquivos são temporários (do bucket) e são gerados pelo motor (mediaUrl).
 */
import { graph, GraphError, GRAPH_VERSION } from "../meta/graph";
import type { PostFormat, PostMedia, PostResult } from "./common";

export interface PublishDeps {
  /** Link público temporário do arquivo. jpeg = converter foto para JPEG (o Instagram só aceita JPEG) */
  mediaUrl: (m: PostMedia, opts: { jpeg: boolean }) => Promise<string>;
  log?: (msg: string) => void;
}

export interface PublishInput {
  format: PostFormat;
  caption: string;
  media: PostMedia[];
  pageId: string;
  pageToken: string;
  igUserId: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mensagem em português para os erros mais comuns da publicação */
export function publishError(e: unknown): string {
  const g = e as GraphError;
  const msg = (g?.message || String(e)).slice(0, 400);
  if (g?.code === 10 || g?.code === 200 || g?.code === 3 || /permission|permiss/i.test(msg)) {
    return "Falta a permissão de publicar. Em Postagens, clique em \"Liberar postagens\" e conecte a página de novo.";
  }
  if (g?.code === 190) return "A conexão com o Facebook expirou. Conecte a página de novo em Instagram e Facebook.";
  if (g?.code === 9 || /limit/i.test(msg)) return "A Meta limitou as publicações desta conta por agora. Tente mais tarde.";
  if (g?.code === 36003 || /aspect ratio/i.test(msg)) return "Proporção da imagem não aceita pelo Instagram (use entre 4:5 e 1.91:1; Stories e Reels 9:16).";
  if (g?.code === 9004 || /download|fetch|retrieve/i.test(msg)) return "A Meta não conseguiu baixar o arquivo. Confira se o bucket está configurado e tente de novo.";
  return msg;
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

/** Espera o vídeo ficar pronto no Instagram (até ~8 minutos) */
async function igWait(containerId: string, token: string) {
  for (let i = 0; i < 96; i++) {
    const s = await graph<{ status_code?: string; status?: string }>("GET", containerId, { access_token: token, fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`O Instagram recusou o vídeo${s.status ? ` (${s.status})` : ""}. Use MP4 (H.264/AAC), vertical 9:16, até 15 minutos.`);
    }
    await sleep(5000);
  }
  throw new Error("O Instagram demorou demais para processar o vídeo. Tente de novo.");
}

async function igContainer(ig: string, token: string, params: Record<string, string>, video: boolean) {
  const c = await graph<{ id: string }>("POST", `${ig}/media`, { access_token: token, ...params });
  if (video) await igWait(c.id, token);
  return c.id;
}

export async function publishInstagram(p: PublishInput, deps: PublishDeps): Promise<PostResult> {
  const ig = p.igUserId;
  if (!ig) throw new Error("Esta página não tem Instagram ligado.");
  const token = p.pageToken;
  const caption = p.caption.trim();
  let creationId: string;

  if (p.format === "REEL") {
    const url = await deps.mediaUrl(p.media[0], { jpeg: false });
    creationId = await igContainer(ig, token, { media_type: "REELS", video_url: url, share_to_feed: "true", ...(caption ? { caption } : {}) }, true);
  } else if (p.format === "FEED") {
    const url = await deps.mediaUrl(p.media[0], { jpeg: true });
    creationId = await igContainer(ig, token, { image_url: url, ...(caption ? { caption } : {}) }, false);
  } else if (p.format === "STORY") {
    const m = p.media[0];
    const video = m.kind === "video";
    const url = await deps.mediaUrl(m, { jpeg: !video });
    creationId = await igContainer(ig, token, video ? { media_type: "STORIES", video_url: url } : { media_type: "STORIES", image_url: url }, video);
  } else {
    const children: string[] = [];
    for (const m of p.media) {
      const video = m.kind === "video";
      const url = await deps.mediaUrl(m, { jpeg: !video });
      children.push(
        await igContainer(ig, token, video ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" } : { image_url: url, is_carousel_item: "true" }, video)
      );
    }
    creationId = await igContainer(ig, token, { media_type: "CAROUSEL", children: children.join(","), ...(caption ? { caption } : {}) }, false);
    // O carrossel com vídeo também precisa terminar de processar
    if (p.media.some((m) => m.kind === "video")) await igWait(creationId, token);
  }

  const pub = await graph<{ id: string }>("POST", `${ig}/media_publish`, { access_token: token, creation_id: creationId });
  let permalink: string | undefined;
  try {
    permalink = (await graph<{ permalink?: string }>("GET", pub.id, { access_token: token, fields: "permalink" })).permalink;
  } catch {}
  return { id: pub.id, permalink };
}

// ---------------------------------------------------------------------------
// Facebook (página)
// ---------------------------------------------------------------------------

/** Envia um vídeo pelo link (fases start → upload → finish) para Reels ou Stories da página */
async function fbVideoFlow(kind: "video_reels" | "video_stories", page: string, token: string, fileUrl: string, finish: Record<string, string>) {
  const start = await graph<{ video_id: string; upload_url?: string }>("POST", `${page}/${kind}`, { access_token: token, upload_phase: "start" });
  const uploadUrl = start.upload_url || `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${start.video_id}`;
  const up = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: fileUrl }, signal: AbortSignal.timeout(120_000) });
  const upBody = (await up.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } };
  if (!up.ok || upBody.success === false) throw new Error(`O Facebook não aceitou o vídeo${upBody.debug_info?.message ? `: ${upBody.debug_info.message}` : ""}.`);
  const done = await graph<{ success?: boolean; post_id?: string }>("POST", `${page}/${kind}`, {
    access_token: token,
    upload_phase: "finish",
    video_id: start.video_id,
    ...finish,
  });
  return { id: done.post_id || start.video_id };
}

export async function publishFacebook(p: PublishInput, deps: PublishDeps): Promise<PostResult> {
  const page = p.pageId;
  const token = p.pageToken;
  const caption = p.caption.trim();

  if (p.format === "FEED") {
    const url = await deps.mediaUrl(p.media[0], { jpeg: false });
    const r = await graph<{ id: string; post_id?: string }>("POST", `${page}/photos`, { access_token: token, url, ...(caption ? { caption } : {}), published: "true" });
    const id = r.post_id || r.id;
    return { id, permalink: `https://www.facebook.com/${id}` };
  }
  if (p.format === "CAROUSEL") {
    const ids: string[] = [];
    for (const m of p.media) {
      if (m.kind !== "image") throw new Error("No Facebook o carrossel aceita só fotos.");
      const url = await deps.mediaUrl(m, { jpeg: false });
      ids.push((await graph<{ id: string }>("POST", `${page}/photos`, { access_token: token, url, published: "false" })).id);
    }
    const params: Record<string, string> = { access_token: token, ...(caption ? { message: caption } : {}) };
    ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const r = await graph<{ id: string }>("POST", `${page}/feed`, params);
    return { id: r.id, permalink: `https://www.facebook.com/${r.id}` };
  }
  if (p.format === "REEL") {
    const url = await deps.mediaUrl(p.media[0], { jpeg: false });
    const r = await fbVideoFlow("video_reels", page, token, url, { video_state: "PUBLISHED", ...(caption ? { description: caption } : {}) });
    return { id: r.id, permalink: `https://www.facebook.com/reel/${r.id}` };
  }
  // STORY
  const m = p.media[0];
  if (m.kind === "video") {
    const url = await deps.mediaUrl(m, { jpeg: false });
    const r = await fbVideoFlow("video_stories", page, token, url, {});
    return { id: r.id };
  }
  const url = await deps.mediaUrl(m, { jpeg: false });
  const photo = await graph<{ id: string }>("POST", `${page}/photos`, { access_token: token, url, published: "false" });
  const r = await graph<{ post_id?: string; success?: boolean }>("POST", `${page}/photo_stories`, { access_token: token, photo_id: photo.id });
  return { id: r.post_id || photo.id };
}
