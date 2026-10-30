import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('../../api/datasource', () => ({
  listExtQueryContracts: vi.fn(),
}))

import { listExtQueryContracts, type ExtQueryContract } from '../../api/datasource'
import DatasourceConfig from './DatasourceConfig.vue'
import type { FormSchemaField } from '@/contracts/form-schema'

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
  CommonConfigRows: {
    template: '<div />',
    props: ['fieldType', 'defaultValue'],
  },
  'el-input': { template: '<input />', props: ['modelValue', 'disabled'] },
}

function datasourceField(queryKey = '', version?: number): FormSchemaField {
  return {
    name: 'vendor',
    type: 'DATASOURCE',
    label: '供应商',
    dsBinding: {
      queryKey,
      ...(version === undefined ? {} : { version }),
      valueField: '',
      displayField: '',
    },
  }
}

function mountConfig(field = datasourceField()) {
  return mount(DatasourceConfig, {
    props: { field, otherNames: [] },
    global: { stubs },
  })
}

type ConfigVm = {
  onQueryKeyChange: (queryKey: string) => void
  onValueFieldChange: (value: string) => void
  contractEnabled: (contract: ExtQueryContract) => boolean
}

describe('DatasourceConfig — 已授权查询契约选择', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listExtQueryContracts).mockResolvedValue([contract])
  })

  it('选择契约时写入稳定 queryKey/version，并清空不属于该契约的字段', async () => {
    const wrapper = mountConfig({
      ...datasourceField('legacy_query', 1),
      dsBinding: {
        queryKey: 'legacy_query',
        version: 1,
        valueField: 'legacy_id',
        displayField: 'legacy_name',
      },
    } as FormSchemaField)
    await flushPromises()
    const vm = wrapper.vm as unknown as ConfigVm

    vm.onQueryKeyChange('asset_list')

    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({
      dsBinding: {
        queryKey: 'asset_list',
        version: 2,
        valueField: '',
        displayField: '',
      },
    })
  })

  it('契约输出字段作为值字段与显示字段的可选清单', async () => {
    const wrapper = mountConfig({
      ...datasourceField('asset_list', 2),
    } as FormSchemaField)
    await flushPromises()

    const options = wrapper.findAllComponents({ name: 'ElOption' })
    expect(options.map((option) => option.props('value'))).toEqual([
      'asset_list',
      'value',
      'display',
      'value',
      'display',
    ])
  })

  it('停用契约在选项中不可选择', async () => {
    vi.mocked(listExtQueryContracts).mockResolvedValue([{ ...contract, enabled: 0 }])
    const wrapper = mountConfig()
    await flushPromises()
    const vm = wrapper.vm as unknown as ConfigVm

    const queryOption = wrapper
      .findAllComponents({ name: 'ElOption' })
      .find((option) => option.props('value') === 'asset_list')
    expect(queryOption?.props('disabled')).toBe(true)
    expect(vm.contractEnabled({ ...contract, enabled: 0 })).toBe(false)

    const updateCount = wrapper.emitted('update')?.length ?? 0
    vm.onQueryKeyChange('asset_list')
    expect(wrapper.emitted('update')?.length ?? 0).toBe(updateCount)
  })

  it('没有已授权契约时给出明确空态', async () => {
    vi.mocked(listExtQueryContracts).mockResolvedValue([])
    const wrapper = mountConfig()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无已授权查询契约')
  })

  it('绑定旧版本时不使用最新版本的字段清单', async () => {
    const wrapper = mountConfig(datasourceField('asset_list', 1))
    await flushPromises()

    expect(wrapper.text()).toContain('字段清单来自最新版本 v2')
    const options = wrapper.findAllComponents({ name: 'ElOption' })
    expect(options.map((option) => option.props('value'))).toEqual(['asset_list'])
  })
})
