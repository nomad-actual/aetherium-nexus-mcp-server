import type { AetheriumLocaleOptions } from '../types.ts'

export function formatTemperature(temperature: number, localeOpts: AetheriumLocaleOptions) {
    const unit = localeOpts.units === 'metric' ? 'celsius' : 'fahrenheit'

    const formatter = Intl.NumberFormat(localeOpts.region, {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: 0,
    })

    return formatter.format(temperature)
}

export function formatDateTime(date: Date, localeOpts: AetheriumLocaleOptions, timezone: string) {
    const dateStyle = 'long'
    const timeStyle = 'long'
    const hourCycle = localeOpts.is24HourTime ? 'h24' : 'h12'

    const formatter = new Intl.DateTimeFormat(localeOpts.region, {
        dateStyle,
        timeStyle,
        hourCycle,
        timeZone: timezone,
    })

    return formatter.format(date)
}

export function formatDate(date: Date, localeOpts: AetheriumLocaleOptions, timezone?: string) {
    const weekday = localeOpts.showWeekday ? 'short' : undefined
    
    return date.toLocaleDateString(localeOpts.region, { 
        year: 'numeric',
        month: localeOpts.monthStyle,
        day: 'numeric',
        weekday,
        hourCycle: localeOpts.is24HourTime ? 'h24' : 'h12',
        ...(timezone && { timeZone: timezone })
    })
}

export function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
}
