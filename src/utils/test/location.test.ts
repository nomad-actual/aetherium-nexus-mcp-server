import test from 'ava'
import type { LocationResult } from '../../types.ts'
import { closestMatch, makeLocationString } from '../location.ts'

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
