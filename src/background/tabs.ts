import { evaluateTabUrlSupport } from '@/core/extraction';
import { SAMPLE_SOURCE_DOCUMENT } from '@/shared/constants';
import type { ActiveTabMetadata, SourceDocument } from '@/shared/types';

async function queryActiveBrowserTab(): Promise<chrome.tabs.Tab | undefined> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return undefined;
  }

  const lastFocused = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (lastFocused && lastFocused.length > 0) {
    return lastFocused[0];
  }

  const currentWin = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return currentWin?.[0];
}

export async function getActiveTabMetadata(): Promise<ActiveTabMetadata> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return {
      url: SAMPLE_SOURCE_DOCUMENT.url,
      title: SAMPLE_SOURCE_DOCUMENT.title,
      domain: 'www.smashingmagazine.com',
      supported: true,
    };
  }

  const tab = await queryActiveBrowserTab();
  const tabUrl = tab?.url || tab?.pendingUrl || '';

  if (!tab || !tabUrl) {
    return evaluateTabUrlSupport('', tab?.title || 'Active Tab');
  }

  const evaluated = evaluateTabUrlSupport(tabUrl, tab.title || 'Active Tab');
  return {
    ...evaluated,
    tabId: tab.id,
    favIconUrl: tab.favIconUrl,
  };
}

export async function openEditorTab(diagramId?: string): Promise<void> {
  const query = diagramId ? `?diagramId=${encodeURIComponent(diagramId)}` : '';
  const relativeUrl = `editor.html${query}`;

  if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
    await chrome.tabs.create({
      url: chrome.runtime.getURL(relativeUrl),
    });
    return;
  }

  window.open(relativeUrl, '_blank', 'noopener,noreferrer');
}

export async function extractFromActiveTab(): Promise<SourceDocument> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return SAMPLE_SOURCE_DOCUMENT;
  }

  const tab = await queryActiveBrowserTab();
  if (!tab?.id) {
    throw new Error(
      'No active browser tab found. Click inside the webpage tab you want to visualise and click Refresh Page.'
    );
  }

  const tabUrl = tab.url || tab.pendingUrl || '';
  if (tabUrl) {
    const support = evaluateTabUrlSupport(tabUrl, tab.title);
    if (!support.supported) {
      throw new Error(support.unsupportedReason || 'This page cannot be extracted.');
    }
  }

  try {
    if (chrome.scripting?.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'CONTENT_EXTRACT_REQUEST',
    });

    if (response && response.ok && response.document) {
      return response.document as SourceDocument;
    }
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : '';
    if (/cannot access|chrome:\/\/|chromewebstore|extensions/i.test(detail)) {
      throw new Error(
        'Chrome restricts extensions from reading this page. Open a standard http/https article or paste text manually below.'
      );
    }
  }

  if (!tabUrl) {
    throw new Error(
      'Could not read active tab URL. Reload the extension in chrome://extensions and click Refresh Page on an http/https webpage.'
    );
  }

  return {
    ...SAMPLE_SOURCE_DOCUMENT,
    id: `doc-${Date.now()}`,
    url: tabUrl,
    title: tab.title || SAMPLE_SOURCE_DOCUMENT.title,
    extractedAt: new Date().toISOString(),
  };
}
