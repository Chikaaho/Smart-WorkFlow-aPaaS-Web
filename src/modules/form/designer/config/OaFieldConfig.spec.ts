import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OaFieldConfig from './OaFieldConfig.vue'
import type { FormSchemaField } from '@/contracts/form-schema'

/**
 * 文字（LABEL）组件的样式属性面板：正文 / 颜色 / 字号 / 粗细 / 对齐。
 * 断言落在「面板呈现」与「回写补丁键」两处，覆盖设计者真实操作路径。
 */
function labelField(overrides: Partial<FormSchemaField> = {}): FormSchemaField {
  return {
    name: 'field_note',
    type: 'LABEL',
    label: '文字',
    colSpan: 24,
    text: '请如实填写',
    color: '',
    fontSize: 14,
    fontWeight: 'normal',
    textAlign: 'left',
    ...overrides,
  } as FormSchemaField
}

function mountConfig(field: FormSchemaField = labelField()) {
  return mount(OaFieldConfig, { props: { field, otherNames: [] } })
}

describe('OaFieldConfig 文字组件样式属性', () => {
  it('对齐方式提供左对齐 / 居中 / 右对齐三个按钮', () => {
    const wrapper = mountConfig()
    const buttons = wrapper.findAll('.el-radio-button')
    expect(buttons.map((b) => b.find('input').attributes('value'))).toEqual([
      'left',
      'center',
      'right',
    ])
    expect(buttons.map((b) => b.text())).toEqual(['左对齐', '居中', '右对齐'])
  })

  it('未配置对齐时回显左对齐', () => {
    const wrapper = mountConfig(labelField({ textAlign: undefined }))
    expect(wrapper.find('.el-radio-button.is-active').text()).toBe('左对齐')
  })

  it('选择居中回写 textAlign=center', async () => {
    const wrapper = mountConfig()
    const centerInput = wrapper.findAll('.el-radio-button')[1].find('input')
    await centerInput.setValue(true)

    const patches = wrapper.emitted('update') as unknown as Array<[{ textAlign?: string }]>
    expect(patches?.at(-1)?.[0].textAlign).toBe('center')
  })

  it('对齐已配置为右对齐时回显右对齐', () => {
    const wrapper = mountConfig(labelField({ textAlign: 'right' }))
    expect(wrapper.find('.el-radio-button.is-active').text()).toBe('右对齐')
  })
})
