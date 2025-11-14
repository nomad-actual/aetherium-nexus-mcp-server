
import axios from 'axios';
import type { City, LocationResult } from '../types.js';
import logger from './logger.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// sorted by lat, lon
let citiesDb = [] as City[]

function loadDb() {
    const fp = path.join(import.meta.dirname, 'location-db','world_cities_15000_(including_all_states_and_counties).json')
    const raw = readFileSync(fp, { encoding: 'utf8' });
    citiesDb = JSON.parse(raw)
}

loadDb()

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
    if (!citiesDb.length) return null;

    let nearestCity: City | null = null;
    let minDistance = Infinity;

    for (const city of citiesDb) {
      const cityLat = parseFloat(city.lat)
      const cityLng = parseFloat(city.lng)
      const distance = haversineDistance(lat, lon, cityLat, cityLng)

      if (distance < minDistance) {
        minDistance = distance
        nearestCity = city
      }
    }

    return nearestCity
  }


export function findCitiesWithinRadius(lat: number, lon: number, radiusKm: number): City[] {
    return citiesDb.filter((city) => {
        const cityLat = parseFloat(city.lat);
        const cityLng = parseFloat(city.lng);
        const distance = haversineDistance(lat, lon, cityLat, cityLng);
        return distance <= radiusKm;
    });
}

export async function search(query: string, { limit = 10, language = 'en' }): Promise<LocationResult[]> {

    const url = 'https://geocoding-api.open-meteo.com/v1/search'

    const locationResp = await axios.get(url, {
        params: { 
            name: query,
            count: limit,
            language: language,
            format: 'json',
        }
    })

    const { results } = locationResp.data
    
    const locations: LocationResult[] = results.map((r: any) => {
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

export function lookupStateAbbreviation(stateName: string): string | null {
  return stateMap.get(stateName.trim().toUpperCase()) || null;
}

export function closestMatch(locations: LocationResult[], city: string, stateOrProvince?: string): LocationResult | null {
    if (!city) return null;
    if (locations.length === 0) return null;

    const stateFullName = stateOrProvince ? stateMap.get(stateOrProvince.trim().toUpperCase()) : null;
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

    if (name.toLocaleLowerCase() === state.toLocaleLowerCase()) return name;
    if (!state) return name;

    return `${name}, ${state}`;
}
