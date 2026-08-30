import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock job API 层
vi.mock('@/modules/job/api', () => ({
  pageJobInfos: vi.fn(),
  getJobInfo: vi.fn(),
  createJobInfo: vi.fn(),
  updateJobInfo: vi.fn(),
  deleteJobInfo: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  triggerJob: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import {
  pageJobInfos,
  createJobInfo,
  updateJobInfo,
  deleteJobInfo,
  pauseJob,
  resumeJob,
  triggerJob,
} from '@/modules/job/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { JobInfo } from '@/contracts/job'
import JobList from './JobList.vue'

// ─── 测试数据工厂 ───

function makeJobInfo(overrides: Partial<JobInfo> = {}): JobInfo {
  return {
    id: 1,
    jobName: '测试任务',
    jobGroup: 'DEFAULT',
    jobType: 'BEAN',
    cronExpression: '0/30 * * * * ?',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 0,
    description: '测试描述',
    beanName: 'testHandler',
    beanParams: undefined,
    flowDefKey: undefined,
    formData: undefined,
    lastFireTime: '2026-07-21T10:00:00',
    nextFireTime: '2026-07-21T10:00:30',
    createTime: '2026-07-20T00:00:00',
    updateTime: '2026-07-20T00:00:00',
    createBy: 1,
    updateBy: 1,
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
  'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
  'el-select': { template: '<select><slot/></select>', props: ['modelValue', 'placeholder'] },
  'el-option': { template: '<option/>' },
  'el-form': { template: '<div><slot/></div>', props: ['model'] },
  'el-form-item': { template: '<div><slot/></div>', props: ['label', 'required'] },
  'el-row': { template: '<div><slot/></div>' },
  'el-col': { template: '<div><slot/></div>' },
  'el-switch': { template: '<input type="checkbox"/>', props: ['modelValue'] },
}

// ═══════════════════════════════════════

describe('JobList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── onMounted 加载 ───

  it('calls pageJobInfos on mount', async () => {
    const job = makeJobInfo()
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 100,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    expect(pageJobInfos).toHaveBeenCalledTimes(1)
    expect(pageJobInfos).toHaveBeenCalledWith(1, 10, {})
    expect((wrapper.vm as unknown as { list: JobInfo[] }).list).toHaveLength(1)
    expect((wrapper.vm as unknown as { total: number }).total).toBe(100)
  })

  // ─── 列表数据 ───

  it('renders job data into list ref', async () => {
    const job = makeJobInfo()
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { list: JobInfo[] }
    expect(vm.list[0].jobName).toBe('测试任务')
    expect(vm.list[0].cronExpression).toBe('0/30 * * * * ?')
    expect(vm.list[0].status).toBe('NORMAL')
  })

  // ─── API 错误（ApiError）───

  it('sets errorMsg when pageJobInfos fails with ApiError', async () => {
    vi.mocked(pageJobInfos).mockRejectedValueOnce(new ApiError(6001, '获取任务列表失败'))

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('获取任务列表失败')
  })

  // ─── API 错误（非 ApiError fallback）───

  it('sets fallback errorMsg for non-ApiError', async () => {
    vi.mocked(pageJobInfos).mockRejectedValueOnce(new Error('Network error'))

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('加载任务列表失败')
  })

  // ─── 空态 ───

  it('isEmpty is true when list is empty', async () => {
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { isEmpty: boolean }).isEmpty).toBe(true)
  })

  // ─── 创建弹窗 ───

  it('openCreate sets dialogVisible and dialogTitle', async () => {
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      dialogVisible: boolean
      dialogTitle: string
      editingId: number | null
      openCreate: () => void
    }
    expect(vm.dialogVisible).toBe(false)
    vm.openCreate()
    expect(vm.dialogVisible).toBe(true)
    expect(vm.dialogTitle).toBe('新建任务')
    expect(vm.editingId).toBeNull()
  })

  // ─── 编辑弹窗 ───

  it('openEdit populates form from row data', async () => {
    const job = makeJobInfo({ id: 5, jobName: '编辑任务', status: 'PAUSED' })
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      openEdit: (r: JobInfo) => void
      editingId: number | null
      dialogTitle: string
      form: JobInfo
    }
    vm.openEdit(job)

    expect(vm.editingId).toBe(5)
    expect(vm.dialogTitle).toBe('编辑任务')
    expect(vm.form.jobName).toBe('编辑任务')
    expect(vm.form.status).toBe('PAUSED')
  })

  // ─── 保存创建成功 ───

  it('handleSave creates job and refreshes', async () => {
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(createJobInfo).mockResolvedValueOnce(42)

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleSave: () => Promise<void>
      dialogVisible: boolean
      form: JobInfo
    }
    vm.form.jobName = '新任务'
    vm.form.cronExpression = '0 0 * * * ?'
    await vm.handleSave()
    await nextTick()

    expect(createJobInfo).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('创建成功')
    expect(vm.dialogVisible).toBe(false)
    expect(pageJobInfos).toHaveBeenCalledTimes(2)
  })

  // ─── 保存更新成功 ───

  it('handleSave updates job and refreshes', async () => {
    const job = makeJobInfo({ id: 5, jobName: '旧名称' })
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(updateJobInfo).mockResolvedValueOnce(undefined)

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      handleSave: () => Promise<void>
      dialogVisible: boolean
      editingId: number | null
      form: JobInfo
    }
    vm.editingId = 5
    vm.form.jobName = '更新后的名称'
    vm.form.cronExpression = '0 0 * * * ?'
    await vm.handleSave()
    await nextTick()

    expect(updateJobInfo).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('更新成功')
    expect(vm.dialogVisible).toBe(false)
    expect(pageJobInfos).toHaveBeenCalledTimes(2)
  })

  // ─── 删除确认 → 成功 ───

  it('handleDelete confirm calls deleteJobInfo and refreshes', async () => {
    const job = makeJobInfo()
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(undefined as never)
    vi.mocked(deleteJobInfo).mockResolvedValueOnce(undefined)

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleDelete: (r: JobInfo) => Promise<void> }).handleDelete(
      job,
    )
    await nextTick()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(deleteJobInfo).toHaveBeenCalledWith(job.id!)
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功')
    expect(pageJobInfos).toHaveBeenCalledTimes(2)
  })

  // ─── 删除取消 ───

  it('handleDelete cancel does not call deleteJobInfo', async () => {
    const job = makeJobInfo()
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleDelete: (r: JobInfo) => Promise<void> }).handleDelete(
      job,
    )
    await nextTick()

    expect(deleteJobInfo).not.toHaveBeenCalled()
    expect(pageJobInfos).toHaveBeenCalledTimes(1)
  })

  // ─── 暂停成功 ───

  it('handlePause calls pauseJob and refreshes', async () => {
    const job = makeJobInfo()
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(pauseJob).mockResolvedValueOnce(undefined)

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handlePause: (r: JobInfo) => Promise<void> }).handlePause(job)
    await nextTick()

    expect(pauseJob).toHaveBeenCalledWith(job.id!)
    expect(ElMessage.success).toHaveBeenCalledWith('任务已暂停')
    expect(pageJobInfos).toHaveBeenCalledTimes(2)
  })

  // ─── 恢复成功 ───

  it('handleResume calls resumeJob and refreshes', async () => {
    const job = makeJobInfo({ status: 'PAUSED' })
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(resumeJob).mockResolvedValueOnce(undefined)

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleResume: (r: JobInfo) => Promise<void> }).handleResume(
      job,
    )
    await nextTick()

    expect(resumeJob).toHaveBeenCalledWith(job.id!)
    expect(ElMessage.success).toHaveBeenCalledWith('任务已恢复')
    expect(pageJobInfos).toHaveBeenCalledTimes(2)
  })

  // ─── 触发确认 → 成功 ───

  it('handleTrigger confirm calls triggerJob', async () => {
    const job = makeJobInfo()
    vi.mocked(pageJobInfos).mockResolvedValueOnce({
      list: [job],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(undefined as never)
    vi.mocked(triggerJob).mockResolvedValueOnce(undefined)

    const wrapper = mount(JobList, { global: { stubs } })
    await nextTick()

    await (wrapper.vm as unknown as { handleTrigger: (r: JobInfo) => Promise<void> }).handleTrigger(
      job,
    )
    await nextTick()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(triggerJob).toHaveBeenCalledWith(job.id!)
    expect(ElMessage.success).toHaveBeenCalledWith('触发成功，请查看执行日志')
  })
})
