import test from 'ava'
import { getConfig } from '../config.ts'

// getConfig caches on first call, so env vars must be set before any test runs.
process.env.MCP_SERVER_PORT = '4321'
process.env.MCP_SERVER_HOST = '0.0.0.0'
process.env.MCP_SERVER_CORS_ALLOWED_ORIGINS = 'https://a.test|https://b.test'
process.env.MCP_SERVER_CORS_ALLOWED_HOSTS = 'a.test'
process.env.MCP_SERVER_TITLE = 'Test Title'
process.env.TOOL_CALL_TIMEOUT = '12345'

process.env.DEFAULT_LOCATION_LAT = '51.5074'
process.env.DEFAULT_LOCATION_LON = '-0.1278'

process.env.TIMESERVER_PORT = '234'
process.env.TIMESERVER_TIMEOUT = '333'

process.env.LOCALE_UNITS = 'metric'
process.env.LOCALE_MONTH = 'long'
process.env.LOCALE_SHOWWEEKDAY = 'false'
process.env.IS_24_HOUR_TIME = 'true'

process.env.SEARCH_HOST = 'http://search.test:8080'
process.env.SEARCH_TIMEOUT = '2500'
process.env.SEARCH_PAGE_CONTENT_LIMIT = '777'
process.env.SEARCH_MAX_RESULTS = '9'

process.env.SCRAPER_CONTENT_LIMIT = '50000'
process.env.SCRAPER_REQUEST_TIMEOUT = '8000'
process.env.SCRAPER_CRW_ONLY_MAIN_CONTENT = 'false'
process.env.SCRAPER_BASIC_MIN_LENGTH = '300'

test.serial('getConfig: applies env var overrides', (t) => {
    const config = getConfig()

    t.is(config.mcpServer.port, 4321)
    t.is(config.mcpServer.host, '0.0.0.0')
    t.deepEqual(config.mcpServer.corsAllowedOrigins, ['https://a.test', 'https://b.test'])
    t.deepEqual(config.mcpServer.corsAllowedHosts, ['a.test'])
    t.is(config.mcpServer.title, 'Test Title')
    t.is(config.mcpServer.toolCallRequestTimeout, 12345)

    t.is(config.defaultLocation.lat, 51.5074)
    t.is(config.defaultLocation.lon, -0.1278)
    t.is(config.defaultLocation.timezone, 'Europe/London')

    t.is(config.timeserver.port, 234)
    t.is(config.timeserver.timeout, 333)

    t.is(config.locale.units, 'metric')
    t.is(config.locale.monthStyle, 'long')
    t.is(config.locale.showWeekday, false)
    t.is(config.locale.is24HourTime, true)

    t.is(config.search.host, 'http://search.test:8080')
    t.is(config.search.timeout, 2500)
    t.is(config.search.contentLimit, 777)
    t.is(config.search.maxResults, 9)

    t.is(config.scraper.contentLimit, 50000)
    t.is(config.scraper.timeout, 8000)
    t.is(config.scraper.crw.onlyMainContent, false)
    t.is(config.scraper.basicHtmlReader.minReadableLength, 300)
})

test.serial('getConfig: falls back to defaults for unset vars', (t) => {
    const config = getConfig()

    t.is(config.mcpServer.version, 'dev')
    t.is(config.timeserver.host, 'time.nist.gov')
    t.is(config.locale.region, 'en-US')
    t.is(config.scraper.crw.host, '')
    t.is(config.scraper.crw.apiKey, '')
    t.is(config.scraper.crw.renderJs, null)
})

test.serial('getConfig: returns the cached instance', (t) => {
    t.is(getConfig(), getConfig())
})
