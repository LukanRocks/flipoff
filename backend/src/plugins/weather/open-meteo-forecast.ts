import { ValidationError } from '../../board/normalize'
import { cpLength, cpSlice } from '../../util/text'
import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fetchJson, fit } from '../lib/format'

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/** WMO weather codes, abbreviated to fit a split-flap column. */
const WEATHER_CODE_LABELS: Record<number, string> = {
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

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

type ForecastRow = [weekday: string, temperature: string, description: string]

function padEndCp(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - cpLength(value)))
}

function padStartCp(value: string, width: number): string {
  return ' '.repeat(Math.max(0, width - cpLength(value))) + value
}

function weekdayLabel(validDate: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(validDate.trim())
  if (parsed) {
    // Parsed as UTC so the label matches the API's calendar date rather than
    // the server's local timezone.
    const date = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])))
    if (!Number.isNaN(date.getTime())) return WEEKDAYS[date.getUTCDay()]!
  }
  return validDate.slice(0, 3).toUpperCase() || 'DAY'
}

function formatTemperature(value: unknown): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '--'
}

function reasonFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'reason' in payload) {
    const reason = (payload as Record<string, unknown>).reason
    if (typeof reason === 'string' && reason) return reason
  }
  return fallback
}

/**
 * Three fixed columns: weekday, min/max temperature, condition. The condition
 * column takes whatever width is left and is dropped entirely when the grid is
 * too narrow to hold it.
 */
function formatForecastRows(rows: ForecastRow[], cols: number, showConditions: boolean): string[] {
  if (rows.length === 0) return []

  const weekdayWidth = Math.max(...rows.map(([weekday]) => cpLength(weekday)))
  const temperatureWidth = Math.max(...rows.map(([, temperature]) => cpLength(temperature)))
  const baseLines = rows.map(([weekday, temperature]) => `${padEndCp(weekday, weekdayWidth)}  ${padStartCp(temperature, temperatureWidth)}`)

  if (!showConditions) return baseLines.map((line) => fit(line, cols))

  const descriptionWidth = cols - weekdayWidth - 2 - temperatureWidth - 2
  if (descriptionWidth <= 0) return baseLines.map((line) => fit(line, cols))

  return rows.map(([weekday, temperature, description]) =>
    fit(
      `${padEndCp(weekday, weekdayWidth)}  ${padStartCp(temperature, temperatureWidth)}  ${padStartCp(cpSlice(description || '--', 0, descriptionWidth), descriptionWidth)}`,
      cols,
    ),
  )
}

function requireSeries(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length < 3) throw new ValidationError('Open-Meteo did not return a complete three day forecast.')
  return value
}

export const openMeteoForecastPlugin: ScreenPlugin = {
  manifest: {
    // Kept from the Python original: this id is persisted in screens.json and
    // renaming it would orphan every configured forecast screen.
    id: 'weatherbit_forecast',
    name: 'Open-Meteo 3 Day Forecast',
    description: 'Fetch a three day weather forecast from Open-Meteo and render it as a screen.',
    defaultRefreshIntervalSeconds: 3600,
    settingsSchema: [
      { name: 'city', label: 'City', type: 'text', required: true, placeholder: 'London' },
      { name: 'country', label: 'Country Code', type: 'text', required: true, placeholder: 'GB', helpText: 'Use a 2 letter country code.' },
      {
        name: 'units',
        label: 'Units',
        type: 'select',
        default: 'M',
        options: [
          { label: 'Metric (C)', value: 'M' },
          { label: 'Imperial (F)', value: 'I' },
        ],
      },
    ],
    designSchema: [
      { name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: '3 DAY LONDON' },
      { name: 'showConditions', label: 'Show Conditions', type: 'checkbox', default: true },
    ],
  },

  async refresh({ settings, design, context, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const city = String(settings.city ?? '').trim()
    const country = String(settings.country ?? '')
      .trim()
      .toUpperCase()
    const units =
      String(settings.units ?? 'M')
        .trim()
        .toUpperCase() || 'M'

    if (!city) throw new ValidationError('Open-Meteo city is required.')
    if (!country) throw new ValidationError('Open-Meteo country code is required.')

    const geocodingUrl = `${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(city)}&count=1&language=en&countryCode=${encodeURIComponent(country)}`
    const geocoding = await fetchJson(geocodingUrl, { signal })
    if (!geocoding.ok) throw new ValidationError(reasonFrom(geocoding.payload, 'Open-Meteo geocoding request failed.'))

    const geocodingPayload = geocoding.payload as Record<string, unknown> | null
    const results = geocodingPayload?.results
    if (!Array.isArray(results) || results.length === 0) throw new ValidationError('Open-Meteo could not find that city/country combination.')

    const location = results[0] as Record<string, unknown>
    const temperatureUnit = units === 'I' ? 'fahrenheit' : 'celsius'
    const timezone = String(location.timezone || 'auto')

    const forecastUrl =
      `${OPEN_METEO_FORECAST_URL}?latitude=${encodeURIComponent(String(location.latitude))}&longitude=${encodeURIComponent(String(location.longitude))}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&temperature_unit=${temperatureUnit}&timezone=${encodeURIComponent(timezone)}`
    const forecast = await fetchJson(forecastUrl, { signal })
    if (!forecast.ok) throw new ValidationError(reasonFrom(forecast.payload, 'Open-Meteo forecast request failed.'))

    const forecastPayload = forecast.payload as Record<string, unknown> | null
    const daily = forecastPayload?.daily
    if (typeof daily !== 'object' || daily === null || Array.isArray(daily)) throw new ValidationError('Open-Meteo did not return daily forecast data.')
    const series = daily as Record<string, unknown>

    const dates = requireSeries(series.time)
    const maxTemps = requireSeries(series.temperature_2m_max)
    const minTemps = requireSeries(series.temperature_2m_min)
    const weatherCodes = requireSeries(series.weather_code)

    const unitSymbol = units === 'I' ? 'F' : 'C'
    const rows: ForecastRow[] = [0, 1, 2].map((index) => [
      weekdayLabel(String(dates[index] ?? '')),
      `${formatTemperature(minTemps[index])}/${formatTemperature(maxTemps[index])}${unitSymbol}`,
      WEATHER_CODE_LABELS[Number(weatherCodes[index])] ?? '',
    ])

    const showConditions = Boolean(design.showConditions ?? true)
    const lines = withOptionalTitle(formatForecastRows(rows, context.cols, showConditions), design, context)

    return {
      lines: lines.slice(0, context.rows),
      meta: { city: location.name || city, country: location.country_code || country },
    }
  },

  placeholderLines({ design, context, error }: PluginPlaceholderArgs): string[] {
    const detail = (error || 'WAITING FOR DATA').toUpperCase()
    return withOptionalTitle([fit(detail, context.cols)], design, context).slice(0, context.rows)
  },
}
