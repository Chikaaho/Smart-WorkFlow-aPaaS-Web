import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/modules/notify/api', () => ({
  pageNotifyTemplates: vi.fn(),
  getNotifyTemplate: vi.fn(),
  createNotifyTemplate: vi.fn(),
  updateNotifyTemplate: vi.fn(),
  deleteNotifyTemplate: vi.fn(),
  toggleNotifyTemplate: vi.fn(),
  previewTemplate: vi.fn(),
}))

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: confirmMock },
  }
})

import {
  pageNotifyTemplates,
  deleteNotifyTemplate,
  toggleNotifyTemplate,
} from '@/modules/notify/api'
import type { NotifyTemplate } from '@/contracts/notify'
import { useUserStore } from '@/stores/user'
import { ApiError } from '@/foundation/request'
import NotifyTemplateList from './NotifyTemplateList.vue'

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  NotifyTemplateFormDialog: {
    template: '<div class="template-dialog-stub"/>',
    props: ['visible', 'templateId'],
    emits: ['update:visible', 'saved'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>', props: ['prop', 'label'] },
  'el-tag': { template: '<span class="el-tag"><slot/></span>', props: ['type', 'size'] },
  'el-button': {
    template:
      '<button class="el-button" :data-type="type" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue" class="preview-dialog"><slot/></div>',
    props: ['modelValue'],
  },
}

export const mockTemplates: NotifyTemplate[] = [
  {
    id: 1,
    templateCode: 'WF_TODO_NOTICE',
    name: '待办提醒模板',
    titleTemplate: '${userName} 的待办提醒',
    contentTemplate: '您好 ${userName}，您有一条新的待办「${taskName}」。',
    enabled: true,
    remark: null,
  },
  {
    id: 2,
    templateCode: 'DISABLED_SAMPLE',
    name: '停用示例',
    titleTemplate: '示例 ${n}',
    contentTemplate: '编号 ${n}',
    enabled: false,
    remark: null,
  },
]

function stubPage(templates: NotifyTemplate[] = mockTemplates) {
  vi.mocked(pageNotifyTemplates).mockResolvedValue({
    list: templates,
    total: templates.length,
    pageNum: 1,
    pageSize: 10,
  })
}

function mountList(options?: { superAdmin?: boolean; permissions?: string[] }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useUserStore()
  store.superAdmin = options?.superAdmin ?? true
  for (const p of options?.permissions ?? []) store.permissions.add(p)
  return mount(NotifyTemplateList, { global: { plugins: [pinia], stubs } })
}

describe('NotifyTemplateList.vue（P36 消息模板管理）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('挂载时加载模板列表并渲染行数', async () => {
    stubPage()
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))
    expect(pageNotifyTemplates).toHaveBeenCalledWith(
      { pageNum: 1, pageSize: 10 },
      undefined,
      undefined,
    )
    expect(wrapper.vm.list).toHaveLength(2)
  })

  it('管理权限可见时展示新增按钮；无权限隐藏', async () => {
    stubPage()
    const adminWrapper = mountList({ superAdmin: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(adminWrapper.text()).toContain('新增模板')

    stubPage()
    // 非 superAdmin 且无 notify:template:manage → canManage=false
    const plainWrapper = mountList({ superAdmin: false, permissions: ['notify:template:view'] })
    await new Promise((r) => setTimeout(r, 0))
    expect(plainWrapper.text()).not.toContain('新增模板')
  })

  it('启停切换：确认后调用 toggle 并刷新列表', async () => {
    stubPage()
    confirmMock.mockResolvedValue({})
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))

    await (
      wrapper.vm as unknown as { handleToggle: (row: NotifyTemplate) => Promise<void> }
    ).handleToggle(mockTemplates[0])
    expect(confirmMock).toHaveBeenCalled()
    expect(toggleNotifyTemplate).toHaveBeenCalledWith(1, false)
    expect(pageNotifyTemplates).toHaveBeenCalledTimes(2)
  })

  it('删除：确认后调用 delete 并刷新列表', async () => {
    stubPage()
    confirmMock.mockResolvedValue({})
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))

    await (
      wrapper.vm as unknown as { handleDelete: (row: NotifyTemplate) => Promise<void> }
    ).handleDelete(mockTemplates[1])
    expect(deleteNotifyTemplate).toHaveBeenCalledWith(2)
    expect(pageNotifyTemplates).toHaveBeenCalledTimes(2)
  })

  it('用户取消确认弹窗时不发起启停/删除请求', async () => {
    stubPage()
    confirmMock.mockRejectedValue('cancel')
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))
    const vm = wrapper.vm as unknown as {
      handleToggle: (row: NotifyTemplate) => Promise<void>
      handleDelete: (row: NotifyTemplate) => Promise<void>
    }

    await vm.handleToggle(mockTemplates[0])
    await vm.handleDelete(mockTemplates[0])
    expect(toggleNotifyTemplate).not.toHaveBeenCalled()
    expect(deleteNotifyTemplate).not.toHaveBeenCalled()
  })

  it('加载失败：ApiError 消息进入错误态，重置后可重新加载', async () => {
    vi.mocked(pageNotifyTemplates).mockRejectedValueOnce(new ApiError(500, '服务器错误'))
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))
    const vm = wrapper.vm as unknown as { errorMsg: string; list: unknown[] }
    expect(vm.errorMsg).toBe('服务器错误')

    stubPage()
    await (wrapper.vm as unknown as { handleReset: () => void }).handleReset()
    await new Promise((r) => setTimeout(r, 0))
    expect(vm.list).toHaveLength(2)
  })

  it('查询与重置：keyword 进入查询参数', async () => {
    stubPage()
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))

    const vm = wrapper.vm as unknown as { filter: { keyword: string }; handleQuery: () => void }
    vm.filter.keyword = 'WF_TODO'
    vm.handleQuery()
    await new Promise((r) => setTimeout(r, 0))
    expect(pageNotifyTemplates).toHaveBeenLastCalledWith(
      { pageNum: 1, pageSize: 10 },
      'WF_TODO',
      undefined,
    )
  })

  it('预览弹窗：openPreview 后调用 previewTemplate 渲染（前端不做替换）', async () => {
    stubPage()
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))
    const { previewTemplate } = await import('@/modules/notify/api')
    vi.mocked(previewTemplate).mockResolvedValue({ title: '张三 的待办提醒', content: '内容' })

    const vm = wrapper.vm as unknown as {
      openPreview: (row: NotifyTemplate) => void
      runPreview: () => Promise<void>
      previewResult: { title: string } | null
    }
    vm.openPreview(mockTemplates[0])
    await vm.runPreview()
    expect(previewTemplate).toHaveBeenCalledWith({
      titleTemplate: mockTemplates[0].titleTemplate,
      contentTemplate: mockTemplates[0].contentTemplate,
      variables: {},
    })
    expect(vm.previewResult?.title).toBe('张三 的待办提醒')
  })

  it('预览失败：后端缺变量错误进入 previewError', async () => {
    stubPage()
    const wrapper = mountList()
    await new Promise((r) => setTimeout(r, 0))
    const { previewTemplate } = await import('@/modules/notify/api')
    vi.mocked(previewTemplate).mockRejectedValue(new ApiError(400, '缺少变量: userName'))

    const vm = wrapper.vm as unknown as {
      openPreview: (row: NotifyTemplate) => void
      runPreview: () => Promise<void>
      previewError: string
    }
    vm.openPreview(mockTemplates[0])
    await vm.runPreview()
    expect(vm.previewError).toBe('缺少变量: userName')
  })
})
