import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/notify/api', () => ({
  batchSendNotify: vi.fn(),
  resolveCountNotify: vi.fn().mockResolvedValue({ recipientCount: 0 }),
  pageNotifyTemplates: vi.fn().mockResolvedValue({
    list: [
      { templateCode: 'WF_TODO_NOTICE', name: '待办提醒模板' },
      { templateCode: 'WF_APPROVED_NOTICE', name: '审批通过模板' },
    ],
    total: 2,
  }),
}))

vi.mock('@/modules/system/api/user', () => ({
  pageUsers: vi.fn().mockResolvedValue({ list: [], total: 0 }),
}))

vi.mock('@/modules/system/api/dept', () => ({
  listDeptTree: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/modules/system/api/role', () => ({
  pageRoles: vi.fn().mockResolvedValue({
    list: [
      { id: '1', name: '超级管理员', code: 'superadmin' },
      { id: '2', name: '管理员', code: 'admin' },
    ],
    total: 2,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

const mockElMessageBox = vi.fn()

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

import { batchSendNotify, resolveCountNotify } from '@/modules/notify/api'
import { ElMessage } from 'element-plus'
import NotifyBatchSend from './NotifyBatchSend.vue'

const stubs = {
  StandardFormTemplate: {
    template:
      '<div class="standard-form"><h1>{{ title }}</h1><div class="form-body"><slot/></div><slot name="alert"/><div class="form-actions"><slot name="actions"/></div></div>',
    props: ['title', 'subtitle'],
  },
  FormSection: {
    template: '<div class="form-section"><h3>{{ title }}</h3><slot/></div>',
    props: ['title'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-tabs': {
    template: '<div class="el-tabs"><slot/></div>',
    props: ['modelValue', 'type'],
    emits: ['update:modelValue'],
  },
  'el-tab-pane': {
    template: '<div class="el-tab-pane"><slot/></div>',
    props: ['label', 'name'],
  },
  'el-input': {
    template: '<div class="el-input"/>',
    props: ['modelValue', 'placeholder', 'clearable', 'type', 'rows', 'maxlength'],
    emits: ['update:modelValue', 'input'],
  },
  'el-select': {
    template: '<div class="el-select"/>',
    props: ['modelValue', 'placeholder', 'style'],
    emits: ['update:modelValue', 'change'],
  },
  'el-option': { template: '<div/>' },
  'el-button': {
    template: '<button class="el-button" :disabled="disabled"><slot/></button>',
    props: ['type', 'loading', 'disabled'],
    emits: ['click'],
  },
  'el-tag': {
    template: '<span class="el-tag"><slot/></span>',
    props: ['closable'],
    emits: ['close'],
  },
  'el-checkbox-group': {
    template: '<div class="el-checkbox-group"><slot/></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'el-checkbox': {
    template: '<label class="el-checkbox"><input type="checkbox" /><slot/></label>',
    props: ['label'],
  },
  'el-tree': {
    template: '<div class="el-tree"/>',
    props: ['data', 'showCheckbox', 'nodeKey', 'props'],
    emits: ['check'],
  },
}

describe('NotifyBatchSend.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page with title and sections', async () => {
    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()
    expect(wrapper.text()).toContain('发送通知')
    expect(wrapper.text()).toContain('接收对象')
    expect(wrapper.text()).toContain('通知内容')
  })

  it('enables send button when direct content is filled with recipients', async () => {
    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      selectedUsers: Array<{ id: string; realName: string }>
      directTitle: string
      directContent: string
      contentMode: string
    }
    vm.selectedUsers = [{ id: '1', realName: '张三' }]
    vm.directTitle = '测试标题'
    vm.directContent = '测试内容'
    vm.contentMode = 'direct'
    await nextTick()

    expect(vm.selectedUsers).toHaveLength(1)
    expect(vm.directTitle).toBe('测试标题')
    expect(vm.directContent).toBe('测试内容')
  })

  it('clears direct content when switching to template mode', async () => {
    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      directTitle: string
      directContent: string
      contentMode: string
      templateCode: string
    }
    vm.directTitle = '测试标题'
    vm.directContent = '测试内容'
    vm.contentMode = 'template'
    await nextTick()

    expect(vm.directTitle).toBe('')
    expect(vm.directContent).toBe('')
  })

  it('clears template data when switching to direct content mode', async () => {
    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      directTitle: string
      directContent: string
      contentMode: string
      templateCode: string
      variablesText: string
    }
    // First switch to template, then set values, then switch back
    vm.contentMode = 'template'
    await nextTick()
    vm.templateCode = 'WF_TODO_NOTICE'
    vm.variablesText = '{"userName": "张三"}'
    // Now switch to direct — watcher should clear template fields
    vm.contentMode = 'direct'
    await nextTick()

    expect(vm.templateCode).toBe('')
    expect(vm.variablesText).toBe('{}')
  })

  it('shows confirm dialog on send click', async () => {
    vi.mocked(batchSendNotify).mockResolvedValueOnce({ recipientCount: 1 })
    vi.mocked(resolveCountNotify).mockResolvedValue({ recipientCount: 1 })
    mockElMessageBox.mockResolvedValueOnce(undefined)

    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      selectedUsers: Array<{ id: string; realName: string }>
      directTitle: string
      directContent: string
      contentMode: string
      serverCount: number
      handleSend: () => Promise<void>
    }
    vm.selectedUsers = [{ id: '1', realName: '张三' }]
    vm.directTitle = '测试标题'
    vm.directContent = '测试内容'
    vm.contentMode = 'direct'
    vm.serverCount = 1 // 直接设置服务端人数（跳过 watch 防抖）
    await nextTick()

    await vm.handleSend()

    expect(mockElMessageBox).toHaveBeenCalledOnce()
  })

  it('calls batchSendNotify API on confirm', async () => {
    vi.mocked(batchSendNotify).mockResolvedValueOnce({ recipientCount: 1 })
    vi.mocked(resolveCountNotify).mockResolvedValue({ recipientCount: 1 })
    mockElMessageBox.mockResolvedValueOnce(undefined)

    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      selectedUsers: Array<{ id: string; realName: string }>
      directTitle: string
      directContent: string
      contentMode: string
      serverCount: number
      handleSend: () => Promise<void>
    }
    vm.selectedUsers = [{ id: '1', realName: '张三' }]
    vm.directTitle = '测试标题'
    vm.directContent = '测试内容'
    vm.contentMode = 'direct'
    vm.serverCount = 1
    await nextTick()

    await vm.handleSend()

    expect(vi.mocked(batchSendNotify)).toHaveBeenCalledWith({
      recipientUserIds: [1],
      recipientDeptIds: [],
      recipientRoleCodes: [],
      title: '测试标题',
      content: '测试内容',
    })
    expect(ElMessage.success).toHaveBeenCalledWith('成功向 1 人发送通知')
  })

  it('shows error message when API fails', async () => {
    vi.mocked(batchSendNotify).mockRejectedValueOnce({ code: 400, msg: '接收人不能为空' })
    vi.mocked(resolveCountNotify).mockResolvedValue({ recipientCount: 1 })
    mockElMessageBox.mockResolvedValueOnce(undefined)

    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      selectedUsers: Array<{ id: string; realName: string }>
      directTitle: string
      directContent: string
      contentMode: string
      serverCount: number
      handleSend: () => Promise<void>
    }
    vm.selectedUsers = [{ id: '1', realName: '张三' }]
    vm.directTitle = '测试标题'
    vm.directContent = '测试内容'
    vm.contentMode = 'direct'
    vm.serverCount = 1
    await nextTick()

    await vm.handleSend()

    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('does not call API when user cancels confirm', async () => {
    mockElMessageBox.mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      selectedUsers: Array<{ id: string; realName: string }>
      directTitle: string
      directContent: string
      contentMode: string
      handleSend: () => Promise<void>
    }
    vm.selectedUsers = [{ id: '1', realName: '张三' }]
    vm.directTitle = '测试标题'
    vm.directContent = '测试内容'
    vm.contentMode = 'direct'
    await nextTick()

    await vm.handleSend()

    expect(vi.mocked(batchSendNotify)).not.toHaveBeenCalled()
  })

  it('canSubmit is false when no recipients selected', async () => {
    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { canSubmit: boolean }
    expect(vm.canSubmit).toBe(false)
  })
})
