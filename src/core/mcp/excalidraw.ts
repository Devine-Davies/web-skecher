import type { MCPConnection } from '@/shared/types';

export const EXCALIDRAW_MCP_PRESET: MCPConnection = {
  id: 'excalidraw-mcp-preset',
  name: 'Excalidraw MCP (Official Preset)',
  endpoint: 'https://mcp.excalidraw.com',
  transport: 'streamable-http',
  enabled: false,
  status: 'disconnected',
  allowedTools: ['read_me', 'create_view'],
  authMode: 'none',
};
