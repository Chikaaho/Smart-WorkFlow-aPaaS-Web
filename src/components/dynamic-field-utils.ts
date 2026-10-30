/**
 * 多选 ID 列表归一化（P63 回显兼容）。
 * USER/DEPT multiple 字段的读取值可能是 JSON 数组串（'["5","6"]'，落库形态）或已解析
 * 数组；渲染层统一归一为 ID 字符串数组，**只影响渲染，不回写存储**。
 * 宽容兼容：历史单个 ID（串/数字）按单元素列表展示；非法 JSON 串按原始串兜底，
 * 与单选回显「不在候选保留原始 ID」同一语义（不伪造、不丢值）。
 *
 * 独立于 dynamic-field-registry：控件组件引用本工具不得反向依赖注册表，
 * 否则注册表 → 控件 → 注册表形成运行时环，深链冷启动会在组件初始化前访问绑定。
 */
export function normalizeIdList(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(text)
        if (Array.isArray(parsed)) return parsed.map((v) => String(v))
      } catch {
        // 非法 JSON 串：按原始串兜底（保留服务端语义），渲染层不抛错
      }
    }
    return text ? [text] : []
  }
  return [String(value)]
}
