import axios from 'axios';


// http://archive.org/wayback/available?url=example.com

// {
//     "archived_snapshots": {
//         "closest": {
//             "available": true,
//             "url": "http://web.archive.org/web/20130919044612/http://example.com/",
//             "timestamp": "20130919044612",
//             "status": "200"
//         }
//     }
// }

export async function searchWayback(url: string, timeout: number, signal: AbortSignal) {
    const temp = await axios.request({
        url,
        timeout,
        signal
    })



    if (temp.status !== 200) {
        return null
    }

    const snapshots = temp.data.archived_snapshots || {}
    const closest = snapshots.closest

    if (!closest) {
        return null
    }

    return {
        available: closest.available,
        url: closest.url,
        timestamp: new Date(closest.timestamp),
        status: closest.status
    }
}
