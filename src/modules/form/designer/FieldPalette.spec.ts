import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FieldPalette from './FieldPalette.vue'
import { FIELD_TYPE_REGISTRY } from './field-types'

/**
 * 控件库（设计器左栏）：
 *  ① 可用条目 = 原生可拖拽按钮；未启用条目禁用且不可拖拽；
 *  ② dragstart 产出与点击添加**同一形态**的画布项（预览与落库同源），并交给宿主；
 *  ③ dragend 通知宿主清预览；已发布 / 禁用态不产生候选。
 */
function mountPalette(props: Record<string, unknown> = {}) {
  return mount(FieldPalette, { props: { existingNames: [], ...props } })
}

function itemEl(wrapper: ReturnType<typeof mountPalette>, type: string) {
  return wrapper.find(`.palette__item[data-field-type="${type}"]`)
}

describe('FieldPalette 原生拖拽', () => {
  it('可用条目可拖拽；未启用条目禁用且不可拖拽', () => {
    const wrapper = mountPalette()
    expect(itemEl(wrapper, 'TEXT').attributes('draggable')).toBe('true')
    // 文字组件经本刀进入组件库
    expect(itemEl(wrapper, 'LABEL').exists()).toBe(true)
    expect(itemEl(wrapper, 'LABEL').attributes('draggable')).toBe('true')
    const richEditor = itemEl(wrapper, 'RICH_EDITOR')
    expect(richEditor.attributes('disabled')).toBeDefined()
    expect(richEditor.attributes('draggable')).toBe('false')
    expect(richEditor.attributes('title')).toBe('该组件暂不可用')
  })

  it('dragstart 产出与点击添加同一形态的画布项并交给宿主', async () => {
    const wrapper = mountPalette()
    await itemEl(wrapper, 'TEXT').trigger('dragstart')

    const emitted = wrapper.emitted('drag-start')
    expect(emitted).toHaveLength(1)
    const item = emitted![0][0] as { id: string; field: Record<string, unknown> }
    expect(item.id).toMatch(/^di_/)
    expect(item.field).toMatchObject({ type: 'TEXT', required: false })
    expect(typeof item.field.name).toBe('string')
    expect(String(item.field.name).length).toBeGreaterThan(0)
    // BF20261013-003：新拖字段默认占满整行（不预设半行宽度）
    expect(item.field.colSpan).toBe(24)
  })

  it('dragend 通知宿主清预览', async () => {
    const wrapper = mountPalette()
    await itemEl(wrapper, 'TEXT').trigger('dragend')
    expect(wrapper.emitted('drag-end')).toHaveLength(1)
  })

  it('未启用条目即便触发 dragstart 也不产出候选', async () => {
    const wrapper = mountPalette()
    await itemEl(wrapper, 'RICH_EDITOR').trigger('dragstart')
    expect(wrapper.emitted('drag-start')).toBeUndefined()
  })

  it('整体禁用（已发布表单）时不产出候选', async () => {
    const wrapper = mountPalette({ disabled: true })
    expect(itemEl(wrapper, 'TEXT').attributes('draggable')).toBe('false')
    await itemEl(wrapper, 'TEXT').trigger('dragstart')
    expect(wrapper.emitted('drag-start')).toBeUndefined()
  })

  it('白名单下只露允许类型（盖层子画布）', () => {
    const wrapper = mountPalette({ allowedTypes: ['TEXT', 'NUMBER'] })
    const types = wrapper.findAll('.palette__item').map((b) => b.attributes('data-field-type'))
    expect(types).toEqual(['TEXT', 'NUMBER'])
  })
})

/**
 * BF20261013-009：选择类入口——下拉选择 / 单选框同为 DICT（变体），开关为 BOOL。
 */
describe('FieldPalette 选择类入口（BF20261013-009）', () => {
  it('DICT 双入口：下拉选择与单选框，开关入口映射 BOOL', () => {
    const wrapper = mountPalette()
    const dictItems = wrapper.findAll('.palette__item[data-field-type="DICT"]')
    expect(dictItems.map((b) => b.text())).toEqual(['下拉选择', '单选框'])
    expect(dictItems.map((b) => b.attributes('data-field-variant'))).toEqual(['dropdown', 'radio'])
    expect(itemEl(wrapper, 'BOOL').text()).toBe('开关')
  })

  it('单选框入口产出 DICT + renderAs=radio，标签取入口名', async () => {
    const wrapper = mountPalette()
    await wrapper
      .find('.palette__item[data-field-type="DICT"][data-field-variant="radio"]')
      .trigger('dragstart')

    const emitted = wrapper.emitted('drag-start')
    const item = emitted![0][0] as { field: Record<string, unknown> }
    expect(item.field).toMatchObject({
      type: 'DICT',
      renderAs: 'radio',
      label: '单选框',
      source: 'dict',
    })
  })

  it('下拉选择入口产出 DICT 缺省（renderAs 缺省 select、source=dict）', async () => {
    const wrapper = mountPalette()
    await wrapper
      .find('.palette__item[data-field-type="DICT"][data-field-variant="dropdown"]')
      .trigger('dragstart')

    const emitted = wrapper.emitted('drag-start')
    const item = emitted![0][0] as { field: Record<string, unknown> }
    expect(item.field).toMatchObject({ type: 'DICT', source: 'dict' })
    expect(item.field.renderAs).toBeUndefined()
  })
})

/**
 * BF20261013-010：库内显示名 = 拖出后的默认字段名（注册表 descriptor 单一名称源）。
 */
describe('FieldPalette 名称一致性（BF20261013-010）', () => {
  const REGISTRY_TYPES = FIELD_TYPE_REGISTRY.map((descriptor) => descriptor.type)

  it('全部已注册类型都有唯一主入口，字典保留下拉和单选两个变体', () => {
    const wrapper = mountPalette()
    for (const type of REGISTRY_TYPES) {
      expect(wrapper.findAll(`.palette__item[data-field-type="${type}"]`)).toHaveLength(
        type === 'DICT' ? 2 : 1,
      )
    }
  })

  it('每个注册表入口：库内名称与点击添加后的默认字段名一致', async () => {
    for (const type of REGISTRY_TYPES) {
      const wrapper = mountPalette()
      const button = wrapper.find(`.palette__item[data-field-type="${type}"]`)
      expect(button.exists(), `${type} 入口应存在`).toBe(true)
      const paletteName = button.find('.palette__label').text()

      await button.trigger('click')
      const emitted = wrapper.emitted('add')
      expect(emitted, `${type} 应产出画布项`).toBeTruthy()
      const item = emitted![0][0] as { field: { label?: string; type: string } }
      expect(item.field.label, `${type} 库内名称与默认字段名应一致`).toBe(paletteName)
    }
  })
})
