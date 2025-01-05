interface Game {
  id: number
  name: string
  path: string
  image_data?: string
  image_url?: string
  time: number
  chain?: string
}

export type { Game }
