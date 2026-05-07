/**
 * Strict host CSP (e.g. LinkedIn) allows only specific Trusted Type policy names.
 * Vue 3.5+ calls `trustedTypes.createPolicy('vue', ...)` during runtime-dom init,
 * which triggers a CSP violation. Intercept that name and return a minimal policy
 * so Vue never hits the real API for `vue` (fallback behaviour is unchanged).
 */
type TrustedTypesFactory = {
  createPolicy: (name: string, policyOptions?: object) => unknown
}

function installTrustedTypesShimForVue(): void {
  if (typeof window === 'undefined') return

  const w = window as Window & { __bbqOneTrustedTypesShimApplied?: boolean }
  if (w.__bbqOneTrustedTypesShimApplied) return

  const tt = (window as Window & { trustedTypes?: TrustedTypesFactory }).trustedTypes
  if (!tt || typeof tt.createPolicy !== 'function') return

  w.__bbqOneTrustedTypesShimApplied = true

  const original = tt.createPolicy.bind(tt)

  tt.createPolicy = function patchedCreatePolicy(
    name: string,
    policyOptions?: object,
  ): unknown {
    if (name === 'vue') {
      return {
        createHTML: (input: string) => input,
        createScript: (input: string) => input,
        createScriptURL: (input: string) => input,
      }
    }
    return original(name, policyOptions)
  }
}

installTrustedTypesShimForVue()
