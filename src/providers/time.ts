import { Client as NTP } from 'ntp-time'
import type { AetheriumConfig, NtpConfig, ToolsDef } from '../types.js'
import { getConfig } from '../utils/config.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { formatDate, formatDateTime } from '../utils/formatter.js'
import logger from '../utils/logger.js'

export async function getTime(config: NtpConfig): Promise<Date> {
    try {
        const { host, port = 123, timeout } = config
        const client = new NTP(host, port, { timeout })

        const packet = await client.syncTime()

        // will need better logging levels (aka pino)
        // logger.info(`Time retrieved from ${config.host} - ${packet.time}`, packet)

        return packet.time
    } catch (err) {
        // log error return invalid date
        console.error('Error retrieving time', err)
        return new Date(0)
    }
}

async function timeHandler(config: AetheriumConfig): Promise<CallToolResult> {
    const time = await getTime(config.timeserver)
    const formattedTime = formatDateTime(time, config.locale, config.defaultLocation.timezone)
    const oldStyle = formatDate(time, config.locale)

    logger.info(`NTP time - ${oldStyle}`, formattedTime)

    return {
        content: [{ type: 'text', text: formattedTime }]
    }
}

export function buildTimeTool(): ToolsDef {
    return {
        name: 'fetch-current-time',
        config: {
            title: 'Current Time Fetcher',
            description: 'Gets the time from NTP',
            inputSchema: {},
            annotations: {
                title: 'Current Time',
                readOnlyHint: true,
                openWorldHint: true
            } 
        },
        handler: async () => {
            const config = getConfig()
            return timeHandler(config)
        },
    }
}
