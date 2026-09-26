"use client";

import { Input, Toggle } from "@/components/ui";
import { MAX_AGENTS_LIMIT, MAX_WHATSAPP_LIMIT, type PlanBenefits } from "@/lib/plans/shared";

/** Campos de benefícios (usados no plano e na conta) */
export function BenefitsFields({
  value,
  onChange,
  ceiling,
}: {
  value: PlanBenefits;
  onChange: (v: PlanBenefits) => void;
  ceiling?: PlanBenefits | null;
}) {
  const maxWa = ceiling?.maxWhatsapp ?? MAX_WHATSAPP_LIMIT;
  const canPremium = !ceiling || ceiling.premiumAccess;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Números de WhatsApp</p>
        <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
          {Array.from({ length: maxWa }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...value, maxWhatsapp: n })}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                value.maxWhatsapp === n ? "bg-white text-[var(--accent)] shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">Quantos números a conta pode conectar ao mesmo tempo.</p>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Agentes de IA</p>
        <Input
          type="number"
          min={1}
          max={ceiling?.maxAgents ?? MAX_AGENTS_LIMIT}
          value={String(value.maxAgents ?? 1)}
          onChange={(e) =>
            onChange({ ...value, maxAgents: Math.max(1, Math.min(ceiling?.maxAgents ?? MAX_AGENTS_LIMIT, Number(e.target.value) || 1)) })
          }
          className="max-w-[120px]"
        />
        <p className="mt-1 text-xs text-slate-400">
          Quantos agentes a conta pode criar, contando o principal (até {ceiling?.maxAgents ?? MAX_AGENTS_LIMIT}).
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Calls de acompanhamento por mês</p>
        <Input
          type="number"
          min={0}
          max={30}
          value={String(value.callsPerMonth)}
          onChange={(e) => onChange({ ...value, callsPerMonth: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
          className="max-w-[120px]"
        />
        <p className="mt-1 text-xs text-slate-400">0 = sem calls. O cliente agenda nos seus horários livres.</p>
      </div>
      <div>
        <Toggle
          checked={value.supportAccess}
          onChange={(v) => onChange({ ...value, supportAccess: v })}
          label="Suporte pelo WhatsApp"
        />
        <p className="mt-1 text-xs text-slate-400">Mostra o botão de suporte no topo do painel, com o seu WhatsApp.</p>
      </div>
      <div>
        <Toggle
          checked={value.premiumAccess && canPremium}
          onChange={(v) => canPremium && onChange({ ...value, premiumAccess: v })}
          label="Área premium"
        />
        <p className="mt-1 text-xs text-slate-400">
          {canPremium ? "Libera as aulas e conteúdos marcados como premium na Área de membros." : "Sua conta não tem a área premium para repassar."}
        </p>
      </div>
    </div>
  );
}
