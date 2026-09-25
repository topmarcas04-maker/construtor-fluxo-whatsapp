/** Área de membros — regras sem dependências (tela e site) */

/** Link do YouTube/Vimeo/Panda/Loom → endereço do player embutido */
export function embedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i.exec(u);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1`;
  m = /vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/i.exec(u);
  if (m) return `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ""}`;
  m = /loom\.com\/(?:share|embed)\/(\w+)/i.exec(u);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  if (/^https:\/\//i.test(u)) return u; // Panda, Bunny e outros já mandam o link do player
  return null;
}

export const COVER_MAX = 450_000;
export const LESSON_VIDEO_MAX = 1024 * 1024 * 1024; // 1 GB
