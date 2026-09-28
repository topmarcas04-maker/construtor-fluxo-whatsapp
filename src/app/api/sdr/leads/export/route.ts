export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth/server";

const MAX_ROWS = 20000;

/**
 * POST /api/sdr/leads/export — monta a planilha (.xlsx) com os leads que estão na tela (já filtrados).
 * Corpo: { headers: string[], rows: (string | number | null)[][] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser("leads");
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const headers = Array.isArray(body?.headers) ? (body.headers as unknown[]).map((h) => String(h).slice(0, 60)).slice(0, 40) : [];
  const rows = Array.isArray(body?.rows) ? (body.rows as unknown[][]).slice(0, MAX_ROWS) : [];
  if (!headers.length) return NextResponse.json({ error: "Nada para exportar" }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length + 4, 14), 40) }));
  for (const r of rows) {
    ws.addRow(
      (Array.isArray(r) ? r : []).slice(0, headers.length).map((v) => (typeof v === "number" ? v : v == null ? "" : String(v).slice(0, 2000)))
    );
  }
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3B52" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const name = `leads-${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}.xlsx`;
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
