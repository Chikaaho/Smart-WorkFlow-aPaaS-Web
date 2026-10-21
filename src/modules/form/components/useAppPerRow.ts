import { ref, watch } from 'vue'

/**
 * 应用卡片网格「每行数量」个人偏好。
 *
 * 仅存本机 localStorage，不落服务端；管理端与用户端共用同一份偏好与默认值。
 */
export const APP_PER_ROW_KEY = 'sw:app-center:per-row'
export const APP_PER_ROW_OPTIONS = [3, 4, 5, 6, 8] as const
export const APP_PER_ROW_DEFAULT = 6

function readPerRow(): number {
  const raw = globalThis.localStorage?.getItem(APP_PER_ROW_KEY)
  const parsed = raw ? Number(raw) : NaN
  return (APP_PER_ROW_OPTIONS as readonly number[]).includes(parsed) ? parsed : APP_PER_ROW_DEFAULT
}

export function useAppPerRow() {
  const perRow = ref<number>(readPerRow())
  watch(perRow, (value) => {
    globalThis.localStorage?.setItem(APP_PER_ROW_KEY, String(value))
  })
  return { perRow, options: APP_PER_ROW_OPTIONS }
}
