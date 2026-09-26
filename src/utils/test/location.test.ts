import test from 'ava'
import type { LocationResult } from '../../types.ts'
import { closestMatch, findNearestCity, makeLocationString } from '../location.ts'

function makeLocation(overrides: Partial<LocationResult> = {}): LocationResult {
    return {
        latitude: 37.7749,
        longitude: -122.4194,
        name: 'Testville',
        country: 'United States of America',
        countryCode: 'US',
        population: 1000,
        timezone: 'America/Los_Angeles',
        elevation: 0,
        postalCodes: [],
        state: 'Test State',
        county: 'Test County',
        ...overrides,
    }
}

const springfields = [
    makeLocation({ name: 'Springfield', state: 'Missouri', population: 169_000 }),
    makeLocation({ name: 'Springfield', state: 'Illinois', population: 59_000 }),
    makeLocation({ name: 'Springfield', state: 'California', population: 34_000 }),
]

test('closestMatch: matches by 2-letter state abbreviation', (t) => {
    const match = closestMatch(springfields, 'Springfield', 'IL')
    t.is(match?.state, 'Illinois')
})

test('closestMatch: matches by full state name (the reported bug)', (t) => {
    const match = closestMatch(springfields, 'Springfield', 'California')
    t.is(match?.state, 'California')
})

test('closestMatch: matches full state name case-insensitively', (t) => {
    const match = closestMatch(springfields, 'Springfield', 'iLLINOis')
    t.is(match?.state, 'Illinois')
})

test('closestMatch: falls back to population sort when no state is given', (t) => {
    const match = closestMatch(springfields, 'Springfield')
    t.is(match?.state, 'Missouri')
})

test('closestMatch: falls back to population sort for unrecognized states (e.g. non-US provinces)', (t) => {
    const match = closestMatch(springfields, 'Springfield', 'Ontario')
    t.is(match?.state, 'Missouri')
})

test('closestMatch: falls back to population sort when no location matches the state', (t) => {
    const match = closestMatch(springfields, 'Springfield', 'TX')
    t.is(match?.state, 'Missouri')
})

test('closestMatch: returns null when the city matches nothing', (t) => {
    t.is(closestMatch(springfields, 'Nowhereville', 'CA'), null)
})

test('closestMatch: returns null for an empty city or empty location list', (t) => {
    t.is(closestMatch(springfields, '', 'CA'), null)
    t.is(closestMatch([], 'Springfield', 'CA'), null)
})

test('makeLocationString: returns Unknown Location for null', (t) => {
    t.is(makeLocationString(null), 'Unknown Location')
})

test('makeLocationString: returns name only when state is missing (no crash)', (t) => {
    const { state: _state, ...location } = makeLocation()
    t.is(makeLocationString(location as LocationResult), 'Testville')
})

test('makeLocationString: returns name only when state is empty', (t) => {
    t.is(makeLocationString(makeLocation({ state: '' })), 'Testville')
})

test('makeLocationString: omits state when it duplicates the name case-insensitively', (t) => {
    t.is(makeLocationString(makeLocation({ name: 'Georgia', state: 'georgia' })), 'Georgia')
})

test('makeLocationString: joins name and state with a comma', (t) => {
    t.is(makeLocationString(makeLocation({ name: 'San Francisco', state: 'California' })), 'San Francisco, California')
})

test('findNearestCity: resolves Los Angeles for coordinates in LA', (t) => {
    const city = findNearestCity(34.0522, -118.2437)
    t.is(city?.name, 'Los Angeles')
    t.is(city?.state, 'California')
})

test('findNearestCity: resolves New York City for coordinates in NYC', (t) => {
    const city = findNearestCity(40.7128, -74.006)
    t.is(city?.name, 'New York City')
    t.is(city?.state, 'New York')
})

test('findNearestCity: resolves San Francisco for coordinates in SF', (t) => {
    const city = findNearestCity(37.7749, -122.4194)
    t.is(city?.name, 'San Francisco')
})

test('findNearestCity: repeated lookups use precomputed coordinates', (t) => {
    // Warm up so the one-time lazy DB load is not part of the measurement.
    findNearestCity(34.0522, -118.2437)

    const startedAt = Date.now()
    for (let i = 0; i < 50; i++) {
        findNearestCity(34.0522 + i * 0.0001, -118.2437)
    }
    const elapsed = Date.now() - startedAt

    // With precomputed numbers, 50 lookups take ~60ms on the reference
    // machine; the old per-call parseFloat over 32k lat/lng strings took
    // ~180ms for the same 50 lookups. The threshold sits between the two, so
    // it holds on machines within ~2x of the reference speed.
    t.true(elapsed < 120, `50 lookups took ${elapsed}ms`)
})
