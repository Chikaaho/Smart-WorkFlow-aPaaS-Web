import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SubFieldDesigner from './SubFieldDesigner.vue'
import { ALLOWED_SUBFIELD_TYPES } from './subfield-convert'
import type { TableSubField } from '@/contracts/form-schema'

/**
 * SubFieldDesigner（盖层子画布）：
 *  ① 控件库只露六种（allowed-types = ALLOWED_SUBFIELD_TYPES）；画布内排序 group 独立
 *  ② 子画布从 subFields 播种为 items；列名集（查重范围）取自子画布、限子表内部
 *  ③ 「返回」把子画布 items 转回 subFields 抛 close（写回宿主）
 *  ④ readonly 透传给控件库/画布/配置面板
 *
 * 子组件 stub 成属性探针，只验组合接线与状态隔离，不拉起 SortableJS / form-create。
 */

let paletteProps: Record<string, unknown> = {}
let canvasProps: Record<string, unknown> = {}
let configProps: Record<string, unknown> = {}

const PaletteStub = {
  props: ['existingNames', 'allowedTypes', 'group', 'disabled'],
  setup(p: Record<string, unknown>) {
    paletteProps = p
    return () => null
  },
}
const CanvasStub = {
  props: ['items', 'selectedId', 'group', 'readonly', 'pendingItem'],
  setup(p: Record<string, unknown>) {
    canvasProps = p
    return () => null
  },
}
const ConfigStub = {
  props: ['field', 'otherNames', 'readonly'],
  setup(p: Record<string, unknown>) {
    configProps = p
    return () => null
  },
}

const stubs = {
  FieldPalette: PaletteStub,
  DesignerCanvas: CanvasStub,
  FieldConfigPanel: ConfigStub,
}

function mountEditor(subFields: TableSubField[], readonly = false) {
  return mount(SubFieldDesigner, {
    props: { tableLabel: '明细', subFields, readonly },
    global: { stubs },
  })
}

describe('SubFieldDesigner (盖层子画布)', () => {
  it('palette exposes only the six allowed types; canvas keeps an isolated sort group', () => {
    mountEditor([{ name: 'c1', type: 'TEXT' }])
    expect(paletteProps.allowedTypes).toEqual(ALLOWED_SUBFIELD_TYPES)
    // 组件库改走原生 DnD：不再声明 SortableJS group（group 只属于画布内排序）
    expect(paletteProps.group).toBeUndefined()
    expect(canvasProps.group).toBe('designer-subfields')
  })

  it('拖拽接线：drag-start 进入落点预览，add 按落点插入子字段并清预览', async () => {
    const wrapper = mountEditor([{ name: 'c1', type: 'TEXT' }])
    const pending = { id: 'di_pending', field: { name: 'c2', type: 'NUMBER' } }

    wrapper.findComponent(PaletteStub).vm.$emit('drag-start', pending)
    await wrapper.vm.$nextTick()
    expect(canvasProps.pendingItem).toEqual(pending)

    wrapper.findComponent(CanvasStub).vm.$emit('add', pending, 1)
    await wrapper.vm.$nextTick()
    expect((canvasProps.items as { field: { name: string } }[]).map((it) => it.field.name)).toEqual(
      ['c1', 'c2'],
    )
    expect(canvasProps.pendingItem).toBeNull()
  })

  it('seeds canvas items from subFields; dedup name set scoped to sub-table fields', () => {
    mountEditor([
      { name: 'c1', type: 'TEXT' },
      { name: 'c2', type: 'NUMBER' },
    ])
    const items = canvasProps.items as { field: { name: string } }[]
    expect(items.map((it) => it.field.name)).toEqual(['c1', 'c2'])
    // 列名查重范围 = 子表内部字段（不掺主表）
    expect(paletteProps.existingNames).toEqual(['c1', 'c2'])
  })

  it('emits close with subFields converted back when 返回 is clicked', async () => {
    const wrapper = mountEditor([{ name: 'c1', type: 'TEXT', label: '列1' }])
    await wrapper.find('.sub-designer__back').trigger('click')
    const emitted = wrapper.emitted('close')?.at(-1)?.[0] as TableSubField[]
    expect(emitted).toEqual([{ name: 'c1', type: 'TEXT', label: '列1' }])
  })

  it('writes a palette-added item into the isolated sub-table context', async () => {
    const wrapper = mountEditor([])
    wrapper.findComponent(PaletteStub).vm.$emit('add', {
      id: 'sub-item-1',
      field: { name: 'c1', type: 'TEXT' },
    })
    await wrapper.find('.sub-designer__back').trigger('click')

    const emitted = wrapper.emitted('close')?.at(-1)?.[0] as TableSubField[]
    expect(emitted).toEqual([{ name: 'c1', type: 'TEXT' }])
  })

  it('propagates readonly to palette / canvas / config', () => {
    mountEditor([{ name: 'c1', type: 'TEXT' }], true)
    expect(paletteProps.disabled).toBe(true)
    expect(canvasProps.readonly).toBe(true)
    expect(configProps.readonly).toBe(true)
  })
})
