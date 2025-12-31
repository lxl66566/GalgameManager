import { useI18n } from '~/i18n'

export default () => {
  const { t } = useI18n()
  return (
    <div class="flex items-center justify-center h-screen">
      <h1>{t('WIP')}</h1>
    </div>
  )
}
