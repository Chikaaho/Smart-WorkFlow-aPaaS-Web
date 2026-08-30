/**
 * 列名（字段英文名）生成与校验——纯函数，单测覆盖。
 *
 * 定位：拖入字段时给一个**合法列名建议**，面板里做即时 UX 校验。
 * 真正的把关在后端发布时（建表/列名冲突/保留字等），前端这层只是提示，不拦死。
 *
 * 不引入拼音库（冷门/重，违背「优先成熟、不引冷门库」）：中文标签无法转英文时
 * 一律回退 `field_{序号}`，由作者在配置面板（第二刀）手动改名。
 */

/** 合法列名：小写字母/下划线开头，后续小写字母/数字/下划线。 */
export const COLUMN_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/

/** 是否合法列名。 */
export function isValidColumnName(name: string): boolean {
  return COLUMN_NAME_PATTERN.test(name)
}

/** 在同一表单内是否唯一（大小写按字面比较，列名本就要求小写）。 */
export function isColumnNameUnique(name: string, existing: readonly string[]): boolean {
  return !existing.includes(name)
}

/**
 * 把任意标签转成合法列名片段；转不出合法值返回空串。
 * 规则：转小写 → 非 [a-z0-9] 连续片段折叠为单个下划线 → 去首尾下划线 →
 * 若以数字开头则前置下划线。中文等字符被剔除，可能产出空串。
 */
export function slugifyColumnName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (slug === '') return ''
  const normalized = /^[0-9]/.test(slug) ? `_${slug}` : slug
  return isValidColumnName(normalized) ? normalized : ''
}

/**
 * 生成唯一的列名建议。
 * 优先用标签 slug；slug 为空（如纯中文）回退 `field_{seq}`；
 * 与 existing 冲突时追加 `_2`、`_3`… 直至唯一。
 */
export function generateColumnName(
  label: string,
  existing: readonly string[],
  seq: number,
): string {
  const base = slugifyColumnName(label) || `field_${seq}`
  if (isColumnNameUnique(base, existing)) return base
  let i = 2
  while (!isColumnNameUnique(`${base}_${i}`, existing)) i += 1
  return `${base}_${i}`
}
