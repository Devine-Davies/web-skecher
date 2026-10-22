export async function requestEndpointAccess(endpoint: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (
    typeof chrome === 'undefined' ||
    !chrome.permissions?.request
  ) {
    return true;
  }
  const originPattern = `${url.protocol}//${url.hostname}/*`;
  try {
    return await chrome.permissions.request({
      origins: [originPattern],
    });
  } catch {
    return false;
  }
}
