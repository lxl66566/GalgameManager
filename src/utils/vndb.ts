// VNDB API response shape
interface VndbResponse {
  more: boolean
  results: {
    id: string
    image?: null | {
      sexual?: number
      url: string
      violence?: number
    }
    title: string
  }[]
}

/**
 * Search VNDB by name and return the cover image URL.
 * @param gameName Game title to search for
 * @returns Cover image URL, or null when not found
 * @throws On network errors or non-2xx HTTP status (e.g. rate limiting), so
 * callers can tell “not found” apart from “query failed”
 */
export async function fetchVnCover(gameName: string): Promise<null | string> {
  if (!gameName.trim()) return null

  const endpoint = 'https://api.vndb.org/kana/vn'

  const body = {
    fields: 'title, image.url, image.sexual, image.violence',
    filters: ['search', '=', gameName],
    results: 1,
    sort: 'searchrank'
  }

  // The custom User-Agent is set globally on the webview via
  // `app.windows[].userAgent` in tauri.conf.json — browser fetch treats
  // 'User-Agent' as a forbidden header and silently drops it, so setting
  // it here would be a no-op.
  // Network failures reject here; both cases must surface to the caller
  // instead of being flattened into a misleading "not found".
  const response = await fetch(endpoint, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error(`VNDB API request failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as VndbResponse

  if (data.results.length > 0) {
    const topResult = data.results[0]
    // Optional: filter NSFW covers here via topResult.image.sexual
    return topResult?.image?.url ?? null
  }
  return null
}
