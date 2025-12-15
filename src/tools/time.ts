import { Client as NTP } from 'ntp-time'
import type { AetheriumConfig, NtpConfig, ToolsDef } from '../types.ts'
import { getConfig } from '../utils/config.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'
import { formatDate, formatDateTime } from '../utils/formatter.ts'
import logger from '../utils/logger.ts'
import { abort } from '../utils/promises.ts'

export async function getTime(config: NtpConfig, abortSignal: AbortSignal): Promise<Date> {
    try {
        const { host, port = 123, timeout } = config
        const client = new NTP(host, port, { timeout })

        const packet = await abort(client.syncTime(), abortSignal, 'Global timeout reached')

        // will need better logging levels (aka pino)
        logger.info(`Time retrieved ${packet.time}`)

        return packet.time
    } catch (err) {
        // log error return invalid date
        console.error('Error retrieving time', err)
        return new Date(0)
    }
}

async function timeHandler(config: AetheriumConfig, abortSignal: AbortSignal): Promise<CallToolResult> {
    const time = await getTime(config.timeserver, abortSignal)
    const formattedTime = formatDateTime(time, config.locale, config.defaultLocation.timezone)
    const oldStyle = formatDate(time, config.locale)

    logger.info(`NTP time - ${oldStyle} - ${formattedTime}`)

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
        handler: async (_, abortSignal: AbortSignal) => {
            const config = getConfig()
            return timeHandler(config, abortSignal)
        },
    }
}
