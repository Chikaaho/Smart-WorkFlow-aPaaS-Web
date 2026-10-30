import { onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/locales'
import { currentTenantContext } from '@/modules/system/api/tenant-context'
import type { TenantContextOption } from '@/modules/system/types/tenant'

export function useManagementTenant() {
  const store = useUserStore()
  const { t } = useI18n()
  const filterTenant = ref<TenantContextOption | null>(null)
  const appliedTenant = ref<TenantContextOption | null>(null)
  const targetTenant = ref<TenantContextOption | null>(null)
  const pickerVisible = ref(false)
  const choosing = ref(false)
  let settle: ((value: TenantContextOption | null) => void) | null = null
  let active = true

  async function chooseForCreate(
    preferred = appliedTenant.value,
  ): Promise<TenantContextOption | null> {
    if (choosing.value) return null
    choosing.value = true
    try {
      let choice = preferred
      if (!store.superAdmin) choice = await currentTenantContext()
      else if (!choice) {
        pickerVisible.value = true
        choice = await new Promise<TenantContextOption | null>((resolve) => {
          settle = resolve
        })
      }
      if (!active || !choice) return null
      if (!choice.writable) {
        ElMessage.error(t('tenantContext.unavailable'))
        return null
      }
      targetTenant.value = choice
      return choice
    } catch (err) {
      ElMessage.error(err instanceof ApiError ? err.msg : t('tenantContext.loadFailed'))
      return null
    } finally {
      choosing.value = false
    }
  }

  function selectTarget(choice: TenantContextOption) {
    if (!choice.writable) return
    pickerVisible.value = false
    settle?.(choice)
    settle = null
  }
  function closePicker(value: boolean) {
    pickerVisible.value = value
    if (!value) {
      settle?.(null)
      settle = null
    }
  }
  function useObjectTarget(row: { tenantId?: string; tenantName?: string }) {
    if (row.tenantId == null) throw new Error(t('tenantContext.missingOwner'))
    targetTenant.value = {
      id: String(row.tenantId),
      name: row.tenantName || t('common.unknown'),
      code: '',
      writable: true,
    }
  }
  function applyFilter() {
    appliedTenant.value = filterTenant.value
  }
  function resetFilter() {
    filterTenant.value = null
    appliedTenant.value = null
  }
  onBeforeUnmount(() => {
    active = false
    settle?.(null)
    settle = null
  })
  return {
    filterTenant,
    appliedTenant,
    targetTenant,
    pickerVisible,
    choosing,
    chooseForCreate,
    selectTarget,
    closePicker,
    useObjectTarget,
    applyFilter,
    resetFilter,
  }
}
