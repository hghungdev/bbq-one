/**
 * Content scripts keep running after the extension is reloaded or updated until the tab is refreshed.
 * Any `chrome.runtime` / `chrome.storage` / messaging call then throws or rejects with a context error.
 */

const INVALIDATED_SUBSTRINGS = ['Extension context invalidated', 'context invalidated']

export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && typeof chrome.runtime?.id === 'string' && chrome.runtime.id.length > 0
  } catch {
    return false
  }
}

export function isExtensionContextError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return INVALIDATED_SUBSTRINGS.some((s) => msg.includes(s))
}
