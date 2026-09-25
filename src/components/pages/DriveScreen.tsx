"use client";

import { useMemo, useRef, useState } from "react";
import { Folder, FolderPlus, Upload, ChevronRight, Pencil, Trash2, Download, MoveRight, Search, AlertTriangle } from "lucide-react";
import { Page, PageHeader, Card, Button, Input, Modal, EmptyState, ErrorNote, Select } from "@/components/ui";
import { KIND_LABEL, fmtSize } from "@/lib/drive/common";
import { FileIcon } from "@/components/drive/FileIcon";
import { useDrive, uploadDriveFile, type DriveFile } from "@/components/drive/useDrive";

export function DriveScreen() {
  const { data, reload } = useDrive();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DriveFile | null>(null);
  const [moving, setMoving] = useState<DriveFile | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const path = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    let cur = data?.folders.find((f) => f.id === folderId);
    for (let i = 0; cur && i < 10; i++) {
      out.unshift({ id: cur.id, name: cur.name });
      cur = data?.folders.find((f) => f.id === cur!.parentId);
    }
    return out;
  }, [data, folderId]);

  const search = q.trim().toLowerCase();
  const folders = search ? [] : (data?.folders || []).filter((f) => f.parentId === folderId);
  const files = (data?.files || []).filter((f) => (search ? f.name.toLowerCase().includes(search) : f.folderId === folderId));
  const folderPath = (id: string) => {
    const names: string[] = [];
    let cur = data?.folders.find((f) => f.id === id);
    for (let i = 0; cur && i < 10; i++) {
      names.unshift(cur.name);
      cur = data?.folders.find((f) => f.id === cur!.parentId);
    }
    return names.join(" / ");
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const items = Array.from(list);
    setUploads(items.map((f) => ({ name: f.name, pct: 0 })));
    for (let i = 0; i < items.length; i++) {
      try {
        await uploadDriveFile(items[i], folderId, (pct) => setUploads((u) => u.map((x, k) => (k === i ? { ...x, pct } : x))));
      } catch (e) {
        setUploads((u) => u.map((x, k) => (k === i ? { ...x, error: (e as Error).message } : x)));
      }
    }
    await reload();
    setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 1500);
    if (input.current) input.current.value = "";
  };

  const newFolder = async () => {
    const name = prompt("Nome da pasta");
    if (!name?.trim()) return;
    const res = await fetch("/api/drive/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parentId: folderId }) });
    if (!res.ok) setError((await res.json()).error);
    reload();
  };
  const renameFolder = async (id: string, current: string) => {
    const name = prompt("Novo nome da pasta", current);
    if (!name?.trim() || name === current) return;
    await fetch(`/api/drive/folders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    reload();
  };
  const deleteFolder = async (id: string, name: string) => {
    if (!confirm(`Excluir a pasta "${name}" com todas as subpastas e arquivos dentro dela? Não dá para desfazer.`)) return;
    await fetch(`/api/drive/folders/${id}`, { method: "DELETE" });
    reload();
  };
  const renameFile = async (f: DriveFile) => {
    const name = prompt("Novo nome do arquivo", f.name);
    if (!name?.trim() || name === f.name) return;
    await fetch(`/api/drive/files/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    reload();
  };
  const deleteFile = async (f: DriveFile) => {
    if (!confirm(`Excluir "${f.name}"?`)) return;
    await fetch(`/api/drive/files/${f.id}`, { method: "DELETE" });
    reload();
  };
  const doMove = async () => {
    if (!moving) return;
    await fetch(`/api/drive/files/${moving.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: moveTo || null }) });
    setMoving(null);
    reload();
  };

  return (
    <Page>
      <PageHeader
        title="Drive"
        description="Guarde fotos, vídeos, catálogos em PDF, tabelas e áudios da empresa. Qualquer arquivo daqui pode ser enviado na conversa ou junto com um disparo."
        actions={
          data?.canEdit && (
            <>
              <Button variant="secondary" onClick={newFolder}>
                <FolderPlus size={16} /> Nova pasta
              </Button>
              <Button onClick={() => input.current?.click()} disabled={!data.storageReady}>
                <Upload size={16} /> Enviar arquivos
              </Button>
              <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
            </>
          )
        }
      />
      {data && !data.storageReady && (
        <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={18} className="shrink-0" />O armazenamento de arquivos ainda não foi ligado no servidor. Peça ao administrador para criar o bucket no Railway.
        </div>
      )}
      <ErrorNote message={error} />
      {uploads.length > 0 && (
        <Card className="mb-4 space-y-2 p-4">
          {uploads.map((u, i) => (
            <div key={i} className="text-sm">
              <div className="flex justify-between">
                <span className="truncate">{u.name}</span>
                <span className={u.error ? "text-red-600" : "text-slate-500"}>{u.error || `${u.pct}%`}</span>
              </div>
              {!u.error && (
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${u.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-[15px]">
          <button onClick={() => setFolderId(null)} className="font-semibold text-[var(--accent)] hover:underline">
            Drive
          </button>
          {path.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight size={15} className="text-slate-400" />
              <button onClick={() => setFolderId(p.id)} className="font-semibold text-[var(--accent)] hover:underline">
                {p.name}
              </button>
            </span>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todo o Drive..." className="pl-9" />
        </div>
      </div>

      {!data ? (
        <p className="text-slate-500">Carregando...</p>
      ) : (
        <>
          {folders.length > 0 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {folders.map((f) => (
                <Card key={f.id} className="group flex items-center gap-3 p-3">
                  <button onClick={() => setFolderId(f.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                      <Folder size={20} />
                    </span>
                    <span className="truncate font-medium text-slate-800">{f.name}</span>
                  </button>
                  {data.canEdit && (
                    <span className="flex opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => renameFolder(f.id, f.name)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Renomear">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteFolder(f.id, f.name)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </Card>
              ))}
            </div>
          )}
          <Card>
            {files.length === 0 ? (
              <EmptyState title={search ? "Nenhum arquivo encontrado" : "Nenhum arquivo nesta pasta"} text={data.canEdit && !search ? "Clique em Enviar arquivos." : undefined} />
            ) : (
              <div className="divide-y divide-slate-100">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => setPreview(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <FileIcon kind={f.kind} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{f.name}</span>
                        <span className="text-xs text-slate-400">
                          {KIND_LABEL[f.kind]} · {fmtSize(f.size)} · {new Date(f.createdAt).toLocaleDateString("pt-BR")}
                          {f.createdBy ? ` · ${f.createdBy}` : ""}
                          {search && f.folderId ? ` · ${folderPath(f.folderId)}` : ""}
                        </span>
                      </span>
                    </button>
                    <a href={`/api/drive/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Abrir / baixar">
                      <Download size={16} />
                    </a>
                    {data.canEdit && (
                      <>
                        <button onClick={() => { setMoving(f); setMoveTo(f.folderId || ""); }} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Mover">
                          <MoveRight size={16} />
                        </button>
                        <button onClick={() => renameFile(f)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Renomear">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => deleteFile(f)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal title={preview?.name || ""} open={preview !== null} onClose={() => setPreview(null)} wide>
        {preview && (
          <div className="flex flex-col items-center gap-3">
            {preview.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/drive/files/${preview.id}`} alt={preview.name} className="max-h-[65vh] rounded-lg" />
            )}
            {preview.kind === "video" && <video src={`/api/drive/files/${preview.id}`} controls className="max-h-[65vh] w-full rounded-lg bg-black" />}
            {preview.kind === "audio" && <audio src={`/api/drive/files/${preview.id}`} controls className="w-full" />}
            {preview.kind === "document" && <p className="text-slate-500">Pré-visualização indisponível para este tipo de arquivo.</p>}
            <a href={`/api/drive/files/${preview.id}`} target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <Download size={15} /> Abrir / baixar
              </Button>
            </a>
          </div>
        )}
      </Modal>

      <Modal
        title="Mover arquivo"
        open={moving !== null}
        onClose={() => setMoving(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoving(null)}>
              Cancelar
            </Button>
            <Button onClick={doMove}>Mover</Button>
          </>
        }
      >
        <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">Drive (raiz)</option>
          {(data?.folders || []).map((f) => (
            <option key={f.id} value={f.id}>
              {folderPath(f.id)}
            </option>
          ))}
        </Select>
      </Modal>
    </Page>
  );
}
