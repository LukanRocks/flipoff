import { ValidationError } from '../../board/normalize'
import { cpLength, cpSlice } from '../../util/text'
import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fetchJson, fit } from '../lib/format'
import { OPEN_METEO_FORECAST_URL, WEATHER_CODE_LABELS, formatTemperature, geocode, reasonFrom, temperatureUnitFor } from './lib/open-meteo'

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

    const location = await geocode(city, country, signal)
    const { apiValue: temperatureUnit, symbol: unitSymbol } = temperatureUnitFor(units)

    const forecastUrl =
      `${OPEN_METEO_FORECAST_URL}?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&temperature_unit=${temperatureUnit}&timezone=${encodeURIComponent(location.timezone)}`
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

    const rows: ForecastRow[] = [0, 1, 2].map((index) => [
      weekdayLabel(String(dates[index] ?? '')),
      `${formatTemperature(minTemps[index])}/${formatTemperature(maxTemps[index])}${unitSymbol}`,
      WEATHER_CODE_LABELS[Number(weatherCodes[index])] ?? '',
    ])

    const showConditions = Boolean(design.showConditions ?? true)
    const lines = withOptionalTitle(formatForecastRows(rows, context.cols, showConditions), design, context)

    return {
      lines: lines.slice(0, context.rows),
      meta: { city: location.name, country: location.countryCode },
    }
  },

  placeholderLines({ design, context, error }: PluginPlaceholderArgs): string[] {
    const detail = (error || 'WAITING FOR DATA').toUpperCase()
    return withOptionalTitle([fit(detail, context.cols)], design, context).slice(0, context.rows)
  },
}
