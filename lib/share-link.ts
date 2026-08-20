const KEY_PARAMETER = "key";

export function createReceiveLink(transferId: string, key: string, origin: string): string {
  const url = new URL(`/receive/${encodeURIComponent(transferId)}`, origin);
  url.hash = new URLSearchParams({ [KEY_PARAMETER]: key }).toString();
  return url.toString();
}

export function readKeyFromFragment(fragment: string): string | null {
  const normalized = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return new URLSearchParams(normalized).get(KEY_PARAMETER);
}
