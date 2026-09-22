"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { roleLabel } from "@/lib/auth/modules";

export function TopBar({
  title,
  user,
}: {
  title: string;
  user: { name: string; email: string; role: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header
      className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 px-8"
      style={{ background: "var(--top-bg)", color: "var(--top-text)" }}
    >
      <div>
        <p className="text-[17px] font-semibold leading-tight">{title}</p>
        <p className="text-sm leading-tight opacity-60">{roleLabel(user.role)}</p>
      </div>

      <div className="flex items-center gap-3">
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] font-medium hover:bg-black/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            {user.name}
            <ChevronDown size={16} />
          </button>
          {open && (
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-lg">
              <div className="px-3 py-2">
                <p className="font-semibold text-slate-900">{user.name}</p>
                <p className="truncate text-sm text-slate-500">{user.email}</p>
                <p className="mt-1 text-xs text-slate-400">{roleLabel(user.role)}</p>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <LogOut size={15} /> Sair
              </button>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
