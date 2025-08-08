import { find } from 'geo-tz'
import { AetheriumConfig, UnitStyle } from '../types.js';

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

let config: AetheriumConfig | null = null;

export function getConfig(): AetheriumConfig {
    if (config) {
        return config
    }

    const mcpServerPort = parseInt(process.env.MCP_SERVER_PORT || '', 10) || 3000;
    const mcpServerHost = process.env.MCP_SERVER_HOST || 'localhost';
    const mcpServerCors = process.env.MCP_SERVER_CORS ? process.env.MCP_SERVER_CORS.split(',') : [];
    const mcpServerTitle = process.env.MCP_SERVER_TITLE || 'Default MCP server';

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
    const searchTimeout = parseInt(process.env.SEARCH_TIMEOUT || '', 10) || 10_000
    const searchContentLimit = parseInt(process.env.SEARCH_PAGE_CONTENT_LIMIT || '', 10) || 5_000
    const maxResults = parseInt(process.env.SEARCH_MAX_RESULTS || '', 10) || 5

    const llmClient = {
        type: 'ollama',
        host: process.env.LLM_HOST || 'localhost',
        embeddingModel: process.env.EMBEDDING_MODEL || '',
        embeddingModelContext: parseInt(process.env.EMBEDDING_MODEL_CONTEXT || '', 10) || 512,
        semanticSearchModel: process.env.SEMANTIC_SEARCH_MODEL || '',
        semanticSearchModelContext: parseInt(process.env.SEMANTIC_SEARCH_MODEL_CONTEXT || '', 10) || 512,
    }

    const ragConfig = {
        limitResults: parseInt(process.env.RAG_LIMIT_RESULTS || '10', 10),
        semanticSearchEnabled: process.env.SEMANTIC_SEARCH_ENABLED === 'true', // must have semanticSearchModel set
        directoriesToIngest: (process.env.RAG_SOURCE_DIRECTORIES || '').split('|'),
        supportedFileExts: (process.env.RAG_INCLUDE_FILE_EXT || '').split('|'),
        maxFileSizeMB: parseInt(process.env.RAG_MAX_FILE_SIZE_MB || '', 10) || 10,
        ignoreDirs: (process.env.RAG_IGNORE_DIRS || '').split('|'),
    }

    config = {
        llmClient: llmClient,
        rag: ragConfig,
        mcpServer: {
            port: mcpServerPort,
            host: mcpServerHost,
            cors: mcpServerCors,
            title: mcpServerTitle,
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

