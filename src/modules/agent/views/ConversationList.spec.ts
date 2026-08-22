/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import { ApiError } from '@/foundation/request'

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('@/modules/agent/api', () => ({
  listConversations: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElSkeleton: { template: '<div class="el-skeleton">loading...</div>' },
    ElAlert: { template: '<div class="el-alert" :class="type">{{ title }}</div>' },
  }
})

import { listConversations } from '@/modules/agent/api'
import type { AgentConversation } from '@/contracts/agent'
import ConversationList from './ConversationList.vue'

const STUBS_LIST = {
  // 简化表格 stub：渲染数据数量与占位（不逐列渲染，行为经组件状态验证）
  'el-table': {
    props: ['data'],
    template: '<div class="table-stub" :data-count="data.length"><slot/></div>',
  },
  'el-table-column': { template: '<div class="col-stub" />' },
  'el-tag': { template: '<span><slot/></span>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-empty': { template: '<div class="empty-stub">empty</div>' },
}

function conversation(partial: Partial<AgentConversation>): AgentConversation {
  return {
    id: 1,
    agentModelConfigId: 10,
    title: '会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 09:00:00',
    ...partial,
  }
}

describe('ConversationList — 会话历史列表页（M07-F04-02 标准6）', () => {
  beforeEach(() => {
    vi.mocked(listConversations).mockReset()
    push.mockClear()
  })

  it('加载成功后调用列表 API 并渲染会话数据', async () => {
    vi.mocked(listConversations).mockResolvedValue([
      conversation({ id: 1, title: '客服咨询会话' }),
      conversation({ id: 2, title: '未知用量会话' }),
    ])

    const wrapper = mount(ConversationList, {
      global: { stubs: STUBS_LIST, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    expect(listConversations).toHaveBeenCalledTimes(1)
    // 数据已进入组件状态
    expect((wrapper.vm as any).conversations).toHaveLength(2)
    // 页面标题存在
    expect(wrapper.text()).toContain('会话历史')
  })

  it('加载失败显示错误信息', async () => {
    vi.mocked(listConversations).mockRejectedValue(new ApiError(500, '服务异常'))

    const wrapper = mount(ConversationList, {
      global: { stubs: STUBS_LIST, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as any).error).toBe('服务异常')
  })

  it('空列表显示空状态', async () => {
    vi.mocked(listConversations).mockResolvedValue([])

    const wrapper = mount(ConversationList, {
      global: { stubs: STUBS_LIST, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as any).conversations).toHaveLength(0)
    expect(wrapper.find('.empty-stub').exists()).toBe(true)
  })

  it('点击"查看消息"跳转到会话详情路由', async () => {
    vi.mocked(listConversations).mockResolvedValue([conversation({ id: 7 })])

    const wrapper = mount(ConversationList, {
      global: { stubs: STUBS_LIST, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    await (wrapper.vm as any).viewConversation(7)
    expect(push).toHaveBeenCalledWith({
      name: 'agent-conversation-detail',
      params: { sessionId: 7 },
    })
  })
})
