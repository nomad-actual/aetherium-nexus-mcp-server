import { getConfig } from "../utils/config.js";
import { getRagDatastore } from "./database/datastore.js";
import { OpenSearchRagDatastore } from "./database/opensearch.js";

const config = getConfig()

// really just an easy reset of whatever db I need
async function reset() {
    if (config.rag.db.type === 'opensearch') {
        const opensearch = new OpenSearchRagDatastore(config.rag.db.hostUri)
        await opensearch.reset()
    }
}

reset()
    .then(() => console.log('reset complete'))
    .catch(() => console.log(''))

