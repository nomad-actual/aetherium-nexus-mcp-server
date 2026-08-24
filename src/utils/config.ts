import { find } from 'geo-tz'
import type { AetheriumConfig, UnitStyle } from '../types.ts';

function parseMonthStyle(monthStyle: string): UnitStyle {
    switch (monthStyle.toLowerCase()) {
        case 'long':
            return 'long';
        case 'narrow':
            return 'narrow';
        default:
            return 'short';
    }
}

function toNum(envName: string, def: number) {
    if (!envName) return def

    const temp = parseInt(envName, 10)

    if (temp === 0) return 0

    return temp || def
}

let config: AetheriumConfig | null = null;

export function getConfig(): AetheriumConfig {
    if (config) {
        return config
    }

    const mcpServerPort = parseInt(process.env.MCP_SERVER_PORT || '', 10) || 3000;
    const mcpServerHost = process.env.MCP_SERVER_HOST || 'localhost';
    const mcpServerCorsCorsAllowedOrigins = process.env.MCP_SERVER_CORS_ALLOWED_ORIGINS ? process.env.MCP_SERVER_CORS_ALLOWED_ORIGINS.split('|') : [];
    const mcpServerCorsCorsAllowedHosts = process.env.MCP_SERVER_CORS_ALLOWED_HOSTS ? process.env.MCP_SERVER_CORS_ALLOWED_HOSTS.split('|') : [];
    const mcpServerTitle = process.env.MCP_SERVER_TITLE || 'Default MCP server';
    const toolCallTimeout = parseInt(process.env.TOOL_CALL_TIMEOUT || '', 10) || 30_000;

    const lat = parseFloat(process.env.DEFAULT_LOCATION_LAT || '') || 34.052235;
    const lon = parseFloat(process.env.DEFAULT_LOCATION_LON || '') || -118.243683;
    const timezone = find(lat, lon)[0] || 'America/Los_Angeles';
    
    const timeserverHost = process.env.TIMESERVER_HOST || 'time.nist.gov';
    const timeserverPort = parseInt(process.env.TIMESERVER_PORT || '', 10) || 123;
    const timeserverTimeout = parseInt(process.env.TIMESERVER_TIMEOUT || '', 10) || 200;

    const localeRegion = process.env.LOCALE_REGION || 'en-US';
    const localeUnits = process.env.LOCALE_UNITS === 'imperial' ? 'imperial' : 'metric';
    const localeMonth = parseMonthStyle(process.env.LOCALE_MONTH || 'short');
    const showWeekday = process.env.LOCALE_SHOWWEEKDAY === 'true';
    const is24HourTime = process.env.IS_24_HOUR_TIME === 'true';

    const searchHost = process.env.SEARCH_HOST || ''
    const searchTimeout = parseInt(process.env.SEARCH_TIMEOUT || '', 10) || 5_000
    const searchContentLimit = parseInt(process.env.SEARCH_PAGE_CONTENT_LIMIT || '', 10) || 5_000
    const maxResults = parseInt(process.env.SEARCH_MAX_RESULTS || '', 10) || 5

    config = {
        mcpServer: {
            port: mcpServerPort,
            host: mcpServerHost,
            corsAllowedHosts: mcpServerCorsCorsAllowedHosts,
            corsAllowedOrigins: mcpServerCorsCorsAllowedOrigins,
            title: mcpServerTitle,
            toolCallRequestTimeout: toolCallTimeout,
        },
        defaultLocation: {
            lat: lat,
            lon: lon,
            timezone
        },
        timeserver: {
            host: timeserverHost,
            port: timeserverPort,
            timeout: timeserverTimeout
        },
        search: {
            host: searchHost,
            timeout: searchTimeout,
            contentLimit: searchContentLimit,
            maxResults: maxResults,
        },
        scraper: {
            contentLimit: parseInt(process.env.SCRAPER_CONTENT_LIMIT || '', 10) || 100_000,
            timeout: parseInt(process.env.SCRAPER_REQUEST_TIMEOUT || '', 10) || 15_000,
            crw: {
                host: process.env.SCRAPER_CRW_HOST || '',
                apiKey: process.env.SCRAPER_CRW_API_KEY || '',
                renderJs: process.env.SCRAPER_CRW_RENDER_JS === 'true' ? true : process.env.SCRAPER_CRW_RENDER_JS === 'false' ? false : null,
                onlyMainContent: process.env.SCRAPER_CRW_ONLY_MAIN_CONTENT !== 'false',
            },
            basicHtmlReader: {
                minScore: parseInt(process.env.SCRAPER_BASIC_MIN_SCORE || '', 10) || 20,
                minReadableLength: parseInt(process.env.SCRAPER_BASIC_MIN_LENGTH || '', 10) || 140,
            }
        },
        locale: {
            region: localeRegion,
            units: localeUnits,
            monthStyle: localeMonth,
            showWeekday: showWeekday,
            is24HourTime,
        }
    }

    return config
}

