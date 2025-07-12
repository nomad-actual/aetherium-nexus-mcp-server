import { LocalizationConfig } from '../types'

export function formatTemperature(temperature: number, localeOpts: LocalizationConfig) {
    const unit = localeOpts.unit === 'metric' ? 'celsius' : 'fahrenheit'

    const formatter = Intl.NumberFormat(localeOpts.locale, {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: 0,
    })

    return formatter.format(temperature)
}

export function formatTime(date: Date, localeOpts: LocalizationConfig) {
    return date.toLocaleString(localeOpts.locale, { hour: 'numeric', minute: 'numeric' })
}

export function formatDate(date: Date, localeOpts: LocalizationConfig) {
    const weekday = localeOpts.datetime.showWeekDay ? 'short' : undefined
    
    return date.toLocaleDateString(localeOpts.locale, { 
        year: 'numeric',
        month: localeOpts.datetime.month,
        day: 'numeric',
        weekday,
        hourCycle: !!localeOpts.datetime.is24HrTime ? 'h24' : 'h12'
    })
}
