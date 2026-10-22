import {
  DEFAULT_USER_SETTINGS,
  SAMPLE_DIAGRAM_SPEC,
  SAMPLE_SOURCE_DOCUMENT,
  STORAGE_KEYS,
} from '@/shared/constants';
import type {
  SavedDiagram,
  SourceDocument,
  StorageUsageStats,
  UserSettings,
} from '@/shared/types';
import {
  exportSceneToSvgString,
  renderDiagramToExcalidrawScene,
} from '@/core/diagrams/renderer';
import { createDiagramCheckpoint } from '@/core/diagrams/patches';
import {
  clearAllProviderCredentials,
  loadMCPSecret,
  loadProviderApiKey,
  loadProfileCredential,
  saveMCPSecret,
  saveProfileCredential,
  saveProviderApiKey,
} from '@/core/security/credentials';
import {
  idbClearAllStores,
  idbClearCrashDraft,
  idbDeleteDiagram,
  idbGetAllDiagrams,
  idbGetCrashDraft,
  idbGetSourceDocument,
  idbPutCrashDraft,
  idbPutDiagram,
  idbPutSourceDocument,
} from './indexeddb';

const CRASH_DRAFT_STORAGE_KEY = 'visualise_page_crash_recovery_v1';

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  );
}

async function readKey<T>(key: string, fallback: T): Promise<T> {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (result && result[key] !== undefined) {
          resolve(result[key] as T);
        } else {
          resolve(fallback);
        }
      });
    });
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeKey<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in fallback mode
  }
}

export async function loadUserSettings(): Promise<UserSettings> {
  const stored = await readKey<Partial<UserSettings>>(STORAGE_KEYS.USER_SETTINGS, {});
  const baseProfiles =
    stored.profiles && stored.profiles.length > 0
      ? stored.profiles
      : DEFAULT_USER_SETTINGS.profiles;

  const activeProviderId =
    stored.activeProviderId ?? DEFAULT_USER_SETTINGS.activeProviderId;
  const legacyKey = await loadProviderApiKey(activeProviderId);
  const persistLocally = Boolean(stored.persistCredentialsLocally);
  const hydratedProfiles = await Promise.all(
    baseProfiles.map(async (profile) => {
      const storedSecret = await loadProfileCredential(profile.id);
      const secret =
        storedSecret ||
        profile.apiKey ||
        (profile.providerId === activeProviderId ? legacyKey : '');
      if (secret && !storedSecret) {
        await saveProfileCredential(profile.id, secret, persistLocally);
      }
      return { ...profile, apiKey: secret };
    })
  );
  const activeProfile =
    hydratedProfiles.find((p) => p.id === stored.activeProfileId) ??
    hydratedProfiles.find((p) => p.providerId === activeProviderId) ??
    hydratedProfiles[0];

  if (baseProfiles.some((p) => Boolean(p.apiKey))) {
    await writeKey(STORAGE_KEYS.USER_SETTINGS, {
      ...stored,
      profiles: baseProfiles.map(({ apiKey: _apiKey, ...profile }) => profile),
    });
  }

  return {
    ...DEFAULT_USER_SETTINGS,
    ...stored,
    activeProfileId: activeProfile?.id,
    profiles: hydratedProfiles,
    mcpConnections:
      stored.mcpConnections && stored.mcpConnections.length > 0
        ? stored.mcpConnections
        : DEFAULT_USER_SETTINGS.mcpConnections,
  };
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const persistLocally = Boolean(settings.persistCredentialsLocally);
  const previous = await readKey<Partial<UserSettings>>(
    STORAGE_KEYS.USER_SETTINGS,
    {}
  );
  const retainedProfileIds = new Set(settings.profiles.map((profile) => profile.id));
  const retainedMCPIds = new Set(
    settings.mcpConnections.map((connection) => connection.id)
  );
  for (const profile of previous.profiles ?? []) {
    if (!retainedProfileIds.has(profile.id)) {
      await saveProfileCredential(profile.id, '', false);
    }
  }
  for (const connection of previous.mcpConnections ?? []) {
    if (!retainedMCPIds.has(connection.id)) {
      await saveMCPSecret(connection.id, '', false);
    }
  }
  for (const profile of settings.profiles) {
    await saveProfileCredential(
      profile.id,
      profile.apiKey ?? '',
      persistLocally
    );
  }
  for (const connection of settings.mcpConnections) {
    const secret = await loadMCPSecret(connection.id);
    if (secret) {
      await saveMCPSecret(connection.id, secret, persistLocally);
    }
  }
  await saveProviderApiKey(settings.activeProviderId, '', persistLocally);

  const sanitisedSettings: UserSettings = {
    ...settings,
    profiles: settings.profiles.map(({ apiKey: _apiKey, ...profile }) => profile),
  };

  await writeKey(STORAGE_KEYS.USER_SETTINGS, sanitisedSettings);
  return settings;
}

export function createInitialSampleDiagram(): SavedDiagram {
  const scene = renderDiagramToExcalidrawScene(SAMPLE_DIAGRAM_SPEC);
  return {
    id: SAMPLE_DIAGRAM_SPEC.id,
    title: SAMPLE_DIAGRAM_SPEC.title,
    sourceDocumentId: SAMPLE_SOURCE_DOCUMENT.id,
    sourceUrl: SAMPLE_SOURCE_DOCUMENT.url,
    diagramType: SAMPLE_DIAGRAM_SPEC.type,
    spec: SAMPLE_DIAGRAM_SPEC,
    scene,
    providerId: 'openai',
    modelId: 'gpt-4o-mini',
    generationMode: 'local_heuristic',
    hasManualEdits: false,
    manualNodePositions: {},
    checkpoints: [],
    refinementHistory: [],
    thumbnailSvg: exportSceneToSvgString(scene, SAMPLE_DIAGRAM_SPEC.title),
    createdAt: SAMPLE_DIAGRAM_SPEC.createdAt,
    updatedAt: SAMPLE_DIAGRAM_SPEC.createdAt,
    version: 1,
  };
}

export async function loadSavedDiagrams(): Promise<SavedDiagram[]> {
  const idbList = await idbGetAllDiagrams();
  const stored =
    idbList ??
    (await readKey<SavedDiagram[] | null>(STORAGE_KEYS.SAVED_DIAGRAMS, null));
  if (!stored) {
    const initial = [createInitialSampleDiagram()];
    await writeKey(STORAGE_KEYS.SAVED_DIAGRAMS, initial);
    await idbPutDiagram(initial[0]);
    return initial;
  }
  return stored;
}

export async function saveDiagramRecord(
  diagram: SavedDiagram
): Promise<SavedDiagram[]> {
  const enriched: SavedDiagram = {
    ...diagram,
    thumbnailSvg:
      diagram.thumbnailSvg ??
      exportSceneToSvgString(diagram.scene, diagram.title),
  };

  const existing = await loadSavedDiagrams();
  const idx = existing.findIndex((d) => d.id === enriched.id);
  const updated =
    idx >= 0
      ? existing.map((item, i) => (i === idx ? enriched : item))
      : [enriched, ...existing];

  await writeKey(STORAGE_KEYS.SAVED_DIAGRAMS, updated);
  await idbPutDiagram(enriched);
  return updated;
}

export async function renameSavedDiagram(
  diagramId: string,
  newTitle: string
): Promise<SavedDiagram[]> {
  const trimmed = newTitle.trim();
  if (!trimmed) return loadSavedDiagrams();

  const existing = await loadSavedDiagrams();
  const target = existing.find((d) => d.id === diagramId);
  if (!target) return existing;

  const checkpoint = createDiagramCheckpoint(
    target,
    `Before rename to "${trimmed}"`
  );
  const updatedDiagram: SavedDiagram = {
    ...target,
    title: trimmed,
    spec: { ...target.spec, title: trimmed },
    checkpoints: [checkpoint, ...(target.checkpoints ?? [])].slice(0, 15),
    updatedAt: new Date().toISOString(),
    version: target.version + 1,
  };

  return saveDiagramRecord(updatedDiagram);
}

export async function restoreDiagramCheckpoint(
  diagramId: string,
  checkpointVersion: number
): Promise<SavedDiagram | null> {
  const existing = await loadSavedDiagrams();
  const target = existing.find((d) => d.id === diagramId);
  if (!target) return null;

  const cp = (target.checkpoints ?? []).find(
    (c) => c.version === checkpointVersion
  );
  if (!cp) return null;

  const currentSnapshot = createDiagramCheckpoint(
    target,
    `Before restoring v${checkpointVersion}`
  );

  const restored: SavedDiagram = {
    ...target,
    title: cp.spec.title,
    diagramType: cp.spec.type,
    spec: structuredClone(cp.spec),
    scene: structuredClone(cp.scene),
    hasManualEdits: Boolean(cp.hasManualEdits),
    checkpoints: [currentSnapshot, ...(target.checkpoints ?? [])].slice(0, 15),
    updatedAt: new Date().toISOString(),
    version: target.version + 1,
  };

  await saveDiagramRecord(restored);
  return restored;
}

export async function deleteSavedDiagram(
  diagramId: string
): Promise<SavedDiagram[]> {
  const existing = await loadSavedDiagrams();
  const updated = existing.filter((d) => d.id !== diagramId);
  await writeKey(STORAGE_KEYS.SAVED_DIAGRAMS, updated);
  await idbDeleteDiagram(diagramId);
  return updated;
}

export async function loadLastExtractedDocument(): Promise<SourceDocument> {
  return readKey<SourceDocument>(
    STORAGE_KEYS.LAST_EXTRACTION,
    SAMPLE_SOURCE_DOCUMENT
  );
}

export async function loadSourceDocument(id: string): Promise<SourceDocument | null> {
  const stored = await idbGetSourceDocument(id);
  if (stored) return stored;
  const last = await loadLastExtractedDocument();
  return last.id === id ? last : null;
}

export async function saveLastExtractedDocument(
  doc: SourceDocument
): Promise<void> {
  await writeKey(STORAGE_KEYS.LAST_EXTRACTION, doc);
  await idbPutSourceDocument(doc);
}

export async function saveCrashRecoveryDraft(
  diagram: SavedDiagram
): Promise<void> {
  await writeKey(CRASH_DRAFT_STORAGE_KEY, diagram);
  await idbPutCrashDraft(diagram);
}

export async function loadCrashRecoveryDraft(): Promise<SavedDiagram | null> {
  const idbDraft = await idbGetCrashDraft();
  if (idbDraft) return idbDraft;
  return readKey<SavedDiagram | null>(CRASH_DRAFT_STORAGE_KEY, null);
}

export async function clearCrashRecoveryDraft(): Promise<void> {
  await writeKey<SavedDiagram | null>(CRASH_DRAFT_STORAGE_KEY, null);
  await idbClearCrashDraft();
}

export async function getStorageUsageStats(): Promise<StorageUsageStats> {
  const [diagrams, lastDoc, settings] = await Promise.all([
    loadSavedDiagrams(),
    loadLastExtractedDocument(),
    loadUserSettings(),
  ]);

  const rawPayload = JSON.stringify({ diagrams, lastDoc, settings });
  const totalBytes = new TextEncoder().encode(rawPayload).length;
  const formattedSize =
    totalBytes >= 1024 * 1024
      ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.max(1, Math.round(totalBytes / 1024))} KB`;

  return {
    diagramCount: diagrams.length,
    sourceDocumentCount: lastDoc ? 1 : 0,
    totalBytes,
    formattedSize,
  };
}

export async function clearAllStoredData(): Promise<void> {
  await idbClearAllStores();
  await clearAllProviderCredentials();

  if (hasChromeStorage()) {
    await new Promise<void>((resolve) => {
      chrome.storage.local.clear(() => resolve());
    });
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.USER_SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.SAVED_DIAGRAMS);
    localStorage.removeItem(STORAGE_KEYS.LAST_EXTRACTION);
    localStorage.removeItem(CRASH_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore fallback errors
  }
}
