/**
 * Planilha de produtos (exportar / importar). Colunas em português, uma linha por produto.
 */
import ExcelJS from "exceljs";

export const SHEET_COLUMNS = [
  { key: "code", header: "Código", width: 14, note: "Identifica o produto. Se já existir, a linha ATUALIZA o produto (não duplica)." },
  { key: "name", header: "Nome", width: 34, note: "Obrigatório." },
  { key: "category", header: "Categoria", width: 18, note: "Se não existir, é criada." },
  { key: "kind", header: "Tipo", width: 12, note: "Produto, Plano ou Serviço (vazio = Produto)." },
  { key: "price", header: "Preço", width: 12, note: "Preço à vista. Ex.: 10990 ou 10.990,00. Vazio = sob consulta." },
  { key: "promoPrice", header: "Preço promocional", width: 16, note: "Opcional." },
  { key: "n1", header: "Parcelas 1", width: 11, note: "Quantidade de parcelas. Ex.: 12" },
  { key: "t1", header: "Total a prazo 1", width: 15, note: "Total no cartão. Vazio = sem juros (mesmo valor à vista)." },
  { key: "n2", header: "Parcelas 2", width: 11, note: "" },
  { key: "t2", header: "Total a prazo 2", width: 15, note: "" },
  { key: "n3", header: "Parcelas 3", width: 11, note: "" },
  { key: "t3", header: "Total a prazo 3", width: 15, note: "" },
  { key: "availability", header: "Entrega", width: 12, note: "Pronta ou Reserva (vazio = Pronta)." },
  { key: "leadTimeDays", header: "Prazo (dias)", width: 12, note: "Só para Reserva." },
  { key: "description", header: "Descrição", width: 50, note: "Detalhes que a IA usa para responder." },
  { key: "photos", header: "Fotos (links)", width: 40, note: "Opcional. Links de fotos separados por ; — para a foto de uma cor use Cor=link (ex.: Azul=https://...). Vazio = mantém as fotos atuais." },
  { key: "active", header: "Ativo", width: 8, note: "Sim ou Não (vazio = Sim)." },
  { key: "billing", header: "Cobrança (plano)", width: 15, note: "Planos: Mensal ou Anual." },
  { key: "setupFee", header: "Adesão (plano)", width: 14, note: "" },
  { key: "commitmentMonths", header: "Fidelidade meses (plano)", width: 20, note: "" },
  { key: "trialDays", header: "Teste grátis dias (plano)", width: 20, note: "" },
  { key: "durationMinutes", header: "Duração min (serviço)", width: 18, note: "" },
] as const;

type ColKey = (typeof SHEET_COLUMNS)[number]["key"];
export type SheetRow = Partial<Record<ColKey, string>> & { line: number };

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Texto de uma célula (número, data, fórmula, link...) */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  // Número: vírgula decimal (o validador trata "." como milhar)
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.hyperlink && typeof o.text !== "object") return String(o.hyperlink).trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return cellText(o.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}

/** Lê a planilha (.xlsx ou .csv) e devolve as linhas pelas colunas conhecidas */
export async function readProductSheet(buf: Buffer, isCsv: boolean): Promise<{ rows: SheetRow[] } | { error: string }> {
  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet | undefined;
  try {
    if (isCsv) {
      const { Readable } = await import("node:stream");
      // CSV do Excel brasileiro costuma usar ";" e vir com BOM
      const text = buf.toString("utf8").replace(/^﻿/, "");
      const first = text.split(/\r?\n/)[0] || "";
      const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
      ws = await wb.csv.read(Readable.from([text]), { parserOptions: { delimiter } });
    } else {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      ws = wb.worksheets.find((w) => w.name.toLowerCase().startsWith("produto")) || wb.worksheets[0];
    }
  } catch {
    return { error: "Não consegui abrir a planilha. Salve como .xlsx (Excel) ou .csv e tente de novo." };
  }
  if (!ws) return { error: "A planilha está vazia." };

  // Linha de cabeçalho: a primeira que tiver "Nome"
  let headerRow = 0;
  const map = new Map<number, ColKey>();
  for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
    const row = ws.getRow(r);
    const found = new Map<number, ColKey>();
    row.eachCell((cell, col) => {
      const h = norm(cellText(cell.value));
      const c = SHEET_COLUMNS.find((x) => norm(x.header) === h || (x.key === "code" && ["codigo", "cod", "sku", "referencia"].includes(h)));
      if (c) found.set(col, c.key);
    });
    if ([...found.values()].includes("name")) {
      headerRow = r;
      found.forEach((v, k) => map.set(k, v));
    }
  }
  if (!headerRow) return { error: 'Não achei o cabeçalho. A primeira linha precisa ter as colunas do modelo (pelo menos "Nome").' };

  const rows: SheetRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const out: SheetRow = { line: r };
    let any = false;
    map.forEach((key, col) => {
      const t = cellText(row.getCell(col).value);
      if (t) {
        out[key] = t;
        any = true;
      }
    });
    if (any) rows.push(out);
    if (rows.length > 2000) return { error: "Máximo de 2000 produtos por planilha." };
  }
  return { rows };
}

const yes = (v?: string) => !v || !/^(n|nao|não|no|false|0|inativo)$/i.test(v.trim());

/** Converte a linha da planilha no formato do cadastro (mesmo validador da tela) */
export function rowToBody(row: SheetRow) {
  const kindTxt = norm(row.kind || "");
  const kind = kindTxt.startsWith("plan") ? "PLAN" : kindTxt.startsWith("serv") ? "SERVICE" : "PHYSICAL";
  const installments = ([["n1", "t1"], ["n2", "t2"], ["n3", "t3"]] as const)
    .map(([n, t]) => ({ n: (row[n] || "").replace(/\D/g, ""), total: row[t] || null }))
    .filter((i) => i.n);
  const reserve = norm(row.availability || "").startsWith("res") || norm(row.availability || "").startsWith("ped");
  return {
    name: row.name || "",
    code: row.code || null,
    kind,
    price: row.price ?? null,
    promoPrice: row.promoPrice ?? null,
    description: row.description ?? null,
    active: yes(row.active),
    availability: reserve ? "ORDER" : "READY",
    leadTimeDays: reserve && row.leadTimeDays ? row.leadTimeDays.replace(/\D/g, "") : null,
    installments: kind === "PHYSICAL" ? installments : [],
    billingPeriod: norm(row.billing || "").startsWith("anu") ? "YEAR" : "MONTH",
    setupFee: kind === "PLAN" ? row.setupFee ?? null : null,
    commitmentMonths: kind === "PLAN" && row.commitmentMonths ? row.commitmentMonths.replace(/\D/g, "") : null,
    trialDays: kind === "PLAN" && row.trialDays ? row.trialDays.replace(/\D/g, "") : null,
    durationMinutes: kind === "SERVICE" && row.durationMinutes ? row.durationMinutes.replace(/\D/g, "") : null,
  };
}

/** "Azul=https://a.jpg; https://b.jpg" → [{ label: "Azul", url }, { label: null, url }] */
export function parsePhotoLinks(v?: string) {
  return (v || "")
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^([^=]{1,60})=\s*(https?:\/\/\S+)$/.exec(p);
      return m ? { label: m[1].trim(), url: m[2] } : { label: null, url: p };
    })
    .filter((p) => /^https?:\/\//i.test(p.url))
    .slice(0, 8);
}

/** Planilha com o catálogo atual (ou só o cabeçalho, como modelo) */
export async function buildProductSheet(
  items: {
    code: string | null;
    name: string;
    category: string | null;
    kind: string;
    price: number | null;
    promoPrice: number | null;
    installments: { n: number; total: number | null }[];
    availability: string;
    leadTimeDays: number | null;
    description: string | null;
    active: boolean;
    billingPeriod: string;
    setupFee: number | null;
    commitmentMonths: number | null;
    trialDays: number | null;
    durationMinutes: number | null;
  }[]
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RossIA";
  const ws = wb.addWorksheet("Produtos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = SHEET_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5B6E" } };
  head.height = 22;
  SHEET_COLUMNS.forEach((c, i) => {
    if (c.note) head.getCell(i + 1).note = c.note;
  });
  const KIND = { PHYSICAL: "Produto", PLAN: "Plano", SERVICE: "Serviço" } as Record<string, string>;
  for (const p of items) {
    const inst = p.installments || [];
    ws.addRow({
      code: p.code || "",
      name: p.name,
      category: p.category || "",
      kind: KIND[p.kind] || "Produto",
      price: p.price ?? "",
      promoPrice: p.promoPrice ?? "",
      n1: inst[0]?.n ?? "",
      t1: inst[0]?.total ?? "",
      n2: inst[1]?.n ?? "",
      t2: inst[1]?.total ?? "",
      n3: inst[2]?.n ?? "",
      t3: inst[2]?.total ?? "",
      availability: p.availability === "ORDER" ? "Reserva" : "Pronta",
      leadTimeDays: p.availability === "ORDER" ? p.leadTimeDays ?? "" : "",
      description: p.description || "",
      photos: "",
      active: p.active ? "Sim" : "Não",
      billing: p.kind === "PLAN" ? (p.billingPeriod === "YEAR" ? "Anual" : "Mensal") : "",
      setupFee: p.kind === "PLAN" ? p.setupFee ?? "" : "",
      commitmentMonths: p.kind === "PLAN" ? p.commitmentMonths ?? "" : "",
      trialDays: p.kind === "PLAN" ? p.trialDays ?? "" : "",
      durationMinutes: p.kind === "SERVICE" ? p.durationMinutes ?? "" : "",
    });
  }
  for (const k of ["price", "promoPrice", "t1", "t2", "t3", "setupFee"]) ws.getColumn(k).numFmt = "#,##0.00";
  ws.getColumn("description").alignment = { wrapText: true, vertical: "top" };

  // Aba de instruções
  const help = wb.addWorksheet("Como preencher");
  help.columns = [
    { header: "Coluna", key: "c", width: 26 },
    { header: "Como preencher", key: "h", width: 100 },
  ];
  help.getRow(1).font = { bold: true };
  help.addRow({ c: "Uma linha por produto", h: "Não mude os nomes das colunas. Linhas vazias são ignoradas." });
  help.addRow({ c: "Atualizar em massa", h: "Baixe o catálogo, altere (ex.: preços) e suba de novo: produtos com o mesmo Código (ou mesmo Nome, se sem código) são atualizados." });
  help.addRow({ c: "Fotos (.zip)", h: "Junte as fotos num .zip com o nome começando pelo Código: FX2.jpg (principal), FX2-Azul.jpg, FX2-Preta.jpg (cores)." });
  for (const c of SHEET_COLUMNS) if (c.note) help.addRow({ c: c.header, h: c.note });
  help.addRow({});
  help.addRow({ c: "Exemplo", h: "FX2 | Scooter Elétrica FX2 | Scooters | Produto | 10990 | 9490 | 12 | 11990 | 18 | 12791,12 | | | Pronta | | Motor 1000W... | | Sim" });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
