import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const workspace = process.cwd()
const systemDirectory = resolve(workspace, 'src/modules/system')
const tokenFile = resolve(workspace, 'src/styles/tokens.css')

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

function definitions(source: string): Set<string> {
  return new Set([...source.matchAll(/(--sw-[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string))
}

function references(source: string): string[] {
  return [...source.matchAll(/var\((--sw-[a-z0-9-]+)/g)].map((match) => match[1] as string)
}

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  })
}

const globalTokens = definitions(withoutComments(readFileSync(tokenFile, 'utf8')))
const moduleFiles = vueFiles(systemDirectory).sort()

describe('系统管理设计 token 消费', () => {
  it('引用的 --sw-* token 均已定义，允许同文件内局部定义', () => {
    const missing: string[] = []
    for (const file of moduleFiles) {
      const source = withoutComments(readFileSync(file, 'utf8'))
      const localTokens = definitions(source)
      for (const token of new Set(references(source))) {
        if (!globalTokens.has(token) && !localTokens.has(token)) {
          missing.push(`${relative(systemDirectory, file)}: ${token}`)
        }
      }
    }

    expect(missing, missing.join('\n')).toEqual([])
  })

  it('不引用旧主色阶 token 或旧品牌色硬编码', () => {
    const legacyToken = /var\(--sw-primary(?:-5)?\b/
    const legacyHex = /#(?:7e306b|652656|a56e97|bf98b5|d8c1d3|e5d6e1|f2eaf0)\b/i
    const violations: string[] = []

    for (const file of moduleFiles) {
      const source = withoutComments(readFileSync(file, 'utf8'))
      if (legacyToken.test(source) || legacyHex.test(source)) {
        violations.push(relative(systemDirectory, file))
      }
    }

    expect(violations, violations.join('\n')).toEqual([])
  })
})
