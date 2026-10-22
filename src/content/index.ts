import { extractDocumentFromDom } from './extractor';

function registerContentExtractorListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'CONTENT_EXTRACT_REQUEST') {
      try {
        const extracted = extractDocumentFromDom(document, window.location.href);
        sendResponse({ ok: true, document: extracted });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to extract page content';
        sendResponse({ ok: false, error: msg });
      }
      return true;
    }
    return false;
  });
}

registerContentExtractorListener();
