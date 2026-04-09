// 定义 VNDB API 返回的数据结构
interface VndbResponse {
  results: Array<{
    id: string
    title: string
    image?: {
      url: string
      sexual?: number
      violence?: number
    } | null
  }>
  more: boolean
}

/**
 * 根据名称搜索 VNDB 并返回封面图片 URL
 * @param gameName 游戏名称
 * @returns 封面图片的 URL，如果未找到则返回 null
 */
export async function fetchVnCover(gameName: string): Promise<string | null> {
  if (!gameName.trim()) return null

  const endpoint = 'https://api.vndb.org/kana/vn'

  // VNDB Kana API 的请求体格式
  const body = {
    // 过滤条件：按照关键词搜索
    filters: ['search', '=', gameName],
    // 需要返回的字段：游戏标题，和图片的 URL
    fields: 'title, image.url, image.sexual, image.violence',
    // 排序：按照搜索相关度排序，确保最匹配的在第一个
    sort: 'searchrank',
    // 我们只需要最匹配的第一个结果
    results: 1
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'github:lxl66566/GalgameManager'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error(`VNDB API 请求失败: ${response.status} ${response.statusText}`)
      return null
    }

    const data: VndbResponse = await response.json()

    if (data.results && data.results.length > 0) {
      const topResult = data.results[0]

      // 可选：如果你想屏蔽 NSFW 封面，可以在这里做判断
      // if (topResult.image && topResult.image.sexual && topResult.image.sexual > 0) {
      //   return null; // 或者返回一张特定的 SFW 占位图
      // }

      return topResult.image?.url || null
    }
    return null
  } catch (error) {
    console.error('访问 VNDB 时发生错误:', error)
    return null
  }
}
