import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '@/sidepanel/App';
import { RecentDiagramsList } from '@/sidepanel/components/RecentDiagramsList';
import { extractFromActiveTab, getActiveTabMetadata, openEditorTab } from '@/background/tabs';
import { createAIProvider } from '@/core/ai/providers';
import { runDiagramGenerationFlow } from '@/core/ai/generation';
import { createDocumentFromPastedText, evaluateTabUrlSupport } from '@/core/extraction';
import { createInitialSampleDiagram, saveLastExtractedDocument, saveUserSettings } from '@/core/storage';
import { DEFAULT_USER_SETTINGS, STORAGE_KEYS } from '@/shared/constants';

vi.mock('@/background/tabs', () => ({
  extractFromActiveTab: vi.fn(),
  getActiveTabMetadata: vi.fn(),
  openEditorTab: vi.fn(),
}));
vi.mock('@/core/ai/providers', () => ({ createAIProvider: vi.fn() }));
vi.mock('@/core/ai/generation', () => ({ runDiagramGenerationFlow: vi.fn() }));

const liveDoc = createDocumentFromPastedText('Live article with useful content.', 'Current article');
liveDoc.url = 'https://example.com/article';
const validateConfig = vi.fn();
let onTabActivated: () => void;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(STORAGE_KEYS.SAVED_DIAGRAMS, '[]');
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn(),
      onActivated: {
        addListener: vi.fn((listener) => { onTabActivated = listener; }),
        removeListener: vi.fn(),
      },
    },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
  });
  await saveUserSettings({
    ...DEFAULT_USER_SETTINGS,
    onboardingCompleted: true,
    requireDataSharingConfirmation: true,
  });
  vi.mocked(getActiveTabMetadata).mockResolvedValue(evaluateTabUrlSupport(liveDoc.url, liveDoc.title));
  vi.mocked(extractFromActiveTab).mockResolvedValue(liveDoc);
  validateConfig.mockResolvedValue({ ok: true });
  vi.mocked(createAIProvider).mockReturnValue({
    id: 'copilot', name: 'Copilot CLI', validateConfig,
    listModels: vi.fn(), generateDiagram: vi.fn(), refineDiagram: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sidepanel source and diagram controls', () => {
  it('does not offer stored content on a restricted page and recovers through paste', async () => {
    await saveLastExtractedDocument(liveDoc);
    vi.mocked(getActiveTabMetadata).mockResolvedValue(evaluateTabUrlSupport('chrome://extensions', 'Extensions'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Chrome|restricted/i);
    expect(screen.getByRole('heading', { name: 'Extensions' })).toBeInTheDocument();
    expect(screen.queryByText('Current article')).not.toBeInTheDocument();
    expect(screen.queryByText(/1 sections/)).not.toBeInTheDocument();
    const generate = screen.getByRole('button', { name: 'Generate diagram' });
    expect(generate).toBeDisabled();
    expect(extractFromActiveTab).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Paste text instead/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Pasted Content' }));
    expect(await screen.findByText(/Please enter or paste article text/)).toBeInTheDocument();
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Manual article title'), { target: { value: 'My notes' } });
    fireEvent.change(screen.getByLabelText('Paste article text manually'), {
      target: { value: 'The pasted source is independent of restricted pages.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use Pasted Content' }));
    expect(await screen.findByRole('heading', { name: 'My notes' })).toBeInTheDocument();
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    expect(screen.getByRole('dialog', { name: 'Confirm content sharing' })).toHaveTextContent('My notes');
    expect(runDiagramGenerationFlow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'This page' }));
    expect(generate).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    expect(generate).toBeEnabled();
  });

  it('invalidates source metadata and sharing approval when a refresh fails', async () => {
    render(<App />);
    const generate = await screen.findByRole('button', { name: 'Generate diagram' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    vi.mocked(extractFromActiveTab).mockRejectedValue(new Error('Page extraction was blocked.'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Page' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Page extraction was blocked.');
    expect(generate).toBeDisabled();
    expect(screen.queryByText(/1 sections/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores extraction results from a previously active tab', async () => {
    let finishOldRequest!: (doc: typeof liveDoc) => void;
    vi.mocked(extractFromActiveTab).mockImplementationOnce(() => new Promise((resolve) => {
      finishOldRequest = resolve;
    }));
    render(<App />);
    await waitFor(() => expect(extractFromActiveTab).toHaveBeenCalledOnce());
    vi.mocked(getActiveTabMetadata).mockResolvedValue(evaluateTabUrlSupport('chrome://settings', 'Settings'));
    act(() => onTabActivated());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await act(async () => finishOldRequest(liveDoc));
    expect(screen.getByRole('button', { name: 'Generate diagram' })).toBeDisabled();
    expect(screen.queryByText('Current article')).not.toBeInTheDocument();
  });

  it('selects type and detail, changes model/output, opens editor, settings and theme', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Current article' });
    fireEvent.click(screen.getByRole('button', { name: 'Mind map' }));
    expect(screen.getByRole('button', { name: 'Mind map' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    expect(screen.getByText('8–15 nodes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Detailed' }));
    expect(screen.getByText('15–30 nodes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Infographic' }));
    expect(screen.queryByRole('button', { name: 'Standard' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Model', { exact: true }));
    fireEvent.change(screen.getByLabelText('AI Model'), { target: { value: 'gpt-5.4' } });
    expect(screen.getByLabelText('AI Model')).toHaveValue('gpt-5.4');
    fireEvent.click(screen.getByText('Output', { exact: true }));
    fireEvent.change(screen.getByLabelText('Output Destination'), { target: { value: 'remote_mcp' } });
    expect(screen.getByText(/Remote MCP Apps are not hosted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand full editor' }));
    expect(openEditorTab).toHaveBeenCalledWith(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle colour theme' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(await screen.findByRole('button', { name: /Test AI Connection/ })).toBeInTheDocument();
  });

  it('shows connection failure rather than assuming a local bridge is connected', async () => {
    await saveUserSettings({
      ...DEFAULT_USER_SETTINGS, onboardingCompleted: true,
      activeProviderId: 'copilot', activeModelId: 'auto', activeProfileId: 'local-copilot',
      profiles: [{ id: 'local-copilot', name: 'Copilot', providerId: 'copilot', modelId: 'auto' }],
    });
    validateConfig.mockResolvedValue({ ok: false });
    render(<App />);
    expect(await screen.findByText('Copilot CLI · Disconnected')).toBeInTheDocument();
  });

  it('disables generation for an empty extraction', async () => {
    vi.mocked(extractFromActiveTab).mockResolvedValue({ ...liveDoc, sections: [], wordCount: 0 });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No readable text');
    expect(screen.getByRole('button', { name: 'Generate diagram' })).toBeDisabled();
  });

  it('generates from the chosen source and preserves diagram options and selection', async () => {
    const saved = createInitialSampleDiagram();
    vi.mocked(runDiagramGenerationFlow).mockResolvedValue(saved);
    render(<App />);
    await screen.findByRole('heading', { name: 'Current article' });
    fireEvent.click(screen.getByRole('button', { name: 'Mind map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    fireEvent.change(screen.getByLabelText('Instructions (optional)'), {
      target: { value: 'Focus on the key relationships.' },
    });
    fireEvent.change(screen.getByLabelText('Optional selected-text focus'), {
      target: { value: 'useful content' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Generate' }));
    await waitFor(() => expect(runDiagramGenerationFlow).toHaveBeenCalledWith(expect.objectContaining({
      sourceDocument: expect.objectContaining({ ...liveDoc, selectedText: 'useful content' }),
      diagramType: 'mindmap', complexity: 'balanced',
      additionalInstructions: 'Focus on the key relationships.',
    })));
    await waitFor(() => expect(openEditorTab).toHaveBeenCalledWith(saved.id));
  });
});

describe('Live tab extraction', () => {
  it('never substitutes example article content when Chrome extraction fails', async () => {
    const tabs = await vi.importActual<typeof import('@/background/tabs')>('@/background/tabs');
    vi.mocked(chrome.tabs.query).mockResolvedValue([{
      id: 1, url: liveDoc.url, title: liveDoc.title,
    } as chrome.tabs.Tab]);
    chrome.tabs.sendMessage = vi.fn().mockResolvedValue({ ok: false });
    await expect(tabs.extractFromActiveTab()).rejects.toThrow(/No readable content/);
  });
});

describe('Recent diagrams', () => {
  it('renders an honest empty state', () => {
    render(<RecentDiagramsList diagrams={[]} onOpenDiagram={vi.fn()} onDeleteDiagram={vi.fn()} />);
    expect(screen.getByText(/No saved diagrams yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View all' })).not.toBeInTheDocument();
  });

  it('expands history and preserves open, rename and confirmed delete actions', () => {
    const diagrams = Array.from({ length: 5 }, (_, index) => ({
      ...createInitialSampleDiagram(), id: `diagram-${index}`, title: `Diagram ${index}`,
    }));
    const open = vi.fn();
    const rename = vi.fn();
    const remove = vi.fn();
    render(<RecentDiagramsList diagrams={diagrams} onOpenDiagram={open}
      onRenameDiagram={rename} onDeleteDiagram={remove} />);
    expect(screen.queryByText('Diagram 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    expect(screen.getByText('Diagram 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Diagram 4 in full editor' }));
    expect(open).toHaveBeenCalledWith('diagram-4');
    fireEvent.click(screen.getByRole('button', { name: 'Rename Diagram 4' }));
    fireEvent.change(screen.getByLabelText('New title for Diagram 4'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(rename).toHaveBeenCalledWith('diagram-4', 'Renamed');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Diagram 4' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(remove).toHaveBeenCalledWith('diagram-4');
  });
});
