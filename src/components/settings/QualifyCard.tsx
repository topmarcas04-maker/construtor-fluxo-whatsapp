"use client";

import { useState } from "react";
import { ClipboardList, Plus, X, UserCheck } from "lucide-react";
import { Input, Textarea, Toggle } from "@/components/ui";
import { MAX_CUSTOM_FIELDS, QUALIFY_MODES, allQualifyFields, type QualifySettings } from "@/lib/ai/qualify";

/** O que a IA pergunta ao cliente e se pergunta antes de passar o preço */
export function QualifyCard({ q, onChange }: { q: QualifySettings; onChange: (q: QualifySettings) => void }) {
  const mode = QUALIFY_MODES.find((m) => m.key === q.mode) || QUALIFY_MODES[0];
  const fields = allQualifyFields(q);
  const toggle = (key: string) =>
    onChange(
      q.fields.includes(key)
        ? { ...q, fields: q.fields.filter((f) => f !== key), required: q.required.filter((f) => f !== key) }
        : { ...q, fields: [...q.fields, key] }
    );
  const toggleRequired = (key: string) =>
    onChange({ ...q, required: q.required.includes(key) ? q.required.filter((f) => f !== key) : [...q.required, key] });

  // Novo campo criado pela empresa
  const [newLabel, setNewLabel] = useState("");
  const [newAsk, setNewAsk] = useState("");
  const addField = () => {
    const label = newLabel.trim();
    if (!label || q.customFields.length >= MAX_CUSTOM_FIELDS) return;
    const key = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const ask = newAsk.trim() || label.toLowerCase();
    onChange({ ...q, customFields: [...q.customFields, { key, label, ask }], fields: [...q.fields, key] });
    setNewLabel("");
    setNewAsk("");
  };
  const removeField = (key: string) =>
    onChange({
      ...q,
      customFields: q.customFields.filter((f) => f.key !== key),
      fields: q.fields.filter((f) => f !== key),
      required: q.required.filter((f) => f !== key),
    });
  const selected = fields.filter((f) => q.fields.includes(f.key));

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
              {fields.map((f) => {
                const on = q.fields.includes(f.key);
                return (
                  <span
                    key={f.key}
                    className={`inline-flex items-center rounded-full border text-sm font-semibold transition ${
                      on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <button type="button" onClick={() => toggle(f.key)} className="px-3 py-1" title={`A IA pergunta ${f.ask}`}>
                      {on ? "✓ " : ""}
                      {f.label}
                    </button>
                    {f.custom && (
                      <button
                        type="button"
                        onClick={() => removeField(f.key)}
                        className="-ml-1.5 mr-1.5 rounded-full p-0.5 opacity-60 hover:bg-slate-200 hover:opacity-100"
                        title="Excluir este campo"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            {q.customFields.length < MAX_CUSTOM_FIELDS && (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-600">Criar um campo novo</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nome do campo (ex.: CNH)" maxLength={60} />
                  <Input
                    value={newAsk}
                    onChange={(e) => setNewAsk(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addField())}
                    placeholder='Como a IA pergunta (ex.: "se já tem CNH")'
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={addField}
                    disabled={!newLabel.trim()}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    <Plus size={15} /> Adicionar
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">O campo aparece na ficha do lead, preenchido pela IA, e no aviso que vai para o vendedor.</p>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <UserCheck size={16} /> Passar para o vendedor quando tiver os dados
            </p>
            <div className="mt-2">
              <Toggle
                checked={q.autoHandoff}
                onChange={(v) => onChange({ ...q, autoHandoff: v })}
                label={q.autoHandoff ? "Sim, transferir sozinho" : "Não, a IA decide quando transferir"}
              />
            </div>
            {q.autoHandoff && (
              <>
                <p className="mt-3 mb-1.5 text-xs font-semibold text-slate-600">Transferir assim que o cliente informar:</p>
                {selected.length === 0 ? (
                  <p className="text-xs text-slate-500">Marque acima o que a IA deve perguntar.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selected.map((f) => {
                      const on = q.required.includes(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => toggleRequired(f.key)}
                          className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                            on ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {on ? "✓ " : ""}
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-3 mb-1.5 text-xs font-semibold text-slate-600">Ao completar os dados:</p>
                <div className="inline-flex flex-wrap gap-1 rounded-xl bg-white p-1">
                  {(
                    [
                      ["ONLY_HANDOFF", "Só transferir, sem passar valor"],
                      ["ANSWER", "Responder e depois transferir"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onChange({ ...q, handoffReply: key })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                        q.handoffReply === key ? "bg-[var(--accent)] text-white" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {q.handoffReply === "ONLY_HANDOFF"
                    ? "A IA nunca passa preço, parcelas nem promoções: quem passa é o vendedor. Com os dados completos, o cliente recebe só a mensagem de transferência. Combine com \"Antes de informar\" para o preço nem chegar à IA."
                    : "A IA ainda responde o que o cliente pediu (pode incluir o preço) e em seguida transfere."}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {q.required.length
                    ? "Com todos esses dados, a IA para de responder e o lead vai para o próximo vendedor da fila (rodízio em Distribuição), com a mensagem de transferência."
                    : "Escolha pelo menos um dado para a transferência automática funcionar."}
                </p>
              </>
            )}
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
