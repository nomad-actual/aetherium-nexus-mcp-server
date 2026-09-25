import test from 'ava'
import { buildTimeTool, getTime } from '../time.ts'
import { buildWebSearchTool } from '../websearch.ts'
import { buildWebScraperTool } from '../website-scraper.ts'
import { buildPackageTrackingTool } from '../trackpackage.ts'
import { buildCurrentWeatherTool, buildForecastTool } from '../weather.ts'
import type { NtpConfig, ToolsDef } from '../../types.ts'

const builders: Array<[string, () => ToolsDef]> = [
    ['fetch-current-time', buildTimeTool],
    ['fetch-current-weather', buildCurrentWeatherTool],
    ['fetch-weather-forecast', buildForecastTool],
    ['web-search', buildWebSearchTool],
    ['scrape-website', buildWebScraperTool],
    ['track-package', buildPackageTrackingTool],
]

for (const [expectedName, build] of builders) {
    test(`tool builder: ${expectedName} returns a complete tool definition`, (t) => {
        const tool = build()
        t.is(tool.name, expectedName)
        t.truthy(tool.config.title)
        t.true(tool.config.annotations.readOnlyHint)
        t.true(tool.config.annotations.openWorldHint)
        t.is(typeof tool.handler, 'function')
    })
}

test('getTime: falls back to local time when the signal is already aborted', async (t) => {
    const controller = new AbortController()
    controller.abort()

    const before = Date.now()
    const time = await getTime({ host: 'time.nist.gov', port: 123, timeout: 200 }, controller.signal)
    const after = Date.now()

    t.true(time.getTime() >= before - 1000)
    t.true(time.getTime() <= after + 1000)
})

test('getTime: falls back to local time when the ntp host is unreachable', async (t) => {
    const config: NtpConfig = { host: '127.0.0.1', port: 1, timeout: 250 }

    const before = Date.now()
    const time = await getTime(config, new AbortController().signal)
    const after = Date.now()

    t.true(time.getTime() >= before - 1000)
    t.true(time.getTime() <= after + 1000)
})
