/**
 * P61 R2a：术语审计（同义异文收敛 + 枚举直出扫描）。
 *
 * 三个可复核的判定：
 *   1. 同文多键：同一句中文被多个键持有（同一状态在不同页面可能翻译分叉）
 *   2. 同义异键：术语表内同义组的中文落在不同键上（操作/状态词不一致）
 *   3. 枚举直出：模板里直接渲染裸枚举字段（未经过标签函数）
 *
 * 用法：node scripts/p61-term-audit.mjs [--json]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocaleTree, flattenTree, stripComments, walkDir } from './p61-lib.mjs'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')

/** 术语表：同义组（每组内的中文应指向同一语义键，或明确分化为不同业务含义） */
const SYNONYM_GROUPS = {
  新增类: ['新建', '新增', '创建'],
  编辑类: ['编辑', '修改'],
  删除类: ['删除', '移除'],
  审批通过类: ['通过', '审批通过', '同意'],
  驳回类: ['驳回', '拒绝'],
  退回类: ['退回', '撤回'],
  查询类: ['查询', '搜索'],
  保存类: ['保存', '提交'],
  停用类: ['停用', '禁用'],
  启用类: ['启用', '开启'],
}

/**
 * 已复核的「同义组内**有意**区分」清单。
 *
 * 同义组里落下不同的词并不总是缺陷：有些是不同语义角色（动作 vs 结果/名词）、
 * 不同交互（精确查询 vs 模糊搜索）或不同业务动作（退回 vs 撤回）。
 * 逐组写清区分依据后，审计即可判定：**未登记的**同义分叉才算问题。
 */
const REVIEWED_DISTINCTIONS = {
  新增类:
    '「新建」是创建动作的动词（按钮/标题统一用它）；「创建」只出现在结果与时间名词中（创建成功/创建失败/创建时间），属事件描述而非操作标签。',
  编辑类: '「编辑」进入表单修改既有对象；「修改」在审计/描述语境中表状态变更，非操作标签。',
  删除类: '「删除」销毁对象；「移除」把成员移出集合（用户组/角色成员），对象本身仍存在。',
  审批通过类:
    '「通过」是审批动作按钮；「审批通过」是任务审批结果状态词，与实例状态「已通过」同属状态词族。',
  驳回类: '「驳回」是审批动作；「拒绝」用于授权/请求语境，语义主体不同。',
  退回类: '「退回」把待办退回上一节点；「撤回」是发起人收回自己发起的实例。两个不同的流程动作。',
  查询类: '「查询」是精确条件提交（按钮）；「搜索」是输入框的模糊匹配（含「搜索中…」等状态词）。',
  保存类: '「保存」写入草稿不改状态；「提交」走审批流并改变单据状态。',
  停用类: '「停用」对象进入不可用状态；IoT 设备原有「禁用」表述已统一为「停用」。',
  启用类: '「启用」对象可用；「开启」打开某个开关项（流程接入开关等）。',
}

const zhTree = buildLocaleTree(join(ROOT, 'scripts'), 'zh-CN')
const enTree = buildLocaleTree(join(ROOT, 'scripts'), 'en-US')
const enById = new Map(flattenTree(enTree))
const entries = flattenTree(zhTree).filter(([, v]) => typeof v === 'string')
const enOf = (key) => (typeof enById.get(key) === 'string' ? enById.get(key) : '')
const byValue = new Map()
for (const [key, value] of entries) {
  if (!/[\u4e00-\u9fff]/.test(value)) continue
  const norm = value.replace(/[\s·]/g, '')
  if (!byValue.has(norm)) byValue.set(norm, [])
  byValue.get(norm).push({ key, value })
}

const duplicateText = [...byValue.entries()].filter(([, list]) => list.length > 1)

const synonymFindings = []
for (const [group, terms] of Object.entries(SYNONYM_GROUPS)) {
  const buckets = new Map()
  for (const [key, value] of entries) {
    for (const term of terms) {
      if (value === term || value === `${term}类` || value.startsWith(term)) {
        if (!buckets.has(term)) buckets.set(term, [])
        buckets.get(term).push({ key, value })
        break
      }
    }
  }
  const usedTerms = [...buckets.keys()]
  if (usedTerms.length > 1) {
    synonymFindings.push({
      group,
      variants: usedTerms.map((t) => ({
        term: t,
        keys: buckets.get(t).map((x) => `${x.key}=${x.value}`),
      })),
    })
  }
}

/**
 * 枚举直出：模板里 {{ x.y }} 且字段名像枚举。
 * 覆盖两种命名：后缀式（deliveryStatus）与裸字段式（status / type / mode）。
 */
const ENUM_SUFFIX = /(Status|Type|State|Mode|Result|Level|Kind|Stage|Phase)$/
const ENUM_BARE = new Set(['status', 'type', 'state', 'mode', 'result', 'level', 'kind'])
const ENUM_FIELD = /\{\{\s*([\w$]+(?:\??\.[\w$]+)*)\.(\w+)\s*(\?\?[^}]*)?\}\}/g
const enumHits = []
for (const file of walkDir(SRC)) {
  const rel = file.split(/[\\/]/).slice(-6).join('/')
  // 测试夹具里的模板片段不是生产渲染位
  if (/\.(spec|test)\.ts$/.test(file)) continue
  const src = stripComments(readFileSync(file, 'utf8'))
  for (const m of src.matchAll(ENUM_FIELD)) {
    const field = m[2]
    if (!ENUM_SUFFIX.test(field) && !ENUM_BARE.has(field.toLowerCase())) continue
    // label 函数包过的（getStatusLabel(row.status)）不属于直出
    const line = src.slice(0, m.index).split('\n').length
    enumHits.push({ file: rel, line, expr: m[0].trim().replace(/\s+/g, ' '), field })
  }
}

/** 同文多键里真正冲突的：英文也不同（同一句中文被翻译成不同英文） */
const conflictingTranslations = duplicateText
  .map(([text, list]) => {
    const byEn = new Map()
    for (const { key } of list) {
      const en = enOf(key)
      if (!byEn.has(en)) byEn.set(en, [])
      byEn.get(en).push(key)
    }
    return { text, groups: [...byEn.entries()].map(([en, keys]) => ({ en, keys })) }
  })
  .filter((x) => x.groups.length > 1)

const report = {
  localeLeafCount: entries.length,
  duplicateTextCount: duplicateText.length,
  duplicateText: duplicateText.map(([text, list]) => ({ text, keys: list.map((x) => x.key) })),
  conflictingTranslationCount: conflictingTranslations.length,
  conflictingTranslations: conflictingTranslations.map((x) => ({
    text: x.text,
    variants: x.groups.map((g) => ({ en: g.en, keys: g.keys })),
  })),
  synonymGroupFindings: synonymFindings,
  enumDirectRenderHits: enumHits,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`目录条目: ${report.localeLeafCount}`)
  console.log(`\n【1】同文多键（${duplicateText.length} 组）：同一中文被多个键持有`)
  for (const [text, list] of duplicateText) {
    console.log(`  「${text}」 → ${list.map((x) => x.key).join(' | ')}`)
  }
  console.log(
    `\n【1b】同文异译（${conflictingTranslations.length} 组）：同一句中文在英文侧分叉——这是必须收敛的冲突`,
  )
  for (const c of conflictingTranslations) {
    console.log(`  「${c.text}」`)
    for (const g of c.groups) console.log(`    → ${JSON.stringify(g.en)}  [${g.keys.join(', ')}]`)
  }
  console.log(`\n【2】同义异键（${synonymFindings.length} 组）：术语表同义组落在不同键`)
  for (const f of synonymFindings) {
    console.log(`  ${f.group}:`)
    for (const v of f.variants) console.log(`    ${v.term} → ${v.keys.join(', ')}`)
  }
  console.log(`\n【3】枚举直出（${enumHits.length} 处）：模板直接渲染裸枚举字段`)
  for (const h of enumHits.slice(0, 60)) console.log(`  ${h.file}:${h.line}  ${h.expr}`)
}

/** 门禁判定：同文多键 / 同文异译 / 枚举直出 / 未复核的同义分叉 都必须为 0 */
const unreviewedSynonyms = synonymFindings.filter((f) => !REVIEWED_DISTINCTIONS[f.group])
const failures = []
if (duplicateText.length) failures.push(`同文多键 ${duplicateText.length} 组`)
if (conflictingTranslations.length) failures.push(`同文异译 ${conflictingTranslations.length} 组`)
if (enumHits.length) failures.push(`枚举直出 ${enumHits.length} 处`)
if (unreviewedSynonyms.length) {
  failures.push(`未复核的同义分叉：${unreviewedSynonyms.map((f) => f.group).join('、')}`)
}

console.log(
  `\n同义区分复核：${synonymFindings.length - unreviewedSynonyms.length}/${synonymFindings.length} 组已给出依据`,
)
for (const f of synonymFindings) {
  const why = REVIEWED_DISTINCTIONS[f.group]
  console.log(`  ${why ? '已复核' : '未复核'}  ${f.group}：${why ?? '（缺区分依据）'}`)
}

if (failures.length) {
  console.error(`\nP61 术语审计未通过：${failures.join('；')}`)
  process.exit(1)
}
console.log('\nP61 术语审计：通过（同文零分叉、枚举零直出、同义分叉均已复核）')
