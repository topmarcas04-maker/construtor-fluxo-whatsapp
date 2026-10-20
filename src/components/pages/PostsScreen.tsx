"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Image as ImageIcon,
  Images,
  CircleDashed,
  Plus,
  Upload,
  FolderOpen,
  X,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Trash2,
  Ban,
  Info,
  Loader2,
} from "lucide-react";
import { Page, PageHeader, Card, Button, Field, Select, Textarea, Input, Modal, ErrorNote } from "@/components/ui";
import {
  CAPTION_MAX,
  FORMAT_HINT,
  FORMAT_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  postProblem,
  type PostFormat,
  type PostMedia,
  type PostResult,
  type PostStatus,
} from "@/lib/social/common";

interface Post {
  id: string;
  connectionId: string | null;
  format: PostFormat;
  toInstagram: boolean;
  toFacebook: boolean;
  caption: string;
  media: PostMedia[];
  scheduledAt: string;
  status: PostStatus;
  results: Record<string, PostResult>;
  createdBy: string | null;
  publishedAt: string | null;
}
interface Conn {
  id: string;
  pageName: string | null;
  igUsername: string | null;
  hasInstagram: boolean;
}
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  kind: string;
  size: number;
  createdAt: string;
}

const FORMAT_ICON = { REEL: Clapperboard, FEED: ImageIcon, CAROUSEL: Images, STORY: CircleDashed } as const;
const FORMATS: PostFormat[] = ["REEL", "FEED", "CAROUSEL", "STORY"];
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fileUrl = (id: string) => `/api/drive/files/${id}`;
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalInput = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Thumb({ m, className = "" }: { m: PostMedia; className?: string }) {
  return m.kind === "video" ? (
    <video src={fileUrl(m.fileId)} muted preload="metadata" className={`bg-black object-cover ${className}`} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileUrl(m.fileId)} alt="" className={`bg-slate-100 object-cover ${className}`} />
  );
}

export function PostsScreen() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [data, setData] = useState<{ posts: Post[]; connections: Conn[]; storageReady: boolean; canConnect: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ post: Post | null; date?: Date } | null>(null);

  const load = useCallback(async () => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1 - 7);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 8);
    try {
      const r = await fetch(`/api/posts?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui carregar as postagens.");
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  // Atualiza sozinho enquanto há postagem publicando ou prestes a sair
  const busy = data?.posts.some((p) => p.status === "PUBLISHING" || (p.status === "SCHEDULED" && new Date(p.scheduledAt).getTime() - Date.now() < 10 * 60_000));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [busy, load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of data?.posts || []) {
      const k = dayKey(new Date(p.scheduledAt));
      m.set(k, [...(m.get(k) || []), p].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    }
    return m;
  }, [data]);

  const cells = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  const upcoming = (data?.posts || [])
    .filter((p) => p.status === "SCHEDULED" || p.status === "PUBLISHING" || p.status === "ERROR" || p.status === "PARTIAL")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const today = dayKey(new Date());
  const noConn = data && data.connections.length === 0;

  return (
    <Page>
      <PageHeader
        title="Postagens"
        description="Agende Reels, posts de feed, carrosséis e Stories no Instagram e no Facebook. O sistema publica sozinho no horário."
        actions={
          <Button onClick={() => setEditing({ post: null })} disabled={!data || Boolean(noConn)}>
            <Plus size={16} /> Nova postagem
          </Button>
        }
      />

      <div className="mb-4 space-y-2">
        <ErrorNote message={error} />
        {data && !data.storageReady && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            O armazenamento de arquivos (bucket) ainda não foi ligado no servidor. Sem ele não dá para publicar: a Meta baixa as fotos e os vídeos de lá.
          </p>
        )}
        {noConn && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Nenhuma página conectada. Conecte a página do Facebook (com o Instagram) em{" "}
            <a href="/redes-sociais" className="font-semibold underline">
              Instagram e Facebook
            </a>
            .
          </p>
        )}
        {data && data.canConnect && !noConn && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Info size={14} className="shrink-0" />
            Para publicar, a página precisa da permissão de postagem da Meta. Se aparecer erro de permissão,
            <a href="/api/meta/connect?posts=1" className="font-semibold text-[var(--accent)] underline">
              clique aqui para liberar as postagens
            </a>
            e escolha a página de novo.
          </p>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Mês anterior">
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold capitalize text-slate-800">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              <button
                onClick={() => {
                  const d = new Date();
                  setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
              >
                Hoje
              </button>
            </div>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Próximo mês">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {WEEK.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const k = dayKey(d);
              const list = byDay.get(k) || [];
              const out = d.getMonth() !== month.getMonth();
              const past = k < today;
              return (
                <div
                  key={k}
                  onClick={() => {
                    if (past || noConn) return;
                    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0);
                    setEditing({ post: null, date: at.getTime() < Date.now() ? new Date(Date.now() + 30 * 60_000) : at });
                  }}
                  className={`group min-h-[96px] border-b border-r border-slate-100 p-1.5 ${out ? "bg-slate-50/60" : "bg-white"} ${past ? "" : "cursor-pointer hover:bg-sky-50/40"}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${k === today ? "bg-[var(--accent)] font-bold text-white" : out ? "text-slate-300" : "text-slate-600"}`}>
                      {d.getDate()}
                    </span>
                    {!past && !noConn && <Plus size={13} className="text-slate-300 opacity-0 group-hover:opacity-100" />}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((p) => {
                      const Icon = FORMAT_ICON[p.format];
                      return (
                        <button
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing({ post: p });
                          }}
                          className={`flex w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-semibold ${STATUS_STYLE[p.status]}`}
                          title={`${FORMAT_LABEL[p.format]} · ${STATUS_LABEL[p.status]}`}
                        >
                          <Icon size={11} className="shrink-0" />
                          {fmtTime(p.scheduledAt)}
                          <span className="truncate font-normal">{p.caption || FORMAT_LABEL[p.format]}</span>
                        </button>
                      );
                    })}
                    {list.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{list.length - 3} postagens</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-800">Fila de publicação</p>
            <p className="text-xs text-slate-500">Agendadas e com erro, deste período.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {!data && (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-400">
                <Loader2 size={15} className="animate-spin" /> Carregando…
              </p>
            )}
            {data && upcoming.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">Nada agendado. Clique num dia do calendário para criar.</p>}
            {upcoming.map((p) => {
              const Icon = FORMAT_ICON[p.format];
              return (
                <button key={p.id} onClick={() => setEditing({ post: p })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  {p.media[0] ? <Thumb m={p.media[0]} className="h-12 w-12 shrink-0 rounded-lg" /> : <span className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Icon size={14} /> {FORMAT_LABEL[p.format]}
                      <span className="text-xs font-normal text-slate-400">· {[p.toInstagram && "Instagram", p.toFacebook && "Facebook"].filter(Boolean).join(" + ")}</span>
                    </p>
                    <p className="text-xs capitalize text-slate-500">{fmtDateTime(p.scheduledAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {editing && data && (
        <PostEditor
          post={editing.post}
          date={editing.date}
          connections={data.connections}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </Page>
  );
}

function PostEditor({
  post,
  date,
  connections,
  onClose,
  onSaved,
}: {
  post: Post | null;
  date?: Date;
  connections: Conn[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const locked = Boolean(post && (post.status === "PUBLISHING" || post.status === "PUBLISHED" || post.status === "PARTIAL"));
  const [connectionId, setConnectionId] = useState(post?.connectionId || connections[0]?.id || "");
  const conn = connections.find((c) => c.id === connectionId) || null;
  const [format, setFormat] = useState<PostFormat>(post?.format || "REEL");
  const [toInstagram, setToInstagram] = useState(post ? post.toInstagram : Boolean(connections[0]?.hasInstagram));
  const [toFacebook, setToFacebook] = useState(post ? post.toFacebook : true);
  const [caption, setCaption] = useState(post?.caption || "");
  const [media, setMedia] = useState<PostMedia[]>(post?.media || []);
  const [now, setNow] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(post ? new Date(post.scheduledAt) : date || new Date(Date.now() + 60 * 60_000)));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxFiles = format === "CAROUSEL" ? 10 : 1;
  const accept = format === "REEL" ? "video/*" : format === "FEED" ? "image/*" : "image/*,video/*";
  const okKind = (k: string) => (format === "REEL" ? k === "video" : format === "FEED" ? k === "image" : k === "image" || k === "video");

  const problem = postProblem({ format, toInstagram, toFacebook, caption, media, hasInstagram: Boolean(conn?.hasInstagram) });
  const tags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).length;

  useEffect(() => {
    if (!picker || files) return;
    fetch("/api/drive", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFiles(((d.files || []) as DriveFile[]).filter((f) => f.kind === "image" || f.kind === "video")))
      .catch(() => setFiles([]));
  }, [picker, files]);

  const add = (m: PostMedia) =>
    setMedia((cur) => {
      if (cur.some((x) => x.fileId === m.fileId)) return cur;
      return maxFiles === 1 ? [m] : [...cur, m].slice(0, maxFiles);
    });

  const sendFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr(null);
    for (const file of Array.from(list).slice(0, maxFiles)) {
      const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "";
      if (!okKind(kind)) {
        setErr(`"${file.name}" não serve para ${FORMAT_LABEL[format]}.`);
        continue;
      }
      const saved = await new Promise<PostMedia | null>((resolve) => {
        setUpload({ name: file.name, pct: 0 });
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/upload/drive?folder=postagens&name=${encodeURIComponent(file.name)}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => e.lengthComputable && setUpload({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) });
        xhr.onload = () => {
          let d: { id?: string; name?: string; mimeType?: string; kind?: string; error?: string } = {};
          try {
            d = JSON.parse(xhr.responseText);
          } catch {}
          if (xhr.status >= 300 || !d.id) {
            setErr(d.error || "Não consegui enviar o arquivo.");
            return resolve(null);
          }
          resolve({ fileId: d.id, name: d.name || file.name, mime: d.mimeType || file.type, kind: d.kind || kind });
        };
        xhr.onerror = () => {
          setErr("Falha de conexão ao enviar o arquivo.");
          resolve(null);
        };
        xhr.send(file);
      });
      if (saved) add(saved);
    }
    setUpload(null);
    setFiles(null);
  };

  const move = (i: number, d: number) =>
    setMedia((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const n = [...cur];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    setBusy("save");
    setErr(null);
    try {
      const body = { connectionId, format, toInstagram, toFacebook, caption, media, now, scheduledAt: now ? null : new Date(when).toISOString() };
      const r = await fetch(post ? `/api/posts/${post.id}` : "/api/posts", {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const act = async (action: "retry" | "cancel" | "delete") => {
    if (!post) return;
    if (action === "delete" && !confirm("Apagar esta postagem do sistema? O que já foi publicado continua no Instagram/Facebook.")) return;
    setBusy(action);
    setErr(null);
    try {
      const r = await fetch(`/api/posts/${post.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não deu certo.");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const results = Object.entries(post?.results || {});

  return (
    <Modal
      open
      wide
      title={post ? (locked ? "Postagem" : "Editar postagem") : "Nova postagem"}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {post && (post.status === "ERROR" || post.status === "PARTIAL") && (
              <Button variant="secondary" onClick={() => act("retry")} disabled={Boolean(busy)}>
                <RotateCcw size={15} /> Tentar de novo
              </Button>
            )}
            {post?.status === "SCHEDULED" && (
              <Button variant="secondary" onClick={() => act("cancel")} disabled={Boolean(busy)}>
                <Ban size={15} /> Cancelar agendamento
              </Button>
            )}
            {post && post.status !== "PUBLISHING" && (
              <Button variant="danger" onClick={() => act("delete")} disabled={Boolean(busy)}>
                <Trash2 size={15} /> Apagar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {!locked && (
              <Button onClick={save} disabled={Boolean(busy) || Boolean(problem) || Boolean(upload)}>
                {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
                {now ? "Publicar agora" : post ? "Salvar e agendar" : "Agendar"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <fieldset disabled={locked} className="space-y-5">
        {post && (
          <div className={`rounded-xl border px-3 py-2 text-sm ${STATUS_STYLE[post.status]}`}>
            <b>{STATUS_LABEL[post.status]}</b>
            {post.publishedAt ? ` em ${fmtDateTime(post.publishedAt)}` : ""}
            {results.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {results.map(([net, r]) => (
                  <li key={net}>
                    <b>{net === "instagram" ? "Instagram" : net === "facebook" ? "Facebook" : "Aviso"}:</b>{" "}
                    {r.error ? (
                      r.error
                    ) : r.permalink ? (
                      <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                        ver publicação <ExternalLink size={11} />
                      </a>
                    ) : (
                      "publicado"
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Página">
            <Select
              value={connectionId}
              onChange={(e) => {
                setConnectionId(e.target.value);
                const c = connections.find((x) => x.id === e.target.value);
                if (c && !c.hasInstagram) setToInstagram(false);
              }}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.pageName || "Página"}
                  {c.igUsername ? ` · @${c.igUsername}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-800">Onde publicar</span>
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toInstagram ? "border-pink-300 bg-pink-50 text-pink-700" : "border-slate-200 text-slate-600"} ${conn?.hasInstagram ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={toInstagram} disabled={!conn?.hasInstagram} onChange={(e) => setToInstagram(e.target.checked)} className="accent-pink-600" />
                Instagram{conn?.igUsername ? ` @${conn.igUsername}` : ""}
              </label>
              <label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toFacebook ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                <input type="checkbox" checked={toFacebook} onChange={(e) => setToFacebook(e.target.checked)} className="accent-blue-600" />
                Facebook
              </label>
            </div>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-slate-800">Formato</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FORMATS.map((f) => {
              const Icon = FORMAT_ICON[f];
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFormat(f);
                    setMedia((cur) => cur.filter((m) => (f === "REEL" ? m.kind === "video" : f === "FEED" ? m.kind === "image" : true)).slice(0, f === "CAROUSEL" ? 10 : 1));
                  }}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${format === f ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon size={16} /> {FORMAT_LABEL[f]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{FORMAT_HINT[format]}</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">
              {format === "CAROUSEL" ? "Fotos e vídeos" : format === "REEL" ? "Vídeo" : format === "FEED" ? "Foto" : "Foto ou vídeo"}
            </span>
            <span className="text-xs text-slate-400">
              {media.length}/{maxFiles}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {media.map((m, i) => (
              <div key={m.fileId} className={`relative overflow-hidden rounded-xl border border-slate-200 ${format === "FEED" || format === "CAROUSEL" ? "h-28 w-24" : "h-36 w-20"}`}>
                <Thumb m={m} className="h-full w-full" />
                {!locked && (
                  <button type="button" onClick={() => setMedia((cur) => cur.filter((x) => x.fileId !== m.fileId))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white" aria-label="Tirar">
                    <X size={13} />
                  </button>
                )}
                {format === "CAROUSEL" && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1 text-[10px] font-bold text-white">
                    {!locked ? (
                      <button type="button" onClick={() => move(i, -1)} aria-label="Para a esquerda">
                        <ArrowLeft size={12} />
                      </button>
                    ) : (
                      <span />
                    )}
                    {i + 1}
                    {!locked ? (
                      <button type="button" onClick={() => move(i, 1)} aria-label="Para a direita">
                        <ArrowRight size={12} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                )}
              </div>
            ))}
            {!locked && media.length < maxFiles && (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="flex h-16 w-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Upload size={16} /> Enviar do computador
                </button>
                <button type="button" onClick={() => setPicker((v) => !v)} className="flex h-16 w-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <FolderOpen size={16} /> Escolher do Drive
                </button>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept={accept} multiple={format === "CAROUSEL"} className="hidden" onChange={(e) => (sendFiles(e.target.files), (e.target.value = ""))} />
          {upload && (
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> Enviando {upload.name}… {upload.pct}%
            </p>
          )}
          {picker && !locked && (
            <div className="mt-3 rounded-xl border border-slate-200 p-2">
              {!files && <p className="p-3 text-xs text-slate-400">Carregando o Drive…</p>}
              {files && files.filter((f) => okKind(f.kind)).length === 0 && <p className="p-3 text-xs text-slate-400">Nenhum arquivo deste tipo no Drive.</p>}
              <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {files
                  ?.filter((f) => okKind(f.kind))
                  .map((f) => {
                    const m: PostMedia = { fileId: f.id, kind: f.kind, mime: f.mimeType, name: f.name };
                    const on = media.some((x) => x.fileId === f.id);
                    return (
                      <button key={f.id} type="button" onClick={() => add(m)} title={f.name} className={`relative aspect-square overflow-hidden rounded-lg border-2 ${on ? "border-[var(--accent)]" : "border-transparent"}`}>
                        <Thumb m={m} className="h-full w-full" />
                        {f.kind === "video" && <Clapperboard size={13} className="absolute left-1 top-1 text-white drop-shadow" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {format !== "STORY" && (
          <Field label="Legenda" hint={`${caption.length}/${CAPTION_MAX} caracteres · ${tags}/30 hashtags`}>
            <Textarea rows={5} value={caption} maxLength={CAPTION_MAX} onChange={(e) => setCaption(e.target.value)} placeholder="Ex.: Scooter elétrica Harley 1000W 🔥 Promoção enquanto durar o estoque! Chame no direct. #scooterelétrica #resplenmotors" />
          </Field>
        )}

        {!locked && (
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-800">Quando</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={!now} onChange={() => setNow(false)} className="accent-[var(--accent)]" /> Agendar para
              </label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={now} className="max-w-[230px]" />
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={now} onChange={() => setNow(true)} className="accent-[var(--accent)]" /> Publicar agora
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-400">O sistema confere a fila a cada 30 segundos. Vídeos podem levar alguns minutos para a Meta processar.</p>
          </div>
        )}

        {!locked && problem && media.length > 0 && <p className="text-xs font-semibold text-amber-700">{problem}</p>}
        <ErrorNote message={err} />
      </fieldset>
    </Modal>
  );
}
