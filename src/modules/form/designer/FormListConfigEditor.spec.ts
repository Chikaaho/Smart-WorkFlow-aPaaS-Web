import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/form/api/i2-choices', () => ({
  getListConfig: vi.fn(),
  saveListConfig: vi.fn(),
}))

import { getListConfig, saveListConfig } from '@/modules/form/api/i2-choices'
import FormListConfigEditor from './FormListConfigEditor.vue'
import type { FormSchemaField } from '@/contracts/form-schema'

const fields: FormSchemaField[] = [
  { name: 'title', type: 'TEXT', label: '标题' },
  { name: 'amount', type: 'NUMBER', label: '金额' },
]

const stubs = {
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
  'el-select': { template: '<div><slot/></div>' },
  'el-option': { template: '<div/>' },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div><slot/></div>' },
  'el-checkbox-group': { template: '<div><slot/></div>' },
  'el-checkbox': { template: '<label><slot/></label>' },
  'el-radio-group': { template: '<div><slot/></div>' },
  'el-radio-button': { template: '<button><slot/></button>' },
}

describe('FormListConfigEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getListConfig).mockResolvedValue(null)
    vi.mocked(saveListConfig).mockResolvedValue(undefined)
  })

  it('derives defaults and saves the ordered configuration', async () => {
    const wrapper = mount(FormListConfigEditor, {
      props: { formId: '71', fields },
      global: { stubs },
    })
    await nextTick()
    await nextTick()
    const vm = wrapper.vm as unknown as {
      columns: { name: string; label: string }[]
      filters: string[]
      actions: string[]
      save: () => Promise<void>
    }
    expect(vm.columns.map((column) => column.name)).toEqual(['title', 'amount'])
    vm.columns = [vm.columns[1]!, vm.columns[0]!]
    vm.filters = ['title']
    vm.actions = ['view', 'export']
    await vm.save()

    expect(saveListConfig).toHaveBeenCalledWith('71', {
      columns: [
        { name: 'amount', label: '金额' },
        { name: 'title', label: '标题' },
      ],
      filters: [{ name: 'title', op: 'LIKE' }],
      actions: ['view', 'export'],
    })
  })
})
