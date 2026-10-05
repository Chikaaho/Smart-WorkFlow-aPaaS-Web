import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DateConfig from './DateConfig.vue'
import type { DateField } from '@/contracts/form-schema'

/**
 * P63：DATE 配置面板「日期 / 日期时间」开关——开写 format='datetime'（值含时间部分），
 * 关写 undefined（缺省 date，语义不变）；子字段上下文（subfield）不渲染该开关
 * （服务端 subFields 契约未落 format 键，开关在子画布出现会造成可配不可存的假入口）。
 * 注意：CommonConfigRows 的必填行也是一枚 el-switch，断言须用 data-testid 定位格式开关。
 */
function dateField(overrides: Partial<DateField> = {}): DateField {
  return {
    name: 'field_date',
    type: 'DATE',
    label: '日期',
    required: false,
    ...overrides,
  }
}

function mountConfig(field: DateField = dateField(), subfield = false) {
  return mount(DateConfig, { props: { field, otherNames: [], subfield } })
}

const formatSwitch = (wrapper: ReturnType<typeof mountConfig>) =>
  wrapper.find('[data-testid="date-format-switch"] input')

describe('DateConfig 日期时间格式开关（P63）', () => {
  it('缺省（date）开关存在，提示为年-月-日格式', () => {
    const wrapper = mountConfig()
    expect(formatSwitch(wrapper).exists()).toBe(true)
    expect(wrapper.text()).toContain('年-月-日')
  })

  it('打开开关回写 format=datetime', async () => {
    const wrapper = mountConfig()
    await formatSwitch(wrapper).setValue(true)

    const patches = wrapper.emitted('update') as unknown as Array<[{ format?: string }]>
    const formatPatch = patches?.find((p) => 'format' in p[0])
    expect(formatPatch?.[0].format).toBe('datetime')
  })

  it('已配置 datetime 时提示为日期时间格式；关闭开关回写 format=undefined', async () => {
    const wrapper = mountConfig(dateField({ format: 'datetime' }))
    expect(wrapper.text()).toContain('YYYY-MM-DD HH:mm:ss')

    await formatSwitch(wrapper).setValue(false)
    const patches = wrapper.emitted('update') as unknown as Array<[{ format?: string }]>
    const formatPatch = patches?.find((p) => 'format' in p[0])
    expect(formatPatch?.[0].format).toBeUndefined()
  })

  it('子字段上下文（subfield）不渲染格式开关', () => {
    const wrapper = mountConfig(dateField(), true)
    expect(wrapper.find('[data-testid="date-format-switch"]').exists()).toBe(false)
  })
})
