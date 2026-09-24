"use client";

import { ClipboardList } from "lucide-react";
import { Textarea } from "@/components/ui";
import { QUALIFY_FIELDS, QUALIFY_MODES, type QualifySettings } from "@/lib/ai/qualify";

/** O que a IA pergunta ao cliente e se pergunta antes de passar o preço */
export function QualifyCard({ q, onChange }: { q: QualifySettings; onChange: (q: QualifySettings) => void }) {
  const mode = QUALIFY_MODES.find((m) => m.key === q.mode) || QUALIFY_MODES[0];
  const toggle = (key: string) =>
    onChange({ ...q, fields: q.fields.includes(key) ? q.fields.filter((f) => f !== key) : [...q.fields, key] });

  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <ClipboardList size={17} /> Qualificação do lead
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Faz a IA esquentar o lead pedindo informações, mesmo quando o cliente chega do anúncio já perguntando o preço.
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Quando pedir os dados</p>
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {QUALIFY_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onChange({ ...q, mode: m.key })}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                q.mode === m.key ? "bg-white text-[var(--accent)] shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{mode.hint}</p>
      </div>

      {q.mode !== "OFF" && (
        <>
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-slate-800">O que perguntar</p>
            <div className="flex flex-wrap gap-2">
              {QUALIFY_FIELDS.map((f) => {
                const on = q.fields.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggle(f.key)}
                    className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                      on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-slate-800">Outras perguntas (opcional)</p>
            <Textarea
              rows={2}
              value={q.custom}
              onChange={(e) => onChange({ ...q, custom: e.target.value })}
              placeholder='Ex.: "se já tem CNH", "se tem veículo para dar na troca"'
            />
          </div>
          {q.mode === "BEFORE_PRICE" && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Exemplo: o cliente chega do anúncio com &quot;quero mais informações da FX2&quot; → a IA responde &quot;Oi! Que bom que gostou da FX2 😊 Já te passo tudo! Qual seu
              nome e de qual cidade você fala?&quot;. Se o cliente insistir sem responder, a IA passa as informações para não perder a venda.
            </p>
          )}
        </>
      )}
    </div>
  );
}
