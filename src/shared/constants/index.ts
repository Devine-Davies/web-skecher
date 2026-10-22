import type {
  AIProviderId,
  ComplexityLevel,
  DiagramSpec,
  DiagramType,
  GenerationStageId,
  SourceDocument,
  UserSettings,
} from '../types';

export const STORAGE_KEYS = {
  USER_SETTINGS: 'visualise_page_settings_v1',
  SAVED_DIAGRAMS: 'visualise_page_saved_diagrams_v1',
  LAST_EXTRACTION: 'visualise_page_last_extraction_v1',
} as const;

export const CONTEXT_MENU_IDS = {
  VISUALISE_PAGE: 'visualise-this-page',
  VISUALISE_SELECTION: 'visualise-selected-text',
} as const;

export interface DiagramStyleMeta {
  id: DiagramType;
  label: string;
  description: string;
}

export const DIAGRAM_STYLE_OPTIONS: DiagramStyleMeta[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    description: 'Best for procedures, decision-making and sequential relationships.',
  },
  {
    id: 'mindmap',
    label: 'Mind map',
    description: 'Best for exploring a central subject and branching ideas.',
  },
  {
    id: 'concept_map',
    label: 'Concept map',
    description: 'Best for explaining relationships among concepts.',
  },
  {
    id: 'infographic',
    label: 'Infographic',
    description:
      'Best for visual poster summaries, key takeaways, highlights and structured Bento cards.',
  },
];

export interface ComplexityPresetMeta {
  id: ComplexityLevel;
  label: string;
  targetNodes: string;
  minNodes: number;
  maxNodes: number;
  behaviour: string;
}

export const COMPLEXITY_PRESETS: ComplexityPresetMeta[] = [
  {
    id: 'simple',
    label: 'Simple',
    targetNodes: '4–8',
    minNodes: 4,
    maxNodes: 8,
    behaviour: 'Main ideas only, beginner-friendly text',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    targetNodes: '8–15',
    minNodes: 8,
    maxNodes: 15,
    behaviour: 'Major ideas and useful relationships',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    targetNodes: '15–30',
    minNodes: 15,
    maxNodes: 30,
    behaviour: 'Deeper explanation, examples and dependencies',
  },
];

export interface ProviderCatalogEntry {
  id: AIProviderId;
  name: string;
  tier: 'MVP' | 'P1';
  defaultModel: string;
  models: { id: string; label: string }[];
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
}

export const AI_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'copilot',
    name: 'Copilot CLI (Local Bridge)',
    tier: 'MVP',
    defaultModel: 'auto',
    models: [
      { id: 'auto', label: 'Auto (Copilot Default)' },
      { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-opus-5.5', label: 'Claude Opus 5.5' },
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-haiku-5.5', label: 'Claude Haiku 5.5 (Fast)' },
      { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (Fast)' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'grok-4.7', label: 'Grok 4.7' },
    ],
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:4317/v1',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tier: 'MVP',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (Fast & structured)' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
    ],
    requiresApiKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    tier: 'P1',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-opus-5.5', label: 'Claude Opus 5.5' },
      { id: 'claude-haiku-5.5', label: 'Claude Haiku 5.5' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
    ],
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    tier: 'P1',
    defaultModel: 'llama3.2',
    models: [
      { id: 'llama3.2', label: 'Llama 3.2 (Local)' },
      { id: 'qwen2.5-coder', label: 'Qwen 2.5 Coder (Local)' },
      { id: 'deepseek-r1', label: 'DeepSeek R1 (Local)' },
      { id: 'mistral', label: 'Mistral (Local)' },
    ],
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:11434',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    tier: 'P1',
    defaultModel: 'custom-model',
    models: [{ id: 'custom-model', label: 'Custom Endpoint Model' }],
    requiresApiKey: false,
    defaultBaseUrl: 'https://api.example.com/v1',
  },
];

export interface GenerationStageMeta {
  id: GenerationStageId;
  stepNumber: number;
  label: string;
}

export const GENERATION_STAGES: GenerationStageMeta[] = [
  { id: 'reading_webpage', stepNumber: 1, label: 'Reading webpage' },
  { id: 'identifying_concepts', stepNumber: 2, label: 'Identifying concepts' },
  { id: 'designing_diagram', stepNumber: 3, label: 'Designing diagram' },
  { id: 'creating_elements', stepNumber: 4, label: 'Creating Excalidraw elements' },
  { id: 'opening_result', stepNumber: 5, label: 'Opening result' },
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  onboardingCompleted: false,
  activeProviderId: 'openai',
  activeModelId: 'gpt-4o-mini',
  defaultDiagramType: 'flowchart',
  defaultComplexity: 'simple',
  defaultOutputDestination: 'local_excalidraw',
  theme: 'system',
  requireDataSharingConfirmation: true,
  persistCredentialsLocally: true,
  approvedProviders: [],
  profiles: [
    {
      id: 'default-openai',
      name: 'OpenAI — Everyday explanations',
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      apiKey: '',
      timeoutMs: 30000,
    },
  ],
  mcpConnections: [
    {
      id: 'excalidraw-mcp-preset',
      name: 'Excalidraw MCP (Official Preset)',
      endpoint: 'https://mcp.excalidraw.com',
      transport: 'streamable-http',
      enabled: false,
      status: 'disconnected',
      allowedTools: ['read_me', 'create_view'],
      authMode: 'none',
    },
  ],
};

export const SAMPLE_SOURCE_DOCUMENT: SourceDocument = {
  id: 'article-001',
  url: 'https://www.smashingmagazine.com/2026/08/how-baseline-can-help-ship-less-javascript/',
  title: 'How Baseline Can Help You Ship Less JavaScript',
  siteName: 'Smashing Magazine',
  language: 'en',
  extractedAt: '2026-10-21T00:00:00Z',
  contentHash: 'baseline-sha256-sample',
  wordCount: 412,
  sections: [
    {
      id: 's1',
      heading: 'Auditing JavaScript Dependencies',
      headingLevel: 2,
      type: 'paragraph',
      text: 'Modern web projects frequently include utility and UI libraries for features that browsers now support natively.',
    },
    {
      id: 's2',
      heading: 'Checking Native Browser APIs',
      headingLevel: 2,
      type: 'paragraph',
      text: 'Before adding or keeping a dependency, check whether a standard Web API covers the same requirement.',
    },
    {
      id: 's3',
      heading: 'Using Web Platform Baseline',
      headingLevel: 2,
      type: 'paragraph',
      text: 'Baseline clarifies which web platform features work consistently across core browser engines.',
    },
    {
      id: 's4',
      heading: 'Adopting Native APIs or Retaining Fallbacks',
      headingLevel: 2,
      type: 'paragraph',
      text: 'When Baseline status meets your browser support targets, adopt the native API; otherwise keep a targeted polyfill or library.',
    },
  ],
};

export const SAMPLE_DIAGRAM_SPEC: DiagramSpec = {
  schemaVersion: 1,
  id: 'baseline-intro',
  title: 'How Baseline Helps Ship Less JavaScript',
  type: 'flowchart',
  summary: 'Check native browser support before depending on JavaScript libraries.',
  sourceDocumentId: 'article-001',
  nodes: [
    {
      id: 'n1',
      kind: 'process',
      label: 'Identify a JavaScript dependency',
      description: 'Audit existing bundle libraries or proposed third-party packages.',
      sourceSectionIds: ['s1'],
      emphasis: 'normal',
    },
    {
      id: 'n2',
      kind: 'decision',
      label: 'Does the browser provide a native API?',
      description: 'Determine if standard DOM, CSS, or Intl APIs solve the problem.',
      sourceSectionIds: ['s2'],
      emphasis: 'high',
    },
    {
      id: 'n3',
      kind: 'process',
      label: 'Check Baseline compatibility',
      description: 'Verify Newly Available or Widely Available status across target browsers.',
      sourceSectionIds: ['s3'],
      emphasis: 'normal',
    },
    {
      id: 'n4',
      kind: 'outcome',
      label: 'Use the native API where appropriate',
      description: 'Remove the unnecessary JS library and reduce bundle size.',
      sourceSectionIds: ['s4'],
      emphasis: 'high',
    },
    {
      id: 'n5',
      kind: 'outcome',
      label: 'Keep a library or fallback if needed',
      description: 'Retain a lightweight polyfill or dependency when support is insufficient.',
      sourceSectionIds: ['s4'],
      emphasis: 'normal',
    },
  ],
  edges: [
    {
      id: 'e1',
      from: 'n1',
      to: 'n2',
      relationship: 'sequence',
    },
    {
      id: 'e2',
      from: 'n2',
      to: 'n3',
      label: 'Yes',
      relationship: 'sequence',
    },
    {
      id: 'e3',
      from: 'n2',
      to: 'n5',
      label: 'No',
      relationship: 'alternative',
    },
    {
      id: 'e4',
      from: 'n3',
      to: 'n4',
      label: 'Suitable support',
      relationship: 'causes',
    },
    {
      id: 'e5',
      from: 'n3',
      to: 'n5',
      label: 'Support insufficient',
      relationship: 'alternative',
    },
  ],
  createdAt: '2026-10-21T00:00:00Z',
};
