import { ValidationError } from '../../../board/normalize'
import { fetchJson } from '../../lib/format'

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/** WMO weather codes, abbreviated to fit a split-flap column. */
export const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'CLEAR',
  1: 'MAINLYCLEAR',
  2: 'PARTLYCLOUDY',
  3: 'OVERCAST',
  45: 'FOG',
  48: 'RIMEFOG',
  51: 'LIGHTDRIZZLE',
  53: 'DRIZZLE',
  55: 'HEAVYDRIZZLE',
  56: 'FREEZEDRIZZLE',
  57: 'DENSEFRZDRIZ',
  61: 'LIGHTRAIN',
  63: 'RAIN',
  65: 'HEAVYRAIN',
  66: 'FREEZERAIN',
  67: 'HEAVYFRZRAIN',
  71: 'LIGHTSNOW',
  73: 'SNOW',
  75: 'HEAVYSNOW',
  77: 'SNOWGRAINS',
  80: 'RAINSHOWERS',
  81: 'HVRYSHOWERS',
  82: 'VIOLENTRAIN',
  85: 'SNOWSHOWERS',
  86: 'HVYSNWSHOWR',
  95: 'TSTORM',
  96: 'TSTRMHAIL',
  99: 'HVYHAIL',
}

export function reasonFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'reason' in payload) {
    const reason = (payload as Record<string, unknown>).reason
    if (typeof reason === 'string' && reason) return reason
  }
  return fallback
}

export function formatTemperature(value: unknown): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '--'
}

/** 'M' (metric) or 'I' (imperial), matching the shared units select. */
export function temperatureUnitFor(units: string): { apiValue: string; symbol: string } {
  return units === 'I' ? { apiValue: 'fahrenheit', symbol: 'F' } : { apiValue: 'celsius', symbol: 'C' }
}

export interface GeocodedLocation {
  latitude: string
  longitude: string
  name: string
  countryCode: string
  timezone: string
}

/**
 * Resolves a city/country pair to coordinates. Both weather plugins take the
 * same two settings and start with this call.
 */
export async function geocode(city: string, country: string, signal: AbortSignal): Promise<GeocodedLocation> {
  if (!city) throw new ValidationError('Open-Meteo city is required.')
  if (!country) throw new ValidationError('Open-Meteo country code is required.')

  const url = `${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(city)}&count=1&language=en&countryCode=${encodeURIComponent(country)}`
  const response = await fetchJson(url, { signal })
  if (!response.ok) throw new ValidationError(reasonFrom(response.payload, 'Open-Meteo geocoding request failed.'))

  const payload = response.payload as Record<string, unknown> | null
  const results = payload?.results
  if (!Array.isArray(results) || results.length === 0) throw new ValidationError('Open-Meteo could not find that city/country combination.')

  const location = results[0] as Record<string, unknown>
  return {
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    name: String(location.name || city),
    countryCode: String(location.country_code || country).toUpperCase(),
    timezone: String(location.timezone || 'auto'),
  }
}

/** Two-letter country code to its flag emoji, via regional indicator symbols. */
export function countryFlag(code: string): string {
  if (code.length !== 2) return ''
  const offset = 0x1f1e6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset)
}
