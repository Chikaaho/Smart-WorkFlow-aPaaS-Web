import { describe, expect, it } from 'vitest'
import { transpileScriptSugar } from './script-sugar'

/**
 * BF20261013-021：`#函数名(...)` 语法糖编译器用例
 * （与 Server 侧 ScriptSugarTest.java 同语义，两实现须保持行为一致）。
 */
describe('transpileScriptSugar', () => {
  it('无 # 脚本原样返回', () => {
    expect(transpileScriptSugar('return 1;')).toBe('return 1;')
    expect(transpileScriptSugar('')).toBe('')
  })

  it('裸标识符参数自动转为字符串', () => {
    expect(transpileScriptSugar('#获取流程变量(var_dept_ids)')).toBe('获取流程变量("var_dept_ids")')
    expect(transpileScriptSugar('#获取流程变量( a )')).toBe('获取流程变量("a")')
  })

  it('已引号/字面量参数原样透传', () => {
    expect(transpileScriptSugar('#获取流程变量("var_x")')).toBe('获取流程变量("var_x")')
    expect(transpileScriptSugar('#设置流程变量(count, 1)')).toBe('设置流程变量("count",1)')
    expect(transpileScriptSugar('#设置必填(f, true)')).toBe('设置必填("f",true)')
    expect(transpileScriptSugar('#设置隐藏(f, null)')).toBe('设置隐藏("f",null)')
  })

  it('表达式参数保持语义并递归编译嵌套调用', () => {
    expect(transpileScriptSugar('#设置流程变量(count, #获取流程变量(a) + 1)')).toBe(
      '设置流程变量("count",获取流程变量("a") + 1)',
    )
    expect(transpileScriptSugar('#获取部门负责人(#获取流程变量(dept))')).toBe(
      '获取部门负责人(获取流程变量("dept"))',
    )
    expect(
      transpileScriptSugar('#设置字段值(total, Number(#获取字段值(a)) * Number(#获取字段值(b)))'),
    ).toBe('设置字段值("total",Number(获取字段值("a")) * Number(获取字段值("b")))')
  })

  it('多参数切分尊重嵌套与字符串内逗号', () => {
    expect(transpileScriptSugar('#fn(a, #inner(b, 2), "c,d")')).toBe('fn("a",inner("b",2),"c,d")')
    expect(transpileScriptSugar('#fn()')).toBe('fn()')
  })

  it('字符串与注释内的 # 不翻译', () => {
    expect(transpileScriptSugar('return "#不是调用";')).toBe('return "#不是调用";')
    expect(transpileScriptSugar('// #注释行\nreturn 1;')).toBe('// #注释行\nreturn 1;')
    expect(transpileScriptSugar('/* #块注释 */ return 1;')).toBe('/* #块注释 */ return 1;')
    expect(transpileScriptSugar("return '#x(1)';")).toBe("return '#x(1)';")
  })

  it('模板字符串插值内按代码编译', () => {
    expect(transpileScriptSugar('return `值=${#获取字段值(f)}`;')).toBe(
      'return `值=${获取字段值("f")}`;',
    )
    expect(transpileScriptSugar('return `a${ {x:1} }b`;')).toBe('return `a${ {x:1} }b`;')
  })

  it('整句示例：Owner 原话写法', () => {
    expect(transpileScriptSugar('var value = #获取流程变量(var_dept_ids); return value;')).toBe(
      'var value = 获取流程变量("var_dept_ids"); return value;',
    )
  })

  it('动态名逃生舱：表达式参数不被加引号', () => {
    expect(transpileScriptSugar('#获取流程变量("" + name)')).toBe('获取流程变量("" + name)')
  })

  it('畸形语法糖给出可诊断错误', () => {
    expect(() => transpileScriptSugar('var a = #;')).toThrow('应为函数名')
    expect(() => transpileScriptSugar('#foo')).toThrow('缺少参数括号')
    expect(() => transpileScriptSugar('#foo(1')).toThrow('括号未闭合')
    expect(() => transpileScriptSugar("return '#未闭合")).toThrow('未闭合')
  })
})
