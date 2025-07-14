
import axios from 'axios';
import type { LocationResult } from '../types.js';
import logger from './logger.js';

export async function search(query: string, { limit = 10, language = 'en' }): Promise<LocationResult[]> {

    const url = 'https://geocoding-api.open-meteo.com/v1/search'

    const locationResp = await axios.get(url, {
        params: { 
            name: query,
            count: limit || 10,
            language: 'en',
            format: 'json',
        }
    })

    const { results } = locationResp.data
    
    // will need to do some work when we find a state as well
    // logger.info('rawwwwww', results)

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
    logger.info('chosen', likely[0])

    return likely[0] || null;
}

export function makeLocationString(location: LocationResult | null): string {
    if (!location) return 'Unknown Location';

    const { name, state } = location;

    if (name.toLocaleLowerCase() === state.toLocaleLowerCase()) return name;
    if (!state) return name;

    return `${name}, ${state}`;
}
