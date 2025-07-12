import { Client as NTP } from 'ntp-time'
import { NtpConfig } from '../types'

export async function getTime(config: NtpConfig): Promise<Date> {
    try {
        const { host, port = 123, timeout } = config
        const client = new NTP(host, port, { timeout })

        const packet = await client.syncTime()

        // will need better logging levels (aka pino)
        // console.log(`Time retrieved from ${config.host} - ${packet.time}`, packet)

        return packet.time
    } catch (err) {
        // log error return invalid date
        console.error('Error retrieving time', err)
        return new Date(0)
    }
}
