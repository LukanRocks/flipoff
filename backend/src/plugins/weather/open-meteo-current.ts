import { ValidationError } from '../../board/normalize'
import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fetchJson, fit } from '../lib/format'
import { OPEN_METEO_FORECAST_URL, WEATHER_CODE_LABELS, countryFlag, formatTemperature, geocode, reasonFrom, temperatureUnitFor } from './lib/open-meteo'

/**
 * Current conditions for one configured location.
 *
 * The browser used to do this itself, geolocating the viewer through ipapi.co.
 * That has no server-side equivalent -- geolocating the server's own IP would
 * report the datacentre -- so the location is an explicit setting instead.
 */
export const openMeteoCurrentPlugin: ScreenPlugin = {
  manifest: {
    id: 'open_meteo_current',
    name: 'Open-Meteo Current Weather',
    description: 'Show the current temperature and conditions for a city from Open-Meteo.',
    defaultRefreshIntervalSeconds: 900,
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
      { name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'RIGHT NOW' },
      { name: 'showCountry', label: 'Show Country', type: 'checkbox', default: true },
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

    const currentUrl =
      `${OPEN_METEO_FORECAST_URL}?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}` +
      `&current=temperature_2m,weather_code&temperature_unit=${temperatureUnit}&timezone=${encodeURIComponent(location.timezone)}`
    const response = await fetchJson(currentUrl, { signal })
    if (!response.ok) throw new ValidationError(reasonFrom(response.payload, 'Open-Meteo current weather request failed.'))

    const payload = response.payload as Record<string, unknown> | null
    const current = payload?.current
    if (typeof current !== 'object' || current === null || Array.isArray(current)) throw new ValidationError('Open-Meteo did not return current conditions.')
    const reading = current as Record<string, unknown>

    const temperature = `${formatTemperature(reading.temperature_2m)} ${unitSymbol}`
    const condition = WEATHER_CODE_LABELS[Number(reading.weather_code)] ?? 'UNKNOWN'

    const showCountry = Boolean(design.showCountry ?? true)
    const flag = countryFlag(location.countryCode)
    const countryLine = flag ? `${flag} ${location.countryCode}` : location.countryCode

    const body = [fit(location.name.toUpperCase(), context.cols), ...(showCountry ? [fit(countryLine, context.cols)] : []), temperature, fit(condition, context.cols)]

    return {
      lines: withOptionalTitle(body, design, context).slice(0, context.rows),
      meta: { city: location.name, country: location.countryCode },
    }
  },

  placeholderLines({ design, context, error }: PluginPlaceholderArgs): string[] {
    const detail = (error || 'WAITING FOR DATA').toUpperCase()
    return withOptionalTitle([fit(detail, context.cols)], design, context).slice(0, context.rows)
  },
}
