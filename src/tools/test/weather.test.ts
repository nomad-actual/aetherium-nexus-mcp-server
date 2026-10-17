import test from 'ava'
import { createRequire } from 'node:module'
import { buildCurrentWeatherTool } from '../weather.ts'
import { geocodingHttp } from '../../utils/location.ts'

const require = createRequire(import.meta.url)
const openmeteo = require('openmeteo') as {
    fetchWeatherApi: (...args: unknown[]) => Promise<unknown[]>
}

const DAYS = 7

function stubVariable(values: number[]) {
    return {
        value: () => values[0],
        valuesArray: () => values,
    }
}

// Minimal stand-in for the Open-Meteo WeatherApiResponse: just the surface
// buildWeatherData reads (current, daily, utcOffsetSeconds).
function stubWeatherResponse() {
    const fill = (v: number) => Array.from({ length: DAYS }, () => v)
    const dailyValues = [fill(1), fill(80), fill(60), fill(0), fill(0)]
    const currentValues = [72, 0, 0, 1]

    return {
        utcOffsetSeconds: () => 0,
        daily: () => ({
            time: () => 0,
            timeEnd: () => DAYS * 86400,
            interval: () => 86400,
            variables: (i: number) => stubVariable(dailyValues[i]!),
        }),
        hourly: () => null,
        current: () => ({
            variables: (i: number) => stubVariable([currentValues[i]!]),
        }),
    }
}

test('summary says Unknown Location when the geocoder has no matching city', async (t) => {
    const originalGeocodingFetch = geocodingHttp.fetch
    const originalFetch = openmeteo.fetchWeatherApi

    // The geocoder returns a place whose name does not contain the query
    // ('New York City' does not contain 'nyc'), so closestMatch returns
    // null and the handler falls back to the default location.
    geocodingHttp.fetch = (async () => ({
        ok: true,
        json: async () => ({
            results: [{
                name: 'New York City',
                latitude: 40.71,
                longitude: -74.0,
                country: 'United States',
                country_code: 'US',
                population: 8_000_000,
                timezone: 'America/New_York',
                elevation: 10,
                postalcodes: [],
                admin1: 'New York',
                admin2: '',
            }],
        }),
    })) as unknown as typeof originalGeocodingFetch

    openmeteo.fetchWeatherApi = (async () => [stubWeatherResponse()]) as typeof originalFetch
    t.teardown(() => {
        geocodingHttp.fetch = originalGeocodingFetch
        openmeteo.fetchWeatherApi = originalFetch
    })

    const tool = buildCurrentWeatherTool()
    const result = await tool.handler({ location: 'NYC' }, new AbortController().signal)

    const [summary] = result.content ?? []
    t.is(summary?.type, 'text')
    if (summary?.type !== 'text') return
    t.false(summary.text.includes('undefined'), summary.text)
    t.regex(summary.text, /^Current conditions for Unknown Location: /)
})
