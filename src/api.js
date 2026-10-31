import {
  deviceApi,
  handlesDeviceApi,
  isInstalledApp,
  mirrorAccountApi,
  updateDeviceContext,
} from "./deviceStore";

const currentLocale = () => {
  const language = typeof document === 'undefined' ? 'uz' : document.documentElement.lang
  return language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ'
}

export const money = (value) => {
  const locale = currentLocale()
  const suffix = locale === 'ru-RU' ? ' сум' : locale === 'en-US' ? ' UZS' : ' so‘m'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value) || 0)}${suffix}`
}

export const numberInput = (value) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 0 }).format(amount) : ''
}

export const readNumber = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

export async function api(path, options = {}) {
  const method = options.method || "GET";
  if (isInstalledApp() && handlesDeviceApi(path, method)) {
    return deviceApi(path, options);
  }

  let response
  const headers = options.body ? { 'Content-Type': 'application/json' } : {}
  if (
    isInstalledApp() &&
    /^\/api\/(employees|managers)(\/[^/]+)?$/.test(path) &&
    ["POST", "PATCH", "DELETE"].includes(method)
  ) {
    headers["X-Yemzor-Device-App"] = "1"
  }
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new Error('Serverga ulanib bo‘lmadi. `npm run dev:all` bilan ilovani qayta ishga tushiring.')
  }
  if (response.status === 204) {
    if (path === "/api/auth/logout") {
      updateDeviceContext({ user: null, company: null, subscription: null });
    }
    return null;
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(result?.error || `So‘rov bajarilmadi (HTTP ${response.status}).`)
    error.status = response.status
    error.details = result
    throw error
  }
  if (path === "/api/status") updateDeviceContext(result);
  if (isInstalledApp()) await mirrorAccountApi(path, method, result, options.body);
  return result
}
