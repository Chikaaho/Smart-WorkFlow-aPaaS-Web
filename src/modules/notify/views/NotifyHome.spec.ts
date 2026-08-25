import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const mockDeleteMessage = vi.fn()
const mockElMessageBox = vi.fn()

vi.mock('@/modules/notify/api', () => ({
  queryNotifyMessages: vi.fn(),
  markAsRead: vi.fn(),
  deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    ElMessageBox: {
      confirm: (...args: unknown[]) => mockElMessageBox(...args),
    },
  }
})

import { queryNotifyMessages, markAsRead } from '@/modules/notify/api'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { NotifyMessage } from '@/contracts/notify'
import NotifyHome from './NotifyHome.vue'

const stubs = {
  StandardListTemplate: {
    template: '<div><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-button': { template: '<button><slot/></button>' },
  'el-select': {
    template: '<div/>',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
  },
  'el-option': { template: '<div/>' },
  'el-input': {
    template: '<div/>',
    props: ['modelValue', 'placeholder', 'clearable'],
    emits: ['update:modelValue', 'keyup', 'clear'],
  },
}

const mockMessage: NotifyMessage = {
  id: 1,
  recipientId: 1,
  title: '新待办任务：请假申请审批',
  content: '张三提交了请假申请，等待您审批。',
  bizType: 'WF_TODO',
  bizId: 'mock-task-001',
  read: false,
  createTime: '2026-07-15T09:00:00',
  updateTime: '2026-07-15T09:00:00',
  createBy: null,
  updateBy: null,
  tenantId: 1,
}

describe('NotifyHome.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls queryNotifyMessages on mount and renders list', async () => {
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([mockMessage])
    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()
    expect(queryNotifyMessages).toHaveBeenCalledOnce()
    expect((wrapper.vm as unknown as { list: NotifyMessage[] }).list).toHaveLength(1)
    expect((wrapper.vm as unknown as { total: number }).total).toBe(1)
  })

  it('shows error message when API fails with ApiError', async () => {
    vi.mocked(queryNotifyMessages).mockRejectedValueOnce(new ApiError(2001, '获取通知列表失败'))
    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('获取通知列表失败')
    expect(ElMessage.error).toHaveBeenCalledWith('获取通知列表失败')
  })

  it('shows fallback error message when API fails with non-ApiError', async () => {
    vi.mocked(queryNotifyMessages).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('加载通知列表失败')
    expect(ElMessage.error).toHaveBeenCalledWith('加载通知列表失败')
  })

  it('calls markAsRead and sets read status', async () => {
    const unreadMessage = { ...mockMessage, read: false }
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([unreadMessage])
    vi.mocked(markAsRead).mockResolvedValueOnce(undefined)

    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()

    expect(wrapper.vm).toHaveProperty('readingId', null)

    // 直接调用 handleMarkRead
    await (
      wrapper.vm as unknown as { handleMarkRead: (r: NotifyMessage) => Promise<void> }
    ).handleMarkRead(unreadMessage)
    await nextTick()

    expect(markAsRead).toHaveBeenCalledWith(1)
    const list = (wrapper.vm as unknown as { list: NotifyMessage[] }).list
    expect(list[0].read).toBe(true)
  })

  it('shows error when markAsRead fails', async () => {
    const unreadMessage = { ...mockMessage, read: false }
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([unreadMessage])
    vi.mocked(markAsRead).mockRejectedValueOnce(new ApiError(2002, '标记已读失败'))

    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleMarkRead: (r: NotifyMessage) => Promise<void> }
    ).handleMarkRead(unreadMessage)
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalledWith('标记已读失败')
  })

  it('shows empty state when no messages', async () => {
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([])
    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect((wrapper.vm as unknown as { list: NotifyMessage[] }).list).toHaveLength(0)
    expect((wrapper.vm as unknown as { isEmpty: boolean }).isEmpty).toBe(true)
  })

  it('calls deleteMessage after confirm and removes from list', async () => {
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([mockMessage])
    mockDeleteMessage.mockResolvedValueOnce(undefined)
    mockElMessageBox.mockResolvedValueOnce(undefined) // 用户确认

    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDelete: (r: NotifyMessage) => Promise<void> }
    ).handleDelete(mockMessage)
    await nextTick()

    expect(mockDeleteMessage).toHaveBeenCalledWith(1)
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功')
    const list = (wrapper.vm as unknown as { list: NotifyMessage[] }).list
    expect(list).toHaveLength(0)
  })

  it('does not delete when user cancels confirm', async () => {
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([mockMessage])
    mockElMessageBox.mockRejectedValueOnce(new Error('cancel')) // 用户取消

    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDelete: (r: NotifyMessage) => Promise<void> }
    ).handleDelete(mockMessage)
    await nextTick()

    expect(mockDeleteMessage).not.toHaveBeenCalled()
    const list = (wrapper.vm as unknown as { list: NotifyMessage[] }).list
    expect(list).toHaveLength(1)
  })

  it('shows error when deleteMessage fails', async () => {
    vi.mocked(queryNotifyMessages).mockResolvedValueOnce([mockMessage])
    mockDeleteMessage.mockRejectedValueOnce(new ApiError(2003, '删除失败'))
    mockElMessageBox.mockResolvedValueOnce(undefined)

    const wrapper = mount(NotifyHome, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDelete: (r: NotifyMessage) => Promise<void> }
    ).handleDelete(mockMessage)
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalledWith('删除失败')
    const list = (wrapper.vm as unknown as { list: NotifyMessage[] }).list
    expect(list).toHaveLength(1) // 列表未变
  })
})
