/**
 * Backup do banco (sem precisar do plano Pro do Railway).
 * Salva todas as tabelas em arquivos .jsonl na pasta "backups/<data>" deste projeto.
 *
 * Como usar (no terminal, dentro da pasta do projeto):
 *   node scripts/backup-db.mjs "COLE_AQUI_O_DATABASE_PUBLIC_URL"
 *
 * O DATABASE_PUBLIC_URL fica no Railway → Postgres → Variables.
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Use: node scripts/backup-db.mjs "postgresql://..."  (Railway → Postgres → Variables → DATABASE_PUBLIC_URL)');
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dir = path.join(process.cwd(), "backups", stamp);
fs.mkdirSync(dir, { recursive: true });

const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await client.connect();
const { rows: tables } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
);
console.log(`Fazendo backup de ${tables.length} tabelas em ${dir}`);
let total = 0;
for (const { table_name: t } of tables) {
  const out = fs.createWriteStream(path.join(dir, `${t}.jsonl`));
  let n = 0;
  const batch = 500;
  for (let offset = 0; ; offset += batch) {
    const { rows } = await client.query(`SELECT * FROM "${t}" ORDER BY ctid LIMIT ${batch} OFFSET ${offset}`);
    for (const r of rows) out.write(JSON.stringify(r) + "\n");
    n += rows.length;
    if (rows.length < batch) break;
  }
  await new Promise((r) => out.end(r));
  total += n;
  console.log(`  ${t}: ${n} linhas`);
}
// Estrutura das tabelas (para conferência)
const { rows: cols } = await client.query(
  "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position"
);
fs.writeFileSync(path.join(dir, "_estrutura.json"), JSON.stringify(cols, null, 1));
await client.end();
console.log(`\nPronto! ${total} linhas salvas em ${dir}`);
