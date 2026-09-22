import { SdrTabs } from "@/components/sdr/SdrTabs";

export default function SdrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">SDR</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Qualificação e distribuição automática de leads por WhatsApp — a IA
          (Claude) faz a triagem inicial e passa para um vendedor quando
          identifica região/tipo de compra ou quando o lead pede.
        </p>
      </div>
      <SdrTabs />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
