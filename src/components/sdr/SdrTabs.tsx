"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/sdr/whatsapp", label: "WhatsApp" },
  { href: "/sdr/leads", label: "Leads" },
  { href: "/sdr/configuracoes", label: "Configurações" },
];

export function SdrTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 px-8">
      <nav className="flex gap-6">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-[color:var(--accent)] text-[color:var(--accent-dark)]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
