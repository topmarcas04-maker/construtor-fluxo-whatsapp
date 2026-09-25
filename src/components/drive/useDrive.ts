"use client";

import { useCallback, useEffect, useState } from "react";
import type { DriveKind } from "@/lib/drive/common";

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
}
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: DriveKind;
  folderId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function useDrive() {
  const [data, setData] = useState<{ folders: DriveFolder[]; files: DriveFile[]; storageReady: boolean; canEdit: boolean } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/drive");
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, reload: load };
}

/** Envia um arquivo ao Drive com progresso */
export function uploadDriveFile(file: File, folderId: string | null, onProgress: (pct: number) => void) {
  return new Promise<DriveFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = new URLSearchParams({ name: file.name });
    if (folderId) qs.set("folderId", folderId);
    xhr.open("POST", `/api/upload/drive?${qs}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let out: { error?: string } & Partial<DriveFile> = {};
      try {
        out = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(out as DriveFile);
      else reject(new Error(out.error || `Não foi possível enviar (erro ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("A conexão caiu durante o envio. Tente de novo."));
    xhr.send(file);
  });
}
