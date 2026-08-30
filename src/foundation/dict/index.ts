import { ref, type Ref } from 'vue'
import { request } from '@/foundation/request'

export interface DictItem {
  label: string
  value: string
  tagType?: string
  cssClass?: string
}

/** 后端字典响应 DTO：value 字段名为 code（决策文档 v2 §1）。 */
interface DictItemDTO {
  code: string
  label: string
}

function mapDictItemDTO(dto: DictItemDTO): DictItem {
  return {
    label: dto.label,
    value: dto.code,
  }
}

/** 字典类型条目，供「绑定字典」类选择器使用（code = 写回字段的 dictType 值）。 */
export interface DictTypeItem {
  /** 字典类型编码，对应字段 dictType 写回值。 */
  code: string
  /** 字典类型显示名。 */
  name: string
}

/** 后端字典类型分页原始形状（records，对齐 system 字典管理端口）。 */
interface DictTypePageDTO {
  records: Array<{ code: string; name: string }>
}

/**
 * 列出全部字典类型，供表单设计器 DICT 字段「绑定字典」下拉选择。
 *
 * 走 foundation/request 单一请求层（业务层禁直引 axios）。字典是横切基础设施，
 * 故读取清单沉淀在 foundation/dict，**modules 之间不互相 import**（modules/form 不直引
 * modules/system 的字典管理 API，避免破坏跨模块边界）。
 *
 * 后端 `/system/dict/type/page` 为分页接口，设计期字典类型量级小，此处取大页一次拉全。
 * TODO(seam): 后端若提供「列出全部字典类型」专用端点，改调该端点即可，调用方零改。
 */
export async function listDictTypes(): Promise<DictTypeItem[]> {
  const raw = await request<DictTypePageDTO>({
    method: 'POST',
    url: '/system/dict/type/page',
    params: { pageNum: 1, pageSize: 1000 },
    data: {},
  })
  return raw.records.map((r) => ({ code: r.code, name: r.name }))
}

const dictRegistry = new Map<string, DictItem[]>()
const loadingDict = new Map<string, Promise<void>>()

export async function loadDict(type: string): Promise<DictItem[]> {
  const items = await request<DictItemDTO[]>({
    method: 'GET',
    url: `/system/dict/data/list/${type}`,
  })
  return items.map(mapDictItemDTO)
}

/** 失败不缓存，允许下次 useDict 按需重试；失败本身非阻塞，不影响应用其余部分。 */
function ensureDictLoaded(type: string): Promise<void> {
  if (dictRegistry.has(type)) {
    return Promise.resolve()
  }
  const inFlight = loadingDict.get(type)
  if (inFlight) {
    return inFlight
  }
  const promise = loadDict(type)
    .then((items) => {
      dictRegistry.set(type, items)
    })
    .catch(() => {
      // TODO(skeleton): 字典加载失败降级，仅 console 提示，不阻塞应用。
      console.warn(`[dict] failed to load type: ${type}`)
    })
    .finally(() => {
      loadingDict.delete(type)
    })
  loadingDict.set(type, promise)
  return promise
}

/**
 * 业务层取字典只走这里，禁止硬编码枚举到文案的映射。
 */
export function useDict(type: string): { items: Ref<DictItem[]> } {
  const items = ref<DictItem[]>(dictRegistry.get(type) ?? [])
  void ensureDictLoaded(type).then(() => {
    items.value = dictRegistry.get(type) ?? []
  })
  return { items }
}
