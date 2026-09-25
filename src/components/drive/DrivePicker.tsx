"use client";

import { useMemo, useState } from "react";
import { Folder, ChevronRight, Search } from "lucide-react";
import { Modal, Input } from "@/components/ui";
import { fmtSize } from "@/lib/drive/common";
import { FileIcon } from "./FileIcon";
import { useDrive, type DriveFile } from "./useDrive";

/** Escolher um arquivo do Drive (conversa e disparos) */
export function DrivePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: DriveFile) => void }) {
  const { data } = useDrive();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  return (
    <Modal title="Enviar arquivo do Drive" open={open} onClose={onClose}>
      {!data ? (
        <p className="text-slate-500">Carregando...</p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar arquivo..." className="pl-9" />
          </div>
          {!search && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <button onClick={() => setFolderId(null)} className="font-medium text-[var(--accent)] hover:underline">
                Drive
              </button>
              {path.map((p) => (
                <span key={p.id} className="flex items-center gap-1">
                  <ChevronRight size={14} className="text-slate-400" />
                  <button onClick={() => setFolderId(p.id)} className="font-medium text-[var(--accent)] hover:underline">
                    {p.name}
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {folders.map((f) => (
              <button key={f.id} onClick={() => setFolderId(f.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                  <Folder size={18} />
                </span>
                <span className="font-medium text-slate-800">{f.name}</span>
              </button>
            ))}
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  onPick(f);
                  onClose();
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <FileIcon kind={f.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{f.name}</span>
                  <span className="text-xs text-slate-400">{fmtSize(f.size)}</span>
                </span>
              </button>
            ))}
            {!folders.length && !files.length && <p className="px-3 py-8 text-center text-sm text-slate-400">Nada aqui.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
