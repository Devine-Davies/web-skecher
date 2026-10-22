import type { ExtensionMessage } from '@/shared/types';
import { extractFromActiveTab, getActiveTabMetadata, openEditorTab } from './tabs';
import { saveLastExtractedDocument } from '@/core/storage';

export async function handleExtensionMessage(
  message: ExtensionMessage
): Promise<unknown> {
  switch (message.type) {
    case 'GET_ACTIVE_TAB_INFO': {
      const metadata = await getActiveTabMetadata();
      return { ok: true, metadata };
    }
    case 'EXTRACT_ACTIVE_PAGE': {
      const document = await extractFromActiveTab();
      await saveLastExtractedDocument(document);
      return { ok: true, document };
    }
    case 'OPEN_EDITOR_TAB': {
      await openEditorTab(message.diagramId);
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unsupported message type' };
  }
}
