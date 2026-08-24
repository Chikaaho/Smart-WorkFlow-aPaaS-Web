/**
 * dev-only 全 mock 调度器 —— 在 foundation/request 顶部短路 axios，使「无后端也能看页面」成为常驻开发能力。
 *
 * ## 注册机制
 *  handlers.ts 导出纯数据 mockRegistrations[]，由 index 在 registry 初始化后集中注册。
 *  这样做避免 handlers.ts 在模块顶层反向 import index 造成的循环依赖与 TDZ。
 *
 * ## 匹配规则
 *  - urlPattern 支持 :param 路径参数（如 /api/form/submit/by-key/:formKey/list）
 *  - 匹配基于 `${METHOD} ${resolvedPathname}`，resolvedPathname = config.baseURL + config.url
 *  - 未命中 handler ⇒ 原样 fallthrough 到真实 axios
 *
 * ## Tree-shake 安全
 *  本模块仅通过 foundation/request 中的动态 import() 载入，其调用位于双重门之后：
 *    import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true'
 *  prod 构建时 import.meta.env.DEV 恒为 false ⇒ 整个 if 块被 DCE ⇒ 本模块不出现在 dist 中。
 *
 * ## 延伸阅读
 *  若需新增 mock 端点 handler，打开同级 handlers.ts 按样板追加即可 —— modules/* 与各 service 层零改动。
 */

import type { ApiResponse } from '@/contracts/common'
import { mockRegistrations } from './handlers'

// ─── 类型 ───────────────────────────────────────────────

export type MockMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * mock handler 签名。
 * @param params  路径参数键值对（如 :formKey → "my-form"）
 * @param query   URL 查询参数
 * @param body    POST/PUT 请求体（原始对象，未序列化）
 * @returns ApiResponse<T> —— code=0 成功，code≠0 业务错误（经同一 ApiError 管线）
 */
export type MockHandler<T = unknown> = (
  params: Record<string, string>,
  query: Record<string, string>,
  body: unknown,
) => ApiResponse<T> | Promise<ApiResponse<T>>

// ─── 注册表 ────────────────────────────────────────────

type RegistryKey = `${MockMethod} ${string}`
const registry = new Map<RegistryKey, MockHandler>()

// 集中注册：由 index 单向收集 handler（handler 仅导出纯函数），
// 避免 handlers.ts 在模块顶层反向 import index 造成的 TDZ（循环依赖）。
for (const { method, pattern, handler } of mockRegistrations) {
  registry.set(`${method} ${pattern}`, handler)
}

/**
 * 注册一个 mock handler。激活时命中 ⇒ 返回假数据流经错误归一管线；
 * 未命中 ⇒ fallthrough 到真实 axios。
 *
 * @example
 * defineMock('GET', '/api/form/submit/by-key/:formKey/list', (params, query) => ({
 *   code: 0,
 *   message: 'ok',
 *   data: { records: [], total: 0, pageNum: 1, pageSize: 10 },
 * }))
 */
export function defineMock<T>(
  method: MockMethod,
  urlPattern: `/${string}`,
  handler: MockHandler<T>,
): void {
  registry.set(`${method} ${urlPattern}`, handler as MockHandler)
}

// ─── 调度 ───────────────────────────────────────────────

/**
 * foundation/request 调用本函数。匹配成功返回 ApiResponse，失败返回 undefined（走真实请求）。
 */
export async function dispatchMock<T>(
  method: string,
  url: string,
  baseURL: string,
  params: Record<string, string>,
  body: unknown,
): Promise<ApiResponse<T> | undefined> {
  const resolvedPath = resolvePath(baseURL, url)
  const match = tryMatch(method.toUpperCase(), resolvedPath)

  if (!match) return undefined

  // 将 params 值转为字符串（模拟真实 HTTP 查询参数行为）
  const stringParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    stringParams[k] = String(v)
  }

  return match.handler(match.params, stringParams, body) as ApiResponse<T> | Promise<ApiResponse<T>>
}

// ─── URL 匹配 ────────────────────────────────────────────

/** 拼接 baseURL + url，保证恰好一个 '/' 连接。 */
function resolvePath(baseURL: string, url: string): string {
  const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base}${path}`
}

/** 按 '/' 拆分为 tokens，跳过空段。 */
function tokenize(p: string): string[] {
  return p.split('/').filter(Boolean)
}

interface MatchResult {
  handler: MockHandler
  params: Record<string, string>
}

function tryMatch(method: string, pathname: string): MatchResult | null {
  const actualTokens = tokenize(pathname)

  for (const [key, handler] of registry) {
    const sepIdx = key.indexOf(' ')
    const keyMethod = key.substring(0, sepIdx)
    if (keyMethod !== method) continue

    const pattern = key.substring(sepIdx + 1)
    const expectedTokens = tokenize(pattern)

    if (actualTokens.length !== expectedTokens.length) continue

    const params: Record<string, string> = {}
    let match = true

    for (let i = 0; i < expectedTokens.length; i++) {
      const exp = expectedTokens[i]
      const act = actualTokens[i]
      if (exp.startsWith(':')) {
        params[exp.slice(1)] = decodeURIComponent(act)
      } else if (exp !== act) {
        match = false
        break
      }
    }

    if (match) {
      return { handler, params }
    }
  }

  return null
}
