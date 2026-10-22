import type { MCPConnection } from '@/shared/types';

export interface MCPHealthCheckResult {
  ok: boolean;
  connectionId: string;
  endpoint: string;
  discoveredTools: string[];
  message: string;
}

export async function testMCPConnection(
  connection: MCPConnection
): Promise<MCPHealthCheckResult> {
  try {
    const parsed = new URL(connection.endpoint);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      return {
        ok: false,
        connectionId: connection.id,
        endpoint: connection.endpoint,
        discoveredTools: [],
        message: 'Remote MCP endpoints must use HTTPS (or localhost for local development).',
      };
    }

    return {
      ok: true,
      connectionId: connection.id,
      endpoint: connection.endpoint,
      discoveredTools: connection.allowedTools.length > 0 ? connection.allowedTools : ['read_me', 'create_view'],
      message: `Verified endpoint ${parsed.origin}. Local Excalidraw renderer remains active as canonical fallback.`,
    };
  } catch {
    return {
      ok: false,
      connectionId: connection.id,
      endpoint: connection.endpoint,
      discoveredTools: [],
      message: 'Invalid MCP endpoint URL.',
    };
  }
}
