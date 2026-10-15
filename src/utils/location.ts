
import axios from 'axios';
import type { City, LocationResult } from '../types.ts';
import logger from './logger.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// sorted by lat, lon
let citiesDb = [] as City[]
// Numeric coordinates, parallel to citiesDb and precomputed at load time so
// findNearestCity never re-parses the lat/lng strings on every call.
let cityCoords: { lat: number; lng: number }[] = []

// Grid-based prefilter: bucket cities into 1° cells so findNearestCity
// only haversine-scans a tiny subset instead of all 32 763 cities.
interface GridCell {
    latBucket: number
    lngBucket: number
    indices: number[]
}
let cityGrid: Map<string, GridCell> = new Map()
let dbLoaded = false

function loadDb() {
    const fp = path.join(import.meta.dirname, 'location-db','world_cities_15000_(including_all_states_and_counties).json')
    const raw = readFileSync(fp, { encoding: 'utf8' });
    citiesDb = JSON.parse(raw)
    cityCoords = citiesDb.map((city) => ({ lat: Number(city.lat), lng: Number(city.lng) }))

    // Build the 1° grid: bucket each city by floor(lat) and floor(lng)
    cityGrid = new Map()
    for (let i = 0; i < citiesDb.length; i++) {
        const lat = cityCoords[i].lat
        const lng = cityCoords[i].lng
        const key = `${Math.floor(lat)},${Math.floor(lng)}`
        let cell = cityGrid.get(key)
        if (!cell) {
            cell = { latBucket: Math.floor(lat), lngBucket: Math.floor(lng), indices: [] }
            cityGrid.set(key, cell)
        }
        cell.indices.push(i)
    }

    dbLoaded = true
}

// Loaded lazily so importing this module doesn't block startup on the ~5 MB
// JSON read; the first lookup pays the cost instead.
function ensureDbLoaded() {
    if (!dbLoaded) loadDb()
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function findNearestCity(lat: number, lon: number): City | null {
    ensureDbLoaded()
    if (!citiesDb.length) return null;

    let nearestCity: City | null = null
    let minDistance = Infinity

    // Scan the target cell and all 8 adjacent cells (a 3×3 window)
    const latBucket = Math.floor(lat)
    const lngBucket = Math.floor(lon)
    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
            const key = `${latBucket + dLat},${lngBucket + dLng}`
            const cell = cityGrid.get(key)
            if (!cell) continue
            for (const idx of cell.indices) {
                const distance = haversineDistance(lat, lon, cityCoords[idx].lat, cityCoords[idx].lng)
                if (distance < minDistance) {
                    minDistance = distance
                    nearestCity = citiesDb[idx]
                }
            }
        }
    }

    return nearestCity
  }


export async function searchLocation(query: string, { limit = 10, language = 'en' }, timeout: number, signal: AbortSignal): Promise<LocationResult[]> {

    const url = 'https://geocoding-api.open-meteo.com/v1/search'

    const locationResp = await axios.get(url, {
        params: { 
            name: query,
            count: limit,
            language: language,
            format: 'json',
        },
        timeout,
        signal,
    })

    const { results } = locationResp.data
    
    const locations: LocationResult[] = (results || []).map((r: any) => {
        return {
            latitude: r.latitude,
            longitude: r.longitude,
            name: r.name,
            country: r.country,
            countryCode: r.country_code,
            population: r.population,
            timezone: r.timezone,
            elevation: r.elevation,
            postalCodes: r.postalcodes,
            state: r.admin1,
            county: r.admin2,
        }
    })

    return locations
}

const stateMap = new Map([
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming']
]);

// Resolves a user-supplied state (2-letter abbreviation or full name, any case)
// to the canonical full state name, or null when it is not a recognized US state.
function resolveStateFullName(stateOrProvince: string): string | null {
  const trimmed = stateOrProvince.trim();
  if (!trimmed) return null;

  const byAbbreviation = stateMap.get(trimmed.toUpperCase());
  if (byAbbreviation) return byAbbreviation;

  const lower = trimmed.toLowerCase();
  for (const fullName of stateMap.values()) {
    if (fullName.toLowerCase() === lower) return fullName;
  }

  return null;
}

export function closestMatch(locations: LocationResult[], city: string, stateOrProvince?: string): LocationResult | null {
    if (!city) return null;
    if (locations.length === 0) return null;

    const stateFullName = stateOrProvince ? resolveStateFullName(stateOrProvince) : null;
    const lowerCityName = city.toLowerCase();

    const likely = locations.filter(location => 
        location.name.toLowerCase().includes(lowerCityName)
    );

    if (likely.length === 0) {
        logger.info(`no matches for ${city}`);
        return null;
    }

    let stateSearch = likely.find(loc => loc.state === stateFullName)
    if (stateSearch) {
        logger.info(`found exact match for ${city} ${stateFullName}`)
        return stateSearch;
    }

    logger.info('no exact match, finding closest by population')
    likely.sort((a, b) => b.population - a.population);
    logger.info(`chosen: ${likely[0]}`)

    const [hopefully] = likely

    return hopefully || null;
}

export function makeLocationString(location: LocationResult | null): string {
    if (!location) return 'Unknown Location';

    const { name, state } = location;

    if (!state) return name;
    if (name.toLocaleLowerCase() === state.toLocaleLowerCase()) return name;

    return `${name}, ${state}`;
}
