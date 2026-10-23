import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LoginPage from './LoginPage.vue'

const { login, fetchChallenge, push } = vi.hoisted(() => ({
  login: vi.fn(),
  fetchChallenge: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/foundation/auth', () => ({ useAuth: () => ({ login, fetchChallenge }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push }) }))

function render() {
  return mount(LoginPage, {
    global: { stubs: { LocaleSwitch: true, 'el-icon': { template: '<span><slot/></span>' } } },
  })
}

describe('登录页租户编码入口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchChallenge.mockResolvedValue({
      captchaId: 'local-fixture',
      captchaImage: '',
      publicKey: 'unused',
    })
    login.mockResolvedValue(undefined)
  })

  it('默认展示账号登录，展开后精确提交租户编码', async () => {
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('#login-tenant-code').exists()).toBe(false)
    const toggle = wrapper.find('[aria-controls="login-tenant-code"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await wrapper.find('#login-tenant-code input').setValue('tenant-w020')
    await wrapper.find('input[autocomplete="username"]').setValue('fixture-user')
    await wrapper.find('input[autocomplete="current-password"]').setValue('local-test-fixture')
    await wrapper.find('input[autocomplete="off"]').setValue('1234')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'fixture-user', tenantCode: 'tenant-w020' }),
    )
    expect(push).toHaveBeenCalledWith('/')
  })

  it('重试保持租户编码并清空密码，更新登录挑战', async () => {
    login.mockRejectedValueOnce(new Error('请检查账号所属租户编码'))
    const wrapper = render()
    await flushPromises()
    await wrapper.find('[aria-controls="login-tenant-code"]').trigger('click')
    await wrapper.find('#login-tenant-code input').setValue('tenant-w020')
    await wrapper.find('input[autocomplete="current-password"]').setValue('local-test-fixture')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#login-tenant-code input').element).toHaveProperty('value', 'tenant-w020')
    expect(wrapper.find('input[autocomplete="current-password"]').element).toHaveProperty(
      'value',
      '',
    )
    expect(fetchChallenge).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').text()).toContain('租户编码')
  })
  it('挑战加载失败后可重试，恢复后清除网络错误并启用登录', async () => {
    fetchChallenge.mockRejectedValueOnce(new Error('temporary network failure'))
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('.login-page__captcha--loading').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
