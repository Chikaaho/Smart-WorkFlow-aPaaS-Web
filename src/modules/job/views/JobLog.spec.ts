import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock job API 层
vi.mock('@/modules/job/api', () => ({
  pageJobLogs: vi.fn(),
  getJobLog: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: { jobId: '1' } }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), ElMessage: { error: vi.fn() } }
})

import { pageJobLogs } from '@/modules/job/api'
import { ApiError } from '@/foundation/request'
import type { JobLog } from '@/contracts/job'
import JobLogComponent from './JobLog.vue'

// ─── 测试数据工厂 ───

function makeJobLog(overrides: Partial<JobLog> = {}): JobLog {
  return {
    id: 1,
    jobId: 1,
    jobName: '测试任务',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T10:00:00',
    endTime: '2026-07-21T10:00:05',
    duration: 5000,
    resultMsg: '执行成功',
    exceptionStack: undefined,
    createTime: '2026-07-21T10:00:05',
    ...overrides,
  }
}

// ─── 桩组件 ───

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div/>' },
  'el-button': { template: '<button :disabled="disabled"><slot/></button>', props: ['disabled'] },
  'el-tag': { template: '<span><slot/></span>', props: ['type', 'size'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title'],
  },
  'el-select': { template: '<select><slot/></select>', props: ['modelValue', 'placeholder'] },
  'el-option': { template: '<option/>' },
  'el-descriptions': { template: '<div><slot/></div>' },
  'el-descriptions-item': { template: '<div><slot/></div>', props: ['label', 'span'] },
}

// ═══════════════════════════════════════

describe('JobLog.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // T15: onMounted 调用 pageJobLogs

  it('calls pageJobLogs with jobId from route query on mount', async () => {
    const log = makeJobLog()
    vi.mocked(pageJobLogs).mockResolvedValueOnce({
      list: [log],
      total: 30,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobLogComponent, { global: { stubs } })
    await nextTick()

    expect(pageJobLogs).toHaveBeenCalledTimes(1)
    expect(pageJobLogs).toHaveBeenCalledWith(1, 1, 10)
    expect((wrapper.vm as unknown as { list: JobLog[] }).list).toHaveLength(1)
    expect((wrapper.vm as unknown as { total: number }).total).toBe(30)
  })

  // T16: 数据进入 list ref

  it('renders log data into list ref', async () => {
    const log = makeJobLog()
    vi.mocked(pageJobLogs).mockResolvedValueOnce({
      list: [log],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobLogComponent, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { list: JobLog[] }
    expect(vm.list[0].jobName).toBe('测试任务')
    expect(vm.list[0].execStatus).toBe('SUCCESS')
  })

  // T17: ApiError → errorMsg

  it('sets errorMsg when pageJobLogs fails with ApiError', async () => {
    vi.mocked(pageJobLogs).mockRejectedValueOnce(new ApiError(6002, '获取日志失败'))

    const wrapper = mount(JobLogComponent, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('获取日志失败')
  })

  // T18: 空列表

  it('isEmpty is true when list is empty', async () => {
    vi.mocked(pageJobLogs).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobLogComponent, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { isEmpty: boolean }).isEmpty).toBe(true)
  })

  // T20: 详情弹窗

  it('openDetail sets detailLog and detailVisible', async () => {
    const log = makeJobLog()
    vi.mocked(pageJobLogs).mockResolvedValueOnce({
      list: [log],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobLogComponent, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      openDetail: (r: JobLog) => void
      detailLog: JobLog | null
      detailVisible: boolean
    }
    expect(vm.detailVisible).toBe(false)
    vm.openDetail(log)
    expect(vm.detailVisible).toBe(true)
    expect(vm.detailLog).not.toBeNull()
    expect(vm.detailLog!.jobName).toBe('测试任务')
  })
})
