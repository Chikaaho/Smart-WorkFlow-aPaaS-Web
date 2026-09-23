import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FieldPalette from './FieldPalette.vue'

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
    // 流水号为设计锁定但契约未启用的占位条目
    const serial = itemEl(wrapper, 'SERIAL')
    expect(serial.attributes('disabled')).toBeDefined()
    expect(serial.attributes('draggable')).toBe('false')
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
    expect(item.field.colSpan).toBe(12)
  })

  it('dragend 通知宿主清预览', async () => {
    const wrapper = mountPalette()
    await itemEl(wrapper, 'TEXT').trigger('dragend')
    expect(wrapper.emitted('drag-end')).toHaveLength(1)
  })

  it('未启用条目即便触发 dragstart 也不产出候选', async () => {
    const wrapper = mountPalette()
    await itemEl(wrapper, 'SERIAL').trigger('dragstart')
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
