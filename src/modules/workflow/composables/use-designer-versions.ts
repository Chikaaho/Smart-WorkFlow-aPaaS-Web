import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import { listDefVersions, suspendDefVersion, activateDefVersion } from '@/modules/workflow/api'
import type { ProcessDefVersionInfo } from '@/modules/workflow/api'

/** useDesignerVersions 入参。 */
export interface DesignerVersionsOptions {
  /** 流程定义 id。 */
  defId: Ref<string>
  /** 预览版本号（主文件持有：非空时画布与属性面板切换为只读快照）。 */
  previewVersion: Ref<number | null>
  /** 未保存标记（切换历史版本前确认）。 */
  dirty: Ref<boolean>
  /** 未保存离开确认（切换历史版本前）。 */
  confirmLeaveIfDirty: () => Promise<boolean>
  /** 重新加载（打开历史版本/回到编辑）。 */
  load: () => Promise<void>
}

/**
 * 历史版本预览与启停（自 ProcessDesigner.vue 原地迁出，行为不变）。
 *
 * 历史版本预览：非空时画布与属性面板切换为只读快照。
 */
export function useDesignerVersions(options: DesignerVersionsOptions) {
  const { defId, dirty, previewVersion, confirmLeaveIfDirty, load } = options
  const { t } = useI18n()

  const isVersionPreview = computed(() => previewVersion.value != null)
  const versionHistory = ref<ProcessDefVersionInfo[]>([])
  const versionsLoading = ref(false)

  function formatVersionTime(value?: string | null): string {
    if (!value) return '—'
    const normalized = value.replace('T', ' ')
    return normalized.length >= 16 ? normalized.slice(0, 16) : normalized
  }

  async function loadVersionHistory() {
    if (!defId.value || versionsLoading.value) return
    versionsLoading.value = true
    try {
      const rows = await listDefVersions(defId.value)
      versionHistory.value = [...rows].sort((a, b) => b.graphVersion - a.graphVersion)
    } catch (err) {
      versionHistory.value = []
      ElMessage.error((err as { msg?: string }).msg ?? t('workflow.versionHistoryLoadFailed'))
    } finally {
      versionsLoading.value = false
    }
  }

  const changingVersionId = ref<number | string | null>(null)

  async function toggleVersionAvailability(item: ProcessDefVersionInfo) {
    if (!defId.value || changingVersionId.value !== null) return
    const suspending = item.status === 'PUBLISHED'
    try {
      await ElMessageBox.confirm(
        t(suspending ? 'workflow.suspendVersionConfirm' : 'workflow.activateVersionConfirm', {
          version: item.graphVersion,
        }),
        t(suspending ? 'workflow.suspendVersion' : 'workflow.activateVersion'),
        {
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          type: 'warning',
        },
      )
    } catch {
      return
    }
    changingVersionId.value = item.id
    try {
      if (suspending) await suspendDefVersion(defId.value, item.graphVersion)
      else await activateDefVersion(defId.value, item.graphVersion)
      ElMessage.success(t('workflow.versionAvailabilityChanged'))
      await loadVersionHistory()
    } catch (error) {
      ElMessage.error((error as { msg?: string }).msg ?? t('workflow.versionAvailabilityFailed'))
    } finally {
      changingVersionId.value = null
    }
  }

  function onVersionMenuVisible(visible: boolean) {
    if (visible) void loadVersionHistory()
  }

  function onVersionCommand(command: unknown) {
    if (command && typeof command === 'object' && 'graphVersion' in command) {
      void openVersion(command as ProcessDefVersionInfo)
    }
  }

  async function openVersion(version: ProcessDefVersionInfo) {
    if (!isVersionPreview.value && dirty.value) {
      const proceed = await confirmLeaveIfDirty()
      if (!proceed) return
    }
    previewVersion.value = version.graphVersion
    await load()
  }

  function backToEditing() {
    if (!isVersionPreview.value) return
    previewVersion.value = null
    void load()
  }

  return {
    previewVersion,
    isVersionPreview,
    versionHistory,
    versionsLoading,
    changingVersionId,
    formatVersionTime,
    loadVersionHistory,
    toggleVersionAvailability,
    onVersionMenuVisible,
    onVersionCommand,
    openVersion,
    backToEditing,
  }
}
