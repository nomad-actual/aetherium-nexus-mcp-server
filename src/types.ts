import type { CallToolResult } from "@modelcontextprotocol/sdk/types.d.ts"

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
    precipitation: string, // unsure what this is
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

export type RagIndexingOpts = {
    db: {
        type: string, // 'json' | 'opensearch'
        hostUri: string // file://path/to/file.json | http://localhost:9200
    }
    limitResults: number
    semanticSearchEnabled: boolean
    directoriesToIngest: string[]
    supportedFileExts: string[]
    maxFileSizeMB: number
    ignoreDirs: string[]
}

export type LlmClientOptions = {
    type: string
    host: string
    embeddingModel: string
    embeddingModelContext: number
    semanticSearchModel: string
    semanticSearchModelContext: number
}

export type AetheriumConfig = {
    llmClient: LlmClientOptions,
    rag: RagIndexingOpts,
    mcpServer: {
        port: number
        host: string
        corsAllowedHosts: string[],
        corsAllowedOrigins: string[],
        title: string,
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
    search: {
        host: string,
        timeout: number
        contentLimit: number
        maxResults: number
    },
    locale: AetheriumLocaleOptions,
}

export type ScrapeOptions = {
    maxContentLength: number; // in characters to the closest sentence
    minReadableLength: number; // in characters,
    minScore: number,
    timeout: number,
    signal: AbortSignal
}

export type ReadableWebpageContent = {
    title: string;
    url: string;
    content: string;
    siteName: string;
    lang: string;
    publishedTime: string;
    scrapeDuration: string;
    meta: any
}

export type McpToolContent = {
    type: 'text',
    text: string,
} | {
    type: 'image',
    image: string, // base64 encoded
}

export type RagSearchQuery = {
    query: string
    resultsLimit: number
    maxContext: number,
    embeddingModel: string
    semanticRankingModel: string
}

export type RagSearchResultMetadata = {
    uri: string
    cosineSimilarityScore: number // 0-1
    vector: number[]
    bm25Score?: number, // 0-1
    semanticScore: 0 | 1,
    embeddingId: string, // uuid to id the embedding uniquely especially when combined with uri
}

export type RagSearchResult = {
    content: string
    metadata: RagSearchResultMetadata
}

export type ToolsDef = {
    name: string
    config: any
    handler(args: any, signal: AbortSignal): Promise<CallToolResult>
}

