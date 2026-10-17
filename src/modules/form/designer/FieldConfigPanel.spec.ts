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

  it('已发布（keyLocked）：输入禁用', () => {
    const wrapper = mountPanel('field_username', true)
    const keyInput = wrapper
      .findAll('.config__row input')
      .find((i) => (i.element as HTMLInputElement).value === 'username')!
    expect((keyInput.element as HTMLInputElement).disabled).toBe(true)
  })
})

describe('FieldConfigPanel 必填开关（BF20261013-013）', () => {
  it('「是否必填」+勾选框：勾选回写 required=true，取消回写 false', async () => {
    const wrapper = mount(FieldConfigPanel, {
      props: {
        field: {
          id: 'f1',
          field: { name: 'field_name', type: 'TEXT', label: '姓名', colSpan: 24 },
        },
        otherNames: [],
      },
      global: { stubs: { RulesEditor: { template: '<div />' } } },
    })
    expect(wrapper.text()).toContain('是否必填')
    const checkbox = wrapper.findComponent({ name: 'ElCheckbox' })
    expect(checkbox.exists()).toBe(true)
    expect(checkbox.props('modelValue')).toBe(false)

    await checkbox.vm.$emit('update:modelValue', true)
    let patches = wrapper.emitted('update') as unknown as Array<[{ required?: boolean }]>
    expect(patches?.at(-1)?.[0].required).toBe(true)

    await checkbox.vm.$emit('update:modelValue', false)
    patches = wrapper.emitted('update') as unknown as Array<[{ required?: boolean }]>
    expect(patches?.at(-1)?.[0].required).toBe(false)
  })

  it('已必填字段勾选框回显勾选态', () => {
    const wrapper = mount(FieldConfigPanel, {
      props: {
        field: {
          id: 'f1',
          field: { name: 'field_name', type: 'TEXT', label: '姓名', colSpan: 24, required: true },
        },
        otherNames: [],
      },
      global: { stubs: { RulesEditor: { template: '<div />' } } },
    })
    expect(wrapper.findComponent({ name: 'ElCheckbox' }).props('modelValue')).toBe(true)
  })
})

describe('FieldConfigPanel 字段标题位置', () => {
  function mountWithField(field: DesignerItem['field']) {
    return mount(FieldConfigPanel, {
      props: { field: { id: 'f1', field }, otherNames: [] },
      global: { stubs: { RulesEditor: { template: '<div />' } } },
    })
  }

  it('未配置时回显上边（缺省），选择后回写 labelPosition', async () => {
    const wrapper = mountWithField({
      name: 'field_name',
      type: 'TEXT',
      label: '姓名',
      colSpan: 24,
    })
    const select = wrapper
      .findAllComponents({ name: 'ElSelect' })
      .find((s) => s.props('modelValue') === 'top-left')
    expect(select).toBeTruthy()

    await select!.vm.$emit('update:modelValue', 'left')
    const patches = wrapper.emitted('update') as unknown as Array<[{ labelPosition?: string }]>
    expect(patches?.at(-1)?.[0].labelPosition).toBe('left')
  })

  it('BF20261013-011：标题位置仅左/右/上三选项；历史上面居中归一到上边展示', () => {
    const wrapper = mountWithField({
      name: 'field_name',
      type: 'TEXT',
      label: '姓名',
      colSpan: 24,
      labelPosition: 'top-center',
    })
    const select = wrapper
      .findAllComponents({ name: 'ElSelect' })
      .find((s) => s.props('modelValue') === 'top-left')
    expect(select).toBeTruthy()
    // 标题位置选项（字符串值；数字 1-12 为宽度选择器选项）
    const optionValues = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => o.props('value'))
      .filter((v) => typeof v === 'string')
    expect(optionValues).toEqual(['left', 'right', 'top-left'])
  })

  it('文字组件无独立标题，不展示标题位置行', () => {
    const wrapper = mountWithField({
      name: 'field_note',
      type: 'LABEL',
      label: '文字',
      colSpan: 24,
    })
    expect(wrapper.text()).not.toContain('标题位置')
  })
})

// 0.1.7 #36（Owner）：面板内选择/填写框尺寸口径——控件各自整行满宽、扩展属性区紧凑占位
// （高度 32px 由浏览器实测；此处锁结构口径，避免回到半宽小框）
describe('FieldConfigPanel 控件尺寸口径（0.1.7 #36）', () => {
  function mountText() {
    return mount(FieldConfigPanel, {
      props: {
        field: {
          id: 'f1',
          field: { name: 'field_name', type: 'TEXT', label: '姓名', colSpan: 24 },
        },
        otherNames: [],
      },
      global: { stubs: { RulesEditor: { template: '<div />' } } },
    })
  }

  it('数据类型与最大长度各自整行（不再两列半宽格）', () => {
    const wrapper = mountText()

    expect(wrapper.find('.config__type-pair').exists()).toBe(false)
    const rows = wrapper.findAll('.config__row')
    const typeInput = rows.find((row) => row.text().startsWith('数据类型'))
    const lengthRow = rows.find((row) => row.text().startsWith('最大长度'))
    expect(typeInput).toBeTruthy()
    expect(lengthRow).toBeTruthy()
    expect(typeInput!.element).not.toBe(lengthRow!.element)
  })

  it('扩展属性区为紧凑占位并带空态说明', () => {
    const wrapper = mountText()

    const box = wrapper.find('.config__extension')
    expect(box.exists()).toBe(true)
    expect(box.find('.config__extension-title').exists()).toBe(true)
    expect(box.text()).toContain('当前版本暂无可配置的扩展属性')
  })
})
