// The visitor's cookie / privacy choice, remembered in this browser.
// Remembering the choice itself is strictly necessary, so it is stored whatever the choice was.

const KEY = 'documind_cookie_consent_v1'
export const CONSENT_CHANGED = 'documind:consent-changed'
export const OPEN_COOKIE_SETTINGS = 'documind:open-cookie-settings'

export interface Consent {
  /** remember choices such as the colour theme in this browser */
  preferences: boolean
  /** anonymous usage statistics */
  analytics: boolean
  decidedAt: string
}

export function getConsent(): Consent | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Consent> | null
    if (!saved || typeof saved !== 'object') return null
    return {
      preferences: saved.preferences === true,
      analytics: saved.analytics === true,
      decidedAt: typeof saved.decidedAt === 'string' ? saved.decidedAt : '',
    }
  } catch {
    return null
  }
}

export function saveConsent(choice: { preferences: boolean; analytics: boolean }): Consent {
  const consent: Consent = { ...choice, decidedAt: new Date().toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify(consent))
  } catch {
    /* storage unavailable: the choice only lasts until the page is closed */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: consent }))
  return consent
}

/** Until the visitor has decided nothing changes; after "continue without accepting" nothing optional is stored. */
export const preferencesAllowed = () => getConsent()?.preferences !== false

export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))
