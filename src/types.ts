import { CallToolResult } from "@modelcontextprotocol/sdk/types"

type LocaleUnit = 'metric' | 'imperial'

export type NtpConfig = {
    host: string,
    port?: number,
    timeout: number,
}

export type WeatherConfig = {
    lat: number,
    lon: number,
    units: LocaleUnit,
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
    currentTemp: number,
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
}

export type ScreenConfig = {
    dataRefresh: number,
    dataTimeout: number,
    ntpConfig: NtpConfig,
    weatherConfig: WeatherConfig,
    rasterizerConfig: RasterizeConfig,
}

export type RasterizeConfig = {
    height: number,
    width: number,
    background?: {
        image: string,
        color: string,
    },
}

export type LocalizationConfig = {
    locale: string, // example: en-US, de-DE, etc
    unit: LocaleUnit,
    datetime: {
        month: 'long' | 'short',
        showWeekDay: boolean,
        is24HrTime: boolean,
    },
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

export type ToolsDef = {
    name: string,
    config: any,
    handler(args: any): Promise<CallToolResult>,
}

