import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/modules/form/api/app-center', () => ({
  listFormApps: vi.fn(),
  createFormApp: vi.fn(),
  updateFormApp: vi.fn(),
  deleteFormApp: vi.fn(),
  disableFormApp: vi.fn(),
  enableFormApp: vi.fn(),
  getFormAppContent: vi.fn(),
  createFormAppDir: vi.fn(),
  updateFormAppDir: vi.fn(),
  deleteFormAppDir: vi.fn(),
  assignFormMembership: vi.fn(),
  listAppCenterApps: vi.fn(),
  getAppCenterContent: vi.fn(),
}))

vi.mock('@/modules/form/api/app-bundle', () => ({
  exportAppBundle: vi.fn(),
  previewBundleImport: vi.fn(),
  confirmBundleImport: vi.fn(),
  listBundleImportRecords: vi.fn(),
  downloadBundleImportReport: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

// F2：AppGrid 导出项改为 v-if 硬门控（v-perm 在 EP 弹层项上不生效），hasPerm 在渲染期读取
// permissions/superAdmin——mock 必须与真实 store 同形（恒有 Set，见 stores/user.ts 初始化）
const mockUserStore = {
  user: { id: '1', username: 'admin' },
  superAdmin: false,
  permissions: new Set(['form:app:manage', 'form:app:export', 'form:app:import']),
  roles: new Set<string>(),
}
vi.mock('@/stores/user', () => ({
  useUserStore: () => mockUserStore,
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { listFormApps } from '@/modules/form/api/app-center'
import {
  confirmBundleImport,
  exportAppBundle,
  previewBundleImport,
} from '@/modules/form/api/app-bundle'
import type { FormApp } from '@/contracts/app-center'
import type { FormBundlePreviewResult } from '@/contracts/app-bundle'
import AppManageList from './AppManageList.vue'

const minimalStubs = {
  LoadErrorState: { template: '<div/>', props: ['error'] },
  UserRemoteSelect: { template: '<div/>', props: ['modelValue', 'multiple'] },
  AppIcon: { template: '<i/>', props: ['icon', 'color', 'size'] },
  'el-button': {
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
    props: ['disabled'],
  },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div><slot :row="{}"/></div>' },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
  },
  'el-input-number': { template: '<input/>', props: ['modelValue'] },
  'el-radio-group': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-radio': { template: '<label><slot/></label>', props: ['value'] },
  'el-tag': { template: '<span><slot/></span>' },
}

function app(partial: Partial<FormApp>): FormApp {
  return {
    id: 'app-1',
    name: '报销应用',
    sortNo: 0,
    visibleScopeType: 'SPECIFIED',
    visibleUserIds: [],
    status: 'ENABLED',
    source: 'MANUAL',
    ...partial,
  }
}

describe('AppManageList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listFormApps).mockResolvedValue([])
  })

  it('挂载即加载应用列表（管理端含停用）', () => {
    mount(AppManageList, { global: { stubs: minimalStubs } })
    expect(listFormApps).toHaveBeenCalledTimes(1)
  })

  it('应用渲染为卡片，工具栏保留可达的新建应用入口', async () => {
    vi.mocked(listFormApps).mockResolvedValue([
      app({ id: 'a1', name: '全员' }),
      app({ id: 'a2', name: '指定' }),
    ])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    const cards = wrapper.findAll('[data-testid="app-card"]')
    expect(cards).toHaveLength(2)
    expect(wrapper.find('[data-testid="app-create"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('全员')
  })

  it('空列表仍可从工具栏新建应用', async () => {
    vi.mocked(listFormApps).mockResolvedValue([])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('[data-testid="app-card"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="app-create"]').exists()).toBe(true)
  })

  // ==================== 0.2.2 F2：整包导出/导入 ====================

  const previewFixture: FormBundlePreviewResult = {
    packageName: 'CRM',
    bundleFormatVersion: 1,
    systemVersion: '0.2.2',
    app: { name: 'CRM', visibleScopeType: 'SPECIFIED', nameConflict: false },
    dirs: [{ name: '客户' }],
    forms: [
      { formKey: 'lead_form', name: '线索', keyConflict: false },
      { formKey: 'opp_form', name: '商机', keyConflict: false },
    ],
    processes: [{ name: '线索流程', formKey: 'lead_form' }],
    opinionForms: [
      { formKey: 'op_form', name: '审批意见', conflict: true, suggestedKey: 'op_form_a1' },
    ],
    dictTypes: [{ code: 'dict_color', name: '颜色', action: 'OCCUPIED' }],
    externalRefs: [
      {
        kind: 'ROLE',
        value: 'manager',
        location: '流程 线索流程 · 节点 复核',
        matched: true,
        matchedTo: '经理',
      },
      { kind: 'FIXED_USER', value: '5', location: '流程 线索流程 · 节点 审批', matched: false },
    ],
    counts: {
      dirs: 1,
      forms: 2,
      processes: 1,
      opinionForms: 1,
      dictTypes: 1,
      txnActions: 1,
      extQueries: 1,
    },
  }

  function chooseBundleFile(wrapper: ReturnType<typeof mount>, name = 'crm_bundle.json') {
    const input = wrapper.find('[data-testid="bundle-import-file"]').element as HTMLInputElement
    const file = new File(['{}'], name, { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    return file
  }

  it('导出：卡片命令触发整包下载（blob → 对象 URL）', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    })
    vi.mocked(exportAppBundle).mockResolvedValue(new Blob(['{}'], { type: 'application/json' }))
    vi.mocked(listFormApps).mockResolvedValue([app({ id: 'a1', name: '全员' })])
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()
    wrapper
      .findComponent({ name: 'AppGrid' })
      .vm.$emit('command', 'export', app({ id: 'a1', name: '全员' }))
    await nextTick()
    await Promise.resolve()
    await nextTick()
    expect(exportAppBundle).toHaveBeenCalledWith('a1')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('导入：预检展示冲突与处置，确认后携新 key 调 confirm 并展示报告', async () => {
    vi.mocked(previewBundleImport).mockResolvedValue(previewFixture)
    vi.mocked(confirmBundleImport).mockResolvedValue({
      packageName: 'CRM',
      appId: 'new-app',
      finalAppName: 'CRM',
      createdDictTypes: [{ code: 'dict_cust_level', name: '客户等级', itemCount: 2 }],
      reusedDictTypes: [{ value: 'dict_lead_source', name: '线索来源' }],
      clearedRefs: [
        { kind: 'FIXED_USER', originalValue: '5', location: '流程 线索流程 · 节点 审批' },
      ],
    })
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="app-import"]').trigger('click')
    await nextTick()
    chooseBundleFile(wrapper)
    await nextTick()
    await wrapper.find('[data-testid="bundle-start-preview"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(previewBundleImport).toHaveBeenCalledTimes(1)
    const keyInput = wrapper.find('[data-testid="bundle-opinion-key"]')
    expect(keyInput.exists()).toBe(true)
    expect(wrapper.text()).toContain('dict_color')

    // 冲突 key 清空 → 确认不可用；恢复唯一 key → 确认可用
    ;(keyInput.element as HTMLInputElement).value = ''
    await keyInput.trigger('input')
    expect(wrapper.find('[data-testid="bundle-confirm"]').attributes('disabled')).toBeDefined()
    ;(keyInput.element as HTMLInputElement).value = 'op_form_new'
    await keyInput.trigger('input')
    expect(wrapper.find('[data-testid="bundle-confirm"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-testid="bundle-confirm"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(confirmBundleImport).toHaveBeenCalledTimes(1)
    const [fileArg, decisions] = vi.mocked(confirmBundleImport).mock.calls[0]
    expect(fileArg?.name).toBe('crm_bundle.json')
    expect(decisions).toEqual([{ formKey: 'op_form', newKey: 'op_form_new' }])
    expect(wrapper.text()).toContain('FIXED_USER')
    // F2-G4：报告按对象展示新建字典（编码/名称/项数）与复用字典
    expect(wrapper.text()).toContain('dict_cust_level')
    expect(wrapper.text()).toContain('客户等级')
    expect(wrapper.text()).toContain('2 项')
    expect(wrapper.text()).toContain('dict_lead_source')
    expect(wrapper.text()).toContain('线索来源')
  })

  // F2-G1：服务端 CONFLICT 拒绝映射到对应冲突项的行内提示，改唯一 key 后提示消失且恢复可确认
  it('导入：key 冲突拒绝在对应项下显示原因，改唯一 key 后可确认', async () => {
    vi.mocked(previewBundleImport).mockResolvedValue(previewFixture)
    vi.mocked(confirmBundleImport).mockRejectedValue({
      code: 1902,
      errorKey: 'form.bundle_opinion_key_conflict',
      message: '审批意见表单新标识“op_form_x”在目标租户已存在，请修改后重试',
    })
    const wrapper = mount(AppManageList, { global: { stubs: minimalStubs } })
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="app-import"]').trigger('click')
    await nextTick()
    chooseBundleFile(wrapper)
    await nextTick()
    await wrapper.find('[data-testid="bundle-start-preview"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    // 改成当前租户已存在的 key → 确认 → 服务端拒绝映射为对应项行内提示，确认不可用
    const keyInput = wrapper.find('[data-testid="bundle-opinion-key"]')
    ;(keyInput.element as HTMLInputElement).value = 'op_form_x'
    await keyInput.trigger('input')
    await wrapper.find('[data-testid="bundle-confirm"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(confirmBundleImport).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="bundle-opinion-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('该 key 在当前租户已存在')
    expect(wrapper.find('[data-testid="bundle-confirm"]').attributes('disabled')).toBeDefined()

    // 改成唯一 key → 提示消失，确认恢复可用
    ;(keyInput.element as HTMLInputElement).value = 'op_form_ok'
    await keyInput.trigger('input')
    await nextTick()
    expect(wrapper.find('[data-testid="bundle-opinion-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bundle-confirm"]').attributes('disabled')).toBeUndefined()
  })
})
