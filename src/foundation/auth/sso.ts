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

/** 登录前安全授权发起（免认证；V012-BUG-019：只提交租户名称，服务端精确解析唯一租户后签发 state） */
export async function startSsoLoginAuthorize(
  provider: SsoProvider,
  tenantName: string,
  redirect?: string,
): Promise<SsoAuthorizeDTO> {
  return request<SsoAuthorizeDTO>({
    method: 'GET',
    url: `/auth/sso/${provider}/authorize-login`,
    params: { tenantName, ...(redirect ? { redirect } : {}) },
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
