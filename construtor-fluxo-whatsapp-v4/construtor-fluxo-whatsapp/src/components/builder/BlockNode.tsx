"use client";

import { Handle, Position } from "reactflow";

const BLOCK_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  START: { bg: "bg-green-50", border: "border-green-300", icon: "▶️" },
  TEXT_MESSAGE: { bg: "bg-blue-50", border: "border-blue-300", icon: "💬" },
  IMAGE: { bg: "bg-purple-50", border: "border-purple-300", icon: "🖼️" },
  VIDEO: { bg: "bg-indigo-50", border: "border-indigo-300", icon: "🎬" },
  AUDIO: { bg: "bg-pink-50", border: "border-pink-300", icon: "🎵" },
  DOCUMENT: { bg: "bg-yellow-50", border: "border-yellow-300", icon: "📄" },
  LIST: { bg: "bg-orange-50", border: "border-orange-300", icon: "📋" },
  RESPONSE_WAIT: { bg: "bg-cyan-50", border: "border-cyan-300", icon: "⏳" },
  CONDITION: { bg: "bg-amber-50", border: "border-amber-300", icon: "❓" },
  END: { bg: "bg-red-50", border: "border-red-300", icon: "🛑" },
};

interface BlockNodeProps {
  data: {
    label: string;
    type: string;
    config?: Record<string, any>;
  };
  isConnecting?: boolean;
  selected?: boolean;
}

export default function BlockNode({ data, isConnecting, selected }: BlockNodeProps) {
  const colors = BLOCK_COLORS[data.type] || BLOCK_COLORS.START;
  const hasConfig = data.config && Object.keys(data.config).length > 0;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[160px] text-center
        ${colors.bg} ${colors.border}
        ${selected ? "ring-2 ring-blue-500 ring-offset-2" : ""}
        shadow-md hover:shadow-lg transition-shadow cursor-grab active:cursor-grabbing
      `}
    >
      {/* Input handles */}
      {data.type !== "START" && <Handle type="target" position={Position.Top} />}

      {/* Content */}
      <div className="flex items-center gap-2 justify-center">
        <span className="text-xl">{colors.icon}</span>
        <div className="text-left">
          <p className="font-semibold text-sm text-gray-900">{data.label}</p>
          {hasConfig && (
            <p className="text-xs text-gray-600">⚙️ Configurado</p>
          )}
        </div>
      </div>

      {/* Output handles */}
      {data.type !== "END" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
