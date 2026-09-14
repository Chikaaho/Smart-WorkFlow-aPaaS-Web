import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NotifyChannelList from './NotifyChannelList.vue'
import type { NotifyChannelStatus } from '@/contracts/notify'

vi.mock('@/modules/notify/api', () => ({
  listNotifyChannels: vi.fn(),
  updateNotifyChannel: vi.fn(),
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

import { listNotifyChannels, updateNotifyChannel } from '@/modules/notify/api'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'

const stubs = {
  StandardListTemplate: { template: '<div><slot name="page-action"/><slot/></div>' },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-tag': { template: '<span>{{ slot }}</span>' },
  'el-switch': {
    template: '<button class="el-switch"/>',
    props: ['modelValue', 'loading'],
    emits: ['update:modelValue'],
  },
}

const rows: NotifyChannelStatus[] = [
  {
    channel: 'IN_APP',
    systemConfigured: true,
    tenantEnabled: true,
    senderDisplay: null,
    configSummary: '本地收件箱',
  },
  {
    channel: 'EMAIL',
    systemConfigured: true,
    tenantEnabled: false,
    senderDisplay: 'oa@example.com',
    configSummary: 'smtp://mail.local',
  },
  {
    channel: 'FEISHU',
    systemConfigured: false,
    tenantEnabled: false,
    senderDisplay: null,
    configSummary: null,
  },
]

describe('NotifyChannelList.vue（I6 G9 聚焦）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists channels with assembly status; unconfigured channel cannot be enabled', async () => {
    vi.mocked(listNotifyChannels).mockResolvedValue(rows)
    const wrapper = mount(NotifyChannelList, { global: { stubs } })
    await nextTick()
    const vm = wrapper.vm as unknown as {
      list: NotifyChannelStatus[]
      handleToggle: (r: NotifyChannelStatus, v: boolean) => Promise<void>
    }
    expect(vm.list).toHaveLength(3)

    // 未装配渠道尝试启用 → 服务端拒绝，UI 错误提示
    vi.mocked(updateNotifyChannel).mockRejectedValueOnce(
      new ApiError(400, '生产渠道适配器未装配或租户配置校验未通过，禁止启用: FEISHU'),
    )
    await vm.handleToggle(rows[2], true)
    expect(updateNotifyChannel).toHaveBeenCalledOnce()
    expect(ElMessage.error).toHaveBeenCalledWith(
      '生产渠道适配器未装配或租户配置校验未通过，禁止启用: FEISHU',
    )

    // 已装配渠道启用成功
    vi.mocked(updateNotifyChannel).mockResolvedValueOnce(undefined)
    await vm.handleToggle(rows[1], true)
    expect(ElMessage.success).toHaveBeenCalledWith('渠道已启用')
  })
})
