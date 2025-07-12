import { AetheriumLocaleOptions } from '../types.js'

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
