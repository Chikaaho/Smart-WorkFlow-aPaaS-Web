import { ref } from 'vue'
import { getProcessDefDefinitionByKey } from '../api'
import { queryCatalogItem } from '../api/oa'
import { getFormDefinition } from '@/adapters/form-runtime'

/**
 * 流程/表单/节点名称解析（业务展示用）。
 *
 * 列表接口常只下发内部标识；页面统一经本组合式函数解析为业务名称，
 * 解析失败时也只回退业务兜底文案，不把 key 暴露给业务用户。
 */
export function useWorkflowDisplayNames() {
  const processNames = ref<Record<string, string>>({})
  const formNames = ref<Record<string, string>>({})
  const nodeNames = ref<Record<string, Record<string, string>>>({})
  const pending = new Set<string>()

  function chineseOr(value: string, fallback: string): string {
    return /[\u4e00-\u9fa5]/.test(value) ? value : fallback
  }

  async function ensureProcess(processKey?: string | null) {
    if (!processKey || processNames.value[processKey] || pending.has(`p:${processKey}`)) return
    pending.add(`p:${processKey}`)
    try {
      const graph = await getProcessDefDefinitionByKey(processKey)
      const name = graph.name?.trim()
      processNames.value = {
        ...processNames.value,
        [processKey]: name || chineseOr(processKey, '未命名流程'),
      }
      const nodes: Record<string, string> = {}
      for (const element of graph.elements ?? []) {
        const nodeName = element.config?.['name']
        if (typeof nodeName === 'string' && nodeName.trim()) nodes[element.id] = nodeName
      }
      nodeNames.value = { ...nodeNames.value, [processKey]: nodes }
    } catch {
      // 设计权限之外的用户读取定义会被拒绝；目录事项是普通用户可见的业务名称来源。
      let fallback = chineseOr(processKey, '未命名流程')
      try {
        const item = await queryCatalogItem(processKey)
        if (item?.name?.trim()) fallback = item.name.trim()
      } catch {
        // 保留业务兜底文案
      }
      processNames.value = { ...processNames.value, [processKey]: fallback }
    } finally {
      pending.delete(`p:${processKey}`)
    }
  }

  async function ensureForm(formKey?: string | null) {
    if (!formKey || formNames.value[formKey] || pending.has(`f:${formKey}`)) return
    pending.add(`f:${formKey}`)
    try {
      const schema = await getFormDefinition(formKey)
      formNames.value = {
        ...formNames.value,
        [formKey]: schema.title?.trim() || chineseOr(formKey, '未命名表单'),
      }
    } catch {
      formNames.value = {
        ...formNames.value,
        [formKey]: chineseOr(formKey, '未命名表单'),
      }
    } finally {
      pending.delete(`f:${formKey}`)
    }
  }

  function processName(processKey?: string | null): string {
    if (!processKey) return '-'
    return processNames.value[processKey] ?? chineseOr(processKey, '未命名流程')
  }

  function formName(formKey?: string | null): string {
    if (!formKey) return '-'
    return formNames.value[formKey] ?? chineseOr(formKey, '未命名表单')
  }

  function nodeName(processKey?: string | null, nodeKey?: string | null): string {
    if (!nodeKey) return '流程节点'
    return nodeNames.value[processKey ?? '']?.[nodeKey] ?? '流程节点'
  }

  return { ensureProcess, ensureForm, processName, formName, nodeName }
}
