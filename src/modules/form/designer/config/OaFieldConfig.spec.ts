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

/** 多选（MULTISELECT）字段：候选选项键值对编辑（BF20261013-008）。 */
function multiField(overrides: Partial<FormSchemaField> = {}): FormSchemaField {
  return {
    name: 'field_multi',
    type: 'MULTISELECT',
    label: '多选',
    colSpan: 24,
    options: [],
    ...overrides,
  } as FormSchemaField
}

function mountConfig(field: FormSchemaField = labelField()) {
  return mount(OaFieldConfig, { props: { field, otherNames: [] } })
}

function lastPatch(wrapper: ReturnType<typeof mountConfig>): Record<string, unknown> {
  const patches = wrapper.emitted('update') as unknown as Array<[Record<string, unknown>]>
  return patches?.at(-1)?.[0] ?? {}
}

function kvRows(wrapper: ReturnType<typeof mountConfig>) {
  return wrapper.findAll('.row__kv').map((row) => row.findAll('input'))
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

/**
 * BF20261013-008：多选候选选项键值对编辑器。
 * 一行两输入框（左键右值）、键剔除空白、键重复/缺键提示、新增加行、删行、历史 string[] 兼容。
 */
describe('OaFieldConfig 多选候选选项键值对', () => {
  it('现有键值对逐行回显（左键右值）', () => {
    const wrapper = mountConfig(
      multiField({
        options: [
          { key: 'canyin', value: '餐饮' },
          { key: 'jiaotong', value: '交通' },
        ],
      }),
    )
    const rows = kvRows(wrapper)
    expect(rows).toHaveLength(2)
    expect((rows[0]![0].element as HTMLInputElement).value).toBe('canyin')
    expect((rows[0]![1].element as HTMLInputElement).value).toBe('餐饮')
    expect((rows[1]![0].element as HTMLInputElement).value).toBe('jiaotong')
  })

  it('键输入剔除全部空白字符后回写', async () => {
    const wrapper = mountConfig(multiField({ options: [{ key: 'a', value: '餐饮' }] }))
    await kvRows(wrapper)[0]![0].setValue('can yin\t2')
    expect(lastPatch(wrapper).options).toEqual([{ key: 'canyin2', value: '餐饮' }])
  })

  it('点击新增追加一个空行并回写', async () => {
    const wrapper = mountConfig(multiField({ options: [{ key: 'a', value: '1' }] }))
    await wrapper.find('.row__kv-add').trigger('click')
    expect(lastPatch(wrapper).options).toEqual([
      { key: 'a', value: '1' },
      { key: '', value: '' },
    ])
    expect(kvRows(wrapper)).toHaveLength(2)
  })

  it('删除行后回写剩余键值对', async () => {
    const wrapper = mountConfig(
      multiField({
        options: [
          { key: 'a', value: '1' },
          { key: 'b', value: '2' },
        ],
      }),
    )
    await wrapper.findAll('.row__kv-del')[0]!.trigger('click')
    expect(lastPatch(wrapper).options).toEqual([{ key: 'b', value: '2' }])
  })

  it('键重复时给出提示', () => {
    const wrapper = mountConfig(
      multiField({
        options: [
          { key: 'a', value: '1' },
          { key: 'a', value: '2' },
        ],
      }),
    )
    expect(wrapper.find('.row__error').text()).toBe('键重复，请修改')
  })

  it('已填值但缺键的行给出提示（纯空行不算）', () => {
    const withHalf = mountConfig(multiField({ options: [{ key: '', value: '餐饮' }] }))
    expect(withHalf.find('.row__error').text()).toBe('已填值的行必须设定键')
    const withEmpty = mountConfig(multiField({ options: [{ key: '', value: '' }] }))
    expect(withEmpty.find('.row__error').exists()).toBe(false)
  })

  it('历史 string[] 选项兼容为 key=value 行', () => {
    const wrapper = mountConfig(multiField({ options: ['餐饮', '交通'] as unknown as never }))
    const rows = kvRows(wrapper)
    expect(rows).toHaveLength(2)
    expect((rows[1]![0].element as HTMLInputElement).value).toBe('交通')
    expect((rows[1]![1].element as HTMLInputElement).value).toBe('交通')
  })
})
