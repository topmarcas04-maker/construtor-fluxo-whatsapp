/** Drive — regras sem dependências (tela, site e motor) */

export const DRIVE_MAX_FILE = 100 * 1024 * 1024; // limite de documento do WhatsApp
/** Vídeo acima disso vai como documento no WhatsApp */
export const WHATSAPP_VIDEO_MAX = 16 * 1024 * 1024;

export type DriveKind = "image" | "video" | "audio" | "document";

export function kindOf(mime: string): DriveKind {
  if (/^image\/(jpe?g|png|webp|gif)/i.test(mime)) return "image";
  if (/^video\//i.test(mime)) return "video";
  if (/^audio\//i.test(mime)) return "audio";
  return "document";
}

export const KIND_LABEL: Record<DriveKind, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento" };

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function safeFileName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-120) || "arquivo"
  );
}
