"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, Toggle, ErrorNote } from "@/components/ui";
import type { CourseCard } from "./types";

/** Criar/editar curso */
export function CourseForm({ course, onClose, onSaved }: { course: CourseCard | "new"; onClose: () => void; onSaved: () => void }) {
  const init = course === "new" ? null : course;
  const [f, setF] = useState({
    title: init?.title || "",
    description: init?.description || "",
    cover: init?.cover || "",
    premium: init?.premium || false,
    published: init?.published ?? true,
    sort: init?.sort || 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickCover = (file?: File) => {
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        // Reduz para 1280x720 no máximo (JPEG), para a capa ficar leve
        const scale = Math.min(1, 1280 / img.width, 720 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        setF((x) => ({ ...x, cover: c.toDataURL("image/jpeg", 0.82) }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(course === "new" ? "/api/members" : `/api/members/courses/${course.id}`, {
      method: course === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    setSaving(false);
    if (!res.ok) return setError((await res.json()).error || "Falha ao salvar");
    onSaved();
  };

  return (
    <Modal
      title={course === "new" ? "Novo curso" : "Editar curso"}
      open
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote message={error} />
        <Field label="Título *">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Vendendo mais com o SDR" />
        </Field>
        <Field label="Descrição">
          <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Capa (16:9)</p>
          <label className="relative flex aspect-video w-full max-w-md cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-[var(--accent)]">
            {f.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-sm">
                <ImagePlus size={24} /> Escolher imagem
              </span>
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => pickCover(e.target.files?.[0])} />
          </label>
          {f.cover && (
            <button onClick={() => setF({ ...f, cover: "" })} className="mt-1 text-xs text-red-500 hover:underline">
              Remover capa
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={f.premium} onChange={(v) => setF({ ...f, premium: v })} label="Curso premium (só para quem tem a área premium)" />
          <Toggle checked={f.published} onChange={(v) => setF({ ...f, published: v })} label={f.published ? "Publicado" : "Rascunho (só você vê)"} />
        </div>
        <Field label="Ordem" hint="Menor aparece primeiro.">
          <Input type="number" value={String(f.sort)} onChange={(e) => setF({ ...f, sort: Number(e.target.value) || 0 })} className="max-w-[120px]" />
        </Field>
      </div>
    </Modal>
  );
}
