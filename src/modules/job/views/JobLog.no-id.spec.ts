import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock job API 层
vi.mock('@/modules/job/api', () => ({
  pageJobLogs: vi.fn(),
  getJobLog: vi.fn(),
}))

// No jobId in route query — tests the noJobId fallback path
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

import { pageJobLogs } from '@/modules/job/api'
import JobLogComponent from './JobLog.vue'

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
}

describe('JobLog.vue — no jobId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows info alert when no jobId in query', async () => {
    const wrapper = mount(JobLogComponent, { global: { stubs } })
    await nextTick()

    expect((wrapper.vm as unknown as { noJobId: boolean }).noJobId).toBe(true)
    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('缺少任务 ID 参数')
    // pageJobLogs should not be called when no jobId
    expect(pageJobLogs).not.toHaveBeenCalled()
  })
})
