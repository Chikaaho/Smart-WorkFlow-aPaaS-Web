import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NotifyPreference from './NotifyPreference.vue'
import type { NotifySubscriptionItem } from '@/contracts/notify'

const mockSave = vi.fn()
vi.mock('@/modules/notify/api', () => ({
  getNotifySubscription: vi.fn(),
  saveNotifySubscription: (...args: unknown[]) => mockSave(...args),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { getNotifySubscription } from '@/modules/notify/api'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'

const stubs = {
  StandardListTemplate: { template: '<div><slot name="page-action"/><slot/></div>' },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-switch': {
    template: '<button class="el-switch"/>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-button': { template: '<button><slot/></button>', props: ['type', 'loading'] },
}

describe('NotifyPreference.vue（I6 G9 聚焦）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads preferences; required opt-out rejected by server surfaces error without clearing state', async () => {
    const items: NotifySubscriptionItem[] = [
      { eventType: 'TODO_CREATED', channel: 'IN_APP', enabled: true },
    ]
    vi.mocked(getNotifySubscription).mockResolvedValueOnce(items)
    const wrapper = mount(NotifyPreference, { global: { stubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      items: NotifySubscriptionItem[]
      handleSave: () => Promise<void>
    }
    expect(vm.items).toHaveLength(1)
    expect(vm.items[0].enabled).toBe(true)

    // 用户在 UI 关闭必须送达项 → 服务端拒绝，列表保持原状态
    vm.items[0].enabled = false
    mockSave.mockRejectedValueOnce(
      new ApiError(400, '必须送达事件/渠道不允许关闭: TODO_CREATED/IN_APP'),
    )
    await vm.handleSave()
    expect(mockSave).toHaveBeenCalledOnce()
    expect(ElMessage.error).toHaveBeenCalledWith('必须送达事件/渠道不允许关闭: TODO_CREATED/IN_APP')
    expect(vm.items[0].enabled).toBe(false) // 服务端权威之前 UI 不放行
  })
})
