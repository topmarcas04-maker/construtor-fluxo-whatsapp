"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Crown, Lock, Play, Plus, Pencil, Trash2, CheckCircle2, Circle, ArrowLeft, ChevronRight, Clock, FileDown, GraduationCap, FolderPlus, Headphones,
} from "lucide-react";
import { Button } from "@/components/ui";
import { embedUrl } from "@/lib/members/common";
import { fmtSize } from "@/lib/drive/common";
import { CourseForm } from "@/components/members/CourseForm";
import { LessonForm } from "@/components/members/LessonForm";
import type { CourseCard, CourseDetail, Lesson } from "@/components/members/types";

const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ""}` : `${m} min`);

function Cover({ c, className = "" }: { c: { cover: string | null; title: string }; className?: string }) {
  return c.cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.cover} alt="" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--accent)] via-slate-800 to-slate-950 ${className}`}>
      <GraduationCap size={48} className="text-white/30" />
    </div>
  );
}

/** Aviso de conteúdo premium, com atalho para o suporte */
function PremiumLock({ compact }: { compact?: boolean }) {
  const [support, setSupport] = useState<{ phone: string } | null>(null);
  useEffect(() => {
    fetch("/api/support")
      .then((r) => r.json())
      .then((d) => setSupport(d.support || null))
      .catch(() => {});
  }, []);
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? "" : "py-10"}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/30">
        <Crown size={26} />
      </span>
      <p className="text-lg font-semibold text-white">Conteúdo exclusivo Premium</p>
      <p className="max-w-sm text-sm text-slate-300">Este conteúdo faz parte do plano Premium. Fale com a gente para liberar o acesso.</p>
      {support && (
        <a
          href={`https://wa.me/${support.phone}?text=${encodeURIComponent("Olá! Quero liberar a área premium.")}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-5 py-2 text-sm font-bold text-slate-950 hover:brightness-110"
        >
          Quero o Premium
        </a>
      )}
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MembersScreen() {
  const [list, setList] = useState<{ canAuthor: boolean; premium: boolean; courses: CourseCard[] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editCourse, setEditCourse] = useState<CourseCard | "new" | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/members");
    if (res.ok) setList(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (openId) return <CourseView id={openId} onBack={() => { setOpenId(null); load(); }} />;

  const courses = list?.courses || [];
  const featured = courses.find((c) => !c.locked && c.completed < c.lessons) || courses.find((c) => !c.locked);
  const free = courses.filter((c) => !c.premium);
  const premium = courses.filter((c) => c.premium);

  return (
    <div className="min-h-full bg-slate-950 text-white">
      {/* Destaque */}
      <section className="relative overflow-hidden">
        {featured && (
          <div className="absolute inset-0 opacity-40">
            <Cover c={featured} className="blur-sm" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/40" />
        <div className="relative px-4 pb-10 pt-10 md:px-10 md:pt-14">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-amber-300">
            <GraduationCap size={18} /> Área de membros
            {list?.premium && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-slate-950">
                <Crown size={12} /> PREMIUM
              </span>
            )}
          </p>
          {featured ? (
            <>
              <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight md:text-5xl">{featured.title}</h1>
              {featured.description && <p className="mt-3 max-w-xl text-slate-300 md:text-lg">{featured.description}</p>}
              <div className="mt-4 flex items-center gap-4 text-sm text-slate-300">
                <span>{featured.lessons} aulas</span>
                {featured.minutes > 0 && <span>{minutes(featured.minutes)}</span>}
                <span>
                  {featured.completed}/{featured.lessons} concluídas
                </span>
              </div>
              <div className="mt-2 max-w-sm">
                <ProgressBar value={featured.completed} total={featured.lessons} />
              </div>
              <button
                onClick={() => setOpenId(featured.id)}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-slate-950 transition hover:scale-[1.02]"
              >
                <Play size={18} fill="currentColor" /> {featured.completed ? "Continuar assistindo" : "Começar agora"}
              </button>
            </>
          ) : (
            <h1 className="mt-3 text-3xl font-bold md:text-4xl">Aprenda a vender mais com o sistema</h1>
          )}
          {list?.canAuthor && (
            <div className="mt-6">
              <button onClick={() => setEditCourse("new")} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-sm font-semibold hover:bg-white/10">
                <Plus size={16} /> Novo curso
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="space-y-10 px-4 pb-14 md:px-10">
        {!list ? (
          <p className="text-slate-400">Carregando...</p>
        ) : courses.length === 0 ? (
          <p className="text-slate-400">{list.canAuthor ? "Nenhum curso ainda. Clique em Novo curso para começar." : "Nenhum conteúdo publicado ainda."}</p>
        ) : (
          <>
            {free.length > 0 && <Row title="Cursos" courses={free} onOpen={setOpenId} onEdit={list.canAuthor ? setEditCourse : undefined} />}
            {premium.length > 0 && (
              <Row
                title={
                  <span className="flex items-center gap-2">
                    <Crown size={20} className="text-amber-400" /> Premium
                  </span>
                }
                courses={premium}
                onOpen={setOpenId}
                onEdit={list.canAuthor ? setEditCourse : undefined}
              />
            )}
          </>
        )}
      </div>

      {editCourse && <CourseForm course={editCourse} onClose={() => setEditCourse(null)} onSaved={() => { setEditCourse(null); load(); }} />}
    </div>
  );
}

function Row({ title, courses, onOpen, onEdit }: { title: React.ReactNode; courses: CourseCard[]; onOpen: (id: string) => void; onEdit?: (c: CourseCard) => void }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {courses.map((c) => (
          <div key={c.id} className="group relative">
            <button onClick={() => onOpen(c.id)} className="block w-full text-left">
              <div
                className={`relative aspect-video overflow-hidden rounded-xl ring-1 transition group-hover:scale-[1.02] ${
                  c.premium ? "ring-amber-400/60 shadow-lg shadow-amber-500/10" : "ring-white/10"
                }`}
              >
                <Cover c={c} className="transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                {c.premium && (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-slate-950">
                    <Crown size={12} /> PREMIUM
                  </span>
                )}
                {!c.published && <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold">Rascunho</span>}
                {c.locked ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 ring-1 ring-amber-400/60">
                      <Lock size={20} className="text-amber-300" />
                    </span>
                  </span>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-950">
                      <Play size={24} fill="currentColor" />
                    </span>
                  </span>
                )}
                <div className="absolute inset-x-3 bottom-3">
                  <ProgressBar value={c.completed} total={c.lessons} />
                </div>
              </div>
              <p className="mt-2 font-semibold">{c.title}</p>
              <p className="text-sm text-slate-400">
                {c.lessons} aulas{c.minutes ? ` · ${minutes(c.minutes)}` : ""} · {c.lessons ? Math.round((c.completed / c.lessons) * 100) : 0}% concluído
              </p>
            </button>
            {onEdit && c.own && (
              <button onClick={() => onEdit(c)} className="absolute right-2 top-2 hidden rounded-full bg-black/70 p-2 text-white hover:bg-black group-hover:block" title="Editar curso">
                <Pencil size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CourseView({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<CourseDetail | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState<{ lesson: Lesson | "new"; moduleId?: string | null } | null>(null);
  const [editCourse, setEditCourse] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/members/courses/${id}`);
    if (res.ok) {
      const data: CourseDetail = await res.json();
      setD(data);
      setCurrent((cur) => cur || data.lessons.find((l) => !l.done && !l.locked)?.id || data.lessons[0]?.id || null);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!d) return [];
    const out = d.modules.map((m) => ({ id: m.id as string | null, title: m.title, lessons: d.lessons.filter((l) => l.moduleId === m.id) }));
    const loose = d.lessons.filter((l) => !l.moduleId || !d.modules.some((m) => m.id === l.moduleId));
    if (loose.length || !out.length) out.unshift({ id: null, title: d.modules.length ? "Aulas" : "", lessons: loose });
    return out;
  }, [d]);
  const ordered = groups.flatMap((g) => g.lessons);
  const lesson = ordered.find((l) => l.id === current) || null;
  const idx = lesson ? ordered.indexOf(lesson) : -1;
  const next = idx >= 0 ? ordered[idx + 1] : null;

  const toggleDone = async (l: Lesson, done = !l.done) => {
    await fetch(`/api/members/lessons/${l.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) });
    load();
  };
  const addModule = async () => {
    const title = prompt("Nome do módulo");
    if (!title?.trim()) return;
    await fetch(`/api/members/courses/${id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "module", title, sort: d?.modules.length || 0 }) });
    load();
  };
  const editModule = async (mid: string, title: string) => {
    const t = prompt("Nome do módulo", title);
    if (!t?.trim() || t === title) return;
    await fetch(`/api/members/items/${mid}?type=module`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t }) });
    load();
  };
  const delModule = async (mid: string, title: string) => {
    if (!confirm(`Excluir o módulo "${title}" e todas as aulas dele?`)) return;
    await fetch(`/api/members/items/${mid}?type=module`, { method: "DELETE" });
    load();
  };
  const delLesson = async (l: Lesson) => {
    if (!confirm(`Excluir a aula "${l.title}"?`)) return;
    await fetch(`/api/members/items/${l.id}?type=lesson`, { method: "DELETE" });
    if (current === l.id) setCurrent(null);
    load();
  };
  const delCourse = async () => {
    if (!d || !confirm(`Excluir o curso "${d.course.title}" com todas as aulas? Não dá para desfazer.`)) return;
    await fetch(`/api/members/courses/${id}`, { method: "DELETE" });
    onBack();
  };

  if (!d) return <div className="min-h-full bg-slate-950 p-10 text-slate-400">Carregando...</div>;
  const total = d.lessons.length;
  const done = d.lessons.filter((l) => l.done).length;
  const embed = lesson && !lesson.locked && !lesson.hasVideo ? embedUrl(lesson.videoUrl) : null;

  return (
    <div className="min-h-full bg-slate-950 text-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-4 md:px-8">
        <button onClick={onBack} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">
          <ArrowLeft size={16} /> Voltar
        </button>
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">
          {d.course.premium && <Crown size={17} className="mr-1 inline text-amber-400" />}
          {d.course.title}
        </p>
        <span className="text-sm text-slate-400">
          {done}/{total} concluídas
        </span>
        {d.canEdit && (
          <>
            <button onClick={() => setEditCourse(true)} className="rounded-full p-2 text-slate-300 hover:bg-white/10" title="Editar curso">
              <Pencil size={16} />
            </button>
            <button onClick={delCourse} className="rounded-full p-2 text-slate-300 hover:bg-red-500/20 hover:text-red-300" title="Excluir curso">
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
            {!lesson ? (
              <div className="flex h-full items-center justify-center text-slate-500">{d.canEdit ? "Adicione a primeira aula →" : "Nenhuma aula ainda."}</div>
            ) : lesson.locked ? (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-900 to-black">
                <PremiumLock />
              </div>
            ) : lesson.hasVideo ? (
              <video key={lesson.id} src={`/api/members/lessons/${lesson.id}`} controls controlsList="nodownload" className="h-full w-full" onEnded={() => !lesson.done && toggleDone(lesson, true)} />
            ) : embed ? (
              <iframe key={lesson.id} src={embed} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">Aula sem vídeo.</div>
            )}
          </div>

          {lesson && (
            <div className="mt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{lesson.title}</h2>
                  {lesson.durationMin ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-slate-400">
                      <Clock size={14} /> {minutes(lesson.durationMin)}
                    </p>
                  ) : null}
                </div>
                {!lesson.locked && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleDone(lesson)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                        lesson.done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      <CheckCircle2 size={16} /> {lesson.done ? "Concluída" : "Marcar como concluída"}
                    </button>
                    {next && (
                      <button onClick={() => setCurrent(next.id)} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950">
                        Próxima aula <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {lesson.description && !lesson.locked && <p className="mt-4 whitespace-pre-wrap leading-relaxed text-slate-300">{lesson.description}</p>}
              {lesson.files.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Material de apoio</p>
                  <div className="flex flex-wrap gap-2">
                    {lesson.files.map((f) => (
                      <a
                        key={f.id}
                        href={`/api/members/lessons/${lesson.id}?file=${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm ring-1 ring-white/10 hover:bg-white/10"
                      >
                        <FileDown size={16} className="text-amber-300" /> {f.name} <span className="text-xs text-slate-500">{fmtSize(f.size)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="mb-2 flex justify-between text-sm text-slate-300">
              <span>Seu progresso</span>
              <span>{total ? Math.round((done / total) * 100) : 0}%</span>
            </div>
            <ProgressBar value={done} total={total} />
          </div>
          {groups.map((g) => (
            <div key={g.id || "loose"} className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
              {g.title && (
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <p className="font-semibold">{g.title}</p>
                  {d.canEdit && g.id && (
                    <span className="flex gap-1">
                      <button onClick={() => editModule(g.id!, g.title)} className="rounded p-1 text-slate-400 hover:text-white" title="Renomear">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => delModule(g.id!, g.title)} className="rounded p-1 text-slate-400 hover:text-red-300" title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </div>
              )}
              {g.lessons.map((l) => (
                <div key={l.id} className={`group flex items-center gap-3 px-4 py-3 ${l.id === current ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <button onClick={() => setCurrent(l.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {l.locked ? <Lock size={17} className="shrink-0 text-amber-300" /> : l.done ? <CheckCircle2 size={17} className="shrink-0 text-emerald-400" /> : <Circle size={17} className="shrink-0 text-slate-500" />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {l.title}
                        {!l.published && <span className="ml-1 text-xs text-slate-500">(rascunho)</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {l.durationMin ? minutes(l.durationMin) : ""}
                        {l.premium && " · Premium"}
                      </span>
                    </span>
                  </button>
                  {d.canEdit && (
                    <span className="hidden gap-1 group-hover:flex">
                      <button onClick={() => setLessonForm({ lesson: l })} className="rounded p-1 text-slate-400 hover:text-white" title="Editar">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => delLesson(l)} className="rounded p-1 text-slate-400 hover:text-red-300" title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {d.canEdit && (
                <button onClick={() => setLessonForm({ lesson: "new", moduleId: g.id })} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-amber-300 hover:bg-white/5">
                  <Plus size={15} /> Nova aula
                </button>
              )}
            </div>
          ))}
          {d.canEdit && (
            <Button variant="secondary" onClick={addModule} className="w-full">
              <FolderPlus size={15} /> Novo módulo
            </Button>
          )}
          {d.course.locked && !d.canEdit && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-transparent p-4 ring-1 ring-amber-400/30">
              <PremiumLock compact />
            </div>
          )}
          <p className="flex items-center gap-1 px-1 text-xs text-slate-500">
            <Headphones size={12} /> Dúvidas sobre o conteúdo? Use o botão Suporte no topo.
          </p>
        </aside>
      </div>

      {lessonForm && (
        <LessonForm
          courseId={id}
          lesson={lessonForm.lesson}
          modules={d.modules}
          defaultModuleId={lessonForm.moduleId}
          onClose={() => setLessonForm(null)}
          onSaved={() => {
            setLessonForm(null);
            load();
          }}
        />
      )}
      {editCourse && <CourseForm course={d.course} onClose={() => setEditCourse(false)} onSaved={() => { setEditCourse(false); load(); }} />}
    </div>
  );
}
