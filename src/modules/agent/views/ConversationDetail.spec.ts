/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import { ApiError } from '@/foundation/request'

const { push, replace, routeParamsMock } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  routeParamsMock: {} as any,
}))

vi.mock('@/modules/agent/api', () => ({
  listConversationMessages: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ params: routeParamsMock }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElSkeleton: { template: '<div class="el-skeleton">loading...</div>' },
    ElAlert: { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
    ElCard: { template: '<div><slot name="header"/><slot/></div>' },
  }
})

import { listConversationMessages } from '@/modules/agent/api'
import type { AgentConversationMessage } from '@/contracts/agent'
import ConversationDetail from './ConversationDetail.vue'

const STUBS_DETAIL = {
  'el-button': { template: '<button><slot/></button>' },
  'el-icon': { template: '<i></i>' },
  'el-empty': { template: '<div>empty</div>' },
}

function message(partial: Partial<AgentConversationMessage>): AgentConversationMessage {
  return {
    id: 1,
    role: 'ASSISTANT',
    content: '回复',
    msgOrder: 0,
    inputTokens: 10,
    outputTokens: 20,
    createTime: '2026-08-22 09:00:00',
    ...partial,
  }
}

describe('ConversationDetail — 会话消息 Token 展示（M07-F04-02 标准6/7）', () => {
  beforeEach(() => {
    Object.keys(routeParamsMock).forEach((k) => delete routeParamsMock[k])
    routeParamsMock.sessionId = 1
    vi.mocked(listConversationMessages).mockReset()
    push.mockClear()
    replace.mockClear()
  })

  it('确定 token：展示 Token 使用统计（输入 40 / 输出 60 / 总 100）', async () => {
    vi.mocked(listConversationMessages).mockResolvedValue([
      message({ id: 1, msgOrder: 0, inputTokens: 10, outputTokens: 20 }),
      message({ id: 2, msgOrder: 1, inputTokens: 30, outputTokens: 40 }),
    ])

    const wrapper = mount(ConversationDetail, {
      global: { stubs: STUBS_DETAIL, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('Token 使用统计')
    expect(text).toContain('输入 Token')
    expect(text).toContain('40')
    expect(text).toContain('输出 Token')
    expect(text).toContain('60')
    expect(text).toContain('总 Token')
    expect(text).toContain('100')
  })

  it('未知 token：全 null 时汇总显示"未知"而非 0', async () => {
    vi.mocked(listConversationMessages).mockResolvedValue([
      message({ id: 1, msgOrder: 0, inputTokens: null, outputTokens: null }),
    ])

    const wrapper = mount(ConversationDetail, {
      global: { stubs: STUBS_DETAIL, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('未知')
    expect(text).not.toContain('输入 Token:0')
    expect(text).not.toContain('总 Token:0')
  })

  it('部分 token：输入有值输出 null 时，输入聚合、输出与总显示"未知"', async () => {
    vi.mocked(listConversationMessages).mockResolvedValue([
      message({ id: 1, msgOrder: 0, inputTokens: 50, outputTokens: null }),
    ])

    const wrapper = mount(ConversationDetail, {
      global: { stubs: STUBS_DETAIL, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('50')
    expect(text).toContain('未知')
  })

  it('无效会话 ID → 显示错误而非请求', async () => {
    delete routeParamsMock.sessionId
    const wrapper = mount(ConversationDetail, {
      global: { stubs: STUBS_DETAIL, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('无效的会话 ID')
    expect(listConversationMessages).not.toHaveBeenCalled()
  })

  it('404 会话 → 跳转 /404（历史/跨租户兼容语义）', async () => {
    vi.mocked(listConversationMessages).mockRejectedValue(new ApiError(404, '会话不存在'))
    mount(ConversationDetail, {
      global: { stubs: STUBS_DETAIL, plugins: [createPinia()] },
    })
    await nextTick()
    await nextTick()
    await nextTick()

    expect(replace).toHaveBeenCalledWith('/404')
  })
})
