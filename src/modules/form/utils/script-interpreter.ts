/**
 * BF20261013-021：表单字段脚本解释器（CSP 安全：不依赖 eval / new Function）。
 *
 * 应用 CSP 维持 `script-src 'self'`（禁 unsafe-eval，高价值防线不动），因此字段脚本
 * 不能经字符串编译执行。本模块实现业务脚本所需的 JS 子集解析与解释执行：
 *
 * 语句：var/let/const 声明、if/else、return（提前结束）、表达式语句；
 * 表达式：数字/字符串/布尔/null/undefined 字面量、数组字面量、标识符、括号、
 *         一元（! - +）、算术（+ - * / %）、比较（== != === !== < > <= >=）、
 *         逻辑（&& ||）、三元（?:）、函数调用（宿主函数）。
 *
 * 不支持：对象字面量、成员访问/下标、循环、自定义函数、赋值表达式（除声明外）、
 *         正则、模板字符串（先经语法糖编译仍不支持，模板串会被解析为普通字符串）。
 * 语义与 JS 对应子集一致：`+` 字符串拼接/数值相加、JS 真值规则、`==` 抽象相等近似。
 * 执行有步数预算（默认 2000 步），超限报错，天然有界。
 */

/* ── 错误 ── */

export class ScriptSyntaxError extends Error {}
export class ScriptRuntimeError extends Error {}

/* ── 词法 ── */

type TokenType = 'number' | 'string' | 'identifier' | 'punctuation' | 'keyword' | 'eof'

interface Token {
  type: TokenType
  value: string
  pos: number
}

const KEYWORDS = new Set([
  'var',
  'let',
  'const',
  'if',
  'else',
  'return',
  'true',
  'false',
  'null',
  'undefined',
])
const PUNCTUATIONS = [
  '===',
  '!==',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  ',',
  ';',
  '?',
  ':',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '=',
]

function isIdentStart(ch: string): boolean {
  return ch === '_' || ch === '$' || /\p{L}/u.test(ch)
}
function isIdentPart(ch: string): boolean {
  return ch === '_' || ch === '$' || /[\p{L}\p{Nd}]/u.test(ch)
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    // 注释
    if (ch === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i)
      i = end < 0 ? src.length : end
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end < 0) {
        throw new ScriptSyntaxError(`注释未闭合（位置 ${i}）`)
      }
      i = end + 2
      continue
    }
    // 字符串
    if (ch === '"' || ch === "'") {
      const quote = ch
      let out = ''
      let j = i + 1
      let closed = false
      while (j < src.length) {
        const c = src[j]
        if (c === '\\') {
          const next = src[j + 1]
          const map: Record<string, string> = {
            n: '\n',
            t: '\t',
            r: '\r',
            '\\': '\\',
            "'": "'",
            '"': '"',
            '`': '`',
          }
          out += next === undefined ? '' : (map[next] ?? next)
          j += 2
          continue
        }
        if (c === quote) {
          closed = true
          j++
          break
        }
        out += c
        j++
      }
      if (!closed) {
        throw new ScriptSyntaxError(`字符串未闭合（位置 ${i}）`)
      }
      tokens.push({ type: 'string', value: out, pos: i })
      i = j
      continue
    }
    // 数字
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const raw = src.slice(i, j)
      if (!/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) {
        throw new ScriptSyntaxError(`数字字面量非法：${raw}（位置 ${i}）`)
      }
      tokens.push({ type: 'number', value: raw, pos: i })
      i = j
      continue
    }
    // 标识符 / 关键字
    if (isIdentStart(ch)) {
      let j = i
      while (j < src.length && isIdentPart(src[j])) j++
      const raw = src.slice(i, j)
      tokens.push({ type: KEYWORDS.has(raw) ? 'keyword' : 'identifier', value: raw, pos: i })
      i = j
      continue
    }
    // 标点
    const punctu = PUNCTUATIONS.find((p) => src.startsWith(p, i))
    if (punctu) {
      tokens.push({ type: 'punctuation', value: punctu, pos: i })
      i += punctu.length
      continue
    }
    throw new ScriptSyntaxError(`无法识别的字符「${ch}」（位置 ${i}）`)
  }
  tokens.push({ type: 'eof', value: '', pos: src.length })
  return tokens
}

/* ── 语法树 ── */

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'ident'; name: string }
  | { kind: 'array'; items: Expr[] }
  | { kind: 'unary'; op: string; operand: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'logical'; op: '&&' | '||'; left: Expr; right: Expr }
  | { kind: 'ternary'; cond: Expr; then: Expr; else: Expr }
  | { kind: 'call'; name: string; args: Expr[] }

type Stmt =
  | { kind: 'var'; name: string; init: Expr }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] | null }
  | { kind: 'return'; value: Expr | null }
  | { kind: 'expr'; expr: Expr }

export interface ScriptProgram {
  body: Stmt[]
}

/* ── 解析 ── */

class Parser {
  private pos = 0
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private next(): Token {
    return this.tokens[this.pos++]
  }

  private error(message: string): never {
    // 位置取当前 token；已到末尾时用 EOF token（永远存在）的 pos
    const token = this.tokens[Math.min(this.pos, this.tokens.length - 1)]
    throw new ScriptSyntaxError(`${message}（位置 ${token.pos}）`)
  }

  private expectPunct(value: string): void {
    const token = this.peek()
    if (token.type === 'punctuation' && token.value === value) {
      this.pos++
      return
    }
    this.error(`缺少「${value}」`)
  }

  parseProgram(): ScriptProgram {
    const body = this.parseStatements(null)
    const token = this.peek()
    if (token.type !== 'eof') {
      this.error(`存在多余内容「${token.value}」`)
    }
    return { body }
  }

  /** 解析语句序列；until 非空时遇到该标点（不消费）结束。 */
  private parseStatements(until: string | null): Stmt[] {
    const list: Stmt[] = []
    while (true) {
      const token = this.peek()
      if (token.type === 'eof') {
        if (until) this.error(`语句块缺少「${until}」`)
        return list
      }
      if (until && token.type === 'punctuation' && token.value === until) {
        return list
      }
      list.push(this.parseStatement())
    }
  }

  private parseStatement(): Stmt {
    const token = this.peek()
    if (token.type === 'keyword') {
      if (token.value === 'var' || token.value === 'let' || token.value === 'const') {
        this.pos++
        const name = this.next()
        if (name.type !== 'identifier') this.error('声明缺少变量名')
        this.expectPunct('=')
        const init = this.parseExpr()
        this.consumeSemicolon()
        return { kind: 'var', name: name.value, init }
      }
      if (token.value === 'if') {
        this.pos++
        this.expectPunct('(')
        const cond = this.parseExpr()
        this.expectPunct(')')
        const then = this.parseBlock()
        let elseBody: Stmt[] | null = null
        const after = this.peek()
        if (after.type === 'keyword' && after.value === 'else') {
          this.pos++
          const elseToken = this.peek()
          if (elseToken.type === 'keyword' && elseToken.value === 'if') {
            elseBody = [this.parseStatement()]
          } else {
            elseBody = this.parseBlock()
          }
        }
        return { kind: 'if', cond, then, else: elseBody }
      }
      if (token.value === 'return') {
        this.pos++
        const after = this.peek()
        let value: Expr | null = null
        const isExpressionStart =
          after.type === 'identifier' ||
          after.type === 'number' ||
          after.type === 'string' ||
          (after.type === 'keyword' &&
            ['true', 'false', 'null', 'undefined'].includes(after.value)) ||
          (after.type === 'punctuation' && ['(', '[', '!', '-', '+'].includes(after.value))
        if (isExpressionStart) {
          value = this.parseExpr()
        }
        this.consumeSemicolon()
        return { kind: 'return', value }
      }
    }
    const expr = this.parseExpr()
    this.consumeSemicolon()
    return { kind: 'expr', expr }
  }

  private parseBlock(): Stmt[] {
    this.expectPunct('{')
    const body = this.parseStatements('}')
    this.expectPunct('}')
    return body
  }

  private consumeSemicolon(): void {
    const token = this.peek()
    if (token.type === 'punctuation' && token.value === ';') {
      this.pos++
    }
  }

  parseExpr(): Expr {
    return this.parseTernary()
  }

  private parseTernary(): Expr {
    const cond = this.parseLogicalOr()
    const token = this.peek()
    if (token.type === 'punctuation' && token.value === '?') {
      this.pos++
      const then = this.parseTernary()
      this.expectPunct(':')
      const elseExpr = this.parseTernary()
      return { kind: 'ternary', cond, then, else: elseExpr }
    }
    return cond
  }

  private parseLogicalOr(): Expr {
    let left = this.parseLogicalAnd()
    while (this.isPunct('||')) {
      this.pos++
      const right = this.parseLogicalAnd()
      left = { kind: 'logical', op: '||', left, right }
    }
    return left
  }

  private parseLogicalAnd(): Expr {
    let left = this.parseEquality()
    while (this.isPunct('&&')) {
      this.pos++
      const right = this.parseEquality()
      left = { kind: 'logical', op: '&&', left, right }
    }
    return left
  }

  private parseEquality(): Expr {
    let left = this.parseRelational()
    while (this.isPunct('==') || this.isPunct('!=') || this.isPunct('===') || this.isPunct('!==')) {
      const op = this.next().value
      const right = this.parseRelational()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseRelational(): Expr {
    let left = this.parseAdditive()
    while (this.isPunct('<') || this.isPunct('>') || this.isPunct('<=') || this.isPunct('>=')) {
      const op = this.next().value
      const right = this.parseAdditive()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative()
    while (this.isPunct('+') || this.isPunct('-')) {
      const op = this.next().value
      const right = this.parseMultiplicative()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary()
    while (this.isPunct('*') || this.isPunct('/') || this.isPunct('%')) {
      const op = this.next().value
      const right = this.parseUnary()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseUnary(): Expr {
    if (this.isPunct('!') || this.isPunct('-') || this.isPunct('+')) {
      const op = this.next().value
      const operand = this.parseUnary()
      return { kind: 'unary', op, operand }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    const token = this.next()
    if (token.type === 'number') {
      return { kind: 'num', value: Number(token.value) }
    }
    if (token.type === 'string') {
      return { kind: 'str', value: token.value }
    }
    if (token.type === 'keyword') {
      if (token.value === 'true') return { kind: 'bool', value: true }
      if (token.value === 'false') return { kind: 'bool', value: false }
      if (token.value === 'null') return { kind: 'null' }
      if (token.value === 'undefined') return { kind: 'undefined' }
      this.error(`此处不能使用关键字「${token.value}」`)
    }
    if (token.type === 'identifier') {
      if (this.isPunct('(')) {
        this.pos++
        const args: Expr[] = []
        if (!this.isPunct(')')) {
          args.push(this.parseExpr())
          while (this.isPunct(',')) {
            this.pos++
            args.push(this.parseExpr())
          }
        }
        this.expectPunct(')')
        return { kind: 'call', name: token.value, args }
      }
      return { kind: 'ident', name: token.value }
    }
    if (token.type === 'punctuation' && token.value === '(') {
      const expr = this.parseExpr()
      this.expectPunct(')')
      return expr
    }
    if (token.type === 'punctuation' && token.value === '[') {
      const items: Expr[] = []
      if (!this.isPunct(']')) {
        items.push(this.parseExpr())
        while (this.isPunct(',')) {
          this.pos++
          if (this.isPunct(']')) break
          items.push(this.parseExpr())
        }
      }
      this.expectPunct(']')
      return { kind: 'array', items }
    }
    this.error(`无法解析的内容「${token.value || '（空）'}」`)
  }

  private isPunct(value: string): boolean {
    const token = this.peek()
    return token.type === 'punctuation' && token.value === value
  }
}

/** 解析脚本（先做 # 语法糖编译的产物）。语法错误抛 {@link ScriptSyntaxError}。 */
export function parseScript(code: string): ScriptProgram {
  return new Parser(tokenize(code)).parseProgram()
}

/** 仅做语法校验：返回 null = 通过；否则为可读错误信息。 */
export function checkScriptSyntax(code: string): string | null {
  try {
    parseScript(code)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/* ── 解释执行 ── */

const RETURN_SIGNAL = Symbol('script-return')

interface Scope {
  vars: Map<string, unknown>
  parent: Scope | null
}

export interface RunOptions {
  /** 宿主函数表（名称 → 实现）。 */
  hostFunctions: Record<string, (...args: unknown[]) => unknown>
  /** 变量初值（如暂无）。 */
  initialVariables?: Record<string, unknown>
  /** 步数预算（默认 2000）。 */
  budget?: number
}

export function runScript(program: ScriptProgram, options: RunOptions): unknown {
  const budget = options.budget ?? 2000
  let steps = 0
  const budgetCheck = () => {
    steps++
    if (steps > budget) {
      throw new ScriptRuntimeError(`脚本执行步数超出上限 ${budget}（请简化脚本）`)
    }
  }

  const rootScope: Scope = {
    vars: new Map(Object.entries(options.initialVariables ?? {})),
    parent: null,
  }

  function lookup(scope: Scope, name: string): { found: boolean; value: unknown } {
    let current: Scope | null = scope
    while (current) {
      if (current.vars.has(name)) {
        return { found: true, value: current.vars.get(name) }
      }
      current = current.parent
    }
    return { found: false, value: undefined }
  }

  const isTruthy = (value: unknown): boolean => {
    if (value === null || value === undefined) return false
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0 && !Number.isNaN(value)
    if (typeof value === 'string') return value !== ''
    return true
  }

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value === null) return 0
    if (value === undefined) return Number.NaN
    // 与 JS 一致：'' 与纯空白 → 0；非数字文本 → NaN
    return Number(value)
  }

  const looseEquals = (a: unknown, b: unknown): boolean => {
    if (a === null || a === undefined || b === null || b === undefined) {
      return (a === null || a === undefined) && (b === null || b === undefined)
    }
    if (typeof a === typeof b) return a === b
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return toNumber(a) === toNumber(b)
    }
    if (typeof a === 'number' && typeof b === 'string') return a === toNumber(b)
    if (typeof a === 'string' && typeof b === 'number') return toNumber(a) === b
    return String(a) === String(b)
  }

  const strictEquals = (a: unknown, b: unknown): boolean => {
    if (typeof a !== typeof b) return false
    if (typeof a === 'number' && typeof b === 'number') {
      return !Number.isNaN(a) && !Number.isNaN(b) && a === b
    }
    return a === b
  }

  /** 解释器内置函数（业务脚本常用三件套；不含任何宿主能力）。 */
  const builtinFunctions: Record<string, (...args: unknown[]) => unknown> = {
    String: (value) => stringify(value),
    Number: (value) => toNumber(value),
    Boolean: (value) => isTruthy(value),
  }
  const builtinFunction = (name: string) => builtinFunctions[name]

  function evalExpr(expr: Expr, scope: Scope): unknown {
    budgetCheck()
    switch (expr.kind) {
      case 'num':
        return expr.value
      case 'str':
        return expr.value
      case 'bool':
        return expr.value
      case 'null':
        return null
      case 'undefined':
        return undefined
      case 'ident': {
        const found = lookup(scope, expr.name)
        if (found.found) return found.value
        if (expr.name in options.hostFunctions) {
          return options.hostFunctions[expr.name]
        }
        if (expr.name in builtinFunctions) {
          return undefined
        }
        throw new ScriptRuntimeError(`变量未定义：${expr.name}`)
      }
      case 'array':
        return expr.items.map((item) => evalExpr(item, scope))
      case 'unary': {
        const value = evalExpr(expr.operand, scope)
        if (expr.op === '!') return !isTruthy(value)
        if (expr.op === '-') return -toNumber(value)
        return +toNumber(value)
      }
      case 'binary': {
        const left = evalExpr(expr.left, scope)
        const right = evalExpr(expr.right, scope)
        switch (expr.op) {
          case '+':
            if (typeof left === 'string' || typeof right === 'string') {
              return stringify(left) + stringify(right)
            }
            return toNumber(left) + toNumber(right)
          case '-':
            return toNumber(left) - toNumber(right)
          case '*':
            return toNumber(left) * toNumber(right)
          case '/':
            return toNumber(left) / toNumber(right)
          case '%':
            return toNumber(left) % toNumber(right)
          case '==':
            return looseEquals(left, right)
          case '!=':
            return !looseEquals(left, right)
          case '===':
            return strictEquals(left, right)
          case '!==':
            return !strictEquals(left, right)
          case '<':
            return compare(left, right) < 0
          case '>':
            return compare(left, right) > 0
          case '<=':
            return compare(left, right) <= 0
          case '>=':
            return compare(left, right) >= 0
          default:
            throw new ScriptRuntimeError(`不支持的运算符：${expr.op}`)
        }
      }
      case 'logical': {
        const left = evalExpr(expr.left, scope)
        if (expr.op === '&&') {
          return isTruthy(left) ? evalExpr(expr.right, scope) : left
        }
        return isTruthy(left) ? left : evalExpr(expr.right, scope)
      }
      case 'ternary':
        return isTruthy(evalExpr(expr.cond, scope))
          ? evalExpr(expr.then, scope)
          : evalExpr(expr.else, scope)
      case 'call': {
        const fn = options.hostFunctions[expr.name] ?? builtinFunction(expr.name)
        if (typeof fn !== 'function') {
          throw new ScriptRuntimeError(`函数不存在：${expr.name}`)
        }
        const args = expr.args.map((arg) => evalExpr(arg, scope))
        return fn(...args)
      }
      default:
        throw new ScriptRuntimeError('不支持的表达式')
    }
  }

  function compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' || typeof b === 'number') {
      const na = toNumber(a)
      const nb = toNumber(b)
      if (Number.isNaN(na) || Number.isNaN(nb)) return Number.NaN
      return na < nb ? -1 : na > nb ? 1 : 0
    }
    const sa = stringify(a)
    const sb = stringify(b)
    return sa < sb ? -1 : sa > sb ? 1 : 0
  }

  function stringify(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (Array.isArray(value)) return value.map((v) => stringify(v)).join(',')
    return String(value)
  }

  function execStatements(statements: Stmt[], scope: Scope): void {
    for (const statement of statements) {
      execStatement(statement, scope)
    }
  }

  function execStatement(statement: Stmt, scope: Scope): void {
    budgetCheck()
    switch (statement.kind) {
      case 'var': {
        // 声明提升：同名同作用域重复声明覆盖（与业务直觉一致）
        scope.vars.set(statement.name, evalExpr(statement.init, scope))
        return
      }
      case 'if': {
        if (isTruthy(evalExpr(statement.cond, scope))) {
          execStatements(statement.then, { vars: new Map(), parent: scope })
        } else if (statement.else) {
          execStatements(statement.else, { vars: new Map(), parent: scope })
        }
        return
      }
      case 'return': {
        const value = statement.value ? evalExpr(statement.value, scope) : undefined
        throw { [RETURN_SIGNAL]: true, value }
      }
      case 'expr':
        evalExpr(statement.expr, scope)
        return
      default:
        throw new ScriptRuntimeError('不支持的语句')
    }
  }

  try {
    execStatements(program.body, rootScope)
    return undefined
  } catch (e) {
    if (e && typeof e === 'object' && RETURN_SIGNAL in (e as object)) {
      return (e as { value?: unknown }).value
    }
    throw e
  }
}
