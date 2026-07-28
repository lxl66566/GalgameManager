/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */

export default {
  arrowParens: 'avoid',
  endOfLine: 'lf',
  // @ianvs/prettier-plugin-sort-imports plugin's options
  // https://github.com/IanVS/prettier-plugin-sort-imports#options
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  importOrderTypeScriptVersion: '5.4.5',
  plugins: ['prettier-plugin-tailwindcss', '@ianvs/prettier-plugin-sort-imports'],
  printWidth: 90,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'none',
  useTabs: false
}
