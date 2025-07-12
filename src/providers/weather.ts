import { fetchWeatherApi } from 'openmeteo'
import { closestMatch, makeLocationString, search } from '../utils/location.js'
import z from 'zod'
import { formatTemperature } from '../utils/formatter.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { WeatherApiResponse } from '@openmeteo/sdk/weather-api-response.js'
import { getConfig } from '../utils/config.js'
import {
    AetheriumConfig,
    CurrentWeather,
    ForcastDay,
    ToolsDef,
    WeatherData,
    WeatherQuery,
} from '../types.js'

const currentVars = ['temperature_2m', 'precipitation', 'rain', 'weather_code']
const dailyVars = ['weather_code', 'temperature_2m_max', 'temperature_2m_min']

// to use for today's future forecast rather than only now's
const hourslyVars = ['temperature_2m','precipitation']

function buildCurrent(
    currentResponse: any,
    todayForecast: ForcastDay
): CurrentWeather {
    // would like to map vars array to values but this is fine for now
    const currentTemp = currentResponse.variables(0).value()
    const precipitation = currentResponse.variables(1).value()
    const rain = currentResponse.variables(2).value()
    const weatherDesc = weatherCodeToType(currentResponse.variables(3).value())

    const current: CurrentWeather = {
        currentTemp: currentTemp,
        maxTemp: todayForecast.maxTemp,
        minTemp: todayForecast.minTemp,
        description: weatherDesc,
        precipitation,
        rain,
    }

    return current
}

// these come from openmateo's docs which
// Weather variable documentation (WMO Weather interpretation codes (WW))
function weatherCodeToType(code: string): string {
    const weatherCode: { [key: string]: string } = {
        '0': 'Clear sky',
        '1': 'Mainly clear',
        '2': 'Partly cloudy',
        '3': 'Overcast',
        '45': 'Fog',
        '48': 'Depositing rime fog',
        '51': 'Drizzle: Light intensity',
        '53': 'Drizzle: Moderate intensity',
        '55': 'Drizzle: Dense intensity',
        '56': 'Freezing Drizzle: Light intensity',
        '57': 'Freezing Drizzle: Dense intensity',
        '61': 'Rain: Slight intensity',
        '63': 'Rain: Moderate intensity',
        '65': 'Rain: Heavy intensity',
        '66': 'Freezing Rain: Light intensity',
        '67': 'Freezing Rain: Heavy intensity',
        '71': 'Snow fall: Slight intensity',
        '73': 'Snow fall: Moderate intensity',
        '75': 'Snow fall: Heavy intensity',
        '77': 'Snow grains',
        '80': 'Rain showers: Slight intensity',
        '81': 'Rain showers: Moderate intensity',
        '82': 'Rain showers: Violent intensity',
        '85': 'Snow showers: Slight intensity',
        '86': 'Snow showers: Heavy intensity',
        '95': 'Thunderstorm: Slight or moderate',
        '96': 'Thunderstorm with slight hail',
        '99': 'Thunderstorm with heavy hail',
    }

    return weatherCode[code] || 'Unknown'
}

// Helper function to form time ranges
function range(start: number, stop: number, step: number) {
    return Array.from(
        { length: (stop - start) / step },
        (_, i) => start + i * step
    )
}

function createTimeRanges(daily: any, utcOffsetSeconds: number): Date[] {
    const ranges = range(
        Number(daily.time()),
        Number(daily.timeEnd()),
        daily.interval()
    )
    return ranges.map((t) => new Date((t + utcOffsetSeconds) * 1000))
}

function buildDaily(daily: any, utcOffsetSeconds: number): ForcastDay[] {
    const weatherData: any = {
        time: createTimeRanges(daily, utcOffsetSeconds),
        weatherCode: daily.variables(0).valuesArray(),
        temperatureMax2m: daily.variables(1).valuesArray(),
        temperatureMin2m: daily.variables(2).valuesArray(),
    }

    const days: ForcastDay[] = []

    const numDays = weatherData.time.length
    for (let i = 0; i < numDays; i++) {
        days.push({
            time: weatherData.time[i].toISOString(),
            description: weatherCodeToType(weatherData.weatherCode[i]),
            maxTemp: weatherData.temperatureMax2m[i],
            minTemp: weatherData.temperatureMin2m[i],
        })
    }

    // console.log('days', days)

    return days
}

async function getWeather(weatherQuery: WeatherQuery): Promise<WeatherData> {
    const url = 'https://api.open-meteo.com/v1/forecast'

    const speedUnit = weatherQuery.units === 'metric' ? 'kph' : 'mph'
    const precipitationUnit = weatherQuery.units === 'metric' ? 'centimeter' : 'inch'
    const temperatureUnit = weatherQuery.units === 'metric' ? 'celsius' : 'fahrenheit'

    const params = {
        latitude: [weatherQuery.lat],
        longitude: [weatherQuery.lon],
        current: currentVars.join(','),
        daily: dailyVars.join(','),
        temperature_unit: temperatureUnit,
        wind_speed_unit: speedUnit,
        precipitation_unit: precipitationUnit,
        forecast_days: 5,
        timezone: weatherQuery.timezone,
    }

    const responses: WeatherApiResponse[] = await fetchWeatherApi(url, params)
    const [response] = responses

    const days = buildDaily(response.daily(), response.utcOffsetSeconds())
    const [today, tomorrow] = days

    const data: WeatherData = {
        current: buildCurrent(response.current(), today),
        tomorrow,
        days: days.slice(2), // omit today and tomorrow since we already have them
    }

    return data
}

async function currentWeatherToolHandler({ location }: any, config: AetheriumConfig): Promise<CallToolResult> {
    let locationObj = null

    const locationArg: string = location

    if (locationArg) {
        // not a huge fan of this assumption but it's fine for now
        const simpleQuery = locationArg.trim().split(',')
        const [city, state] = simpleQuery

        const locations = await search(city, { limit: 5 })

        if (locations.length === 0) {
            // todo - return mcp error instead
            throw new Error('Location not found')
        }

        locationObj = closestMatch(locations, city, state)
    }

    const weatherQuery = {
        lat: locationObj?.latitude || config.defaultLocation.lat,
        lon: locationObj?.longitude || config.defaultLocation.lon,
        timezone: locationObj?.timezone || config.defaultLocation.timezone,
        units: config.locale.units,
    }

    console.log(weatherQuery, config.defaultLocation)

    const weather = await getWeather(weatherQuery)

    console.log(`weather for ${locationObj.name}`, weather)

    const {
        currentTemp,
        maxTemp: maxTempRaw,
        description,
        precipitation,
        rain,
    } = weather.current

    const currTemp = formatTemperature(currentTemp, config.locale)
    const maxTemp = formatTemperature(maxTempRaw, config.locale)

    const weatherSummary = 
        `Current conditions for ${locationObj.name}: ${currTemp} ${description}. High of ${maxTemp}.`

    const locationStr = makeLocationString(locationObj)

    return {
        content: [
            { type: 'text', text: weatherSummary },
            { type: 'text', text: `Percipitation ${precipitation}, Rain ${rain}`}, // what about snow or hail?
            { type: 'text', text: locationStr }
        ]
    }
}

export function buildCurrentWeatherTool(): ToolsDef {
    return {
        name: 'fetch-current-weather',
        config: {
            title: 'Current Weather Fetcher',
            description: 'Gets the current weather for a given location.',
            inputSchema: {
                location: z
                    .string()
                    .optional()
                    .describe('Location to search for current weather'),
            },
            annotations: {
                title: 'Current Weather Fetcher',
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        handler: async(args: any) => {
            const config = getConfig()
            return currentWeatherToolHandler(args, config)
        }
    }
}
