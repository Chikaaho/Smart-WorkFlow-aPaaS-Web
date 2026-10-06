import { type FormSchema } from '@/contracts/form-schema'
import { loadDeptChoices, loadUserChoices } from '@/modules/form/api/i2-choices'

/**
 * P63 G01：USER/DEPT 字段保存回读的可读显示。
 * 值形态：单选=数字 ID（宽表列），多选=JSON 数组串；解析为「姓名」「部门名」，
 * 多选以顿号连接。找不到候选（分页外/已停用）回退原始 ID，与 REFERENCE 同口径。
 * 解析失败不阻断页面（返回空映射，调用方回退原值）。
 */
export type UserDeptDisplayMap = Record<string, string>

/** 值 → 稳定 ID 列表（单值/JSON 数组串/逗号串统一）。 */
function extractIds(value: unknown): string[] {
  if (value == null || value === '') return []
  const raw: unknown[] = []
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const decoded = JSON.parse(value)
      if (Array.isArray(decoded)) raw.push(...decoded)
    } catch {
      raw.push(value)
    }
  } else if (Array.isArray(value)) {
    raw.push(...value)
  } else {
    raw.push(value)
  }
  const ids = new Set<string>()
  for (const item of raw) {
    if (item == null) continue
    const text = String(item).trim()
    for (const part of text.split(',')) {
      const t = part.trim()
      if (/^\d+$/.test(t) && t.length <= 19) ids.add(t)
    }
  }
  return [...ids]
}

function isUserDeptField(type: string | undefined): boolean {
  return type === 'USER' || type === 'DEPT'
}

/**
 * 按 schema 解析整张记录的全部 USER/DEPT 显示串：
 * { fieldName: '张三、李四' }。候选解析并发一次，复用于任务详情与数据管理。
 */
export async function buildUserDeptDisplays(
  schema: FormSchema,
  record: Record<string, unknown>,
): Promise<UserDeptDisplayMap> {
  const displays: UserDeptDisplayMap = {}
  const targets = (schema.fields ?? []).filter((f) => isUserDeptField(f.type))
  if (targets.length === 0) return displays

  const userIds = new Set<string>()
  const deptIds = new Set<string>()
  const perFieldIds = new Map<string, { ids: string[]; type: string }>()
  for (const field of targets) {
    const ids = extractIds(record[field.name])
    if (ids.length === 0) continue
    perFieldIds.set(field.name, { ids, type: String(field.type) })
    if (field.type === 'USER') ids.forEach((id) => userIds.add(id))
    else ids.forEach((id) => deptIds.add(id))
  }
  if (perFieldIds.size === 0) return displays

  const [userChoices, deptChoices] = await Promise.all([
    userIds.size > 0 ? loadUserChoices().catch(() => [] as { id: string; label: string }[]) : [],
    deptIds.size > 0 ? loadDeptChoices().catch(() => [] as { id: string; label: string }[]) : [],
  ])
  const userLabels = new Map(userChoices.map((c) => [c.id, c.label]))
  const deptLabels = new Map(deptChoices.map((c) => [c.id, c.label.replace(/^\u3000+/, '')]))

  for (const [name, { ids, type }] of perFieldIds) {
    const labels = ids.map(
      (id) => (type === 'USER' ? userLabels.get(id) : deptLabels.get(id)) ?? `#${id}`,
    )
    displays[name] =
      labels.length === 1 ? labels[0] : ids.length > 1 ? labels.join('、') : labels[0]
  }
  return displays
}

/** 解析失败/无定义时的原值回退显示串（多选保持数组原文）。 */
export function fallbackValueDisplay(value: unknown): string {
  return value == null || value === '' ? '-' : String(value)
}
