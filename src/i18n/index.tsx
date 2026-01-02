import * as i18n from '@solid-primitives/i18n'
import {
  createContext,
  createEffect,
  createResource,
  createSignal,
  useContext,
  type FlowComponent
} from 'solid-js'
import * as en from './en-US'
import * as zh from './zh-CN'

export type Locale = 'en-US' | 'zh-CN'
export type RawDictionary = typeof en.dict
// Flatten 将嵌套对象转换为 "button.toggle" 这种键值对
export type Dictionary = i18n.Flatten<RawDictionary>
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

const dictmap = {
  'zh-CN': zh.dict
}

let cachedEnDict: Dictionary | null = null

function getEnDict(): Dictionary {
  if (!cachedEnDict) {
    cachedEnDict = i18n.flatten(en.dict)
  }
  return cachedEnDict
}

async function fetchDictionary(locale: string): Promise<Dictionary> {
  const enDict = getEnDict()

  const hasDict = Object.prototype.hasOwnProperty.call(dictmap, locale)

  if (locale === 'en-US' || !hasDict) {
    return enDict
  }

  // 确定 locale 存在于 dictmap 中
  const rawTargetDict = dictmap[locale as keyof typeof dictmap] as RawDictionary
  const targetDict = i18n.flatten(rawTargetDict)
  return { ...enDict, ...targetDict }
}

// --- 2. 创建 Context ---
type I18nContextType = {
  t: i18n.Translator<Dictionary>
  locale: () => Locale
  setLocale: (l: Locale) => void
  loading: boolean
}

const I18nContext = createContext<I18nContextType>()

export const I18nProvider: FlowComponent = props => {
  const [locale, setLocale] = createSignal<Locale>('en-US')

  // 使用 Resource 异步加载字典
  const [dict] = createResource(locale, fetchDictionary, {
    initialValue: i18n.flatten(en.dict) // 初始值设为英文，避免闪烁
  })

  // 生成翻译函数 t
  // translator 会自动处理响应性，当 dict 更新时 t 也会更新
  const t = i18n.translator(dict)

  // --- 3. 动态样式逻辑 ---
  createEffect(() => {
    const currentLang = locale()
    // 修改 html 标签属性，供 CSS 使用
    document.documentElement.lang = currentLang
    document.documentElement.setAttribute('data-theme-lang', currentLang)
  })

  return (
    <I18nContext.Provider value={{ t, locale, setLocale, loading: dict.loading }}>
      {props.children}
    </I18nContext.Provider>
  )
}

// 导出 hook 方便使用
export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
