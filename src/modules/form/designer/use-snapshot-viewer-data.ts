import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { parseDefinition } from '@/adapters/form-designer'
import {
  loadSnapshotProcessVersionCandidates,
  loadSnapshotProcessVersionGraph,
  type SnapshotProcessVersionCandidate,
} from '@/adapters/published-snapshot'
import type { FormSchema } from '@/contracts/form-schema'
import { useI18n } from '@/locales'
import {
  getFormSnapshotDefinition,
  type FormSnapshotDTO,
  type FormSnapshotDetailDTO,
} from '../api/form-def'
import {
  buildSnapshotAdvancedConfigs,
  buildSnapshotApprovalScripts,
  buildSnapshotConstraints,
  buildSnapshotFieldPermissions,
  buildSnapshotNodes,
  buildSnapshotScripts,
  buildSnapshotTriggers,
  buildSnapshotVariables,
  buildSnapshotVisibility,
  extractSnapshotListConfig,
  flattenSnapshotFields,
  matchesSnapshotFormVersion,
  type SnapshotProcessSource,
} from './published-snapshot'
import { errorText, parseRawDefinition, prettyJson } from './use-snapshot-labels'

/** 0.2.0 G14（272:1518）：全屏外壳五页签——原 12 分区按实际内容归入对应页签。 */
export type SnapshotTab = 'fields' | 'design' | 'process' | 'numbering' | 'settings'

export interface SnapshotViewerProps {
  formId: string
  formKey: string
  snapshot: FormSnapshotDTO | null
}

/**
 * 快照查看器的数据面：表单快照加载、派生清单（字段/校验/显隐/权限/脚本/流程）与选中态。
 *
 * The form snapshot is authoritative for the form definition. Related process
 * definitions are found through the adapter seam, then only versions whose
 * formVersion matches the selected form snapshot are loaded from the immutable
 * workflow version endpoint. Missing data is displayed as missing; current
 * mutable configuration is never substituted for a frozen value.
 */
export function useSnapshotViewerData(
  props: SnapshotViewerProps,
  visible: Ref<boolean>,
  activeTab: Ref<SnapshotTab>,
) {
  const { t } = useI18n()

  const loading = ref(false)
  const loadError = ref('')
  const warnings = ref<string[]>([])
  const detail = ref<FormSnapshotDetailDTO | null>(null)
  const schema = ref<FormSchema | null>(null)
  const rawDefinition = ref<Record<string, unknown> | null>(null)
  const processSources = ref<SnapshotProcessSource[]>([])

  /* ── 表单设计 · 冻结字段属性（右属性外壳，方向 direction-ui-completion-020）──
   * 点击设计网格中的字段，右栏只读展示该字段的冻结配置；不写入任何数据。 */
  const selectedFieldName = ref<string | null>(null)
  const selectedField = computed<FormSchema['fields'][number] | null>(() => {
    if (!schema.value || schema.value.fields.length === 0) return null
    return (
      schema.value.fields.find((f) => f.name === selectedFieldName.value) ?? schema.value.fields[0]
    )
  })
  let requestGeneration = 0

  const fields = computed(() => (schema.value ? flattenSnapshotFields(schema.value) : []))

  const constraints = computed(() => buildSnapshotConstraints(fields.value))
  const visibility = computed(() => (schema.value ? buildSnapshotVisibility(schema.value) : []))
  const permissions = computed(() =>
    schema.value ? buildSnapshotFieldPermissions(schema.value) : [],
  )
  const actionPermissions = computed(() =>
    Object.entries(schema.value?.actionPermissions ?? {}).map(([action, subjects]) => ({
      action,
      subjects,
    })),
  )
  const listConfig = computed(() =>
    rawDefinition.value ? extractSnapshotListConfig(rawDefinition.value) : null,
  )
  const nodes = computed(() => buildSnapshotNodes(processSources.value))
  const advancedConfigs = computed(() => buildSnapshotAdvancedConfigs(processSources.value))
  const variables = computed(() => buildSnapshotVariables(processSources.value))
  const triggers = computed(() => buildSnapshotTriggers(processSources.value))
  const scripts = computed(() =>
    schema.value ? buildSnapshotScripts(schema.value, processSources.value) : [],
  )
  const approvalScripts = computed(() => buildSnapshotApprovalScripts(processSources.value))

  const effectiveSnapshot = computed<FormSnapshotDTO | null>(() => {
    if (!props.snapshot) return null
    return { ...props.snapshot, ...(detail.value ?? {}) }
  })
  const snapshotVersionText = computed(() => {
    const snapshot = effectiveSnapshot.value
    if (!snapshot) return '—'
    return String(snapshot.versionLabel || snapshot.formVersion)
  })
  const snapshotTitle = computed(
    () => schema.value?.title?.trim() || effectiveSnapshot.value?.versionLabel || props.formKey,
  )
  const rawDefinitionText = computed(() =>
    rawDefinition.value ? prettyJson(rawDefinition.value) : '',
  )

  /* ── 流程设计页签：左列流程版本、中列节点配置、右列选中节点只读属性 ── */
  const selectedProcessKey = ref<string | null>(null)
  const selectedNodeId = ref<string | null>(null)

  const selectedProcess = computed<SnapshotProcessSource | null>(() => {
    const list = processSources.value
    if (list.length === 0) return null
    return list.find((p) => `${p.defId}:${p.graphVersion}` === selectedProcessKey.value) ?? list[0]
  })

  const processNodes = computed(() =>
    selectedProcess.value
      ? nodes.value.filter(
          (node) =>
            node.processKey === selectedProcess.value!.processKey &&
            node.graphVersion === selectedProcess.value!.graphVersion,
        )
      : [],
  )

  const selectedNode = computed(() => {
    if (processNodes.value.length === 0) return null
    return (
      processNodes.value.find((node) => node.id === selectedNodeId.value) ?? processNodes.value[0]
    )
  })

  function toProcessSource(
    candidate: SnapshotProcessVersionCandidate,
    graph: unknown,
  ): SnapshotProcessSource {
    return {
      defId: String(candidate.def.id),
      defName: candidate.def.name || candidate.def.processKey,
      processKey: candidate.def.processKey,
      graphVersion: candidate.version.graphVersion,
      versionName: candidate.version.name || candidate.def.name,
      status: candidate.version.status,
      formVersion: candidate.version.formVersion,
      publishedAt: candidate.version.publishedAt || candidate.version.updateTime,
      publisherName: candidate.version.publisherName,
      graph,
    }
  }

  async function loadRelatedProcessSnapshots(
    generation: number,
    snapshot: FormSnapshotDTO,
  ): Promise<void> {
    try {
      const candidates = await loadSnapshotProcessVersionCandidates(props.formKey)
      if (generation !== requestGeneration) return
      warnings.value.push(...candidates.failures)
      const matches = candidates.items.filter((candidate) =>
        matchesSnapshotFormVersion(
          snapshot.formVersion,
          snapshot.versionLabel,
          candidate.version.formVersion,
        ),
      )
      const settled = await Promise.allSettled(
        matches.map(async (candidate) => ({
          candidate,
          graph: await loadSnapshotProcessVersionGraph(
            candidate.def.id,
            candidate.version.graphVersion,
          ),
        })),
      )
      if (generation !== requestGeneration) return
      const sources: SnapshotProcessSource[] = []
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          sources.push(toProcessSource(result.value.candidate, result.value.graph))
          return
        }
        const candidate = matches[index]
        warnings.value.push(
          t('form.snapshotViewer.processReadFailed', {
            name: candidate?.def.name ?? candidate?.def.processKey ?? 'process',
            message: errorText(result.reason),
          }),
        )
      })
      processSources.value = sources.sort(
        (left, right) =>
          left.defName.localeCompare(right.defName) || left.graphVersion - right.graphVersion,
      )
    } catch (error) {
      if (generation === requestGeneration) {
        warnings.value.push(
          t('form.snapshotViewer.processLoadFailed', { message: errorText(error) }),
        )
      }
    }
  }

  async function loadSnapshot(): Promise<void> {
    const snapshot = props.snapshot
    if (!visible.value || !snapshot) return
    const generation = ++requestGeneration
    loading.value = true
    loadError.value = ''
    warnings.value = []
    detail.value = null
    schema.value = null
    rawDefinition.value = null
    processSources.value = []
    activeTab.value = 'fields'
    selectedFieldName.value = null
    selectedProcessKey.value = null
    selectedNodeId.value = null
    try {
      const loaded = await getFormSnapshotDefinition(props.formId, snapshot.formVersion)
      if (generation !== requestGeneration) return
      const raw = parseRawDefinition(loaded.definition)
      const parsed = parseDefinition(loaded.definition)
      detail.value = loaded
      rawDefinition.value = raw
      schema.value = parsed
      await loadRelatedProcessSnapshots(generation, snapshot)
    } catch (error) {
      if (generation === requestGeneration) {
        loadError.value = `${t('form.snapshotViewer.loadFailed')}: ${errorText(error)}`
      }
    } finally {
      if (generation === requestGeneration) loading.value = false
    }
  }

  watch(
    () => [visible.value, props.formId, props.formKey, props.snapshot?.formVersion] as const,
    () => {
      if (visible.value) void loadSnapshot()
    },
    { immediate: true },
  )

  return {
    loading,
    loadError,
    warnings,
    detail,
    schema,
    rawDefinition,
    processSources,
    activeTab,
    selectedFieldName,
    selectedField,
    fields,
    constraints,
    visibility,
    permissions,
    actionPermissions,
    listConfig,
    nodes,
    advancedConfigs,
    variables,
    triggers,
    scripts,
    approvalScripts,
    effectiveSnapshot,
    snapshotVersionText,
    snapshotTitle,
    rawDefinitionText,
    selectedProcessKey,
    selectedNodeId,
    selectedProcess,
    processNodes,
    selectedNode,
  }
}
