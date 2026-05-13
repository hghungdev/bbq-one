/**
 * Phiên bản extension — khớp manifest đã cài.
 * Runtime: chrome.runtime.getManifest().version (nguồn chân lý trong trình duyệt).
 * Fallback: import.meta.env.VITE_EXTENSION_VERSION (vite inject từ public/manifest.json).
 */
export function getExtensionVersion(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest != null) {
      return chrome.runtime.getManifest().version
    }
  } catch {
    /* không phải extension hoặc context hạn chế */
  }
  return import.meta.env.VITE_EXTENSION_VERSION
}
