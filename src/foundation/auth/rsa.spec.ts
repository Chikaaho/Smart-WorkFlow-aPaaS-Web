import { describe, it, expect } from 'vitest'
import { encryptPassword } from './rsa'

/**
 * RSA-OAEP 加密契约（P45）。
 * Node 18+ 提供与浏览器一致的 webcrypto（crypto.subtle），可直接验证真实加密行为；
 * 解密侧用 Node crypto 私钥解密，证明密文符合 RSA-OAEP(SHA-256) 且不含明文。
 */
describe('rsa login encryption', () => {
  // 测试专用 RSA-2048 密钥对（每次生成，约几十毫秒）
  const generateKeyPair = async () =>
    crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    )

  const spkiBase64 = async (key: CryptoKey): Promise<string> => {
    const der = await crypto.subtle.exportKey('spki', key)
    let binary = ''
    const bytes = new Uint8Array(der)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  it('should produce ciphertext that decrypts to the original password (RSA-OAEP/SHA-256)', async () => {
    const pair = await generateKeyPair()
    const publicKeyBase64 = await spkiBase64(pair.publicKey)
    const password = 'admin123安全!'

    const ciphertext = await encryptPassword(publicKeyBase64, password)

    expect(ciphertext).not.toContain(password)
    // 用私钥解密（Node webcrypto 同样支持 RSA-OAEP/SHA-256 解密）
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      pair.privateKey,
      Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0)) as BufferSource,
    )
    expect(new TextDecoder().decode(decrypted)).toBe(password)
  })

  it('should produce different ciphertext for the same password (OAEP random seeding)', async () => {
    const pair = await generateKeyPair()
    const publicKeyBase64 = await spkiBase64(pair.publicKey)

    const c1 = await encryptPassword(publicKeyBase64, 'same-password')
    const c2 = await encryptPassword(publicKeyBase64, 'same-password')

    expect(c1).not.toBe(c2)
  })

  it('should encrypt UTF-8 multibyte characters without truncation', async () => {
    const pair = await generateKeyPair()
    const publicKeyBase64 = await spkiBase64(pair.publicKey)
    const password = '中文密码🔐'

    const ciphertext = await encryptPassword(publicKeyBase64, password)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      pair.privateKey,
      Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0)) as BufferSource,
    )

    expect(new TextDecoder().decode(decrypted)).toBe(password)
  })
})
