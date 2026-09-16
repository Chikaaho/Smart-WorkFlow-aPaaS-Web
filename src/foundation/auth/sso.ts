import { i18n } from '@/locales'
import { request } from '@/foundation/request'
import { setTokenResponse } from './token'

// ========== DTO（后端形状，不提升为 contract） ==========

interface TokenResponseDTO {
  accessToken: string
  expiresIn: number
}

interface SsoAuthorizeDTO {
  authorizeUrl: string
  state: string
}

interface SsoCallbackDTO {
  redirect: string
}

export interface SsoBindingItem {
  provider: string
  externalDigestPrefix: string
}

interface SsoBindingsDTO {
  bindings: SsoBindingItem[]
}

// ========== 类型 ==========

export type SsoProvider = 'WECOM' | 'FEISHU' | 'DINGTALK'

export const SSO_PROVIDERS: ReadonlyArray<{ key: SsoProvider; label: string }> = [
  { key: 'WECOM', label: i18n.global.t('foundation.ssoWecom') },
  { key: 'FEISHU', label: i18n.global.t('foundation.ssoFeishu') },
  { key: 'DINGTALK', label: i18n.global.t('foundation.ssoDingtalk') },
]

// ========== API ==========

/** 登录前安全授权发起（免认证；显式租户，服务端校验租户与 Provider 启用后签发 state） */
export async function startSsoLoginAuthorize(
  provider: SsoProvider,
  tenantId: number,
  redirect?: string,
): Promise<SsoAuthorizeDTO> {
  return request<SsoAuthorizeDTO>({
    method: 'GET',
    url: `/auth/sso/${provider}/authorize-login`,
    params: { tenant: tenantId, ...(redirect ? { redirect } : {}) },
  })
}

/** 服务端授权发起（需认证场景：个人中心绑定入口） */
export async function startSsoAuthorize(
  provider: SsoProvider,
  redirect?: string,
): Promise<SsoAuthorizeDTO> {
  return request<SsoAuthorizeDTO>({
    method: 'GET',
    url: `/auth/sso/${provider}/authorize`,
    params: redirect ? { redirect } : undefined,
  })
}

/**
 * 服务端回调换票（免认证）：后端校验一次性 state 并定位绑定，
 * 返回受控同源回跳地址（含一次性 ticket，不含 code/state）。
 */
export async function completeSsoCallback(
  provider: SsoProvider,
  code: string,
  state: string,
): Promise<SsoCallbackDTO> {
  return request<SsoCallbackDTO>({
    method: 'GET',
    url: `/auth/sso/${provider}/callback`,
    params: { code, state },
  })
}

/** 一次性票据兑换会话（与第一方登录同一 TokenResponse 契约；refresh 走 httpOnly cookie） */
export async function exchangeSsoTicket(ticket: string): Promise<TokenResponseDTO> {
  const data = await request<TokenResponseDTO>({
    method: 'POST',
    url: '/auth/sso/ticket',
    data: { ticket },
  })
  setTokenResponse(data.accessToken, data.expiresIn)
  return data
}

/** 当前用户绑定状态（个人中心）。 */
export async function fetchSsoBindings(): Promise<SsoBindingsDTO> {
  return request<SsoBindingsDTO>({ method: 'GET', url: '/auth/sso/bindings' })
}

/** 解绑。 */
export async function unbindSso(provider: SsoProvider): Promise<void> {
  await request<null>({ method: 'POST', url: '/auth/sso/unbind', data: { provider } })
}
