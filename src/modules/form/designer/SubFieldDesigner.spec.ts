import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SubFieldDesigner from './SubFieldDesigner.vue'
import { ALLOWED_SUBFIELD_TYPES } from './subfield-convert'
import type { TableSubField } from '@/contracts/form-schema'

/**
 * SubFieldDesigner（盖层子画布）：
 *  ① 控件库只露六种（allowed-types = ALLOWED_SUBFIELD_TYPES）、独立 group
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
  props: ['items', 'selectedId', 'group', 'readonly'],
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
  it('palette exposes only the six allowed types with an isolated group', () => {
    mountEditor([{ name: 'c1', type: 'TEXT' }])
    expect(paletteProps.allowedTypes).toEqual(ALLOWED_SUBFIELD_TYPES)
    expect(paletteProps.group).toBe('designer-subfields')
    expect(canvasProps.group).toBe('designer-subfields')
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

  it('propagates readonly to palette / canvas / config', () => {
    mountEditor([{ name: 'c1', type: 'TEXT' }], true)
    expect(paletteProps.disabled).toBe(true)
    expect(canvasProps.readonly).toBe(true)
    expect(configProps.readonly).toBe(true)
  })
})
