import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FormAccessPanel from './FormAccessPanel.vue'
import type { FormSchemaField } from '@/contracts/form-schema'

const fields: FormSchemaField[] = [
  { name: 'salary', type: 'NUMBER', label: '薪资' },
  {
    name: 'items',
    type: 'TABLE',
    label: '明细',
    subFields: [{ name: 'amount', type: 'NUMBER', label: '金额' }],
  },
]

const stubs = {
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div />' },
  'el-select': { template: '<div/>' },
  FormListConfigEditor: { template: '<div data-testid="list-config" />' },
  DatasourceManagerDialog: { template: '<div data-testid="datasource-dialog" />' },
}

describe('FormAccessPanel', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('includes table subfields and emits normalized field/action permissions', () => {
    const wrapper = mount(FormAccessPanel, {
      props: {
        formId: '71',
        fields,
        fieldPermissions: { salary: { view: ['role:hr'], edit: [] } },
        actionPermissions: { view: ['role:admin'] },
      },
      global: { stubs },
    })
    const vm = wrapper.vm as unknown as {
      patchField: (key: string, action: 'view' | 'edit', values: string[]) => void
      patchAction: (action: string, values: string[]) => void
      resetPermissions: () => void
    }

    vm.patchField('items.amount', 'edit', [' role:finance ', 'role:finance'])
    vm.patchAction('export', ['user:42'])
    vm.resetPermissions()

    expect(wrapper.emitted('update:fieldPermissions')?.[0]?.[0]).toMatchObject({
      salary: { view: ['role:hr'] },
      'items.amount': { edit: ['role:finance'] },
    })
    expect(wrapper.emitted('update:actionPermissions')?.[0]?.[0]).toEqual({
      view: ['role:admin'],
      export: ['user:42'],
    })
    expect(wrapper.emitted('update:fieldPermissions')?.at(-1)?.[0]).toEqual({})
    expect(wrapper.emitted('update:actionPermissions')?.at(-1)?.[0]).toEqual({})
  })
})
