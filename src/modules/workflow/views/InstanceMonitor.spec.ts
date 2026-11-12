import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

vi.mock('@/modules/workflow/api/i4', () => ({
  pageMonitorInstances: vi.fn(),
  interveneInstance: vi.fn(),
  queryInterventions: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { pageMonitorInstances, queryInterventions } from '@/modules/workflow/api/i4'
import type { MonitorInstance } from '@/modules/workflow/api/i4'
import InstanceMonitor from './InstanceMonitor.vue'

interface FilterVm {
  filters: () => { initiatorId?: number | string }
  openHistory: (row: MonitorInstance) => Promise<void>
}

/** 用户筛选器桩：上抛选中值，并暴露页面传入的 fixedOptions 供断言 */
const UserFilterSelectStub = defineComponent({
  name: 'UserFilterSelect',
  props: {
    modelValue: { type: [String, Number], default: undefined },
    fixedOptions: { type: Array, default: () => [] },
    placeholder: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  template: `<div class="stub-user-select">
    <button type="button" class="stub-user-select__system" @click="$emit('update:modelValue', 0)">system</button>
  </div>`,
})

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['total', 'pageNum', 'pageSize', 'empty'],
  },
  ListFilterItem: { template: '<div class="filter-item"><slot/></div>', props: ['label'] },
  ListActionsColumn: { template: '<div/>', props: ['actions', 'label', 'width'] },
  UserFilterSelect: UserFilterSelectStub,
  'el-select': { template: '<div/>', props: ['modelValue'] },
  'el-option': true,
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': {
    props: ['label', 'prop', 'width', 'minWidth'],
    template: '<div class="stub-col" :data-label="label"><slot :$index="0" /></div>',
  },
  'el-tag': { template: '<span><slot/></span>' },
  'el-dialog': {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" class="stub-dialog"><slot/><slot name="footer"/></div>',
  },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': { template: '<div/>' },
  'el-button': { template: '<button><slot/></button>' },
  'el-date-picker': { template: '<div/>' },
  'el-input-number': { template: '<div/>' },
}

function monitorRow(instanceOverrides: Partial<MonitorInstance['instance']> = {}): MonitorInstance {
  return {
    instance: {
      id: 1,
      processInstanceId: 'pi-001',
      processDefKey: 'leave_approval',
      initiatorId: 0,
      status: 'RUNNING',
      businessKey: 'bk-001',
      formKey: 'leave_form',
      createTime: '2026-07-17T10:00:00.123456',
      updateTime: '2026-07-17T10:00:00',
      ...instanceOverrides,
    },
    activeNodeIds: ['node_a'],
    suspended: false,
  }
}

async function mountPage(): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(InstanceMonitor, { global: { stubs } })
  await flushPromises()
  return wrapper
}

describe('InstanceMonitor 发起人筛选（G4-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageMonitorInstances).mockResolvedValue({
      list: [monitorRow()],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(queryInterventions).mockResolvedValue([])
  })

  it('固定「系统（IoT）」选项对应 initiatorId=0，选中后 filters 仍传 0', async () => {
    const wrapper = await mountPage()
    const select = wrapper.findComponent(UserFilterSelectStub)
    expect(select.props('fixedOptions')).toContainEqual({ value: 0, label: '系统（IoT）' })

    await select.find('.stub-user-select__system').trigger('click')
    await nextTick()

    const vm = wrapper.vm as unknown as FilterVm
    expect(vm.filters().initiatorId).toBe(0)
  })

  it('普通用户选中后以原始字符串 ID 提交，不经 Number 丢精度', async () => {
    const wrapper = await mountPage()
    const select = wrapper.findComponent(UserFilterSelectStub)

    select.vm.$emit('update:modelValue', '2113516346351312898')
    await nextTick()

    const vm = wrapper.vm as unknown as FilterVm
    expect(vm.filters().initiatorId).toBe('2113516346351312898')
  })
})

describe('InstanceMonitor 实例展示（G4-3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pageMonitorInstances).mockResolvedValue({
      list: [monitorRow()],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(queryInterventions).mockResolvedValue([])
  })

  it('列表状态显示中文，发起时间精确到秒且不带微秒', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()

    expect(text).toContain('运行中')
    expect(text).not.toContain('RUNNING')
    expect(text).toContain('2026-07-17 10:00:00')
    expect(text).not.toContain('123456')
  })

  it('流程定义优先显示 processDefName', async () => {
    vi.mocked(pageMonitorInstances).mockResolvedValueOnce({
      list: [monitorRow({ processDefName: '请假审批' })],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('请假审批')
  })

  it('旧数据无 processDefName 时回退显示 processDefKey', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('leave_approval')
  })

  it('干预历史前后状态显示中文，干预时间精确到秒', async () => {
    vi.mocked(queryInterventions).mockResolvedValueOnce([
      {
        id: 9,
        processInstanceId: 'pi-001',
        action: 'SUSPEND',
        operatorId: 2,
        beforeState: 'RUNNING',
        afterState: 'SUSPENDED',
        intervenedAt: '2026-07-17T11:02:03.987654',
      },
    ])
    const wrapper = await mountPage()
    const vm = wrapper.vm as unknown as FilterVm

    await vm.openHistory(monitorRow())
    await flushPromises()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('运行中')
    expect(text).toContain('已挂起')
    expect(text).not.toContain('SUSPENDED')
    expect(text).toContain('2026-07-17 11:02:03')
    expect(text).not.toContain('987654')
  })
})
