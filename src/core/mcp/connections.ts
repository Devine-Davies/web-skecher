import type { MCPConnection } from '@/shared/types';
import { EXCALIDRAW_MCP_PRESET } from './excalidraw';

export function getDefaultMCPConnections(): MCPConnection[] {
  return [{ ...EXCALIDRAW_MCP_PRESET }];
}
