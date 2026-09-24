"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, FolderArchive, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { Modal, Button } from "@/components/ui";

interface PreviewRow {
  line: number;
  code: string | null;
  name: string;
  category: string | null;
  action: "create" | "update" | "error";
  error: string | null;
  linkPhotos: number;
}
interface Preview {
  summary: { total: number; create: number; update: number; errors: number; newCategories: string[]; linkPhotos: number };
  rows: PreviewRow[];
}
interface ZipPhoto {
  code: string;
  label: string | null;
  file: string;
  blob: () => Promise<Blob>;
}

const IMG = /\.(jpe?g|png|webp)$/i;
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Diminui a foto no navegador (lado maior até 1280 px, JPEG) */
async function toDataUrl(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let q = 0.82;
  let url = canvas.toDataURL("image/jpeg", q);
  while (url.length > 1_400_000 && q > 0.4) {
    q -= 0.12;
    url = canvas.toDataURL("image/jpeg", q);
  }
  return url;
}

/** Nome do arquivo → código + cor. Usa o maior código da planilha que casa com o começo do nome. */
function matchPhoto(fileName: string, codes: string[]) {
  const base = fileName.split("/").pop()!.replace(IMG, "");
  const n = norm(base);
  const code = codes
    .filter((c) => {
      const k = norm(c);
      return n === k || (n.startsWith(k) && /^[\s_\-.]/.test(n.slice(k.length)));
    })
    .sort((a, b) => b.length - a.length)[0];
  if (!code) return null;
  const rest = base.slice(code.length).replace(/^[\s_\-.]+/, "").trim();
  // "FX2-1", "FX2 (2)" = foto extra sem cor
  const label = !rest || /^\(?\d+\)?$/.test(rest) ? null : rest.replace(/[_]+/g, " ");
  return { code, label };
}

export function ProductImport({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [sheet, setSheet] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [zipPhotos, setZipPhotos] = useState<ZipPhoto[]>([]);
  const [zipUnmatched, setZipUnmatched] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ create: number; update: number; photos: number; photoErrors: string[] } | null>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSheet(null);
    setZip(null);
    setZipPhotos([]);
    setZipUnmatched([]);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy(null);
  };
  const close = () => {
    if (busy) return;
    if (result) onDone();
    reset();
    onClose();
  };

  const post = async (mode: "preview" | "apply") => {
    const res = await fetch(`/api/upload/products-import?mode=${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(sheet!.name) },
      body: sheet,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Erro ${res.status}`);
    return d;
  };

  const check = async () => {
    if (!sheet) return;
    setError(null);
    setBusy("Conferindo a planilha...");
    try {
      const p = (await post("preview")) as Preview;
      setPreview(p);
      if (zip) {
        setBusy("Lendo as fotos do .zip...");
        const JSZip = (await import("jszip")).default;
        const z = await JSZip.loadAsync(zip);
        const codes = p.rows.filter((r) => r.action !== "error" && r.code).map((r) => r.code!);
        const found: ZipPhoto[] = [];
        const miss: string[] = [];
        z.forEach((path, entry) => {
          if (entry.dir || !IMG.test(path) || path.includes("__MACOSX") || path.split("/").pop()!.startsWith(".")) return;
          const m = matchPhoto(path, codes);
          if (m) found.push({ ...m, file: path.split("/").pop()!, blob: () => entry.async("blob") });
          else miss.push(path.split("/").pop()!);
        });
        // Principal (sem cor) primeiro
        found.sort((a, b) => a.code.localeCompare(b.code) || (a.label ? 1 : 0) - (b.label ? 1 : 0) || a.file.localeCompare(b.file));
        setZipPhotos(found);
        setZipUnmatched(miss);
      }
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!sheet || !preview) return;
    setError(null);
    setBusy("Gravando os produtos...");
    try {
      const d = await post("apply");
      const idByCode = new Map<string, string>((d.products as { id: string; code: string | null }[]).filter((p) => p.code).map((p) => [norm(p.code!), p.id]));
      // Fotos do .zip: por produto, substitui as atuais no primeiro envio
      const byProduct = new Map<string, ZipPhoto[]>();
      for (const ph of zipPhotos) {
        const id = idByCode.get(norm(ph.code));
        if (!id) continue;
        byProduct.set(id, [...(byProduct.get(id) || []), ph]);
      }
      let done = 0;
      const total = [...byProduct.values()].reduce((n, l) => n + Math.min(l.length, 8), 0);
      for (const [productId, list] of byProduct) {
        const chosen = list.slice(0, 8);
        for (let i = 0; i < chosen.length; i += 3) {
          setBusy(`Enviando fotos ${done + 1} de ${total}...`);
          const batch = [];
          for (const ph of chosen.slice(i, i + 3)) {
            try {
              batch.push({ label: ph.label, dataUrl: await toDataUrl(await ph.blob()) });
            } catch {
              /* foto que o navegador não conseguiu ler */
            }
          }
          await fetch("/api/upload/product-photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, replace: i === 0, photos: batch }),
          });
          done += chosen.slice(i, i + 3).length;
        }
      }
      setResult({ create: d.summary.create, update: d.summary.update, photos: done + d.summary.linkPhotos - (d.photoErrors?.length || 0), photoErrors: d.photoErrors || [] });
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const photoProducts = new Set(zipPhotos.map((p) => norm(p.code))).size;

  return (
    <Modal
      wide
      open={open}
      onClose={close}
      title="Importar produtos por planilha"
      footer={
        result ? (
          <Button onClick={close}>Concluir</Button>
        ) : (
          <>
            {error && <p className="mr-auto max-w-md self-center text-sm font-semibold text-red-600">{error}</p>}
            <Button variant="secondary" onClick={close} disabled={Boolean(busy)}>
              Cancelar
            </Button>
            {preview ? (
              <Button onClick={run} disabled={Boolean(busy) || preview.summary.create + preview.summary.update === 0}>
                {busy || `Importar ${preview.summary.create + preview.summary.update} produto(s)`}
              </Button>
            ) : (
              <Button onClick={check} disabled={!sheet || Boolean(busy)}>
                {busy || "Conferir"}
              </Button>
            )}
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 py-4 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <p className="text-lg font-semibold text-slate-900">Importação concluída</p>
          <p className="text-sm text-slate-600">
            {result.create} produto(s) novo(s) · {result.update} atualizado(s) · {result.photos} foto(s)
          </p>
          {result.photoErrors.length > 0 && (
            <div className="mx-auto max-w-lg rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-800">
              <p className="mb-1 font-semibold">Algumas fotos por link não vieram:</p>
              {result.photoErrors.slice(0, 10).map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Use o modelo (ou o catálogo baixado) e mantenha os nomes das colunas. Produtos com o mesmo <b>Código</b> (ou mesmo Nome, se estiver sem código)
            são <b>atualizados</b>; os outros são criados.{" "}
            <a href="/api/products/export?modelo=1" className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline">
              <Download size={13} /> Baixar modelo
            </a>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => sheetRef.current?.click()}
              disabled={Boolean(busy)}
              className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-4 text-left transition ${sheet ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:border-[var(--accent)]"}`}
            >
              <FileSpreadsheet size={28} className={sheet ? "text-emerald-600" : "text-slate-400"} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">1. Planilha (.xlsx ou .csv)</span>
                <span className="block truncate text-xs text-slate-500">{sheet ? sheet.name : "Clique para escolher"}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => zipRef.current?.click()}
              disabled={Boolean(busy)}
              className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-4 text-left transition ${zip ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:border-[var(--accent)]"}`}
            >
              <FolderArchive size={28} className={zip ? "text-emerald-600" : "text-slate-400"} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">2. Fotos em .zip (opcional)</span>
                <span className="block truncate text-xs text-slate-500">{zip ? zip.name : "Nome das fotos: CÓDIGO.jpg ou CÓDIGO-Cor.jpg"}</span>
              </span>
            </button>
          </div>
          <input
            ref={sheetRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              setSheet(e.target.files?.[0] || null);
              setPreview(null);
              e.target.value = "";
            }}
          />
          <input
            ref={zipRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              setZip(e.target.files?.[0] || null);
              setPreview(null);
              e.target.value = "";
            }}
          />

          {busy && !preview && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> {busy}
            </p>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">{preview.summary.create} novo(s)</span>
                <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">{preview.summary.update} atualizado(s)</span>
                {preview.summary.errors > 0 && (
                  <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">{preview.summary.errors} com erro (serão ignorados)</span>
                )}
                {zip && (
                  <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">
                    {zipPhotos.length} foto(s) do .zip para {photoProducts} produto(s)
                  </span>
                )}
                {preview.summary.linkPhotos > 0 && (
                  <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">{preview.summary.linkPhotos} foto(s) por link</span>
                )}
              </div>
              {preview.summary.newCategories.length > 0 && (
                <p className="text-xs text-slate-500">Categorias novas que serão criadas: {preview.summary.newCategories.join(", ")}</p>
              )}
              {zipUnmatched.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {zipUnmatched.length} foto(s) sem código da planilha no nome (serão ignoradas): {zipUnmatched.slice(0, 8).join(", ")}
                  {zipUnmatched.length > 8 ? "..." : ""}
                </p>
              )}
              <p className="text-xs text-slate-500">Produtos que receberem fotos novas (link ou .zip) têm as fotos atuais substituídas. Os outros mantêm as fotos.</p>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Linha</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">O que acontece</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((r) => {
                      const photos = zipPhotos.filter((p) => r.code && norm(p.code) === norm(r.code)).length + r.linkPhotos;
                      return (
                        <tr key={r.line} className={r.action === "error" ? "bg-red-50/40" : ""}>
                          <td className="px-3 py-2 text-slate-400">{r.line}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.code || "—"}</td>
                          <td className="px-3 py-2">{r.name || "—"}</td>
                          <td className="px-3 py-2 text-xs">
                            {r.action === "error" ? (
                              <span className="font-semibold text-red-600">{r.error}</span>
                            ) : (
                              <>
                                <span className={`font-semibold ${r.action === "create" ? "text-emerald-700" : "text-sky-700"}`}>
                                  {r.action === "create" ? "Criar" : "Atualizar"}
                                </span>
                                {photos > 0 && <span className="text-violet-700"> · {photos} foto(s)</span>}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {busy && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" /> {busy}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
