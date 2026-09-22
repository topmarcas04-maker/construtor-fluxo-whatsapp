"use client";

import { useState, useEffect } from "react";
import { Node } from "reactflow";

interface ConfigPanelProps {
  node: Node;
  onDelete: () => void;
  onConfigChange: (config: Record<string, any>) => void;
}

const BLOCK_CONFIG_SCHEMA: Record<string, { label: string; fields: Array<{ key: string; label: string; type: string; placeholder?: string }> }> = {
  TEXT_MESSAGE: {
    label: "Mensagem de Texto",
    fields: [
      { key: "text", label: "Texto da Mensagem", type: "textarea", placeholder: "Digite o texto..." },
      { key: "delay", label: "Atraso (segundos)", type: "number", placeholder: "0" },
    ],
  },
  IMAGE: {
    label: "Enviar Imagem",
    fields: [
      { key: "imageUrl", label: "URL da Imagem", type: "text", placeholder: "https://..." },
      { key: "caption", label: "Legenda (opcional)", type: "textarea" },
    ],
  },
  VIDEO: {
    label: "Enviar Vídeo",
    fields: [
      { key: "videoUrl", label: "URL do Vídeo", type: "text", placeholder: "https://..." },
      { key: "caption", label: "Legenda (opcional)", type: "textarea" },
    ],
  },
  AUDIO: {
    label: "Enviar Áudio",
    fields: [
      { key: "audioUrl", label: "URL do Áudio", type: "text", placeholder: "https://..." },
    ],
  },
  DOCUMENT: {
    label: "Enviar Documento",
    fields: [
      { key: "documentUrl", label: "URL do Documento", type: "text", placeholder: "https://..." },
      { key: "fileName", label: "Nome do Arquivo", type: "text", placeholder: "documento.pdf" },
    ],
  },
  LIST: {
    label: "Menu com Opções",
    fields: [
      { key: "title", label: "Título", type: "text", placeholder: "Escolha uma opção" },
      { key: "options", label: "Opções (uma por linha)", type: "textarea", placeholder: "Opção 1\nOpção 2\nOpção 3" },
    ],
  },
  RESPONSE_WAIT: {
    label: "Aguardar Resposta",
    fields: [
      { key: "prompt", label: "Mensagem de Espera", type: "textarea", placeholder: "Aguardando sua resposta..." },
      { key: "timeout", label: "Tempo Limite (segundos)", type: "number", placeholder: "60" },
    ],
  },
  CONDITION: {
    label: "Condição",
    fields: [
      { key: "variable", label: "Variável a Comparar", type: "text", placeholder: "ex: resposta_anterior" },
      { key: "operator", label: "Operador", type: "select", placeholder: "" },
      { key: "value", label: "Valor", type: "text", placeholder: "valor esperado" },
    ],
  },
  START: {
    label: "Bloco de Início",
    fields: [
      { key: "message", label: "Mensagem Inicial", type: "textarea", placeholder: "Mensagem ao iniciar o fluxo" },
    ],
  },
  END: {
    label: "Encerrar Fluxo",
    fields: [
      { key: "message", label: "Mensagem de Encerramento", type: "textarea", placeholder: "Obrigado por conversar!" },
    ],
  },
};

export default function ConfigPanel({ node, onDelete, onConfigChange }: ConfigPanelProps) {
  const [config, setConfig] = useState(node.data.config || {});
  const [hasChanges, setHasChanges] = useState(false);

  const blockSchema = BLOCK_CONFIG_SCHEMA[node.data.type] || BLOCK_CONFIG_SCHEMA.TEXT_MESSAGE;

  const handleFieldChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    setHasChanges(true);
  };

  const handleSaveConfig = () => {
    onConfigChange(config);
    setHasChanges(false);
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 rounded-lg shadow overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
        <h3 className="font-bold text-gray-900">
          {blockSchema.label}
        </h3>
        <p className="text-xs text-gray-600">ID: {node.id.slice(0, 8)}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Form Fields */}
        {blockSchema.fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
            </label>

            {field.type === "textarea" && (
              <textarea
                value={config[field.key] || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            )}

            {field.type === "text" && (
              <input
                type="text"
                value={config[field.key] || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                value={config[field.key] || ""}
                onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value) || 0)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            )}

            {field.type === "select" && (
              <select
                value={config[field.key] || ""}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">Selecione...</option>
                <option value="equals">Igual a</option>
                <option value="notEquals">Diferente de</option>
                <option value="contains">Contém</option>
                <option value="startsWith">Começa com</option>
              </select>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 space-y-2">
        {hasChanges && (
          <button
            onClick={handleSaveConfig}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
          >
            Salvar Configuração
          </button>
        )}

        <button
          onClick={onDelete}
          className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium text-sm"
        >
          Deletar Bloco
        </button>
      </div>
    </div>
  );
}
