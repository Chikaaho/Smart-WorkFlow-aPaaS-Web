import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { resolveCountNotify } from '@/modules/notify/api'
import * as notifyApi from '@/modules/notify/api'
import {
  MOCK_NOTIFY_MESSAGES,
  MOCK_ROLE_MENU_BINDINGS,
  switchMockSession,
} from '@/foundation/mock/seeds'
import NotifyBatchSend from './NotifyBatchSend.vue'

const mockElMessageBox = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: (...args: unknown[]) => mockElMessageBox(...args) },
  }
})

const stubs = {
  StandardFormTemplate: {
    template: '<div><slot name="alert"/><slot/><slot name="actions"/></div>',
    props: ['title', 'subtitle'],
  },
  FormSection: { template: '<section><slot/></section>', props: ['title'] },
  'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
  'el-tabs': { template: '<div><slot/></div>', props: ['modelValue', 'type'] },
  'el-tab-pane': { template: '<div><slot/></div>', props: ['label', 'name'] },
  'el-input': {
    template: '<div/>',
    props: ['modelValue', 'placeholder', 'clearable', 'type', 'rows', 'maxlength'],
  },
  'el-select': { template: '<div/>', props: ['modelValue', 'placeholder', 'style'] },
  'el-option': { template: '<div/>' },
  'el-button': { template: '<button :disabled="disabled"><slot/></button>', props: ['disabled'] },
  'el-tag': { template: '<span><slot/></span>', props: ['closable'] },
  'el-checkbox-group': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-checkbox': { template: '<label><slot/></label>', props: ['label'] },
  'el-tree': { template: '<div/>', props: ['data', 'showCheckbox', 'nodeKey', 'props'] },
}

const selectedInput = {
  recipientUserIds: [1],
  recipientDeptIds: [1],
  recipientRoleCodes: ['user'],
}

describe('S4：批量发送页面真实 API/Mock 人数确认链', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'true')
    vi.clearAllMocks()
    MOCK_ROLE_MENU_BINDINGS['2'] = [
      1, 2, 3, 5, 11, 12, 13, 14, 15, 16, 17, 18, 43, 430, 110, 111, 112, 120, 121, 122, 170,
    ]
    switchMockSession('admin')
  })

  it('页面选择→resolve-count→确认框→batch-send→Mock新增数全链路为 3', async () => {
    const wrapper = mount(NotifyBatchSend, { global: { stubs } })
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      selectedUsers: Array<{ id: string; username: string; realName: string }>
      checkedDeptKeys: string[]
      checkedRoleCodes: string[]
      directTitle: string
      directContent: string
      contentMode: string
      serverCount: number
      refreshServerCount: () => Promise<void>
      handleSend: () => Promise<void>
    }
    vm.selectedUsers = [{ id: '1', username: 'admin', realName: '系统管理员' }]
    vm.checkedDeptKeys = ['1']
    vm.checkedRoleCodes = ['user']
    vm.directTitle = 'S4 页面确认'
    vm.directContent = 'S4 实际请求链'
    vm.contentMode = 'direct'

    const resolveCountResponse = await resolveCountNotify(selectedInput)
    await vm.refreshServerCount()
    await flushPromises()

    expect(resolveCountResponse.recipientCount).toBe(3)
    expect(vm.serverCount).toBe(resolveCountResponse.recipientCount)
    expect(wrapper.text()).toContain('服务端确认人数：3')

    let confirmDialogText = ''
    mockElMessageBox.mockImplementationOnce((text: unknown) => {
      confirmDialogText = String(text)
      return Promise.resolve()
    })
    const before = MOCK_NOTIFY_MESSAGES.length
    const batchSendSpy = vi.spyOn(notifyApi, 'batchSendNotify')

    await vm.handleSend()
    await flushPromises()

    const batchSendResult = await batchSendSpy.mock.results[0]?.value
    const persistedDelta = MOCK_NOTIFY_MESSAGES.length - before
    const evidence = {
      selectedInput,
      resolveCountResponse,
      renderedServerCount: vm.serverCount,
      confirmDialogText,
      batchSendResponse: batchSendResult,
      persistedDelta,
    }

    expect(confirmDialogText).toBe('确认向 3 人发送通知？')
    expect(confirmDialogText).toContain(String(resolveCountResponse.recipientCount))
    expect(batchSendResult?.recipientCount).toBe(3)
    expect(persistedDelta).toBe(3)
    console.log(JSON.stringify(evidence))

    batchSendSpy.mockRestore()
    wrapper.unmount()
  })
})
