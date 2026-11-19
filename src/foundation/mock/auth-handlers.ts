/**
 * 认证/会话 mock：登录挑战（P45 验证码+公钥+一次性消费）、双 token 登录、刷新、登出、SSO 绑定。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { switchMockSession } from './seeds'
import type { MockRegistration } from './mock-shared'

/** P45 mock 登录挑战状态：captchaId → 验证码内容（小写），登录成功/失败即消费。
 * 导出仅供 spec 读取答案（mock 内无像素 OCR 手段）；生产载荷不含答案字段。 */

// ─── Handler 实现 ─────────────────────────────────────────

export const MOCK_LOGIN_CHALLENGES = new Map<string, string>()

export /** P45 mock 挑战公钥（真实生成的 RSA-2048 SPKI，仅用于让前端 WebCrypto 加密走通；私钥不出现在任何仓库） */
const MOCK_LOGIN_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs9hDIIU8ZPofX5s+TiQY5xoAhtgve/oB/3gDXUpQuhQcuGeppEQwdO5BOL/WihYt6DO3GlLgl38KC2YepgDNztnjiz6hTcQg3Pdlx64Ju2pHJFGeFiWUfCOhA2duyoms/oU2DL2LMa5SPLgnzPUSobNeZCHyLCdIVF2eVBVnuNK6xK5aqtTtqgAtpLI+PjiHPky0qLlKo5RUqpyGGy47ko0og9lBLuczLAHzmVRc7NwtHnMIoH9CBs1XAdfhdznfqHZ46cM/obXYHhoRCGOIFoilgpj6vSJT6fbj6aknVfzJJnSbcq5ulSVQOEJr5/tmUNV831zQZ6xralHJXOxN2QIDAQAB'

export /** mock 验证码 SVG 载荷：答案仅存在于图像渲染语义中，响应不含独立答案字段 */
function renderMockCaptchaSvg(code: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'>` +
    `<rect width='100%' height='100%' fill='#f5f7fa'/>` +
    code
      .split('')
      .map(
        (ch, i) =>
          `<text x='${14 + i * 26}' y='27' font-family='monospace' font-size='22' font-weight='bold' fill='#5631b4' transform='rotate(${((i * 17) % 40) - 20} ${14 + i * 26} 27)'>${ch}</text>`,
      )
      .join('') +
    `</svg>`
  return 'data:image/svg+xml;base64,' + btoa(svg)
}

export const authMockRegistrations: MockRegistration[] = [
  // ── 登录挑战（P45：验证码图像 + 公钥 + 一次性消费，表达与真实后端相同的错误语义） ──
  // 挑战权威状态在 mock 中为模块级 Map（仅 mock 内存演示用）；验证码内容不匹配 → 2101；
  // 挑战已消费/未知 → 2101；timestamp 缺失/非法 → 2103；username='wrong' → 2104（演示密码错误分支）。
  {
    method: 'GET',
    pattern: '/api/auth/challenge',
    handler: () => {
      const captchaId =
        'mock-challenge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      const captcha = Math.random()
        .toString(36)
        .replace(/[0189]/g, '')
        .slice(0, 4)
        .padEnd(4, 'a')
      MOCK_LOGIN_CHALLENGES.set(captchaId, captcha.toLowerCase())
      return {
        code: 0,
        message: 'ok',
        data: {
          captchaImage: renderMockCaptchaSvg(captcha),
          captchaId,
          publicKey: MOCK_LOGIN_PUBLIC_KEY,
          keyVersion: 'mock-v1',
          expiresIn: 300,
          serverTime: Date.now(),
        },
      }
    },
  },
  // ── 登录/会话（双 token 契约 + P45 挑战语义，对齐 F1 的 TokenResponseDTO） ──
  // 登录按 username 切换当前会话：superadmin → 超管（旁路）、admin → 普通管理员（非超管，
  // 权限按角色绑定装配）、user → 普通用户（非超管，空绑定）；其他用户名回退超管。
  // mock 校验挑战语义（验证码/一次性消费/时间戳），不校验真实密码（密码='wrong' → 2104）。
  {
    method: 'POST',
    pattern: '/api/auth/login',
    handler: (_params, _query, body) => {
      const payload = body as
        | { username?: string; captcha?: string; captchaId?: string; timestamp?: string }
        | undefined
      // 1) 验证码记录与内容（UUID 缺失/未知挑战/内容不匹配 → 2101）
      const expectedCaptcha = payload?.captchaId
        ? MOCK_LOGIN_CHALLENGES.get(payload.captchaId)
        : undefined
      if (!payload?.captchaId || expectedCaptcha === undefined) {
        return { code: 2101, message: '验证码错误', data: null }
      }
      if ((payload.captcha ?? '').trim().toLowerCase() !== expectedCaptcha) {
        return { code: 2101, message: '验证码错误', data: null }
      }
      // 2) 一次性消费（删除成功才放行；重复/并发提交均 2101）
      MOCK_LOGIN_CHALLENGES.delete(payload.captchaId)
      // 3) 客户端机器时间（缺失/非法 → 2103）
      if (!payload.timestamp || Number.isNaN(Number(payload.timestamp))) {
        return { code: 2103, message: '机器时间异常', data: null }
      }
      // 4) 密码（mock 演示：username='wrong' → 2104；其余放行并按 username 切换会话）
      const username = payload.username ?? 'admin'
      if (username === 'wrong') {
        return { code: 2104, message: '密码错误', data: null }
      }
      switchMockSession(username)
      return {
        code: 0,
        message: 'ok',
        data: {
          accessToken: 'mock-access-token-' + username + '-' + Date.now(),
          expiresIn: 900,
        },
      }
    },
  },
  // ── Token 刷新（mock 模式：直接返回新 token，无需 cookie） ──
  {
    method: 'POST',
    pattern: '/api/auth/refresh',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: {
        accessToken: 'mock-refreshed-token-' + Date.now(),
        expiresIn: 900,
      },
    }),
  },
  // ── 登出（mock 模式：幂等，始终返回成功） ──
  {
    method: 'POST',
    pattern: '/api/auth/logout',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: null,
    }),
  },
  // ── I5 第三方 SSO（mock：绑定状态查询 / 绑定 / 解绑；授权发起与回调走真实 Provider，
  //    mock 只覆盖页面契约形状，不伪造 Provider 行为） ──
  {
    method: 'GET',
    pattern: '/api/auth/sso/bindings',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: { bindings: [] as Array<{ provider: string; externalDigestPrefix: string }> },
    }),
  },
  {
    method: 'POST',
    pattern: '/api/auth/sso/unbind',
    handler: () => ({ code: 0, message: 'ok', data: null }),
  },
]
