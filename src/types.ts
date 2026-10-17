import type { CallToolResult } from "@modelcontextprotocol/sdk/types.d.ts"
import type * as z from 'zod'

type LocaleUnit = 'metric' | 'imperial'

export type UnitStyle = 'short' | 'long' | 'narrow'

export type NtpConfig = {
    host: string,
    port?: number,
    timeout: number,
}

export type WeatherQuery = {
    lat: number,
    lon: number,
    units: LocaleUnit,
    timezone: string,
    currentWeatherVars: string[],
    dailyWeatherVars: string[],
    hourlyWeatherVars: string[],
    forecastDays: number,
}

export type ForecastHour = {
    time: Date,
    temperature: number,
    feelsLike: number,
    precipitationProbability: number,
    precipitation: number,
    description: string,
}

export type WeatherData = {
    current: CurrentWeather
    days: ForecastDay[],
    hours: ForecastHour[],
}

export type CurrentWeather = {
    temperature: number,
    maxTemp: number,
    minTemp: number,
    description: string,
    precipitation: number,
    rain: number,
}

export type ForecastDay = {
    maxTemp: number,
    minTemp: number,
    description: string,
    time: Date,
    precipitationSum: number,
    precipitationHours: number,
}

 export type LocationResult = { 
    latitude: number,
    longitude: number,
    name: string,
    country: string,
    countryCode: string,
    population: number,
    timezone: string,
    elevation: number,
    postalCodes: string[],
    state: string, // example: California, New York, etc
    county: string, // example: Los Angeles County, Brooklyn, etc
}

export interface City {
    name: string;
    country: string;
    state: string;
    county: string;
    lat: string
    lng: string
}

export type AetheriumLocaleOptions = {
        region: string,
        units: LocaleUnit,
        monthStyle: UnitStyle,
        showWeekday: boolean,
        is24HourTime: boolean
}

export type AetheriumConfig = {
    mcpServer: {
        port: number
        host: string
        corsAllowedHosts: string[],
        corsAllowedOrigins: string[],
        authToken: string,
        title: string,
        version: string,
        toolCallRequestTimeout: number
    },
    defaultLocation: {
        lat: number
        lon: number
        timezone: string
    },
    timeserver: { 
        host: string
        port: number
        timeout: number
    },
    scraper: {
        contentLimit: number,
        timeout: number,
        connectTimeout: number,
        maxConcurrent: number,
        maxBytes: number,
        crw: {
            host: string,
            apiKey: string,
            renderJs: boolean | null,
            onlyMainContent: boolean,
        },
        basicHtmlReader: {
            minReadableLength: number,
        }
    },
    search: {
        host: string,
        timeout: number
        maxResults: number
    },
    weather: {
        forecastDays: number,
    },
    locale: AetheriumLocaleOptions,
}

export type ReadableWebpageContent = {
    title: string;
    url: string;
    content: string;
    siteName: string;
    lang: string;
    publishedTime: string;
    scrapeDuration: string;
    meta: Record<string, string>
}

export type McpToolContent = {
    type: 'text',
    text: string,
}

export type ToolsDef = {
    name: string
    config: Record<string, unknown>
    handler(args: Record<string, unknown>, signal: AbortSignal): Promise<CallToolResult>
}

