import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LoginPage from './LoginPage.vue'

const { login, fetchChallenge, push, startSsoLoginAuthorize } = vi.hoisted(() => ({
  login: vi.fn(),
  fetchChallenge: vi.fn(),
  push: vi.fn(),
  startSsoLoginAuthorize: vi.fn(),
}))
vi.mock('@/foundation/auth', () => ({ useAuth: () => ({ login, fetchChallenge }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push }) }))
vi.mock('@/foundation/auth/sso', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/foundation/auth/sso')>()),
  startSsoLoginAuthorize,
}))

function render() {
  return mount(LoginPage, {
    global: { stubs: { LocaleSwitch: true, 'el-icon': { template: '<span><slot/></span>' } } },
  })
}

describe('登录页企业名称与单点登录（B021-016）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchChallenge.mockResolvedValue({
      captchaId: 'local-fixture',
      captchaImage: '',
      publicKey: 'unused',
    })
    login.mockResolvedValue(undefined)
  })

  it('企业名称常驻显示在账号上方并随登录提交', async () => {
    const wrapper = render()
    await flushPromises()
    const org = wrapper.find('input[autocomplete="organization"]')
    const account = wrapper.find('input[autocomplete="username"]')
    // 常驻显示（无需像旧「租户编码」那样点击展开），且位于账号输入之前（视觉上方）
    expect(org.exists()).toBe(true)
    expect(
      org.element.compareDocumentPosition(account.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(wrapper.text()).not.toContain('租户编码')

    await org.setValue('演示企业')
    await account.setValue('fixture-user')
    await wrapper.find('input[autocomplete="current-password"]').setValue('local-test-fixture')
    await wrapper.find('input[autocomplete="off"]').setValue('1234')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'fixture-user', tenantName: '演示企业' }),
    )
    expect(push).toHaveBeenCalledWith('/')
  })

  it('企业名称留空时仍可登录（不提交该字段）', async () => {
    const wrapper = render()
    await flushPromises()
    await wrapper.find('input[autocomplete="username"]').setValue('fixture-user')
    await wrapper.find('input[autocomplete="current-password"]').setValue('local-test-fixture')
    await wrapper.find('input[autocomplete="off"]').setValue('1234')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'fixture-user', tenantName: undefined }),
    )
  })

  it('重试保持企业名称并清空密码，更新登录挑战', async () => {
    login.mockRejectedValueOnce(new Error('密码错误'))
    const wrapper = render()
    await flushPromises()
    await wrapper.find('input[autocomplete="organization"]').setValue('演示企业')
    await wrapper.find('input[autocomplete="current-password"]').setValue('local-test-fixture')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('input[autocomplete="organization"]').element).toHaveProperty(
      'value',
      '演示企业',
    )
    expect(wrapper.find('input[autocomplete="current-password"]').element).toHaveProperty(
      'value',
      '',
    )
    expect(fetchChallenge).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').text()).toContain('密码错误')
  })

  it('单点登录区不再有企业名称输入，点击 Provider 直接发起', async () => {
    startSsoLoginAuthorize.mockRejectedValueOnce(new Error('尚未有企业启用该登录方式'))
    const wrapper = render()
    await flushPromises()
    // 全页仅账号表单一个企业名称输入（旧 SSO 租户名称输入已移除）
    expect(wrapper.findAll('input[autocomplete="organization"]')).toHaveLength(1)
    const providers = wrapper.findAll('button.login-page__sso-provider')
    expect(providers).toHaveLength(3)
    await providers[0].trigger('click')
    await flushPromises()
    expect(startSsoLoginAuthorize).toHaveBeenCalledWith('WECOM', undefined, '/')
    expect(wrapper.find('.login-page__sso .login-page__error').text()).toContain(
      '尚未有企业启用该登录方式',
    )
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
