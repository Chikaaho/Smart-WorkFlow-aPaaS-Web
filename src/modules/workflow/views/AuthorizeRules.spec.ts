import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/locales'
import { useUserStore } from '@/stores/user'
import AuthorizeRules from './AuthorizeRules.vue'

vi.mock('@/modules/workflow/api', () => ({
  createAuthorizeRule: vi.fn(),
  listAuthorizeRules: vi.fn(),
  pageProcessDefs: vi.fn(),
  revokeAuthorizeRule: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import {
  createAuthorizeRule,
  listAuthorizeRules,
  pageProcessDefs,
  revokeAuthorizeRule,
} from '@/modules/workflow/api'
import { ElMessageBox } from 'element-plus'

const stubs = {
  'el-card': { template: '<div><slot name="header"/><slot/></div>' },
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': { template: '<label><slot/></label>' },
  'el-alert': { props: ['title'], template: '<div class="alert">{{ title }}</div>' },
  'el-table': { props: ['data'], template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-button': { template: '<button><slot/></button>' },
  'el-select': { template: '<div><slot/></div>' },
  'el-option': { template: '<div/>' },
  'el-input': { template: '<input />' },
  'el-date-picker': { template: '<input />' },
  UserRemoteSelect: { template: '<input />' },
}

const existingRule = {
  id: '2100424929376403601',
  principalId: '1',
  agentId: '2',
  scopeType: 'PROCESS',
  processDefKey: 'leave_approval',
  startAt: '2026-10-24T09:00:00',
  endAt: '2026-11-24T18:00:00',
  status: 'ACTIVE',
}

function mountPage(permissions: string[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useUserStore(pinia).setSession({
    user: {
      id: '1',
      username: 'owner',
      displayName: '授权人',
      deptId: null,
      tenantId: null,
    },
    permissions: new Set(permissions),
    roles: new Set<string>(),
    superAdmin: false,
  })
  return mount(AuthorizeRules, { global: { plugins: [i18n, pinia], stubs } })
}

describe('AuthorizeRules.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAuthorizeRules).mockResolvedValue([existingRule])
    vi.mocked(pageProcessDefs).mockResolvedValue({
      list: [
        {
          id: 1,
          processKey: 'leave_approval',
          name: '请假审批',
          formKey: 'leave-request',
          defVersion: 1,
          status: 'PUBLISHED',
          createTime: '2026-10-01',
          updateTime: '2026-10-01',
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 200,
    })
  })

  it('creates a process-scoped rule with a string user id', async () => {
    vi.mocked(createAuthorizeRule).mockResolvedValueOnce('2100424929376403602')
    const wrapper = mountPage(['workflow:task:authorize'])
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      form: Record<string, string>
      submit: () => Promise<void>
    }
    vm.form.targetUserId = '2100424929376403458'
    vm.form.scopeType = 'PROCESS'
    vm.form.processDefKey = 'leave_approval'

    await vm.submit()

    expect(createAuthorizeRule).toHaveBeenCalledWith({
      targetUserId: '2100424929376403458',
      scopeType: 'PROCESS',
      processDefKey: 'leave_approval',
    })
    expect(listAuthorizeRules).toHaveBeenCalledTimes(2)
  })

  it('revokes by the exact 19-digit rule id', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    vi.mocked(revokeAuthorizeRule).mockResolvedValueOnce(undefined)
    const wrapper = mountPage(['workflow:def:design'])
    await flushPromises()

    await (
      wrapper.vm as unknown as { revoke: (rule: typeof existingRule) => Promise<void> }
    ).revoke(existingRule)

    expect(revokeAuthorizeRule).toHaveBeenCalledWith('2100424929376403601')
    expect(listAuthorizeRules).toHaveBeenCalledTimes(2)
  })

  it('does not load rules or show the form without an authorizing permission', async () => {
    const wrapper = mountPage([])
    await flushPromises()

    expect(listAuthorizeRules).not.toHaveBeenCalled()
    expect(pageProcessDefs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('当前账号没有授权代理规则的管理权限')
  })
})
