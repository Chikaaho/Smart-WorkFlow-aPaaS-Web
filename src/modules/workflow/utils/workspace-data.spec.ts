import { describe, expect, it } from 'vitest'
import { composeHexColor, parseHexColor } from './workspace-data'

describe('图表自定义颜色', () => {
  it('解析 6 位与 8 位 HEX，透明度按 0—100 返回', () => {
    expect(parseHexColor('#3286E7')).toEqual({ hex: '#3286e7', opacity: 100 })
    expect(parseHexColor('#3286E780')).toEqual({ hex: '#3286e7', opacity: 50 })
    expect(parseHexColor('#abc')).toEqual({ hex: '#aabbcc', opacity: 100 })
  })

  it('非法值回退，组合后 100% 不写 alpha', () => {
    expect(parseHexColor('red')).toEqual({ hex: '#7c3aed', opacity: 100 })
    expect(composeHexColor('#3286e7', 100)).toBe('#3286e7')
    expect(composeHexColor('#3286e7', 50)).toBe('#3286e780')
    expect(composeHexColor('#3286e7', 0)).toBe('#3286e700')
  })
})
