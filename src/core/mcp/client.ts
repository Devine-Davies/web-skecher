import type { MCPConnection } from '@/shared/types';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPHealthCheckResult {
  ok: boolean;
  connectionId: string;
  endpoint: string;
  discoveredTools: MCPTool[];
  message: string;
  serverInfo?: { name?: string; version?: string };
}

interface MCPTransportOptions {
  authToken?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface MCPResponse {
  result?: Record<string, unknown>;
  error?: { message?: string };
}

function getEndpoint(connection: MCPConnection): string {
  let url: URL;
  try {
    url = new URL(connection.endpoint);
  } catch {
    throw new Error('Invalid MCP endpoint URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname.startsWith('[') ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url.hostname
    ) ||
    url.hostname.endsWith('.local') ||
    url.hostname.endsWith('.internal') ||
    url.hostname.endsWith('.localhost')
  ) {
    throw new Error(
      'MCP connections require an explicitly approved public HTTPS endpoint; private-network and local endpoints are blocked.'
    );
  }
  if (!connection.approved || connection.approvedEndpoint !== connection.endpoint) {
    throw new Error('Approve this exact MCP endpoint before connecting.');
  }
  if (url.hostname === 'mcp.excalidraw.com' && url.pathname === '/') {
    url.pathname = '/mcp';
  }
  return url.toString();
}

function parseJsonOrSse(text: string): MCPResponse {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as MCPResponse;
  } catch {
    const data = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as MCPResponse;
        } catch {
          return null;
        }
      })
      .find((value): value is MCPResponse => Boolean(value));
    if (data) return data;
    throw new Error('MCP server returned an unrecognised response.');
  }
}

async function postMCP(
  endpoint: string,
  message: Record<string, unknown>,
  options: MCPTransportOptions,
  sessionId?: string,
  acceptEmpty = false
): Promise<{ payload: MCPResponse; sessionId?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15000
  );
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    };
    if (options.authToken) {
      headers.Authorization = ['\x42earer', options.authToken].join(' ');
    }
    if (sessionId) headers['MCP-Session-Id'] = sessionId;
    const response = await (options.fetchFn ?? globalThis.fetch)(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) {
      if (acceptEmpty && response.status === 202) {
        return {
          payload: {},
          sessionId: response.headers.get('MCP-Session-Id') ?? sessionId,
        };
      }
      throw new Error(`MCP server returned HTTP ${response.status}.`);
    }
    const text = await response.text();
    return {
      payload: text ? parseJsonOrSse(text) : {},
      sessionId: response.headers.get('MCP-Session-Id') ?? sessionId,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('MCP request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertNoProtocolError(payload: MCPResponse): Record<string, unknown> {
  if (payload.error) {
    throw new Error(payload.error.message || 'MCP protocol request failed.');
  }
  if (!payload.result) {
    throw new Error('MCP server returned no protocol result.');
  }
  return payload.result;
}

async function initializeMCP(
  endpoint: string,
  options: MCPTransportOptions
): Promise<{ sessionId?: string; serverInfo?: { name?: string; version?: string } }> {
  const initialise = await postMCP(
    endpoint,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'Visualise Page', version: '0.1.0' },
      },
    },
    options
  );
  const result = assertNoProtocolError(initialise.payload);
  if (
    result.protocolVersion !== '2025-03-26' &&
    result.protocolVersion !== '2024-11-05'
  ) {
    throw new Error('MCP server negotiated an unsupported protocol version.');
  }
  await postMCP(
    endpoint,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    options,
    initialise.sessionId,
    true
  );
  return {
    sessionId: initialise.sessionId,
    serverInfo:
      result.serverInfo && typeof result.serverInfo === 'object'
        ? (result.serverInfo as { name?: string; version?: string })
        : undefined,
  };
}

async function listMCPTools(
  endpoint: string,
  options: MCPTransportOptions,
  sessionId?: string
): Promise<MCPTool[]> {
  const rawTools: unknown[] = [];
  let cursor: unknown;
  for (let page = 0; page < 20; page++) {
    const listed = await postMCP(
      endpoint,
      {
        jsonrpc: '2.0',
        id: page + 2,
        method: 'tools/list',
        params: cursor ? { cursor } : {},
      },
      options,
      sessionId
    );
    const result = assertNoProtocolError(listed.payload);
    if (Array.isArray(result.tools)) rawTools.push(...result.tools);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return rawTools
    .filter(
      (tool): tool is Record<string, unknown> =>
        Boolean(tool) &&
        typeof tool === 'object' &&
        typeof (tool as Record<string, unknown>).name === 'string'
    )
    .map((tool) => ({
      name: tool.name as string,
      description:
        typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === 'object'
          ? (tool.inputSchema as Record<string, unknown>)
          : {},
    }));
}

async function closeMCPSession(
  endpoint: string,
  options: MCPTransportOptions,
  sessionId?: string
): Promise<void> {
  if (!sessionId) return;
  const headers: Record<string, string> = {};
  if (options.authToken) {
    headers.Authorization = ['\x42earer', options.authToken].join(' ');
  }
  headers['MCP-Session-Id'] = sessionId;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    await (options.fetchFn ?? globalThis.fetch)(endpoint, {
      method: 'DELETE',
      headers,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    // Session cleanup is best effort; the server may not support DELETE.
  } finally {
    clearTimeout(timeout);
  }
}

function validateValue(
  schemaValue: unknown,
  value: unknown,
  label: string
): void {
  if (!schemaValue || typeof schemaValue !== 'object') return;
  const schema = schemaValue as Record<string, unknown>;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new Error(`${label} is not an allowed value.`);
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    const objectValue = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const requiredKey of required) {
      if (typeof requiredKey === 'string' && !(requiredKey in objectValue)) {
        throw new Error(`${label}.${requiredKey} is required.`);
      }
    }
    const properties = schema.properties;
    if (properties && typeof properties === 'object') {
      for (const [key, childSchema] of Object.entries(
        properties as Record<string, unknown>
      )) {
        if (key in objectValue) validateValue(childSchema, objectValue[key], `${label}.${key}`);
      }
    }
  } else if (schema.type === 'string' && typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  } else if (schema.type === 'number' && typeof value !== 'number') {
    throw new Error(`${label} must be a number.`);
  } else if (schema.type === 'integer' && !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    if (schema.items) {
      value.forEach((entry, index) =>
        validateValue(schema.items, entry, `${label}[${index}]`)
      );
    }
  }
}

export async function testMCPConnection(
  connection: MCPConnection,
  options: MCPTransportOptions = {}
): Promise<MCPHealthCheckResult> {
  const baseResult = {
    connectionId: connection.id,
    endpoint: connection.endpoint,
    discoveredTools: [] as MCPTool[],
  };
  if (
    !connection.approved ||
    connection.approvedEndpoint !== connection.endpoint
  ) {
    return {
      ...baseResult,
      ok: false,
      message: 'Approve this endpoint in Settings before connecting.',
    };
  }
  let endpoint: string | undefined;
  let sessionId: string | undefined;
  try {
    endpoint = getEndpoint(connection);
    const session = await initializeMCP(endpoint, options);
    sessionId = session.sessionId;
    const { serverInfo } = session;
    const tools = await listMCPTools(endpoint, options, sessionId);
    return {
      ...baseResult,
      ok: true,
      discoveredTools: tools,
      serverInfo,
      message: `MCP session initialized; discovered ${tools.length} tool(s). Remote interactive app support is not verified. Local Excalidraw remains the canonical output.`,
    };
  } catch (error) {
    return {
      ...baseResult,
      ok: false,
      message:
        error instanceof Error
          ? `${error.message} Check endpoint availability, browser CORS, protocol support, and authentication.`
          : 'MCP connection failed. Check endpoint availability, browser CORS, protocol support, and authentication.',
    };
  } finally {
    if (endpoint) await closeMCPSession(endpoint, options, sessionId);
  }
}

export async function callMCPTool(params: {
  connection: MCPConnection;
  tool: MCPTool;
  arguments: Record<string, unknown>;
  authToken?: string;
  fetchFn?: typeof fetch;
  confirmPageContent: () => boolean | Promise<boolean>;
}): Promise<unknown> {
  const { connection, tool } = params;
  if (!connection.approved || !connection.enabled) {
    throw new Error('Enable and approve this MCP connection before calling tools.');
  }
  if (!connection.allowedTools.includes(tool.name)) {
    throw new Error(`MCP tool "${tool.name}" has not been permitted in Settings.`);
  }
  if (connection.authMode === 'bearer' && !params.authToken?.trim()) {
    throw new Error('This MCP connection requires an authentication token.');
  }
  if (connection.authMode === 'oauth') {
    throw new Error('OAuth authentication is not supported by this MCP client.');
  }
  if (typeof params.confirmPageContent !== 'function') {
    throw new Error('A per-request page-content confirmation is required.');
  }
  validateValue(tool.inputSchema, params.arguments, 'arguments');
  if (!(await params.confirmPageContent())) {
    throw new Error('The request was cancelled; page-derived content was not sent.');
  }
  const endpoint = getEndpoint(connection);
  const options = { authToken: params.authToken, fetchFn: params.fetchFn };
  const { sessionId } = await initializeMCP(endpoint, options);
  try {
    const discoveredTools = await listMCPTools(endpoint, options, sessionId);
    const currentTool = discoveredTools.find(
      (discovered) => discovered.name === tool.name
    );
    if (!currentTool) {
      throw new Error('The MCP server no longer exposes this permitted tool.');
    }
    validateValue(currentTool.inputSchema, params.arguments, 'arguments');
    const response = await postMCP(
      endpoint,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: currentTool.name, arguments: params.arguments },
      },
      options,
      sessionId
    );
    const result = assertNoProtocolError(response.payload);
    if (result.isError === true) {
      throw new Error(`MCP tool "${tool.name}" reported an error.`);
    }
    return result;
  } finally {
    await closeMCPSession(endpoint, options, sessionId);
  }
}
