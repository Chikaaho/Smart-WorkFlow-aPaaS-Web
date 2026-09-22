import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FieldConfigPanel from './FieldConfigPanel.vue'
import type { DesignerItem } from './types'

function fieldItem(name: string): DesignerItem {
  return { id: 'f1', field: { name, type: 'TEXT', label: '姓名', colSpan: 24 } }
}

function mountPanel(name = 'field_username', keyLocked = false) {
  return mount(FieldConfigPanel, {
    props: {
      field: fieldItem(name),
      otherNames: ['field_age'],
      keyLocked,
    },
    global: {
      stubs: {
        RulesEditor: { template: '<div />' },
      },
    },
  })
}

describe('FieldConfigPanel 字段标识（V011-BUG-016）', () => {
  it('未发布：只展示 field_ 后缀，输入后缀回写全名并规范化', async () => {
    const wrapper = mountPanel('field_username')
    const keyInput = wrapper
      .findAll('.config__row input')
      .find((i) => (i.element as HTMLInputElement).value === 'username')!
    expect(keyInput).toBeTruthy()
    await keyInput.setValue('UserName-01')
    const patches = wrapper.emitted('update') as unknown as Array<[{ name: string }]> | undefined
    expect(patches?.at(-1)?.[0].name).toBe('field_username01')
  })

  it('与其他字段重名时不回写', async () => {
    const wrapper = mountPanel('field_username')
    const keyInput = wrapper
      .findAll('.config__row input')
      .find((i) => (i.element as HTMLInputElement).value === 'username')!
    await keyInput.setValue('age')
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('已发布（keyLocked）：输入禁用且提示不可直接修改', () => {
    const wrapper = mountPanel('field_username', true)
    const keyInput = wrapper
      .findAll('.config__row input')
      .find((i) => (i.element as HTMLInputElement).value === 'username')!
    expect((keyInput.element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('字段标识发布后不可直接修改')
  })
})
