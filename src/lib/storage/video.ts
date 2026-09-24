/**
 * Compressão de vídeo com o ffmpeg (ffmpeg-static): MP4 H.264 leve, até 90 s e 720p,
 * pronto para WhatsApp, Instagram e Messenger. Sem imports "@/".
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

export const VIDEO_MAX_UPLOAD = 200 * 1024 * 1024; // arquivo original
export const VIDEO_MAX_SECONDS = 90;
export const VIDEO_MAX_OUTPUT = 16 * 1024 * 1024; // limite seguro do WhatsApp

export function ffmpegBinary() {
  try {
    // Resolve pelo projeto (não pelo bundle do Next)
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const p = req("ffmpeg-static") as string | null;
    if (p && existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBinary(), args);
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(err.split("\n").slice(-6).join(" ").trim() || `ffmpeg saiu com ${code}`))));
  });
}

function durationOf(log: string) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** Comprime o vídeo de entrada para `output`. Devolve a duração (s) e o tamanho final. */
export async function compressVideo(input: string, output: string) {
  // Menor lado com no máximo 720 px, dimensões pares
  const scale = "scale='if(gt(iw,ih),-2,min(720,trunc(iw/2)*2))':'if(gt(iw,ih),min(720,trunc(ih/2)*2),-2)'";
  const pass = (crf: number, maxrate: string, bufsize: string, audio: string) => [
    "-y",
    "-i", input,
    "-t", String(VIDEO_MAX_SECONDS),
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", scale,
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
    "-maxrate", maxrate, "-bufsize", bufsize,
    "-pix_fmt", "yuv420p", "-profile:v", "main",
    "-c:a", "aac", "-b:a", audio, "-ac", "2",
    "-movflags", "+faststart",
    output,
  ];
  const log = await run(pass(28, "1300k", "2600k", "96k"));
  let size = (await stat(output)).size;
  if (size > VIDEO_MAX_OUTPUT) {
    await run(pass(32, "650k", "1300k", "64k"));
    size = (await stat(output)).size;
  }
  const full = durationOf(log);
  const seconds = full == null ? null : Math.round(Math.min(full, VIDEO_MAX_SECONDS));
  return { seconds, size };
}
