import { Parser, type Values } from 'expr-eval-fork'

/**
 * 受限表达式求值器，供「字段计算公式 M03-F03 / 流程条件 M04-F07」等场景使用。
 * 严禁任何人将本文件改为 eval / new Function 实现。
 */
export function safeEval(expr: string, ctx: Values = {}): unknown {
  return new Parser().parse(expr).evaluate(ctx)
}
