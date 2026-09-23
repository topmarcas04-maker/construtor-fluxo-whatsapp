/** Ações da IA — parte usada também no navegador (sem dependências). */

export const ACTION_KINDS = ["SCHEDULE", "CALL", "RESERVE", "HANDOFF", "INFO"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_KIND_LABEL: Record<string, string> = {
  SCHEDULE: "Agendar (agenda)",
  CALL: "Ligação",
  RESERVE: "Reserva",
  HANDOFF: "Passar para vendedor",
  INFO: "Explicar / informar",
};

export const ACTION_KIND_HINT: Record<string, string> = {
  SCHEDULE: "A IA combina dia e horário e marca na Agenda (com lembrete no WhatsApp).",
  CALL: "A IA pega o melhor horário para ligar e registra o pedido de ligação.",
  RESERVE: "A IA confirma o que o cliente quer reservar e registra a reserva.",
  HANDOFF: "A IA passa o cliente para um vendedor na hora.",
  INFO: "A IA explica como funciona (ex.: financiamento) seguindo as instruções.",
};

export interface AiAction {
  id: string;
  name: string;
  kind: string;
  instructions: string | null;
  appointmentTitle: string | null;
  appointmentMinutes: number | null;
  columnId: string | null;
  handoff: boolean;
  active: boolean;
  sort: number;
}

export const DEFAULT_ACTIONS: {
  name: string;
  kind: ActionKind;
  instructions: string;
  appointmentTitle?: string;
  appointmentMinutes?: number;
  handoff?: boolean;
  columnName?: string;
}[] = [
  {
    name: "Test-drive",
    kind: "SCHEDULE",
    appointmentTitle: "Test-drive",
    appointmentMinutes: 30,
    instructions: "Convide para um test-drive. Pergunte em qual loja prefere ir e combine dia e horário.",
  },
  {
    name: "Agendar reunião",
    kind: "SCHEDULE",
    appointmentTitle: "Reunião",
    appointmentMinutes: 30,
    instructions: "Ofereça uma reunião para apresentar o plano. Pergunte se prefere online (videochamada) ou presencial e combine dia e horário.",
  },
  {
    name: "Reservar",
    kind: "RESERVE",
    handoff: true,
    instructions: "Confirme o modelo, a cor e a cidade do cliente. Diga que um consultor vai confirmar a reserva e a forma de pagamento.",
  },
  {
    name: "Financiamento",
    kind: "INFO",
    handoff: true,
    instructions:
      "Explique que o financiamento é um empréstimo para trabalhador CLT, feito por instituição parceira: precisa estar registrado há mais de 6 meses, em empresa com mais de 2 anos de abertura, e é mediante análise e aprovação de crédito. Nunca informe taxas, parcelas ou prazos do empréstimo, nunca prometa aprovação e nunca peça CPF, salário ou documentos. Se o cliente tiver interesse, diga que um consultor vai fazer a análise com ele.",
  },
  {
    name: "Ligação",
    kind: "CALL",
    columnName: "Ligação",
    instructions: "Pergunte o melhor dia e horário para um consultor ligar e confirme o número.",
  },
  {
    name: "Passar para vendedor",
    kind: "HANDOFF",
    handoff: true,
    instructions: "Quando o cliente quiser fechar a compra, negociar ou falar com uma pessoa.",
  },
];
