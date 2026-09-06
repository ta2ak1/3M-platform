export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function isTurnstileEnabled() {
  return Boolean(turnstileSiteKey);
}
