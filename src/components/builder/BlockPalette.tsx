"use client";

const BLOCK_TYPES = [
  {
    id: "START",
    label: "Início",
    icon: "▶️",
    description: "Bloco inicial do fluxo",
  },
  {
    id: "TEXT_MESSAGE",
    label: "Texto",
    icon: "💬",
    description: "Enviar mensagem de texto",
  },
  {
    id: "IMAGE",
    label: "Imagem",
    icon: "🖼️",
    description: "Enviar imagem",
  },
  {
    id: "VIDEO",
    label: "Vídeo",
    icon: "🎬",
    description: "Enviar vídeo",
  },
  {
    id: "AUDIO",
    label: "Áudio",
    icon: "🎵",
    description: "Enviar áudio",
  },
  {
    id: "DOCUMENT",
    label: "Documento",
    icon: "📄",
    description: "Enviar documento",
  },
  {
    id: "LIST",
    label: "Menu",
    icon: "📋",
    description: "Menu com opções",
  },
  {
    id: "RESPONSE_WAIT",
    label: "Aguardar",
    icon: "⏳",
    description: "Aguardar resposta",
  },
  {
    id: "CONDITION",
    label: "Condição",
    icon: "❓",
    description: "Decisão/ramificação",
  },
  {
    id: "END",
    label: "Fim",
    icon: "🛑",
    description: "Encerrar fluxo",
  },
];

interface BlockPaletteProps {
  onAddBlock: (blockType: string) => void;
}

export default function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  return (
    <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Blocos</h3>
        <div className="space-y-2">
          {BLOCK_TYPES.map((block) => (
            <button
              key={block.id}
              onClick={() => onAddBlock(block.id)}
              className="w-full p-3 text-left bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{block.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{block.label}</p>
                  <p className="text-xs text-gray-600">{block.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="m-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-900">
          💡 Clique em um bloco para adicioná-lo ao canvas. Arraste para posicionar e clique nas bordas para conectar.
        </p>
      </div>
    </div>
  );
}
