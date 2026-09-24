"use client";

import { Clock } from "lucide-react";
import { Textarea, Toggle } from "@/components/ui";
import { WEEKDAYS, hoursText, sellerAvailability, type SellerHours } from "@/lib/ai/hours";

/** Horário dos consultores + mensagem de transferência fora do horário */
export function SellerHoursCard({
  hours,
  message,
  onChange,
}: {
  hours: SellerHours;
  message: string;
  onChange: (patch: { sellerHours?: SellerHours; afterHoursMessage?: string }) => void;
}) {
  const setDay = (i: number, patch: Partial<SellerHours["days"][number]>) =>
    onChange({ sellerHours: { ...hours, days: hours.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) } });
  const now = sellerAvailability(hours);
  // Segunda primeiro, domingo por último
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Clock size={17} /> Horário dos consultores
          </p>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            A IA atende 24 horas. Fora deste horário, quando ela passar o cliente para um consultor, avisa quando ele vai ser atendido em vez de
            dizer &quot;já vai te chamar&quot;.
          </p>
        </div>
        <Toggle
          checked={hours.enabled}
          onChange={(v) => onChange({ sellerHours: { ...hours, enabled: v } })}
          label={hours.enabled ? "Usar horário" : "Desligado"}
        />
      </div>

      {hours.enabled && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {order.map((i) => {
              const d = hours.days[i];
              return (
                <div key={i} className={`rounded-lg border px-3 py-2 ${d.open ? "border-slate-200" : "border-slate-100 bg-slate-50"}`}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={d.open} onChange={(e) => setDay(i, { open: e.target.checked })} className="accent-[var(--accent)]" />
                    {WEEKDAYS[i]}
                  </label>
                  {d.open ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-sm">
                      <input type="time" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} className="w-[112px] rounded-md border border-slate-200 px-2 py-1" />
                      <span className="text-slate-400">às</span>
                      <input type="time" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} className="w-[112px] rounded-md border border-slate-200 px-2 py-1" />
                    </div>
                  ) : (
                    <p className="mt-1.5 py-1 text-sm text-slate-400">Fechado</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Resumo: atende {hoursText(hours)}. Agora:{" "}
            {now.open ? <b className="text-emerald-600">consultores atendendo</b> : <b className="text-amber-600">fora do horário (volta {now.nextOpen})</b>}
          </p>

          <div className="mt-4">
            <p className="mb-1 text-sm font-semibold text-slate-800">Mensagem ao transferir fora do horário</p>
            <p className="mb-1.5 text-xs text-slate-500">
              Use {"{horario}"} (ex.: &quot;segunda a sexta das 8h às 18h&quot;), {"{retorno}"} (ex.: &quot;amanhã a partir das 8h&quot;) e {"{vendedor}"}.
            </p>
            <Textarea rows={2} value={message} onChange={(e) => onChange({ afterHoursMessage: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}

/** Turno de um vendedor: dias e horários (compacto) */
export function ShiftEditor({ value, onChange }: { value: SellerHours; onChange: (v: SellerHours) => void }) {
  const setDay = (i: number, patch: Partial<SellerHours["days"][number]>) =>
    onChange({ ...value, days: value.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  return (
    <div className="grid gap-1.5 md:grid-cols-2 2xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6, 0].map((i) => {
        const d = value.days[i];
        return (
          <div key={i} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${d.open ? "border-slate-200" : "border-slate-100 bg-slate-50"}`}>
            <label className="flex w-[70px] shrink-0 cursor-pointer items-center gap-1.5 font-semibold text-slate-700">
              <input type="checkbox" checked={d.open} onChange={(e) => setDay(i, { open: e.target.checked })} className="accent-[var(--accent)]" />
              {WEEKDAYS[i].slice(0, 3)}
            </label>
            {d.open ? (
              <>
                <input type="time" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} className="w-[92px] rounded border border-slate-200 px-1 py-0.5" />
                <span className="text-slate-400">às</span>
                <input type="time" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} className="w-[92px] rounded border border-slate-200 px-1 py-0.5" />
              </>
            ) : (
              <span className="text-slate-400">folga</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
