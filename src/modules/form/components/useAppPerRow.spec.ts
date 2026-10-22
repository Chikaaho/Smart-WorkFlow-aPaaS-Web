import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { APP_PER_ROW_DEFAULT, APP_PER_ROW_KEY, useAppPerRow } from './useAppPerRow'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('application grid preferences', () => {
  it('keeps the grid usable when reading or writing storage is denied', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const scope = effectScope()
    const preference = scope.run(useAppPerRow)!
    expect(preference.perRow.value).toBe(APP_PER_ROW_DEFAULT)
    preference.perRow.value = 8
    await nextTick()
    expect(preference.perRow.value).toBe(8)
    scope.stop()
  })

  it('rejects unsupported columns and restores a supported persisted choice', async () => {
    localStorage.setItem(APP_PER_ROW_KEY, '5')
    const scope = effectScope()
    const preference = scope.run(useAppPerRow)!
    expect(preference.perRow.value).toBe(5)
    preference.perRow.value = 100
    await nextTick()
    expect(preference.perRow.value).toBe(APP_PER_ROW_DEFAULT)
    expect(localStorage.getItem(APP_PER_ROW_KEY)).toBe(String(APP_PER_ROW_DEFAULT))
    scope.stop()
  })
})
