import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const permissions = new Set<string>()

vi.mock('@/foundation/permission', () => ({
  usePermission: () => ({
    hasPerm: (code: string) => permissions.has(code),
  }),
}))

vi.mock('../api/datasource', () => ({
  pageManagedDatasources: vi.fn(),
  createManagedDatasource: vi.fn(),
  updateManagedDatasource: vi.fn(),
  deleteManagedDatasource: vi.fn(),
  listDatasourceGrants: vi.fn(),
  replaceDatasourceGrants: vi.fn(),
  listExtQueryContracts: vi.fn(),
  setExtQueryContractEnabled: vi.fn(),
}))

import {
  listDatasourceGrants,
  listExtQueryContracts,
  pageManagedDatasources,
  replaceDatasourceGrants,
  setExtQueryContractEnabled,
  updateManagedDatasource,
  type ExtQueryContract,
  type ManagedDatasource,
} from '../api/datasource'
import DatasourceManagerDialog from './DatasourceManagerDialog.vue'

const datasource: ManagedDatasource = {
  id: '9',
  name: '资产库',
  type: 'postgresql',
  jdbcUrl: 'jdbc:postgresql://db:5432/asset',
  driverClass: 'org.postgresql.Driver',
  username: 'asset_reader',
  readOnly: 1,
  enabled: 1,
}

const contract: ExtQueryContract = {
  queryKey: 'asset_list',
  queryVersion: 2,
  datasourceId: '9',
  outputFields: [
    { name: 'value', type: 'string' },
    { name: 'display', type: 'string' },
  ],
  enabled: 1,
}

const stubs = {
  DetailDialog: {
    props: ['modelValue', 'title', 'error', 'loading'],
    template: '<div><slot/><slot name="footer"/></div>',
  },
  'el-tabs': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div><slot/></div>', props: ['label', 'name'] },
  'el-table': {
    template: '<div><slot/></div>',
    props: ['data', 'emptyText', 'maxHeight'],
  },
  'el-table-column': { template: '<div />', props: ['label', 'prop'] },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    props: ['loading', 'disabled'],
  },
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-select': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-option': { template: '<div />', props: ['value', 'label'] },
  'el-switch': { template: '<div />', props: ['modelValue', 'disabled'] },
  'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
  'el-form': { template: '<div><slot/></div>', props: ['labelPosition'] },
  'el-form-item': { template: '<div><slot/></div>', props: ['label'] },
  'el-row': { template: '<div><slot/></div>' },
  'el-col': { template: '<div><slot/></div>' },
}

function mountDialog() {
  return mount(DatasourceManagerDialog, {
    props: { modelValue: true },
    global: {
      stubs,
      directives: { loading: {} },
    },
  })
}

type DialogVm = {
  form: { password: string }
  grants: Array<{ subjectType: 'ROLE' | 'USER'; subjectKey: string }>
  contracts: ExtQueryContract[]
  newGrantType: 'ROLE' | 'USER'
  newGrantKey: string
  grantsError: string
  openGrants: (row: ManagedDatasource) => Promise<void>
  addGrant: () => void
  saveGrants: () => Promise<void>
  openEdit: (row: ManagedDatasource) => void
  save: () => Promise<void>
  onTabChange: (name: string) => void
  toggleContract: (row: ExtQueryContract, value: string | number | boolean) => Promise<void>
}

describe('DatasourceManagerDialog — F020 授权与查询契约', () => {
  beforeEach(() => {
    permissions.clear()
    permissions.add('workflow:datasource:manage')
    permissions.add('form:design:save')
    vi.clearAllMocks()
    vi.mocked(pageManagedDatasources).mockResolvedValue({
      list: [datasource],
      total: 1,
      pageNum: 1,
      pageSize: 100,
    })
    vi.mocked(updateManagedDatasource).mockResolvedValue(undefined)
    vi.mocked(replaceDatasourceGrants).mockResolvedValue(undefined)
    vi.mocked(setExtQueryContractEnabled).mockResolvedValue(undefined)
  })

  it('读取授权主体；保存整集合后再次回读服务端结果', async () => {
    vi.mocked(listDatasourceGrants)
      .mockResolvedValueOnce([{ subjectType: 'ROLE', subjectKey: 'designer' }])
      .mockResolvedValueOnce([
        { subjectType: 'ROLE', subjectKey: 'designer' },
        { subjectType: 'USER', subjectKey: '2113516345554395137' },
      ])
    const wrapper = mountDialog()
    await flushPromises()
    const vm = wrapper.vm as unknown as DialogVm

    await vm.openGrants(datasource)
    expect(listDatasourceGrants).toHaveBeenCalledWith('9')
    expect(vm.grants).toEqual([{ subjectType: 'ROLE', subjectKey: 'designer' }])

    vm.newGrantType = 'USER'
    vm.newGrantKey = ' 2113516345554395137 '
    vm.addGrant()
    expect(vm.grants).toHaveLength(2)

    await vm.saveGrants()
    expect(replaceDatasourceGrants).toHaveBeenCalledWith('9', [
      { subjectType: 'ROLE', subjectKey: 'designer' },
      { subjectType: 'USER', subjectKey: '2113516345554395137' },
    ])
    expect(listDatasourceGrants).toHaveBeenCalledTimes(2)
    expect(vm.grants).toHaveLength(2)
  })

  it('拒绝不合法的用户主体，不提交到待保存清单', async () => {
    vi.mocked(listDatasourceGrants).mockResolvedValueOnce([])
    const wrapper = mountDialog()
    await flushPromises()
    const vm = wrapper.vm as unknown as DialogVm

    await vm.openGrants(datasource)
    vm.newGrantType = 'USER'
    vm.newGrantKey = 'user-42'
    vm.addGrant()

    expect(vm.grants).toEqual([])
    expect(vm.grantsError).toBe('用户 ID 只能包含数字')
  })

  it('编辑数据源时密码留空不发送 password，填写新值才发送', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const vm = wrapper.vm as unknown as DialogVm

    vm.openEdit(datasource)
    vm.form.password = ''
    await vm.save()
    expect(vi.mocked(updateManagedDatasource).mock.calls.at(-1)?.[1]).not.toHaveProperty('password')

    vm.openEdit(datasource)
    vm.form.password = 'rotated-secret'
    await vm.save()
    expect(vi.mocked(updateManagedDatasource).mock.calls.at(-1)?.[1]).toMatchObject({
      password: 'rotated-secret',
    })
  })

  it('查看查询契约清单并启停最新版本后回读', async () => {
    vi.mocked(listExtQueryContracts)
      .mockResolvedValueOnce([contract])
      .mockResolvedValueOnce([{ ...contract, enabled: 0 }])
    const wrapper = mountDialog()
    await flushPromises()
    const vm = wrapper.vm as unknown as DialogVm

    vm.onTabChange('contracts')
    await flushPromises()
    expect(listExtQueryContracts).toHaveBeenCalledTimes(1)
    expect(vm.contracts).toEqual([contract])

    await vm.toggleContract(contract, false)
    expect(setExtQueryContractEnabled).toHaveBeenCalledWith('asset_list', false)
    expect(listExtQueryContracts).toHaveBeenCalledTimes(2)
    expect(vm.contracts[0]?.enabled).toBe(0)
  })
})
