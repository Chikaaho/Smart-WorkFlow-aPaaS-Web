import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@/foundation/auth', () => ({
  changePassword: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), ElMessage: { success: vi.fn() } }
})

import { changePassword, logout } from '@/foundation/auth'
import ChangePasswordDialog from './ChangePasswordDialog.vue'

const stubs = {
  DetailDialog: {
    template: '<div><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width', 'error', 'appearance'],
    emits: ['update:modelValue'],
  },
  'el-form': { template: '<form><slot/></form>', props: ['labelPosition'] },
  'el-form-item': { template: '<label><slot/></label>', props: ['label', 'required'] },
  'el-input': {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'autocomplete', 'showPassword'],
    emits: ['update:modelValue'],
  },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
}

describe('ChangePasswordDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('提交当前密码与一致的新密码后清理登录态并通知宿主', async () => {
    vi.mocked(changePassword).mockResolvedValue()
    vi.mocked(logout).mockResolvedValue()
    const wrapper = mount(ChangePasswordDialog, {
      props: { modelValue: true },
      global: { stubs },
    })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('old-password')
    await inputs[1]!.setValue('new-password')
    await inputs[2]!.setValue('new-password')
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await flushPromises()

    expect(changePassword).toHaveBeenCalledWith({
      oldPassword: 'old-password',
      newPassword: 'new-password',
    })
    expect(logout).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('新密码不足八位时不请求后端', async () => {
    const wrapper = mount(ChangePasswordDialog, {
      props: { modelValue: true },
      global: { stubs },
    })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('old-password')
    await inputs[1]!.setValue('short')
    await inputs[2]!.setValue('short')
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await flushPromises()

    expect(changePassword).not.toHaveBeenCalled()
  })
})
