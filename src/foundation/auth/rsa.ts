/**
 * 登录密码 RSA-OAEP 加密（P45）。
 *
 * 使用 WebCrypto 原生能力，与服务端 Java 侧对齐：
 * - 算法：RSA-OAEP，摘要 SHA-256，MGF1 也是 SHA-256（WebCrypto 默认即此，服务端须显式对齐）；
 * - 公钥格式：Base64 编码的 X.509 SubjectPublicKeyInfo（SPKI），由登录挑战接口下发；
 * - 密码以 UTF-8 编码后加密，不截断；超长由 WebCrypto/服务端拒绝，绝不降级明文。
 *
 * 仅使用 WebCrypto 标准接口（crypto.subtle），非安全上下文（http 且非 localhost）
 * 下 crypto.subtle 不可用 —— 生产 HTTPS 部署满足该前提。
 */

export interface LoginChallengeDTO {
  /** 验证码图像载荷（SVG data URL，浏览器 <img> 渲染；不含独立答案字段或可读答案元数据） */
  captchaImage: string
  /** 验证码 UUID（服务端挑战唯一标识） */
  captchaId: string
  /** Base64 SPKI 公钥 */
  publicKey: string
  /** 密钥版本标识 */
  keyVersion: string
  /** 挑战有效期（秒） */
  expiresIn: number
  /** 服务器时间（Unix epoch 毫秒） */
  serverTime: number
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** 使用挑战下发的公钥加密 UTF-8 密码，返回 Base64 密文 */
export async function encryptPassword(publicKeyBase64: string, password: string): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    'spki',
    base64ToBytes(publicKeyBase64) as BufferSource,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    new TextEncoder().encode(password) as BufferSource,
  )
  return bytesToBase64(new Uint8Array(ciphertext))
}
