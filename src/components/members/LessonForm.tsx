"use client";

import { useState } from "react";
import { Paperclip, Upload, X } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, Toggle, ErrorNote, Select } from "@/components/ui";
import { DrivePicker } from "@/components/drive/DrivePicker";
import type { Lesson } from "./types";

function uploadVideo(lessonId: string, file: File, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload/lesson-video/${lessonId}`);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let out: { error?: string } = {};
      try {
        out = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(out.error || `Erro ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("A conexão caiu durante o envio."));
    xhr.send(file);
  });
}

/** Criar/editar aula: vídeo por link ou enviado, material de apoio do Drive */
export function LessonForm({
  courseId,
  lesson,
  modules,
  defaultModuleId,
  onClose,
  onSaved,
}: {
  courseId: string;
  lesson: Lesson | "new";
  modules: { id: string; title: string }[];
  defaultModuleId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const init = lesson === "new" ? null : lesson;
  const [f, setF] = useState({
    title: init?.title || "",
    description: init?.description || "",
    moduleId: init?.moduleId || defaultModuleId || "",
    videoUrl: init?.videoUrl || "",
    durationMin: init?.durationMin ? String(init.durationMin) : "",
    premium: init?.premium || false,
    published: init?.published ?? true,
    sort: init?.sort || 0,
    driveFileIds: init?.driveFileIds || [],
  });
  const [files, setFiles] = useState<{ id: string; name: string }[]>(init?.files || []);
  const [video, setVideo] = useState<File | null>(null);
  const [removeVideo, setRemoveVideo] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(lesson === "new" ? `/api/members/courses/${courseId}/items` : `/api/members/items/${lesson.id}?type=lesson`, {
        method: lesson === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, type: "lesson", driveFileIds: files.map((x) => x.id) }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Falha ao salvar");
      const id = lesson === "new" ? out.id : lesson.id;
      if (video) {
        setPct(0);
        await uploadVideo(id, video, setPct);
      } else if (removeVideo) {
        await fetch(`/api/upload/lesson-video/${id}`, { method: "DELETE" });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setPct(null);
    }
  };

  return (
    <Modal
      title={lesson === "new" ? "Nova aula" : "Editar aula"}
      open
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {pct !== null ? `Enviando vídeo ${pct}%...` : saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <Field label="Título *">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Módulo">
            <Select value={f.moduleId} onChange={(e) => setF({ ...f, moduleId: e.target.value })}>
              <option value="">Sem módulo</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Vídeo da aula</p>
          <Field label="Link (YouTube não listado, Vimeo, Panda, Loom...)" hint="Ou envie o arquivo abaixo. Se tiver os dois, vale o arquivo enviado.">
            <Input value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} placeholder="https://..." />
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
              <Upload size={15} /> {video ? "Trocar arquivo" : "Enviar vídeo (até 1 GB)"}
              <input type="file" accept="video/*" hidden onChange={(e) => { setVideo(e.target.files?.[0] || null); setRemoveVideo(false); }} />
            </label>
            {video && <span className="text-slate-600">{video.name}</span>}
            {!video && init?.hasVideo && !removeVideo && (
              <span className="flex items-center gap-2 text-slate-600">
                Vídeo enviado
                <button onClick={() => setRemoveVideo(true)} className="text-red-500 hover:underline">
                  remover
                </button>
              </span>
            )}
          </div>
        </div>
        <Field label="Descrição / conteúdo da aula">
          <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Material de apoio (do seu Drive)</p>
          <div className="flex flex-wrap items-center gap-2">
            {files.map((x) => (
              <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
                {x.name}
                <button onClick={() => setFiles(files.filter((y) => y.id !== x.id))} className="text-slate-400 hover:text-red-500">
                  <X size={13} />
                </button>
              </span>
            ))}
            <Button variant="secondary" onClick={() => setPicker(true)}>
              <Paperclip size={15} /> Adicionar arquivo
            </Button>
          </div>
          <DrivePicker open={picker} onClose={() => setPicker(false)} onPick={(x) => !files.some((y) => y.id === x.id) && setFiles([...files, { id: x.id, name: x.name }])} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Duração (minutos)">
            <Input type="number" min={0} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} />
          </Field>
          <Field label="Ordem" hint="Menor aparece primeiro.">
            <Input type="number" value={String(f.sort)} onChange={(e) => setF({ ...f, sort: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={f.premium} onChange={(v) => setF({ ...f, premium: v })} label="Aula premium" />
          <Toggle checked={f.published} onChange={(v) => setF({ ...f, published: v })} label={f.published ? "Publicada" : "Rascunho"} />
        </div>
      </div>
    </Modal>
  );
}
