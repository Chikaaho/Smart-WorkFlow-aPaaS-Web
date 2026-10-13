/**
 * BF20261013-021：表单/流程脚本 `#函数名(...)` 语法糖编译器（与 Server 侧 ScriptSugar.java 同语义）。
 *
 * 业务写法 `var v = #获取字段值(field_a)` 编译为普通 JS 调用 `获取字段值("field_a")`：
 * - `#` 只作标记，编译时剔除——JS 标识符本身允许中文，宿主函数名不变；
 * - 参数为**裸标识符**时按“名字字符串”处理（自动加引号）；已带引号的字符串、数字、
 *   表达式原样透传（`#获取字段值("" + name)` 可表达动态名）；
 * - 参数里的嵌套 `#调用` 递归编译；字符串/注释/模板字符串内的 `#` 不动；
 *   模板字符串 `${...}` 内按代码处理；
 * - `true/false/null/undefined` 是字面量，不加引号。
 *
 * 语法错误（`#` 后缺函数名/缺括号/括号不闭合）抛出带定位说明的 Error。
 * 无 `#` 的脚本原样返回（不触发糖校验）。
 */

const KEYWORD_LITERALS = new Set(['true', 'false', 'null', 'undefined'])

export function transpileScriptSugar(script: string): string {
  if (!script || !script.includes('#')) {
    return script
  }
  const out: string[] = []
  const end = scanCode(script, 0, out, null)
  if (end !== script.length) {
    throw new Error(`语法糖解析异常：存在未闭合的结构（位置 ${end}）`)
  }
  return out.join('')
}

/** 代码区扫描：原样搬移普通字符，处理字符串/注释/模板字符串，遇到 `#` 调用做替换。 */
function scanCode(src: string, start: number, out: string[], stopAt: string | null): number {
  let i = start
  let braceDepth = 0
  while (i < src.length) {
    const c = src[i]
    if (stopAt !== null && c === stopAt) {
      if (braceDepth === 0) {
        return i
      }
      braceDepth--
      out.push(c)
      i++
      continue
    }
    if (stopAt !== null && c === '{') {
      braceDepth++
      out.push(c)
      i++
      continue
    }
    if (c === "'" || c === '"') {
      i = copyQuoted(src, i, c, out)
      continue
    }
    if (c === '`') {
      i = copyTemplate(src, i, out)
      continue
    }
    if (c === '/' && i + 1 < src.length) {
      const next = src[i + 1]
      if (next === '/') {
        const lineEnd = src.indexOf('\n', i)
        const stop = lineEnd < 0 ? src.length : lineEnd
        out.push(src.slice(i, stop))
        i = stop
        continue
      }
      if (next === '*') {
        const close = src.indexOf('*/', i + 2)
        if (close < 0) {
          throw new Error(`脚本注释未闭合（位置 ${i}）`)
        }
        out.push(src.slice(i, close + 2))
        i = close + 2
        continue
      }
    }
    if (c === '#') {
      i = translateCall(src, i, out)
      continue
    }
    out.push(c)
    i++
  }
  if (stopAt !== null) {
    throw new Error(`模板字符串插值未闭合（缺失 '${stopAt}'）`)
  }
  return i
}

function copyQuoted(src: string, start: number, quote: string, out: string[]): number {
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === quote) {
      out.push(src.slice(start, i + 1))
      return i + 1
    }
    if (c === '\n') {
      break
    }
    i++
  }
  throw new Error(`字符串字面量未闭合（位置 ${start}）`)
}

function copyTemplate(src: string, start: number, out: string[]): number {
  out.push('`')
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      out.push(src.slice(i, Math.min(i + 2, src.length)))
      i += 2
      continue
    }
    if (c === '`') {
      out.push('`')
      return i + 1
    }
    if (c === '$' && i + 1 < src.length && src[i + 1] === '{') {
      out.push('${')
      const close = scanCode(src, i + 2, out, '}')
      out.push('}')
      i = close + 1
      continue
    }
    out.push(c)
    i++
  }
  throw new Error(`模板字符串未闭合（位置 ${start}）`)
}

function translateCall(src: string, hashIndex: number, out: string[]): number {
  let i = hashIndex + 1
  const nameStart = i
  while (i < src.length && isIdentifierPart(src[i])) {
    i++
  }
  if (i === nameStart || !isIdentifierStart(src[nameStart])) {
    throw new Error(`语法糖 # 后应为函数名（位置 ${hashIndex}）`)
  }
  const name = src.slice(nameStart, i)
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) {
    i++
  }
  if (i >= src.length || src[i] !== '(') {
    throw new Error(`语法糖 #${name} 缺少参数括号（位置 ${hashIndex}）`)
  }
  const close = findMatchingParen(src, i)
  const argsSrc = src.slice(i + 1, close)
  const args = splitTopLevel(argsSrc)
  out.push(`${name}(`)
  args.forEach((raw, index) => {
    if (index > 0) {
      out.push(',')
    }
    const arg = raw.trim()
    const compiled = transpileScriptSugar(arg)
    if (isBareName(compiled) && !KEYWORD_LITERALS.has(compiled)) {
      out.push(`"${compiled}"`)
    } else {
      out.push(compiled)
    }
  })
  out.push(')')
  return close + 1
}

function findMatchingParen(src: string, open: number): number {
  let depth = 0
  let i = open
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"') {
      i = skipQuoted(src, i, c)
      continue
    }
    if (c === '`') {
      i = skipTemplate(src, i)
      continue
    }
    if (c === '/' && i + 1 < src.length) {
      const next = src[i + 1]
      if (next === '/') {
        const lineEnd = src.indexOf('\n', i)
        i = lineEnd < 0 ? src.length : lineEnd
        continue
      }
      if (next === '*') {
        const close = src.indexOf('*/', i + 2)
        if (close < 0) {
          throw new Error(`脚本注释未闭合（位置 ${i}）`)
        }
        i = close + 2
        continue
      }
    }
    if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) {
        return i
      }
    }
    i++
  }
  throw new Error(`语法糖函数调用括号未闭合（位置 ${open}）`)
}

function skipQuoted(src: string, start: number, quote: string): number {
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === quote) {
      return i + 1
    }
    if (c === '\n') {
      break
    }
    i++
  }
  throw new Error(`字符串字面量未闭合（位置 ${start}）`)
}

function skipTemplate(src: string, start: number): number {
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`') {
      return i + 1
    }
    if (c === '$' && i + 1 < src.length && src[i + 1] === '{') {
      let depth = 1
      i += 2
      while (i < src.length && depth > 0) {
        const inner = src[i]
        if (inner === "'" || inner === '"') {
          i = skipQuoted(src, i, inner)
          continue
        }
        if (inner === '{') {
          depth++
        } else if (inner === '}') {
          depth--
        }
        i++
      }
      continue
    }
    i++
  }
  throw new Error(`模板字符串未闭合（位置 ${start}）`)
}

/** 顶层逗号切分（括号/方括号/花括号/字符串/注释内的逗号不切）。 */
export function splitTopLevel(src: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"') {
      const next = skipQuoted(src, i, c)
      current += src.slice(i, next)
      i = next
      continue
    }
    if (c === '`') {
      const next = skipTemplate(src, i)
      current += src.slice(i, next)
      i = next
      continue
    }
    if (c === '/' && i + 1 < src.length && (src[i + 1] === '/' || src[i + 1] === '*')) {
      if (src[i + 1] === '/') {
        const lineEnd = src.indexOf('\n', i)
        const stop = lineEnd < 0 ? src.length : lineEnd
        current += src.slice(i, stop)
        i = stop
        continue
      }
      const close = src.indexOf('*/', i + 2)
      if (close < 0) {
        throw new Error(`脚本注释未闭合（位置 ${i}）`)
      }
      current += src.slice(i, close + 2)
      i = close + 2
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth++
    } else if (c === ')' || c === ']' || c === '}') {
      depth--
    } else if (c === ',' && depth === 0) {
      parts.push(current)
      current = ''
      i++
      continue
    }
    current += c
    i++
  }
  parts.push(current)
  if (parts.length === 1 && parts[0].trim() === '') {
    return []
  }
  return parts
}

function isBareName(text: string): boolean {
  if (text.length === 0 || !isIdentifierStart(text[0])) {
    return false
  }
  for (let i = 1; i < text.length; i++) {
    if (!isIdentifierPart(text[i])) {
      return false
    }
  }
  return true
}

function isIdentifierStart(c: string): boolean {
  return c === '_' || c === '$' || /\p{L}/u.test(c)
}

function isIdentifierPart(c: string): boolean {
  return c === '_' || c === '$' || /[\p{L}\p{Nd}]/u.test(c)
}
