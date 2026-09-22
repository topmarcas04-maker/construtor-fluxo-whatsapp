/**
 * FLOW VALIDATION — Validar e detectar problemas em fluxos
 *
 * Validações:
 * - Ciclos infinitos
 * - Blocos órfãos
 * - Conexões inválidas
 * - START/END obrigatórios
 */

interface FlowBlock {
  id: string;
  type: string;
}

interface FlowConnection {
  id: string;
  fromBlockId: string;
  toBlockId: string;
}

interface ValidationError {
  type: "error" | "warning";
  message: string;
  blockIds?: string[];
}

/**
 * Validar fluxo completo
 */
export function validateFlow(
  blocks: FlowBlock[],
  connections: FlowConnection[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Verificar se há bloco START
  const hasStart = blocks.some((b) => b.type === "START");
  if (!hasStart) {
    errors.push({
      type: "error",
      message: "Fluxo deve ter um bloco START",
    });
  }

  // 2. Verificar se há bloco END
  const hasEnd = blocks.some((b) => b.type === "END");
  if (!hasEnd) {
    errors.push({
      type: "warning",
      message: "Recomendado ter um bloco END no fluxo",
    });
  }

  // 3. Verificar ciclos
  const cycles = detectCycles(blocks, connections);
  if (cycles.length > 0) {
    errors.push({
      type: "error",
      message: `Ciclo infinito detectado: ${cycles
        .map((c) => `${c[0]} → ${c[1]}`)
        .join(", ")}`,
      blockIds: cycles.flat(),
    });
  }

  // 4. Verificar blocos órfãos
  const orphanedBlockIds = findOrphanedBlocks(blocks, connections);
  if (orphanedBlockIds.length > 0 && blocks.length > 1) {
    errors.push({
      type: "warning",
      message: `Blocos órfãos encontrados (não conectados): ${orphanedBlockIds.length}`,
      blockIds: orphanedBlockIds,
    });
  }

  // 5. Verificar conexões inválidas
  const invalidConnections = findInvalidConnections(blocks, connections);
  if (invalidConnections.length > 0) {
    errors.push({
      type: "error",
      message: `Conexões inválidas: ${invalidConnections.length}`,
      blockIds: invalidConnections.flat(),
    });
  }

  return errors;
}

/**
 * Detectar ciclos no grafo usando DFS
 */
function detectCycles(
  blocks: FlowBlock[],
  connections: FlowConnection[]
): string[][] {
  const blockIds = new Set(blocks.map((b) => b.id));
  const graph = new Map<string, string[]>();

  // Construir grafo
  for (const block of blocks) {
    graph.set(block.id, []);
  }

  for (const conn of connections) {
    if (graph.has(conn.fromBlockId)) {
      graph.get(conn.fromBlockId)!.push(conn.toBlockId);
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recursionStack.has(neighbor)) {
        // Ciclo encontrado
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat([neighbor]));
        }
      }
    }

    recursionStack.delete(nodeId);
  }

  for (const blockId of blockIds) {
    if (!visited.has(blockId)) {
      dfs(blockId, []);
    }
  }

  return cycles;
}

/**
 * Encontrar blocos órfãos (não conectados ao START ou não levam a END)
 */
function findOrphanedBlocks(
  blocks: FlowBlock[],
  connections: FlowConnection[]
): string[] {
  const blockIds = new Set(blocks.map((b) => b.id));
  const connectedIds = new Set<string>();

  // Todos os blocos que têm conexão de/para
  for (const conn of connections) {
    connectedIds.add(conn.fromBlockId);
    connectedIds.add(conn.toBlockId);
  }

  // START sempre está "conectado"
  for (const block of blocks) {
    if (block.type === "START") {
      connectedIds.add(block.id);
    }
  }

  const orphaned: string[] = [];
  for (const id of blockIds) {
    if (!connectedIds.has(id)) {
      orphaned.push(id);
    }
  }

  return orphaned;
}

/**
 * Encontrar conexões para blocos que não existem
 */
function findInvalidConnections(
  blocks: FlowBlock[],
  connections: FlowConnection[]
): string[] {
  const blockIds = new Set(blocks.map((b) => b.id));
  const invalid: string[] = [];

  for (const conn of connections) {
    if (!blockIds.has(conn.fromBlockId) || !blockIds.has(conn.toBlockId)) {
      invalid.push(conn.fromBlockId, conn.toBlockId);
    }
  }

  return [...new Set(invalid)];
}

/**
 * Resumo de validação para exibição
 */
export function getSummary(errors: ValidationError[]): {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
} {
  const errorCount = errors.filter((e) => e.type === "error").length;
  const warningCount = errors.filter((e) => e.type === "warning").length;

  return {
    isValid: errorCount === 0,
    errorCount,
    warningCount,
  };
}
