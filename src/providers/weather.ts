import { fetchWeatherApi } from 'openmeteo'
import { closestMatch, makeLocationString, search } from '../utils/location.js'
import z from 'zod'
import { formatDate, formatTemperature } from '../utils/formatter.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { WeatherApiResponse } from '@openmeteo/sdk/weather-api-response.js'
import { getConfig } from '../utils/config.js'
import type {
    AetheriumConfig,
    CurrentWeather,
    ForecastDay,
    ForecastHour,
    LocationResult,
    ToolsDef,
    WeatherData,
    WeatherQuery,
} from '../types.js'
import logger from '../utils/logger.js'
import { getTime } from './time.js'

const currentVars = ['temperature_2m', 'precipitation', 'rain', 'weather_code']
const dailyVars = [
    'weather_code', 'temperature_2m_max', 
    'temperature_2m_min', 'precipitation_sum', 
    'precipitation_hours'
]

// to use for today's future forecast rather than only now's
const hourlyVars = [
    "temperature_2m", 
    "apparent_temperature", 
    "precipitation_probability", 
    "precipitation",
    "weather_code",
]

function buildCurrent(currentResponse: any, todayForecast: ForecastDay): CurrentWeather {
    // would like to map vars array to values but this is fine for now
    const currentTemp = currentResponse.variables(0).value()
    const precipitation = currentResponse.variables(1).value()
    const rain = currentResponse.variables(2).value()
    const weatherDesc = weatherCodeToType(currentResponse.variables(3).value())

    const current: CurrentWeather = {
        temperature: currentTemp,
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

function createTimeRanges(times: any, utcOffsetSeconds: number): Date[] {
    const ranges = range(
        Number(times.time()),
        Number(times.timeEnd()),
        times.interval()
    )
    return ranges.map((t) => new Date((t + utcOffsetSeconds) * 1000))
}

function buildHourly(hourly: any, utcOffsetSeconds: number): ForecastHour[] {
    if (!hourly) return []

    const weatherData: any = {
        time: createTimeRanges(hourly, utcOffsetSeconds),
		temperature2m: hourly.variables(0)!.valuesArray()!,
		apparentTemperature: hourly.variables(1)!.valuesArray()!,
		precipitationProbability: hourly.variables(2)!.valuesArray()!,
		precipitation: hourly.variables(3)!.valuesArray()!,
		weatherCode: hourly.variables(4)!.valuesArray()!,
    }

    const hours: ForecastHour[] = []
    const len = weatherData.time.length

    for (let i = 0; i < len; i++) {
        hours.push({
            time: weatherData.time[i].toISOString(),
            description: weatherCodeToType(weatherData.weatherCode[i]),
            temperature: weatherData.temperature2m[i],
            feelsLike: weatherData.apparentTemperature[i],
            precipitationProbability: weatherData.precipitationProbability[i],
            precipitation: weatherData.precipitation[i],
        })
    }

    return hours
}

function buildDaily(daily: any, utcOffsetSeconds: number): ForecastDay[] {
    if (!daily) return []

    const weatherData: any = {
        time: createTimeRanges(daily, utcOffsetSeconds),
        weatherCode: daily.variables(0).valuesArray(),
        temperatureMax2m: daily.variables(1).valuesArray(),
        temperatureMin2m: daily.variables(2).valuesArray(),
        percipitationSum: daily.variables(3).valuesArray(),
        percipitationHours: daily.variables(4).valuesArray()
    }

    const days: ForecastDay[] = []

    const numDays = weatherData.time.length
    for (let i = 0; i < numDays; i++) {
        days.push({
            time: weatherData.time[i].toISOString(),
            description: weatherCodeToType(weatherData.weatherCode[i]),
            maxTemp: weatherData.temperatureMax2m[i],
            minTemp: weatherData.temperatureMin2m[i],
            percipitationSum: weatherData.percipitationSum[i],
            percipitationHours: weatherData.percipitationHours[i],
        })
    }

    return days
}

async function fetchWeather(weatherQuery: WeatherQuery): Promise<WeatherApiResponse>{
    const url = 'https://api.open-meteo.com/v1/forecast'

    const speedUnit = weatherQuery.units === 'metric' ? 'kph' : 'mph'
    const precipitationUnit = weatherQuery.units === 'metric' ? 'centimeter' : 'inch'
    const temperatureUnit = weatherQuery.units === 'metric' ? 'celsius' : 'fahrenheit'

    const params: any = {
        latitude: [weatherQuery.lat],
        longitude: [weatherQuery.lon],
        temperature_unit: temperatureUnit,
        wind_speed_unit: speedUnit,
        precipitation_unit: precipitationUnit,
        forecast_days: 3,
        timezone: weatherQuery.timezone,
    }

    if (weatherQuery.currentWeatherVars.length > 0) {
        params.current = weatherQuery.currentWeatherVars.join(',')
    }
    if (weatherQuery.hourlyWeatherVars.length > 0) {
        params.hourly = weatherQuery.hourlyWeatherVars.join(',')
    }
    if (weatherQuery.dailyWeatherVars.length > 0) {
        params.daily = weatherQuery.dailyWeatherVars.join(',')
    }

    const responses: WeatherApiResponse[] = await fetchWeatherApi(url, params)
    const [response] = responses

    if (!response) {
        throw new Error('No weather data available')
    }

    return response
}

function buildWeatherData(response: WeatherApiResponse): WeatherData {
    logger.info({ message: 'Building weather data days' })
    const days = buildDaily(response.daily(), response.utcOffsetSeconds())

    logger.info({ message: 'Building weather data hours' })
    const hours = buildHourly(response.hourly(), response.utcOffsetSeconds())
    const [today] = days
    if (!today) {
        logger.error({ message: 'Weather data incomplete' })
        throw new Error('Weather data incomplete')
    }

    const current = buildCurrent(response.current(), today)

    const weather: WeatherData = {
        current,
        hours,
        days,
    }

    return weather
}

async function fetchLocation(locationArg: string): Promise<LocationResult | null> {
    if (!locationArg) {
        return null
    }

    // not a huge fan of this assumption but it's fine for now
    const simpleQuery = locationArg.trim().split(',')
    const [city = '', state] = simpleQuery

    const locations = await search(city, { limit: 5 })

    if (locations.length === 0) {
        // todo - return mcp error instead
        throw new Error('Location not found')
    }

    return closestMatch(locations, city, state)
}

async function currentWeatherToolHandler({ location }: any, config: AetheriumConfig): Promise<CallToolResult> {
    const locationObj = await fetchLocation(location)

    const weatherQuery: WeatherQuery = {
        lat: locationObj?.latitude || config.defaultLocation.lat,
        lon: locationObj?.longitude || config.defaultLocation.lon,
        timezone: locationObj?.timezone || config.defaultLocation.timezone,
        units: config.locale.units,
        currentWeatherVars: currentVars,
        dailyWeatherVars: dailyVars,
        hourlyWeatherVars: [],
        forecastDays: 3 // todo: config
    }

    logger.info(`Weather Query ${weatherQuery} default location: ${config.defaultLocation }`)

    const response = await fetchWeather(weatherQuery)
    const weather = buildWeatherData(response)

    const { current } = weather
    const {
        temperature,
        maxTemp: maxTempRaw,
        description,
        precipitation,
        rain,
    } = current

    const currTemp = formatTemperature(temperature, config.locale)
    const maxTemp = formatTemperature(maxTempRaw, config.locale)

    const weatherSummary = 
        `Current conditions for ${locationObj?.name}: ${currTemp} ${description}. High of ${maxTemp}.`

    const locationStr = makeLocationString(locationObj)

    return {
        content: [
            { type: 'text', text: weatherSummary },
            // improve this by adding more details about the weather conditions (e.g., humidity, wind speed)
            // also units
            // what about snow or hail?
            { type: 'text', text: `Percipitation ${precipitation}, Rain ${rain}`},
            { type: 'text', text: locationStr }
        ]
    }
}

async function weatherForecastToolHandler({ location }: any, config: AetheriumConfig): Promise<CallToolResult> {
    const locationObj = await fetchLocation(location)
    const time = await getTime(config.timeserver)
    const day = formatDate(time, config.locale)

    const forecastDays = 3

    const weatherQuery: WeatherQuery = {
        lat: locationObj?.latitude || config.defaultLocation.lat,
        lon: locationObj?.longitude || config.defaultLocation.lon,
        timezone: locationObj?.timezone || config.defaultLocation.timezone,
        units: config.locale.units,
        currentWeatherVars: currentVars,
        dailyWeatherVars: dailyVars,
        hourlyWeatherVars: hourlyVars,
        forecastDays // todo: config
    }

    logger.info(`Weather Query ${weatherQuery} default location: ${config.defaultLocation }`)

    const response = await fetchWeather(weatherQuery)
    const weather = buildWeatherData(response)

    // todo: figure this part out XD
    const { current } = weather
    const {
        temperature,
        maxTemp: maxTempRaw,
        description,
        precipitation,
        rain,
    } = current

    const currTemp = formatTemperature(temperature, config.locale)
    const maxTemp = formatTemperature(maxTempRaw, config.locale)

    const weatherSummary = 
        `Current conditions for ${locationObj?.name}: ${currTemp} ${description}. High of ${maxTemp}.`

    const locationStr = makeLocationString(locationObj)

    logger.info(`Weather Summary: ${weatherSummary} Location: ${locationStr} `)

    // omit the hours including the one we're in
    // const hoursWeCareAbout = weather.hours.filter((hourlyData) => {
    //     if (hourlyData.time < new Date()) {
    //         return false;
    //     }
    //     return true;
    // })

    return {
        content: [
            { type: 'text', text: weatherSummary },
            { type: 'text', text: locationStr },
            { type: 'text', text: `Today is ${day}.` },
            { type: 'text', text: `Forecast for the next ${forecastDays} days ${JSON.stringify(weather.days)}`},
        ]
    }


}

export function buildCurrentWeatherTool(): ToolsDef {
    return {
        name: 'fetch-current-weather',
        config: {
            title: 'Current Weather Fetcher',
            description: 'Gets the current weather for an optional location.',
            inputSchema: {
                location: z.optional(
                    z.string({ description: 'Location to search for current weather' })
                )
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

export function buildForecastTool(): ToolsDef {
    return {
        name: 'fetch-weather-forecast',
        config: {
            title: 'Weather Forecast Fetcher',
            description: 'Gets the weather forecast for a given location.',
            inputSchema: {
                location: z.optional(
                    z.string({ description: 'Location to search for weather forecast' })
                )
            },
            annotations: {
                title: 'Weather Forecast Fetcher',
                readOnlyHint: true,
                openWorldHint: true,
            }
        },
        handler: async(args: any) => {
            try {
                const config = getConfig()
                return weatherForecastToolHandler(args, config)
            } catch (error) {
                logger.error(error, 'Error fetching weather forecast',);
                throw error
            }
        }
    }
}
