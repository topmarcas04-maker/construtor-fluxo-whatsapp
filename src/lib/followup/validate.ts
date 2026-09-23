import { MAX_ATTEMPTS, DISQUALIFIED_DEFAULT, type FollowupSettings } from "./common";

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Valida a configuração enviada pela tela */
export function followupValues(body: Record<string, unknown>, refs: { tagIds: Set<string>; columnIds: Set<string> }):
  | { error: string }
  | { values: FollowupSettings } {
  const attempts = Array.isArray(body.attempts) ? body.attempts : [];
  if (!attempts.length) return { error: "Crie pelo menos uma tentativa" };
  if (attempts.length > MAX_ATTEMPTS) return { error: `Máximo de ${MAX_ATTEMPTS} tentativas` };
  const mode = body.mode === "TEXT" ? "TEXT" : "AI";
  const list: FollowupSettings["attempts"] = [];
  for (const [i, a] of (attempts as Record<string, unknown>[]).entries()) {
    const hours = Math.round(Number(a?.afterHours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) return { error: `Tentativa ${i + 1}: espera entre 1 e 720 horas` };
    const time = String(a.time || "").trim();
    if (!HHMM.test(time)) return { error: `Tentativa ${i + 1}: horário inválido` };
    const text = String(a.text || "").trim().slice(0, 1000);
    if (!text) return { error: `Tentativa ${i + 1}: escreva o texto (a IA usa como base e é o texto usado se ela falhar)` };
    list.push({ afterHours: hours, time: time.padStart(5, "0"), text });
  }
  const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number).filter((d) => d >= 0 && d <= 6))] : [];
  if (!days.length) return { error: "Escolha pelo menos um dia da semana" };
  const maxScore = body.maxScore === null || body.maxScore === "" || body.maxScore === undefined ? null : Math.round(Number(body.maxScore));
  const ids = (v: unknown, ok: Set<string>) => (Array.isArray(v) ? [...new Set(v.map(String).filter((x) => ok.has(x)))] : []);
  const finalHours = Math.round(Number(body.finalHours));
  return {
    values: {
      enabled: body.enabled === true,
      mode,
      aiInstructions: String(body.aiInstructions || "").trim().slice(0, 1000),
      attempts: list,
      days: days.sort(),
      includeTeam: body.includeTeam !== false,
      includeWithSeller: body.includeWithSeller === true,
      maxScore: maxScore != null && Number.isFinite(maxScore) ? Math.min(Math.max(maxScore, 0), 100) : null,
      columnIds: ids(body.columnIds, refs.columnIds),
      skipTagIds: ids(body.skipTagIds, refs.tagIds),
      finalHours: Number.isFinite(finalHours) ? Math.min(Math.max(finalHours, 0), 720) : 24,
      moveToDisqualified: body.moveToDisqualified !== false,
      disqualifiedColumnName: String(body.disqualifiedColumnName || "").trim().slice(0, 60) || DISQUALIFIED_DEFAULT,
      addTagName: String(body.addTagName ?? "").trim().slice(0, 60),
    },
  };
}
