type NetworkListener = (online: boolean) => void

const listeners = new Set<NetworkListener>()

/** Trình duyệt báo offline — không ping Supabase (tránh treo popup). */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function onNetworkStatusChange(listener: NetworkListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyListeners(online: boolean): void {
  for (const fn of listeners) {
    fn(online)
  }
}

function attachListeners(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => notifyListeners(true))
    window.addEventListener('offline', () => notifyListeners(false))
    return
  }
  if (typeof self !== 'undefined') {
    self.addEventListener('online', () => notifyListeners(true))
    self.addEventListener('offline', () => notifyListeners(false))
  }
}

let wired = false

/** Gọi một lần từ popup hoặc background. */
export function initNetworkReachability(): void {
  if (wired) return
  wired = true
  attachListeners()
}
