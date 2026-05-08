/**
 * First content script in manifest. Patches Trusted Types before the Vite/CRX
 * loader dynamically imports Vue (otherwise chunk vi-*.js triggers CSP on strict sites).
 */
;(function () {
  'use strict'
  try {
    if (typeof window === 'undefined') return
    if (window.__bbqOneTrustedTypesShimApplied) return

    function wrapFactory(factory) {
      if (!factory || typeof factory.createPolicy !== 'function') return factory
      var origCreate = factory.createPolicy.bind(factory)
      return new Proxy(factory, {
        get: function (target, prop, receiver) {
          if (prop === 'createPolicy') {
            return function (name, opts) {
              if (name === 'vue') {
                return {
                  createHTML: function (s) {
                    return s
                  },
                  createScript: function (s) {
                    return s
                  },
                  createScriptURL: function (s) {
                    return s
                  },
                }
              }
              return origCreate(name, opts)
            }
          }
          return Reflect.get(target, prop, receiver)
        },
      })
    }

    var desc =
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'trustedTypes') ||
      Object.getOwnPropertyDescriptor(window, 'trustedTypes')

    if (desc && desc.get) {
      var origGet = desc.get
      Object.defineProperty(window, 'trustedTypes', {
        configurable: true,
        get: function () {
          var raw = origGet.call(window)
          return wrapFactory(raw)
        },
      })
    } else {
      var tt = window.trustedTypes
      if (!tt) return
      Object.defineProperty(window, 'trustedTypes', {
        configurable: true,
        writable: true,
        value: wrapFactory(tt),
      })
    }

    window.__bbqOneTrustedTypesShimApplied = true
  } catch (_e) {
    try {
      if (window.__bbqOneTrustedTypesShimApplied) return
      var tt2 = window.trustedTypes
      if (!tt2 || typeof tt2.createPolicy !== 'function') return
      var original = tt2.createPolicy.bind(tt2)
      tt2.createPolicy = function (name, opts) {
        if (name === 'vue') {
          return {
            createHTML: function (s) {
              return s
            },
            createScript: function (s) {
              return s
            },
            createScriptURL: function (s) {
              return s
            },
          }
        }
        return original(name, opts)
      }
      window.__bbqOneTrustedTypesShimApplied = true
    } catch (_e2) {
      /* ignore */
    }
  }
})()
