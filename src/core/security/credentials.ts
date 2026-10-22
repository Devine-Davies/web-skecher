import type { AIProviderId } from '@/shared/types';

const SESSION_CREDENTIALS_KEY = 'visualise_page_session_keys_v1';
const LOCAL_CREDENTIALS_KEY = 'visualise_page_consented_local_keys_v1';

function hasChromeSessionStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.session !== 'undefined'
  );
}

function hasChromeLocalStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  );
}

async function readCredentialMap(usePersistentLocal: boolean): Promise<Record<string, string>> {
  const key = usePersistentLocal ? LOCAL_CREDENTIALS_KEY : SESSION_CREDENTIALS_KEY;

  if (!usePersistentLocal && hasChromeSessionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.session.get([key], (res) => {
        resolve((res?.[key] as Record<string, string>) ?? {});
      });
    });
  }

  if (usePersistentLocal && hasChromeLocalStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => {
        resolve((res?.[key] as Record<string, string>) ?? {});
      });
    });
  }

  try {
    const store = usePersistentLocal ? localStorage : sessionStorage;
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function writeCredentialMap(
  map: Record<string, string>,
  usePersistentLocal: boolean
): Promise<void> {
  const key = usePersistentLocal ? LOCAL_CREDENTIALS_KEY : SESSION_CREDENTIALS_KEY;

  if (!usePersistentLocal && hasChromeSessionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.session.set({ [key]: map }, () => resolve());
    });
  }

  if (usePersistentLocal && hasChromeLocalStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: map }, () => resolve());
    });
  }

  try {
    const store = usePersistentLocal ? localStorage : sessionStorage;
    store.setItem(key, JSON.stringify(map));
  } catch {
    // Ignore fallback storage errors
  }
}

export async function saveProviderApiKey(
  providerId: AIProviderId,
  apiKey: string,
  persistLocally = false
): Promise<void> {
  const trimmed = apiKey.trim();
  const sessionMap = await readCredentialMap(false);
  sessionMap[providerId] = trimmed;
  await writeCredentialMap(sessionMap, false);

  const localMap = await readCredentialMap(true);
  if (persistLocally && trimmed) {
    localMap[providerId] = trimmed;
  } else {
    delete localMap[providerId];
  }
  await writeCredentialMap(localMap, true);
}

export async function loadProviderApiKey(providerId: AIProviderId): Promise<string> {
  const sessionMap = await readCredentialMap(false);
  if (sessionMap[providerId]) {
    return sessionMap[providerId];
  }
  const localMap = await readCredentialMap(true);
  return localMap[providerId] ?? '';
}

export async function clearAllProviderCredentials(): Promise<void> {
  await writeCredentialMap({}, false);
  await writeCredentialMap({}, true);
}
