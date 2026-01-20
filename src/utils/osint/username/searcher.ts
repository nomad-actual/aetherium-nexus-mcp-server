
// get list of sites to search

import type { AetheriumConfig } from "../../../types.ts";

// search site with username

// request page


type SearchUsernamesResult = {
    found: boolean;
    url: string,
    // what else?
}


// check here for how to extract data
// https://github.com/soxoj/socid-extractor/blob/master/socid_extractor/schemes.py

async function searchUsername(username: string, config: AetheriumConfig, abortSignal: AbortSignal) {

}


