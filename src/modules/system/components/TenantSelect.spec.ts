import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TenantSelect from './TenantSelect.vue'
import { tenantContextOptions } from '@/modules/system/api/tenant-context'
import type { TenantContextOption } from '@/modules/system/types/tenant'

vi.mock('@/modules/system/api/tenant-context', () => ({ tenantContextOptions: vi.fn() }))
const stubs = {
  'el-select': {
    name: 'ElSelect',
    template: '<div><slot/></div>',
    props: ['modelValue', 'remoteMethod'],
    emits: ['update:modelValue'],
  },
  'el-option': { template: '<span/>', props: ['value', 'label', 'disabled'] },
}
const first: TenantContextOption = {
  id: '2113285377233043457',
  name: '租户甲',
  code: 'a',
  writable: true,
}
const second: TenantContextOption = {
  id: '2113285377233043458',
  name: '租户乙',
  code: 'b',
  writable: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tenantContextOptions).mockResolvedValue([])
})

describe('TenantSelect', () => {
  it('搜索结果按最新请求展示，旧响应不能覆盖另一个目标的候选', async () => {
    let finishFirst!: (rows: TenantContextOption[]) => void
    vi.mocked(tenantContextOptions).mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirst = resolve
      }),
    )
    const wrapper = mount(TenantSelect, { props: { modelValue: null }, global: { stubs } })
    vi.mocked(tenantContextOptions).mockResolvedValueOnce([second])
    const vm = wrapper.vm as unknown as {
      search: (keyword: string) => Promise<void>
      options: TenantContextOption[]
    }
    await vm.search('乙')
    finishFirst([first])
    await flushPromises()
    expect(vm.options).toEqual([second])
    expect(tenantContextOptions).toHaveBeenLastCalledWith('乙', false)
  })

  it('选择保留完整 Long 字符串及可用状态，不转换成数字', async () => {
    vi.mocked(tenantContextOptions).mockResolvedValue([first])
    const wrapper = mount(TenantSelect, {
      props: { modelValue: null, creatable: true },
      global: { stubs },
    })
    await flushPromises()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', first.id)
    expect(wrapper.emitted('update:modelValue')).toEqual([[first]])
    expect(tenantContextOptions).toHaveBeenCalledWith('', true)
  })

  it('加载失败显示错误，重新搜索可恢复', async () => {
    vi.mocked(tenantContextOptions).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(TenantSelect, { props: { modelValue: null }, global: { stubs } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    vi.mocked(tenantContextOptions).mockResolvedValueOnce([second])
    await (wrapper.vm as unknown as { search: (keyword: string) => Promise<void> }).search('乙')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
