import { fetch } from '@tauri-apps/plugin-http'
import * as cheerio from 'cheerio'

/**
 * 根据游戏名搜索 Steam 图片。
 * @param name 游戏名
 * @returns 图片 URL
 */
export default async (name: string): Promise<string> => {
  return fetch(`https://store.steampowered.com/search/?l=schinese&term=${name}`, {
    method: 'GET',
    connectTimeout: 15000
  })
    .then(res => res.text())
    .then(res => cheerio.load(res))
    .then(res =>
      res('#search_resultsRows .search_result_row').first().attr('data-ds-appid')
    )
    .then(
      appid => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
    )
}
