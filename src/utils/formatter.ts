import type { AetheriumLocaleOptions } from '../types.js'

export function formatTemperature(temperature: number, localeOpts: AetheriumLocaleOptions) {
    const unit = localeOpts.units === 'metric' ? 'celsius' : 'fahrenheit'

    const formatter = Intl.NumberFormat(localeOpts.region, {
        style: 'unit',
        unit,
        unitDisplay: localeOpts.monthStyle,
        maximumFractionDigits: 0,
    })

    return formatter.format(temperature)
}

export function formatDateTime(date: Date, localeOpts: AetheriumLocaleOptions, timezone: string) {
    const dateStyle = 'long' // "full" | "long" | "medium" | "short"
    const timeStyle = 'long' // "full" | "long" | "medium" | "short"
    const hourCycle = localeOpts.is24HourTime ? 'h24' : 'h12' // "h11" | "h12" | "h23" | "h24"
    const dayPeriod = 'short' // "narrow" | "short" | "long
    
    const formatter = new Intl.DateTimeFormat(localeOpts.region, {
        dateStyle,
        timeStyle,
        hourCycle,
        timeZone: timezone,
    })

    return formatter.format(date)
}

export function formatDuration(startTimestamp: number) {
    const duration = (Date.now() - startTimestamp) / 1000
    return `${duration}s`
}

export function formatTime(date: Date, localeOpts: AetheriumLocaleOptions) {
    return date.toLocaleString(localeOpts.region, { hour: 'numeric', minute: 'numeric' })
}

export function formatDate(date: Date, localeOpts: AetheriumLocaleOptions) {
    const weekday = localeOpts.showWeekday ? 'short' : undefined
    
    return date.toLocaleDateString(localeOpts.region, { 
        year: 'numeric',
        month: localeOpts.monthStyle,
        day: 'numeric',
        weekday,
        hourCycle:  localeOpts.is24HourTime ? 'h24' : 'h12'
    })
}

export function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
}
