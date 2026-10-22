import type { SavedDiagram, SourceDocument } from '@/shared/types';

const DB_NAME = 'visualise_page_db_v1';
const DB_VERSION = 1;
const STORE_DIAGRAMS = 'diagrams';
const STORE_DOCUMENTS = 'source_documents';
const STORE_RECOVERY = 'crash_recovery';

function isIndexedDbSupported(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbSupported()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_DIAGRAMS)) {
          db.createObjectStore(STORE_DIAGRAMS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
          db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_RECOVERY)) {
          db.createObjectStore(STORE_RECOVERY, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGetAllDiagrams(): Promise<SavedDiagram[] | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_DIAGRAMS, 'readonly');
      const store = tx.objectStore(STORE_DIAGRAMS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as SavedDiagram[]) ?? [];
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        resolve(list.length > 0 ? list : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbPutDiagram(diagram: SavedDiagram): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_DIAGRAMS, 'readwrite');
      tx.objectStore(STORE_DIAGRAMS).put(diagram);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbDeleteDiagram(diagramId: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_DIAGRAMS, 'readwrite');
      tx.objectStore(STORE_DIAGRAMS).delete(diagramId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbPutSourceDocument(doc: SourceDocument): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
      tx.objectStore(STORE_DOCUMENTS).put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbGetSourceDocument(id: string): Promise<SourceDocument | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_DOCUMENTS, 'readonly');
      const req = tx.objectStore(STORE_DOCUMENTS).get(id);
      req.onsuccess = () => resolve((req.result as SourceDocument | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbPutCrashDraft(diagram: SavedDiagram): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_RECOVERY, 'readwrite');
      tx.objectStore(STORE_RECOVERY).put({ id: 'active_draft', diagram });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbGetCrashDraft(): Promise<SavedDiagram | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_RECOVERY, 'readonly');
      const req = tx.objectStore(STORE_RECOVERY).get('active_draft');
      req.onsuccess = () => {
        const res = req.result as { id: string; diagram: SavedDiagram } | undefined;
        resolve(res?.diagram ?? null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbClearCrashDraft(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_RECOVERY, 'readwrite');
      tx.objectStore(STORE_RECOVERY).delete('active_draft');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbClearAllStores(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(
        [STORE_DIAGRAMS, STORE_DOCUMENTS, STORE_RECOVERY],
        'readwrite'
      );
      tx.objectStore(STORE_DIAGRAMS).clear();
      tx.objectStore(STORE_DOCUMENTS).clear();
      tx.objectStore(STORE_RECOVERY).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
