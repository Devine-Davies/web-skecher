import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_DIAGRAM_SPEC, SAMPLE_SOURCE_DOCUMENT } from '@/shared/constants';
import { CompatibleProvider } from '@/core/ai/providers/compatible';
import { AnthropicProvider } from '@/core/ai/providers/anthropic';
import { runDiagramGenerationFlow } from '@/core/ai/generation';
import {
  clearAllStoredData,
  loadUserSettings,
  saveUserSettings,
} from '@/core/storage';
import {
  loadMCPSecret,
  loadProfileCredential,
  saveMCPSecret,
} from '@/core/security/credentials';
import { callMCPTool, testMCPConnection, type MCPTool } from '@/core/mcp/client';
import { requestEndpointAccess } from '@/core/security/host-permissions';
import { getProviderApprovalKey } from '@/core/security/provider-approval';
import type { MCPConnection } from '@/shared/types';

const mcpConnection: MCPConnection = {
  id: 'test-mcp',
  name: 'Test MCP',
  endpoint: 'https://mcp.excalidraw.com',
  transport: 'streamable-http',
  enabled: true,
  status: 'disconnected',
  allowedTools: [],
  authMode: 'none',
  approved: true,
  approvedEndpoint: 'https://mcp.excalidraw.com',
};

describe('Volume 06 — Additional Connections', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await clearAllStoredData();
  });

  it('keeps credentials separate for saved profiles and MCP connections', async () => {
    const settings = await loadUserSettings();
    const profiles = [
      {
        ...settings.profiles[0],
        id: 'profile-openai',
        apiKey: 'profile-openai-test-secret',
      },
      {
        id: 'profile-anthropic',
        name: 'Anthropic work',
        providerId: 'anthropic' as const,
        modelId: 'claude-3-5-sonnet-latest',
        apiKey: 'profile-anthropic-test-secret',
        timeoutMs: 30000,
      },
    ];
    await saveUserSettings({
      ...settings,
      profiles,
      activeProfileId: profiles[0].id,
    });

    await saveMCPSecret('test-mcp', 'mcp-test-secret', false);

    const storedMetadata = localStorage.getItem('visualise_page_settings_v1') ?? '';
    expect(storedMetadata).not.toContain('profile-openai-test-secret');
    expect(storedMetadata).not.toContain('profile-anthropic-test-secret');
    expect(storedMetadata).not.toContain('mcp-test-secret');
    expect(
      localStorage.getItem('visualise_page_consented_local_keys_v1')
    ).toBe('{}');
    expect(
      sessionStorage.getItem('visualise_page_session_keys_v1')
    ).toContain('profile-openai-test-secret');
    expect(await loadProfileCredential('profile-openai')).toBe(
      'profile-openai-test-secret'
    );
    expect(await loadProfileCredential('profile-anthropic')).toBe(
      'profile-anthropic-test-secret'
    );
    expect(await loadMCPSecret('test-mcp')).toBe('mcp-test-secret');

    const reloaded = await loadUserSettings();
    expect(reloaded.profiles.map((profile) => profile.id)).toEqual([
      'profile-openai',
      'profile-anthropic',
    ]);
    expect(reloaded.activeProfileId).toBe('profile-openai');
    await saveUserSettings({
      ...reloaded,
      profiles: [reloaded.profiles[0]],
    });
    expect(await loadProfileCredential('profile-anthropic')).toBe('');
  });

  it('scopes remembered page-sharing approvals to the exact provider profile and endpoint', () => {
    const profile = {
      id: 'team-model',
      name: 'Team model',
      providerId: 'custom' as const,
      modelId: 'model-a',
      baseUrl: 'https://models.example.test/v1',
      timeoutMs: 30000,
    };
    const approval = getProviderApprovalKey('custom', profile);
    expect(getProviderApprovalKey('custom', { ...profile })).toBe(approval);
    expect(
      getProviderApprovalKey('custom', {
        ...profile,
        baseUrl: 'https://other.example.test/v1',
      })
    ).not.toBe(approval);
    expect(
      getProviderApprovalKey('ollama', {
        ...profile,
        providerId: 'ollama',
      })
    ).not.toBe(approval);
  });

  it('moves persisted MCP credentials back to session storage when persistence is disabled', async () => {
    const settings = await loadUserSettings();
    const connection: MCPConnection = {
      ...mcpConnection,
      id: 'persistent-mcp',
      endpoint: 'https://mcp.example.test',
      approvedEndpoint: 'https://mcp.example.test',
    };
    await saveMCPSecret(connection.id, 'persistent-mcp-test-token', true);
    await saveUserSettings({
      ...settings,
      persistCredentialsLocally: false,
      mcpConnections: [...settings.mcpConnections, connection],
    });

    expect(
      localStorage.getItem('visualise_page_consented_local_keys_v1')
    ).not.toContain('persistent-mcp-test-token');
    expect(
      sessionStorage.getItem('visualise_page_session_keys_v1')
    ).toContain('persistent-mcp-test-token');
    expect(await loadMCPSecret(connection.id)).toBe('persistent-mcp-test-token');
  });

  it('sends a custom OpenAI-compatible request only after exact endpoint approval', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify(SAMPLE_DIAGRAM_SPEC) } },
          ],
        }),
        { status: 200 }
      )
    );
    const provider = new CompatibleProvider({
      providerId: 'custom',
      modelId: 'org-model',
      baseUrl: 'https://models.example.test/v1',
      approvedEndpoint: 'https://models.example.test/v1',
      additionalHeaders: {
        'x-project-id': 'diagram-team',
        Authorization: 'not-accepted',
        'x-api-key': 'not-accepted',
      },
      fetchFn,
    });

    const diagram = await provider.generateDiagram({
      sourceDocument: SAMPLE_SOURCE_DOCUMENT,
      diagramType: 'flowchart',
      complexity: 'simple',
      modelId: 'org-model',
    });
    expect(diagram.id).toBe(SAMPLE_DIAGRAM_SPEC.id);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://models.example.test/v1/chat/completions');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-project-id']).toBe('diagram-team');
    expect(headers.Authorization).toBeUndefined();

    const unapproved = new CompatibleProvider({
      providerId: 'custom',
      baseUrl: 'https://models.example.test/v1',
      fetchFn,
    });
    await expect(
      unapproved.generateDiagram({
        sourceDocument: SAMPLE_SOURCE_DOCUMENT,
        diagramType: 'flowchart',
        complexity: 'simple',
        modelId: 'org-model',
      })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const privateEndpoint = new CompatibleProvider({
      providerId: 'custom',
      baseUrl: 'https://[fd00::1]/v1',
      approvedEndpoint: 'https://[fd00::1]/v1',
      fetchFn,
    });
    expect((await privateEndpoint.validateConfig()).message).toContain(
      'public HTTPS endpoint'
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('limits Ollama to localhost and explains browser CORS or connectivity failures', async () => {
    const blockedFetch = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    const provider = new CompatibleProvider({
      providerId: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      fetchFn: blockedFetch,
    });
    const result = await provider.validateConfig();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('OLLAMA_ORIGINS');
    expect(result.message).toContain('CORS');
    expect(blockedFetch).toHaveBeenCalledOnce();

    const remoteOllama = new CompatibleProvider({
      providerId: 'ollama',
      baseUrl: 'http://192.168.1.25:11434/v1',
      fetchFn: blockedFetch,
    });
    expect((await remoteOllama.validateConfig()).message).toContain(
      'limited to localhost'
    );
    expect(blockedFetch).toHaveBeenCalledOnce();
  });

  it('uses the Anthropic Messages API for generation and refinement', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(SAMPLE_DIAGRAM_SPEC) }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  baseDiagramId: SAMPLE_DIAGRAM_SPEC.id,
                  baseVersion: 1,
                  operations: [
                    {
                      type: 'update_node',
                      id: 'n1',
                      changes: { label: 'Updated label' },
                    },
                  ],
                }),
              },
            ],
          }),
          { status: 200 }
        )
      );
    const provider = new AnthropicProvider({
      apiKey: 'sk-ant-test-key-not-real',
      fetchFn,
    });
    const generated = await provider.generateDiagram({
      sourceDocument: SAMPLE_SOURCE_DOCUMENT,
      diagramType: 'flowchart',
      complexity: 'simple',
      modelId: 'claude-3-5-sonnet-latest',
    });
    const patch = await provider.refineDiagram({
      currentDiagram: generated,
      currentVersion: 1,
      instruction: 'Keep the diagram as-is',
      modelId: 'claude-3-5-sonnet-latest',
    });

    expect(generated.id).toBe(SAMPLE_DIAGRAM_SPEC.id);
    expect(patch.operations).toHaveLength(1);
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('initializes Streamable HTTP MCP, discovers schemas, and requires per-tool consent', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: { name: 'Excalidraw MCP', version: 'test' },
            },
          }),
          {
            status: 200,
            headers: { 'MCP-Session-Id': 'test-session' },
          }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: {
              tools: [
                {
                  name: 'create_view',
                  description: 'Create a view',
                  inputSchema: {
                    type: 'object',
                    required: ['elements'],
                    properties: { elements: { type: 'string' } },
                  },
                },
              ],
            },
          }),
          { status: 200 }
        )
      );
    const result = await testMCPConnection(mcpConnection, { fetchFn });
    expect(result.ok).toBe(true);
    expect(result.discoveredTools[0]).toMatchObject({
      name: 'create_view',
      inputSchema: { required: ['elements'] },
    });
    expect(fetchFn.mock.calls[0][0]).toBe('https://mcp.excalidraw.com/mcp');
    expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toMatchObject({
      method: 'initialize',
    });
    expect(
      (fetchFn.mock.calls[2][1]?.headers as Record<string, string>)[
        'MCP-Session-Id'
      ]
    ).toBe('test-session');

    const deniedFetch = vi.fn<typeof fetch>();
    const denied = await testMCPConnection(
      { ...mcpConnection, approved: false },
      { fetchFn: deniedFetch }
    );
    expect(denied.ok).toBe(false);
    expect(deniedFetch).not.toHaveBeenCalled();

    const tool = result.discoveredTools[0] as MCPTool;
    const allowedConnection = {
      ...mcpConnection,
      allowedTools: ['create_view'],
    };
    const confirmPageContent = vi.fn().mockResolvedValue(false);
    await expect(
      callMCPTool({
        connection: allowedConnection,
        tool,
        arguments: { elements: '[]' },
        fetchFn,
        confirmPageContent,
      })
    ).rejects.toThrow(/cancelled/);
    expect(confirmPageContent).toHaveBeenCalledOnce();
  });

  it('rejects MCP calls for unapproved tools and invalid input schemas', async () => {
    const tool: MCPTool = {
      name: 'read_me',
      inputSchema: {
        type: 'object',
        required: ['topic'],
        properties: { topic: { type: 'string' } },
      },
    };
    const fetchFn = vi.fn<typeof fetch>();
    const confirmPageContent = vi.fn().mockResolvedValue(true);

    await expect(
      callMCPTool({
        connection: mcpConnection,
        tool,
        arguments: {},
        fetchFn,
        confirmPageContent,
      })
    ).rejects.toThrow(/not been permitted/);

    await expect(
      callMCPTool({
        connection: { ...mcpConnection, allowedTools: ['read_me'] },
        tool,
        arguments: {},
        fetchFn,
        confirmPageContent,
      })
    ).rejects.toThrow(/topic is required/);
    expect(fetchFn).not.toHaveBeenCalled();

    fetchFn.mockImplementation(async (_input, init) => {
      const method =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as { method?: string }).method
          : undefined;
      if (init?.method === 'DELETE') return new Response(null, { status: 200 });
      if (method === 'initialize') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: { name: 'Test MCP' },
            },
          }),
          { status: 200, headers: { 'MCP-Session-Id': 'call-session' } }
        );
      }
      if (method === 'tools/list') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: { tools: [tool] },
          }),
          { status: 200 }
        );
      }
      if (method === 'tools/call') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            result: { content: [{ type: 'text', text: 'Tool result' }] },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 202 });
    });
    const result = await callMCPTool({
      connection: { ...mcpConnection, allowedTools: ['read_me'] },
      tool,
      arguments: { topic: 'diagram' },
      fetchFn,
      confirmPageContent,
    });
    expect(result).toMatchObject({
      content: [{ type: 'text', text: 'Tool result' }],
    });
    expect(fetchFn.mock.calls.some(([, init]) => {
      if (typeof init?.body !== 'string') return false;
      return (
        (JSON.parse(init.body) as { method?: string }).method === 'tools/call'
      );
    })).toBe(true);
  });

  it('requests only the selected host and keeps local rendering available after MCP failure', async () => {
    const requestPermission = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', { permissions: { request: requestPermission } });
    expect(
      await requestEndpointAccess('https://service.example.test:8443/mcp')
    ).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({
      origins: ['https://service.example.test/*'],
    });
    vi.unstubAllGlobals();

    const unavailable = await testMCPConnection(mcpConnection, {
      fetchFn: vi.fn<typeof fetch>().mockRejectedValue(
        new TypeError('Failed to fetch')
      ),
    });
    expect(unavailable.ok).toBe(false);

    const localDiagram = await runDiagramGenerationFlow({
      sourceDocument: SAMPLE_SOURCE_DOCUMENT,
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      diagramType: 'flowchart',
      complexity: 'simple',
    });
    expect(localDiagram.generationMode).toBe('local_heuristic');
    expect(localDiagram.scene.type).toBe('excalidraw');
  });
});
