import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'

const getProcessDefDefinition = vi.fn()
const saveProcessDefGraph = vi.fn()
const push = vi.fn()

vi.mock('@/modules/workflow/api', () => ({
  getProcessDefDefinition: (...args: unknown[]) => getProcessDefDefinition(...args),
  saveProcessDefGraph: (...args: unknown[]) => saveProcessDefGraph(...args),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { defId: '1' } }),
  useRouter: () => ({ push }),
}))

import ProcessSettings from './ProcessSettings.vue'

const global = {
  directives: { loading: {} },
  stubs: {
    'el-icon': { template: '<i><slot /></i>' },
    'el-button': { template: '<button type="button"><slot /></button>' },
    'el-checkbox': {
      props: ['modelValue', 'label'],
      template:
        '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>',
    },
    'el-checkbox-group': {
      props: ['modelValue'],
      template: '<div><slot /></div>',
    },
    UserRemoteSelect: {
      name: 'UserRemoteSelect',
      props: ['modelValue'],
      template: '<div class="user-select-stub">{{ JSON.stringify(modelValue) }}</div>',
    },
  },
}

function graph(notification?: Record<string, unknown>) {
  return {
    processKey: 'p1',
    name: '流程一',
    formKey: 'f1',
    elements: [],
    triggers: [],
    notification,
  }
}

describe('ProcessSettings 结束通知配置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveProcessDefGraph.mockResolvedValue(undefined)
  })

  it('加载已有配置并保存回写 notification', async () => {
    getProcessDefDefinition.mockResolvedValue(
      graph({
        initiator: true,
        approvers: true,
        channels: ['IN_APP', 'EMAIL'],
        otherRecipientIds: [9001],
      }),
    )
    const wrapper = mount(ProcessSettings, { global })
    await flushPromises()

    expect(wrapper.text()).toContain('流程设置')
    expect(wrapper.find('.user-select-stub').text()).toContain('9001')

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存')
    expect(saveButton).toBeDefined()
    await saveButton!.trigger('click')
    await flushPromises()

    expect(saveProcessDefGraph).toHaveBeenCalledTimes(1)
    const payload = saveProcessDefGraph.mock.calls[0][1]
    expect(payload.notification).toEqual({
      initiator: true,
      approvers: true,
      channels: ['IN_APP', 'EMAIL'],
      otherRecipientIds: [9001],
    })
  })

  it('无接收对象时拒绝保存', async () => {
    getProcessDefDefinition.mockResolvedValue(graph())
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({}) as never)
    const wrapper = mount(ProcessSettings, { global })
    await flushPromises()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    // 默认发起人选中、审批人未选中；取消发起人后无任何接收对象
    await checkboxes[0].setValue(false)
    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存')
    await saveButton!.trigger('click')
    await flushPromises()
    expect(warning).toHaveBeenCalled()
    expect(saveProcessDefGraph).not.toHaveBeenCalled()
  })

  it('新增流程级监听并随保存写入 triggers', async () => {
    getProcessDefDefinition.mockResolvedValue(graph())
    const wrapper = mount(ProcessSettings, { global })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      openListenerEditor: () => void
      listenerDraft: {
        name: string
        event: 'PROCESS_START' | 'PROCESS_COMPLETED'
        enabled: boolean
        script: string
      }
      saveListenerDraft: () => void
      save: () => Promise<void>
    }

    vm.openListenerEditor()
    vm.listenerDraft.name = '测试监听'
    vm.listenerDraft.event = 'PROCESS_COMPLETED'
    vm.listenerDraft.script = 'return 1;'
    vm.saveListenerDraft()
    await vm.save()
    await flushPromises()

    const payload = saveProcessDefGraph.mock.calls[0][1] as {
      triggers: Array<Record<string, unknown>>
    }
    expect(payload.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '测试监听',
          event: 'PROCESS_COMPLETED',
          script: 'return 1;',
          enabled: true,
        }),
      ]),
    )
  })
})
