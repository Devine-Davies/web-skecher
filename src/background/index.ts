import { CONTEXT_MENU_IDS } from '@/shared/constants';
import type { ExtensionMessage } from '@/shared/types';
import { handleExtensionMessage } from './messaging';
import { extractFromActiveTab } from './tabs';
import { saveLastExtractedDocument } from '@/core/storage';

export function initializeBackgroundServiceWorker(): void {
  if (typeof chrome === 'undefined') return;

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {
        // Ignore if browser version does not support setPanelBehavior
      });
  }

  chrome.runtime?.onInstalled?.addListener(() => {
    if (!chrome.contextMenus) return;

    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.VISUALISE_PAGE,
        title: 'Visualise this page',
        contexts: ['page'],
      });

      chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.VISUALISE_SELECTION,
        title: 'Visualise selected text',
        contexts: ['selection'],
      });
    });
  });

  chrome.contextMenus?.onClicked?.addListener(async (info, tab) => {
    if (tab?.id && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch {
        // Side panel open requires user gesture in some versions
      }
    }

    try {
      const doc = await extractFromActiveTab();
      if (info.menuItemId === CONTEXT_MENU_IDS.VISUALISE_SELECTION && info.selectionText) {
        doc.selectedText = info.selectionText.trim();
      }
      await saveLastExtractedDocument(doc);
    } catch {
      // Handled by side panel status
    }
  });

  chrome.runtime?.onMessage?.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      handleExtensionMessage(message)
        .then((res) => sendResponse(res))
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          sendResponse({ ok: false, error: errorMessage });
        });
      return true;
    }
  );
}

initializeBackgroundServiceWorker();
