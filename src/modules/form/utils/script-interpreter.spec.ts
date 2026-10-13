import { describe, expect, it, vi } from 'vitest'
import { ScriptRuntimeError, checkScriptSyntax, parseScript, runScript } from './script-interpreter'
import { transpileScriptSugar } from './script-sugar'

/**
 * BF20261013-021：表单字段脚本解释器用例（CSP 安全：不依赖 eval）。
 */
function run(code: string, host: Record<string, (...args: unknown[]) => unknown> = {}): unknown {
  return runScript(parseScript(transpileScriptSugar(code)), { hostFunctions: host })
}

describe('script-interpreter 表达式', () => {
  it('算术与优先级', () => {
    expect(run('return 1 + 2 * 3;')).toBe(7)
    expect(run('return (1 + 2) * 3;')).toBe(9)
    expect(run('return 7 % 4;')).toBe(3)
    expect(run('return -2 + 5;')).toBe(3)
  })

  it('字符串拼接（+ 遇字符串转拼接）', () => {
    expect(run('return "a" + 1;')).toBe('a1')
    expect(run('return 1 + 2 + "x";')).toBe('3x')
    expect(run('return "v=" + "ok";')).toBe('v=ok')
  })

  it('比较与相等（JS 子集语义）', () => {
    expect(run('return 1 < 2;')).toBe(true)
    expect(run('return "b" > "a";')).toBe(true)
    expect(run('return 1 == "1";')).toBe(true)
    expect(run('return 1 === "1";')).toBe(false)
    expect(run('return null == undefined;')).toBe(true)
    expect(run('return "" == 0;')).toBe(true)
    expect(run('return 2 != 3;')).toBe(true)
  })

  it('逻辑/三元/真值规则', () => {
    expect(run('return "" || "默认";')).toBe('默认')
    expect(run('return "有值" || "默认";')).toBe('有值')
    expect(run('return 1 && "和";')).toBe('和')
    expect(run('return 0 ? "y" : "n";')).toBe('n')
    expect(run('return !0;')).toBe(true)
    expect(run('return !!"x";')).toBe(true)
  })

  it('数组字面量', () => {
    expect(run('return [1, 2, 3];')).toEqual([1, 2, 3])
    expect(run('return ["a", 1 + 1];')).toEqual(['a', 2])
  })

  it('变量与块/条件语句；return 提前结束', () => {
    expect(
      run(`
        var a = 1;
        var b = 2;
        if (a < b) { var c = a + b; return c * 10; }
        return 0;
      `),
    ).toBe(30)
    expect(
      run(`
        if (false) { return "then"; } else { return "else"; }
      `),
    ).toBe('else')
    expect(run('return 1; return 2;')).toBe(1)
  })

  it('宿主函数调用与标识符解析', () => {
    const host = {
      getField: vi.fn((name: unknown) => `val-${String(name)}`),
      setField: vi.fn(),
    }
    expect(run('return getField("a");', host)).toBe('val-a')
    run('setField("b", 5);', host)
    expect(host.setField).toHaveBeenCalledWith('b', 5)
  })

  it('未定义变量/函数报可读错误', () => {
    expect(() => run('return notDefined;')).toThrow(ScriptRuntimeError)
    expect(() => run('return notDefined;')).toThrow('变量未定义')
    expect(() => run('return fn();')).toThrow('函数不存在')
  })

  it('步数预算有界（超限报错，不死循环）', () => {
    const many = Array.from({ length: 30 }, (_, i) => `var v${i} = ${i} + 1;`).join('\n')
    expect(() => runScript(parseScript(many), { hostFunctions: {}, budget: 10 })).toThrow(
      '步数超出上限',
    )
  })
})

describe('script-interpreter 语法校验', () => {
  it('合法脚本通过', () => {
    expect(checkScriptSyntax('var a = 1; if (a > 0) { a; }')).toBeNull()
    expect(checkScriptSyntax('return #语法糖已编译;'.replace('#语法糖已编译', '"x"'))).toBeNull()
  })

  it('语法错误给出位置信息', () => {
    expect(checkScriptSyntax('if (')).toContain('位置')
    expect(checkScriptSyntax('var = 1;')).not.toBeNull()
    expect(checkScriptSyntax('return "未闭合')).toContain('字符串未闭合')
    expect(checkScriptSyntax('return @;')).toContain('无法识别的字符')
    expect(() => parseScript('return 1;')).not.toThrow()
  })
})
