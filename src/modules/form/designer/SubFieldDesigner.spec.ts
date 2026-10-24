import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { i18n } from '@/locales'
import type { DesignerItem } from './types'
import type { TableSubField } from '@/contracts/form-schema'
import SubFieldDesigner from './SubFieldDesigner.vue'

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const stubs = {
  'el-dialog': {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div class="dialog"><slot name="header"/><slot/><slot name="footer"/></div>',
  },
  'el-button': {
    props: ['disabled', 'icon', 'ariaLabel'],
    emits: ['click'],
    template:
      '<button :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\')"><slot/></button>',
  },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  FieldConfigPanel: {
    props: ['field', 'otherNames', 'readonly', 'subfield'],
    emits: ['update'],
    template: '<div class="field-config"/>',
  },
}

type Vm = {
  working: TableSubField[]
  configVisible: boolean
  configItem: DesignerItem | null
  otherNames: string[]
  openAdd: () => void
  openConfig: (index: number) => void
  patchConfig: (patch: Record<string, unknown>) => void
  saveConfig: () => void
  cancelConfig: () => void
  moveField: (index: number, offset: number) => void
  confirmFields: () => void
  cancel: () => void
}

function mountEditor(subFields: TableSubField[], readonly = false) {
  return mount(SubFieldDesigner, {
    props: { tableLabel: '明细', subFields, readonly },
    global: { plugins: [i18n], stubs },
  })
}

describe('SubFieldDesigner modal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the field table and keeps a local working copy', () => {
    const subFields: TableSubField[] = [{ name: 'c1', type: 'TEXT', label: '列一' }]
    const wrapper = mountEditor(subFields)
    const vm = wrapper.vm as unknown as Vm

    expect(vm.working).toEqual(subFields)
    expect(vm.working).not.toBe(subFields)
    expect(wrapper.text()).toContain('子表字段编辑 · 明细')
    expect(wrapper.text()).toContain('1 个子字段')
  })

  it('adds and configures a field before writing it back on confirm', async () => {
    const wrapper = mountEditor([{ name: 'c1', type: 'TEXT' }])
    const vm = wrapper.vm as unknown as Vm

    vm.openAdd()
    expect(vm.configVisible).toBe(true)
    vm.patchConfig({ name: 'c2', label: '数量', type: 'NUMBER', required: true })
    vm.saveConfig()
    vm.confirmFields()
    await flushPromises()

    const emitted = wrapper.emitted('close')?.at(-1)?.[0] as TableSubField[]
    expect(emitted).toContainEqual({ name: 'c2', type: 'NUMBER', label: '数量', required: true })
  })

  it('edits and reorders an existing field', () => {
    const wrapper = mountEditor([
      { name: 'c1', type: 'TEXT', label: '列一' },
      { name: 'c2', type: 'NUMBER', label: '数量' },
    ])
    const vm = wrapper.vm as unknown as Vm
    vm.moveField(1, -1)
    expect(vm.working.map((field) => field.name)).toEqual(['c2', 'c1'])

    vm.openConfig(0)
    vm.patchConfig({ label: '数量（调整）' })
    vm.saveConfig()
    expect(vm.working[0]?.label).toBe('数量（调整）')
  })

  it('cancels without applying local edits', async () => {
    const original: TableSubField[] = [{ name: 'c1', type: 'TEXT', label: '列一' }]
    const wrapper = mountEditor(original)
    const vm = wrapper.vm as unknown as Vm
    vm.openAdd()
    vm.saveConfig()
    vm.cancel()
    await flushPromises()

    const emitted = wrapper.emitted('close')?.at(-1)?.[0] as TableSubField[]
    expect(emitted).toEqual(original)
    expect(emitted).not.toBe(original)
  })

  it('blocks add and reorder in read-only mode', () => {
    const wrapper = mountEditor([{ name: 'c1', type: 'TEXT' }], true)
    const vm = wrapper.vm as unknown as Vm
    vm.openAdd()
    vm.moveField(0, 1)

    expect(vm.configVisible).toBe(false)
    expect(vm.working).toEqual([{ name: 'c1', type: 'TEXT' }])
  })
})
