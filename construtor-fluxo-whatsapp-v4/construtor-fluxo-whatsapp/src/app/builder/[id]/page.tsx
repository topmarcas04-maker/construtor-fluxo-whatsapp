"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

import BlockPalette from "@/components/builder/BlockPalette";
import BlockNode from "@/components/builder/BlockNode";
import ConfigPanel from "@/components/builder/ConfigPanel";

interface Flow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  phoneNumber: string;
  priority: number;
}

interface BlockData {
  id: string;
  flowId: string;
  type: string;
  config: Record<string, any>;
  positionX: number;
  positionY: number;
}

interface ConnectionData {
  id: string;
  flowId: string;
  fromBlockId: string;
  toBlockId: string;
  label: string | null;
  conditionKey: string | null;
  conditionValue: string | null;
}

const nodeTypes: NodeTypes = {
  block: BlockNode,
};

export default function FlowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;

  const [flow, setFlow] = useState<Flow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load flow data
  useEffect(() => {
    const loadFlow = async () => {
      try {
        const response = await fetch(`/api/flows/${flowId}`);
        if (!response.ok) throw new Error("Failed to load flow");
        const data = await response.json();
        setFlow(data);

        // Convert blocks to React Flow nodes
        const flowNodes = (data.blocks || data.flow_blocks || []).map((block: BlockData) => ({
          id: block.id,
          data: {
            label: `${block.type}`,
            type: block.type,
            config: block.config,
          },
          position: { x: block.positionX, y: block.positionY },
          type: "block",
        }));

        // Convert connections to React Flow edges
        const flowEdges = (data.connections || data.flow_connections || []).map((conn: ConnectionData) => ({
          id: conn.id,
          source: conn.fromBlockId,
          target: conn.toBlockId,
          label: conn.label || "",
          animated: true,
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    loadFlow();
  }, [flowId, setNodes, setEdges]);

  // Handle new connection
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  // Handle adding a block
  const handleAddBlock = useCallback(
    async (blockType: string) => {
      try {
        const response = await fetch(`/api/flows/${flowId}/blocks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: blockType,
            config: {},
            positionX: 250,
            positionY: 150 + Math.random() * 100,
          }),
        });

        if (!response.ok) throw new Error("Failed to create block");
        const block = await response.json();

        const newNode: Node = {
          id: block.id,
          data: { label: blockType, type: blockType, config: block.config },
          position: { x: block.positionX, y: block.positionY },
          type: "block",
        };

        setNodes((nds) => [...nds, newNode]);
        setSelectedNodeId(block.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [flowId, setNodes]
  );

  // Handle saving flow
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Save node positions
      for (const node of nodes) {
        await fetch(`/api/flows/${flowId}/blocks/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            positionX: Math.round(node.position.x),
            positionY: Math.round(node.position.y),
          }),
        });
      }

      // Get existing connections from API
      const connectionsResponse = await fetch(`/api/flows/${flowId}/connections`);
      const existingConnections = await connectionsResponse.json();
      const existingConnectionIds = new Set(existingConnections.map((c: any) => c.id));

      // Delete connections that are no longer in the flow
      for (const conn of existingConnections) {
        const stillExists = edges.some((e) => e.id === conn.id);
        if (!stillExists) {
          await fetch(`/api/flows/${flowId}/connections/${conn.id}`, {
            method: "DELETE",
          });
        }
      }

      // Create new connections or update existing
      for (const edge of edges) {
        if (existingConnectionIds.has(edge.id)) {
          // Update existing connection
          await fetch(`/api/flows/${flowId}/connections/${edge.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: edge.label,
            }),
          });
        } else {
          // Create new connection
          await fetch(`/api/flows/${flowId}/connections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fromBlockId: edge.source,
              toBlockId: edge.target,
              label: edge.label,
            }),
          });
        }
      }

      alert("Fluxo salvo com sucesso!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [flowId, nodes, edges]);

  // Handle delete block
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        await fetch(`/api/flows/${flowId}/blocks/${nodeId}`, {
          method: "DELETE",
        });
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNodeId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [flowId, setNodes, setEdges]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Carregando fluxo...</p>
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Erro ao carregar fluxo: {error}</p>
        <button
          onClick={() => router.push("/flows")}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Voltar
        </button>
      </div>
    );
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Palette Sidebar */}
      <BlockPalette onAddBlock={handleAddBlock} />

      {/* Main Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{flow.name}</h1>
            <p className="text-sm text-gray-600">{flow.description || "Sem descrição"}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={() => router.push("/flows")}
              className="px-6 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
            >
              Voltar
            </button>
          </div>
        </div>

        {/* Canvas and Config Container */}
        <div className="flex-1 flex gap-4 p-4">
          {/* React Flow Canvas */}
          <div className="flex-1 bg-white rounded-lg shadow">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          {/* Config Panel */}
          {selectedNode && (
            <ConfigPanel
              node={selectedNode}
              onDelete={() => handleDeleteNode(selectedNode.id)}
              onConfigChange={(config) => {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === selectedNode.id ? { ...n, data: { ...n.data, config } } : n
                  )
                );
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
