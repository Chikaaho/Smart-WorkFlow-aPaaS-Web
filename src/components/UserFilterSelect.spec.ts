import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/modules/system/api/user', () => ({
  searchUserOptions: vi.fn(),
}))

import { searchUserOptions } from '@/modules/system/api/user'
import UserFilterSelect from './UserFilterSelect.vue'

interface SelectVm {
  options: Array<{ value: string | number; label: string }>
}

const stubs = {
  'el-select': {
    props: ['modelValue', 'remoteMethod', 'loading', 'placeholder'],
    emits: ['update:modelValue'],
    template: `<div class="stub-select">
      <button type="button" class="stub-select__search" @click="remoteMethod && remoteMethod('张')">search</button>
      <button type="button" class="stub-select__system" @click="$emit('update:modelValue', 0)">system</button>
      <slot />
    </div>`,
  },
  'el-option': true,
}

function mountSelect() {
  return mount(UserFilterSelect, {
    props: {
      fixedOptions: [{ value: 0, label: '系统（IoT）' }],
      placeholder: '全部',
    },
    global: { stubs },
  })
}

describe('UserFilterSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(searchUserOptions).mockResolvedValue([
      { id: '2113516346351312898', username: 'zhangsan', realName: '张三' },
    ])
  })

  it('固定「系统（IoT）」与远程用户结果同列，选中固定项上抛 0', async () => {
    const wrapper = mountSelect()
    await flushPromises()

    const vm = wrapper.vm as unknown as SelectVm
    expect(vm.options).toEqual([
      { value: 0, label: '系统（IoT）' },
      { value: '2113516346351312898', label: '张三（zhangsan）' },
    ])

    await wrapper.find('.stub-select__system').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]])
  })

  it('按姓名远程搜索调用用户搜索接口', async () => {
    const wrapper = mountSelect()
    await flushPromises()

    await wrapper.find('.stub-select__search').trigger('click')
    await flushPromises()

    expect(searchUserOptions).toHaveBeenCalledWith('张', 20)
  })
})
