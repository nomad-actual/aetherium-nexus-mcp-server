import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

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
}

export type WeatherData = {
    current: CurrentWeather
    tomorrow: ForcastDay,
    days: ForcastDay[],
}

export type CurrentWeather = {
    temperature: number,
    maxTemp: number,
    minTemp: number,
    description: string,
    precipitation: number,
    rain: number,
}

export type ForcastDay = {
    maxTemp: number,
    minTemp: number,
    description: string,
    time: Date,
    percipitationSum: number,
    percipitationHours: number,
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


export type AetheriumLocaleOptions = {
        region: string,
        units: LocaleUnit,
        monthStyle: UnitStyle,
        showWeekday: boolean,
        is24HourTime: boolean
}

export type AetheriumConfig = {
    mcpServer: {
        port: number,
        host: string,
        cors: string[],
        title: string,
    },
    defaultLocation: {
        lat: number,
        lon: number,
        timezone: string
    },
    timeserver: { 
        host: string,
        port: number,
        timeout: number
    },
    locale: AetheriumLocaleOptions,
}

export type ToolsDef = {
    name: string,
    config: any,
    handler(args: any): Promise<CallToolResult>,
}

