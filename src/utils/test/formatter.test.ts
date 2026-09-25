import test from 'ava'
import {
    capitalizeFirstLetter,
    formatDate,
    formatDateTime,
    formatDuration,
    formatTemperature,
    formatTime,
} from '../formatter.ts'
import type { AetheriumLocaleOptions } from '../../types.ts'

const metricShort: AetheriumLocaleOptions = {
    region: 'en-US',
    units: 'metric',
    monthStyle: 'short',
    showWeekday: false,
    is24HourTime: false,
}

test('capitalizeFirstLetter: uppercases the first character', (t) => {
    t.is(capitalizeFirstLetter('los angeles'), 'Los angeles')
})

test('capitalizeFirstLetter: leaves an already-capitalized string unchanged', (t) => {
    t.is(capitalizeFirstLetter('Los Angeles'), 'Los Angeles')
})

test('capitalizeFirstLetter: returns an empty string for empty input', (t) => {
    t.is(capitalizeFirstLetter(''), '')
})

test('formatTemperature: formats metric values with a degree-Celsius symbol', (t) => {
    t.is(formatTemperature(21, metricShort), '21°C')
})

test('formatTemperature: formats imperial values with a degree-Fahrenheit symbol', (t) => {
    t.is(formatTemperature(21, { ...metricShort, units: 'imperial' }), '21°F')
})

test('formatDate: omits the weekday when showWeekday is false', (t) => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0))
    t.is(formatDate(date, metricShort, 'UTC'), 'Jan 15, 2026')
})

test('formatDate: includes the weekday when showWeekday is true', (t) => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0))
    t.is(
        formatDate(date, { ...metricShort, showWeekday: true, monthStyle: 'narrow' }, 'UTC'),
        'Thu, J 15, 2026',
    )
})

test('formatDate: honors the month style', (t) => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0))
    t.is(formatDate(date, { ...metricShort, monthStyle: 'long' }, 'UTC'), 'January 15, 2026')
})

test('formatDateTime: renders a long date and time in the given timezone', (t) => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0))
    t.is(formatDateTime(date, metricShort, 'UTC'), 'January 15, 2026 at 12:30:00 PM UTC')
})

test('formatTime: renders hour and minute', (t) => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0))
    t.is(formatTime(date, metricShort), '4:30 AM')
})

test('formatDuration: renders elapsed seconds since the start timestamp', (t) => {
    t.regex(formatDuration(Date.now() - 1500), /^1\.5\d*s$/)
})
