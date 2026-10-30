import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UserRemoteSelect from './UserRemoteSelect.vue'
import { searchUserOptions } from '@/modules/system/api/user'

vi.mock('@/modules/system/api/user', () => ({
  searchUserOptions: vi.fn(),
}))

const stubs = {
  'el-input': {
    props: ['modelValue', 'placeholder', 'readonly', 'disabled', 'clearable'],
    template: '<div class="stub-input">{{ modelValue }}<slot/><slot name="suffix"/></div>',
  },
  'el-dialog': {
    props: ['modelValue', 'title', 'width', 'appendToBody'],
    template: '<div v-if="modelValue" class="stub-dialog"><slot/><slot name="footer"/></div>',
  },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': true,
  'el-icon': { template: '<span><slot/></span>' },
  'el-button': { template: '<button><slot/></button>' },
}

type SelectorVm = {
  openDialog: () => void
  toggleRow: (row: { id: string; username: string; realName: string | null }) => void
  confirmPick: () => void
}

function mountSelector() {
  return mount(UserRemoteSelect, {
    props: { modelValue: [], multiple: true },
    global: { stubs, directives: { loading: () => undefined } },
  })
}

describe('UserRemoteSelect 64 位身份', () => {
  beforeEach(() => {
    vi.mocked(searchUserOptions).mockResolvedValue([
      { id: '2113516346351312898', username: 'w020_e2e_2', realName: 'W020 审批人2' },
    ])
  })

  it('选择后原样提交字符串 ID，不经过 Number 精度转换', async () => {
    const wrapper = mountSelector()
    const vm = wrapper.vm as unknown as SelectorVm
    vm.openDialog()
    await flushPromises()
    vm.toggleRow({
      id: '2113516346351312898',
      username: 'w020_e2e_2',
      realName: 'W020 审批人2',
    })
    vm.confirmPick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[['2113516346351312898']]])
    await wrapper.setProps({ modelValue: ['2113516346351312898'] })
    await flushPromises()
    expect(wrapper.text()).toContain('W020 审批人2（w020_e2e_2）')
  })
})
