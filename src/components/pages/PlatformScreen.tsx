"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, Upload, Users, Settings } from "lucide-react";
import { Page, PageHeader, Card, Button, Field, Input, ErrorNote } from "@/components/ui";

interface Branding {
  displayName: string;
  subtitle: string | null;
  logo: string | null;
  menuBg: string;
  menuText: string;
  menuActive: string;
  topBg: string;
  topText: string;
  accent: string;
}

const DEFAULTS: Omit<Branding, "displayName" | "subtitle" | "logo"> = {
  menuBg: "#155e75",
  menuText: "#ffffff",
  menuActive: "#ffffff",
  topBg: "#ffffff",
  topText: "#0f172a",
  accent: "#155e75",
};

const COLORS: { key: keyof typeof DEFAULTS; label: string; hint: string }[] = [
  { key: "menuBg", label: "Fundo do menu", hint: "Cor da barra lateral" },
  { key: "menuText", label: "Texto do menu", hint: "Letras e ícones do menu" },
  { key: "menuActive", label: "Destaque do menu", hint: "Item selecionado / passar o mouse" },
  { key: "topBg", label: "Fundo do topo", hint: "Barra de cima" },
  { key: "topText", label: "Texto do topo", hint: "Nome e usuário no topo" },
  { key: "accent", label: "Cor principal", hint: "Botões, abas e destaques" },
];

function ColorInput({
  value,
  isDefault,
  onChange,
}: {
  value: string;
  isDefault: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="relative h-11 w-16 cursor-pointer overflow-hidden rounded-lg border border-slate-300">
        <span className="absolute inset-1 rounded-md" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <code className="text-sm text-slate-600">{value}</code>
      {isDefault && <span className="text-sm text-slate-400">Padrão</span>}
    </div>
  );
}

export function PlatformScreen() {
  const [b, setB] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/platform").then((r) => r.json()).then(setB);
  }, []);

  if (!b) {
    return (
      <Page>
        <p className="text-sm text-slate-400">Carregando...</p>
      </Page>
    );
  }

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 350 * 1024) {
      setError("A logo precisa ter até 350 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setB({ ...b, logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/platform", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setSaved(true);
      // Recarrega para aplicar as cores e a logo no menu/topo
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Plataforma"
        description="Identidade visual do painel: nome, logo e cores. Vale para todos os usuários, inclusive parceiros."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="font-semibold text-slate-900">Identidade visual</p>
          </div>
          <div className="space-y-6 p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Nome exibido">
                <Input value={b.displayName} onChange={(e) => setB({ ...b, displayName: e.target.value })} />
              </Field>
              <Field label="Subtítulo" hint="Aparece embaixo do nome quando não há logo">
                <Input value={b.subtitle || ""} onChange={(e) => setB({ ...b, subtitle: e.target.value })} />
              </Field>
            </div>

            <Field
              label="Logo"
              hint="PNG ou SVG com fundo transparente, recomendado 420×90 px, até 350 KB. Aparece no menu e na tela de login."
            >
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className="flex h-20 w-56 items-center justify-center rounded-xl border border-dashed border-slate-300 p-2"
                  style={{ background: b.menuBg }}
                >
                  {b.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs" style={{ color: b.menuText }}>
                      Sem imagem
                    </span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onLogo(e.target.files?.[0])}
                />
                <Button variant="secondary" type="button" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} /> Escolher arquivo
                </Button>
                {b.logo && (
                  <Button variant="ghost" type="button" onClick={() => setB({ ...b, logo: null })}>
                    Remover
                  </Button>
                )}
              </div>
            </Field>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Cores do painel</p>
                <div className="flex gap-4 text-sm">
                  <button
                    className="font-medium text-[var(--accent)] hover:underline"
                    onClick={() => setB({ ...b, accent: b.menuBg })}
                  >
                    Padronizar pela cor do menu
                  </button>
                  <button
                    className="font-medium text-slate-500 hover:underline"
                    onClick={() => setB({ ...b, ...DEFAULTS })}
                  >
                    Voltar ao padrão
                  </button>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {COLORS.map((c) => (
                  <Field key={c.key} label={c.label} hint={c.hint}>
                    <ColorInput
                      value={b[c.key]}
                      isDefault={b[c.key].toLowerCase() === DEFAULTS[c.key]}
                      onChange={(v) => setB({ ...b, [c.key]: v })}
                    />
                  </Field>
                ))}
              </div>
            </div>

            <ErrorNote message={error} />
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saved ? (
                  <>
                    <Check size={16} /> Salvo
                  </>
                ) : saving ? (
                  "Salvando..."
                ) : (
                  "Salvar identidade"
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Pré-visualização */}
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
            Pré-visualização
          </div>
          <div className="flex h-72 text-[12px]">
            <div className="flex w-32 flex-col gap-1.5 p-3" style={{ background: b.menuBg, color: b.menuText }}>
              <div className="mb-2 flex h-8 items-center">
                {b.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo} alt="" className="max-h-7 max-w-full object-contain" />
                ) : (
                  <span className="truncate font-bold">{b.displayName}</span>
                )}
              </div>
              <span
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-semibold"
                style={{ background: `color-mix(in srgb, ${b.menuActive} 32%, transparent)` }}
              >
                <MessageCircle size={12} /> WhatsApp
              </span>
              <span className="flex items-center gap-1.5 px-2 py-1.5 font-semibold">
                <Users size={12} /> Leads
              </span>
              <span className="flex items-center gap-1.5 px-2 py-1.5 font-semibold">
                <Settings size={12} /> Config.
              </span>
            </div>
            <div className="flex flex-1 flex-col bg-slate-50">
              <div className="border-b border-slate-200 px-3 py-2" style={{ background: b.topBg, color: b.topText }}>
                <p className="font-semibold">{b.displayName}</p>
                <p className="opacity-60">Administrador Master</p>
              </div>
              <div className="space-y-2 p-3">
                <div className="h-3 w-24 rounded bg-slate-200" />
                <div className="h-14 rounded-lg border border-slate-200 bg-white" />
                <span className="inline-block rounded-md px-3 py-1 font-semibold text-white" style={{ background: b.accent }}>
                  Botão
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
