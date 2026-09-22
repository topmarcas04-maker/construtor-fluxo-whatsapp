"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Bot, Users, Zap } from "lucide-react";
import { Button, Field, Input, ErrorNote } from "@/components/ui";

interface Branding {
  displayName: string;
  subtitle: string | null;
  logo: string | null;
}

function LoginForm() {
  const params = useSearchParams();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/platform/public").then((r) => r.json()).then(setBranding).catch(() => {});
    fetch("/api/auth/setup").then((r) => r.json()).then((d) => setNeedsSetup(Boolean(d.needsSetup))).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível entrar");
        return;
      }
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") ? next : "/leads";
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div
        className="hidden w-[46%] flex-col justify-between p-12 lg:flex"
        style={{ background: "var(--menu-bg)", color: "var(--menu-text)" }}
      >
        <div className="flex items-center gap-3">
          {branding?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt="" className="max-h-12 max-w-[220px] object-contain" />
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                <MessageCircle size={24} />
              </span>
              <div>
                <p className="text-xl font-bold">{branding?.displayName || "SDR WhatsApp"}</p>
                {branding?.subtitle && <p className="text-sm opacity-70">{branding.subtitle}</p>}
              </div>
            </>
          )}
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold leading-snug">
            Atendimento e qualificação de leads no WhatsApp, com inteligência artificial.
          </h2>
          <ul className="space-y-4 text-[15px] opacity-90">
            <li className="flex items-center gap-3"><Bot size={20} /> A IA responde na hora e qualifica cada contato</li>
            <li className="flex items-center gap-3"><Users size={20} /> Leads distribuídos por região e tipo de compra</li>
            <li className="flex items-center gap-3"><Zap size={20} /> Funil visual do primeiro contato até a venda</li>
          </ul>
        </div>
        <p className="text-xs opacity-50">© {new Date().getFullYear()} {branding?.displayName || "SDR WhatsApp"}</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {needsSetup ? "Primeiro acesso" : "Entrar"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {needsSetup
                ? "Crie a conta do Administrador Master. Ela terá acesso a tudo."
                : "Use seu e-mail e senha para acessar o painel."}
            </p>
          </div>
          {needsSetup && (
            <Field label="Seu nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </Field>
          )}
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!needsSetup} />
          </Field>
          <Field label="Senha" hint={needsSetup ? "Mínimo de 6 caracteres" : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <ErrorNote message={error} />
          <Button type="submit" disabled={loading} className="w-full py-3 text-[15px]">
            {loading ? "Aguarde..." : needsSetup ? "Criar conta e entrar" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
