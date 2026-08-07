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

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
// Flatten 将嵌套对象转换为 "button.toggle" 这种键值对
export type Dictionary = i18n.Flatten<RawDictionary>
export type Locale = 'en-US' | 'zh-CN'
export type RawDictionary = typeof en.dict

/**
 * Resolve a `TimeLanguage` setting into a concrete locale, falling back
 * to the global locale when set to `auto`.
 *
 * Used by the home page so a user can render "last played" timestamps
 * in, say, English even though their UI is set to Simplified Chinese.
 */
export function resolveTimeLanguage(
  override: 'auto' | 'en' | 'zh',
  globalLocale: Locale
): Locale {
  if (override === 'en') return 'en-US'
  if (override === 'zh') return 'zh-CN'
  return globalLocale
}

const dictmap: Partial<Record<Locale, DeepPartial<RawDictionary>>> = {
  'zh-CN': zh.dict
}

let cachedEnDict: Dictionary | null = null

// --- 2. 创建 Context ---
interface I18nContextType {
  loading: boolean
  locale: () => Locale
  setLocale: (l: Locale) => void
  t: i18n.Translator<Dictionary>
}

const resolveDictionary = (locale: Locale): Dictionary => {
  const enDict = getEnDict()
  const rawTargetDict = dictmap[locale]
  // The DeepPartial cast mirrors the runtime merge: en covers every key, so
  // missing zh entries fall back to English.
  return rawTargetDict
    ? { ...enDict, ...i18n.flatten(rawTargetDict as RawDictionary) }
    : enDict
}

async function fetchDictionary(locale: string): Promise<Dictionary> {
  return resolveDictionary(locale as Locale)
}

function getEnDict(): Dictionary {
  cachedEnDict ??= i18n.flatten(en.dict)
  return cachedEnDict
}

// __INITIAL_CONFIG__ is injected by the Rust initialization_script before any
// page script runs (see src-tauri/src/lib.rs). Seeding the locale from it lets
// the first render use the configured dictionary directly — no English flash
// and no full-tree text re-render from a post-mount locale switch.
const detectInitialLocale = (): Locale => {
  try {
    // The global is typed as always-present (Tauri injects it before page
    // scripts), but plain-browser contexts (vitest, `vite preview`) never get
    // the injection — hence the optional chains and the try/catch.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const lang = globalThis.__INITIAL_CONFIG__?.settings?.appearance?.language
    if (lang === 'zh-CN' || lang === 'en-US') return lang
  } catch {
    // fall through to the default below
  }
  return 'en-US'
}

const I18nContext = createContext<I18nContextType>()

export const I18nProvider: FlowComponent = props => {
  const initialLocale = detectInitialLocale()
  const [locale, setLocale] = createSignal<Locale>(initialLocale)

  // 使用 Resource 异步加载字典；初始值同步给出目标语言词典，避免闪烁
  const [dict] = createResource(locale, fetchDictionary, {
    initialValue: resolveDictionary(initialLocale)
  })

  // 生成翻译函数 t
  // translator 会自动处理响应性，当 dict 更新时 t 也会更新
  const t = i18n.translator(dict, i18n.resolveTemplate)

  // --- 3. 动态样式逻辑 ---
  createEffect(() => {
    const currentLang = locale()
    // 修改 html 标签属性，供 CSS 使用
    document.documentElement.lang = currentLang
    document.documentElement.dataset.themeLang = currentLang
  })

  return (
    // eslint-disable-next-line solid/reactivity -- dict.loading is a Resource accessor; consumers track it via t
    <I18nContext.Provider value={{ loading: dict.loading, locale, setLocale, t }}>
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
