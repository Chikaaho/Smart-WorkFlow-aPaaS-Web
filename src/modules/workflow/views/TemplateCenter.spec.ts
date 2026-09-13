import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/modules/workflow/api/i4', () => ({
  pageTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  changeTemplateStatus: vi.fn(),
  copyTemplateToDefinition: vi.fn(),
  deleteTemplate: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import {
  pageTemplates,
  changeTemplateStatus,
  copyTemplateToDefinition,
  type BpmTemplate,
} from '@/modules/workflow/api/i4'
import type { PageResult } from '@/contracts/common'
import TemplateCenter from './TemplateCenter.vue'

const minimalStubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div><slot/></div>' },
  'el-button': { template: '<button><slot/></button>', props: ['disabled'] },
}

const template: BpmTemplate = {
  id: 1,
  name: '请假模板',
  category: '人事',
  formKey: 'leave_form',
  templateVersion: 2,
  status: 'ENABLED',
  scopeType: 'GLOBAL',
}

describe('TemplateCenter', () => {
  beforeEach(() => {
    vi.mocked(pageTemplates).mockResolvedValue({
      list: [template],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    } as PageResult<BpmTemplate>)
    vi.mocked(copyTemplateToDefinition).mockResolvedValue({ id: 99, processKey: 'copy_1' })
    vi.mocked(changeTemplateStatus).mockResolvedValue({ ...template, status: 'DISABLED' })
  })

  it('mounts and loads visible templates', async () => {
    const wrapper = mount(TemplateCenter, { global: { stubs: minimalStubs } })
    await Promise.resolve()
    expect(pageTemplates).toHaveBeenCalledTimes(1)
    expect(wrapper.exists()).toBe(true)
  })

  it('copies template to definition via controlled chain', async () => {
    const wrapper = mount(TemplateCenter, { global: { stubs: minimalStubs } })
    await Promise.resolve()
    const vm = wrapper.vm as unknown as { handleCopy: (row: BpmTemplate) => Promise<void> }
    await vm.handleCopy(template)
    expect(copyTemplateToDefinition).toHaveBeenCalledWith(1, '请假模板-副本')
  })

  it('toggles template status', async () => {
    const wrapper = mount(TemplateCenter, { global: { stubs: minimalStubs } })
    await Promise.resolve()
    const vm = wrapper.vm as unknown as {
      handleToggle: (row: BpmTemplate) => Promise<void>
    }
    await vm.handleToggle(template)
    expect(changeTemplateStatus).toHaveBeenCalledWith(1, false)
  })
})
