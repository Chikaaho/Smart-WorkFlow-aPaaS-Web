import { afterEach, describe, expect, it, vi } from 'vitest'
import { installCompositionEscapeGuard, isCompositionEscape } from './composition-escape-guard'

describe('isCompositionEscape（BF20261013-017）', () => {
  it('组合态 ESC 识别（isComposing 或 keyCode 229）', () => {
    expect(isCompositionEscape({ code: 'Escape', isComposing: true })).toBe(true)
    expect(isCompositionEscape({ key: 'Escape', keyCode: 229 })).toBe(true)
  })

  it('非组合态 ESC 与其它键放行', () => {
    expect(isCompositionEscape({ code: 'Escape', isComposing: false })).toBe(false)
    expect(isCompositionEscape({ code: 'Escape', keyCode: 13 })).toBe(false)
    expect(isCompositionEscape({ code: 'Enter', isComposing: true })).toBe(false)
  })
})

describe('installCompositionEscapeGuard', () => {
  let uninstall: (() => void) | null = null

  afterEach(() => {
    uninstall?.()
    uninstall = null
  })

  function keydownOn(target: EventTarget, init: KeyboardEventInit, isComposing?: boolean): void {
    const event = new KeyboardEvent('keydown', { ...init, bubbles: true })
    if (isComposing !== undefined) {
      Object.defineProperty(event, 'isComposing', { value: isComposing })
    }
    target.dispatchEvent(event)
  }

  it('组合态 ESC 被拦下（document 冒泡监听收不到），普通 ESC 正常送达', () => {
    const bubbleSpy = vi.fn()
    document.addEventListener('keydown', bubbleSpy)
    uninstall = installCompositionEscapeGuard()
    const input = document.createElement('input')
    document.body.appendChild(input)

    keydownOn(input, { code: 'Escape' }, true)
    expect(bubbleSpy).not.toHaveBeenCalled()

    keydownOn(input, { code: 'Escape' })
    expect(bubbleSpy).toHaveBeenCalledTimes(1)

    input.remove()
    document.removeEventListener('keydown', bubbleSpy)
  })
})
