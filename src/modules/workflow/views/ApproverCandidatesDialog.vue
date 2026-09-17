<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import { queryApproverCandidates, type ApproverCandidate } from '@/modules/workflow/api'

/**
 * ApproverCandidatesDialog — 审批人候选选择（P53 节点 12 · 受限真实组件）。
 *
 * 只交付服务端已有契约的部分：`/workflow/defs/approver-candidates` 的真实候选搜索，
 * 点选后把候选「用户 ID」回填给父级的审批人输入框（与既有手输 ID 语义一致）。
 * 设计稿中的部门 / 角色 / 动态规则 tab 无服务端契约，不提供（方向 §5.12）。
 */
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ pick: [candidate: ApproverCandidate] }>()

const { t } = useI18n()

const keyword = ref('')
const loading = ref(false)
const errorMsg = ref('')
const candidates = ref<ApproverCandidate[]>([])
const pickedId = ref<number | null>(null)

async function load(keywordText: string) {
  loading.value = true
  errorMsg.value = ''
  try {
    candidates.value = await queryApproverCandidates(keywordText.trim() || undefined)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('errors.network')
    candidates.value = []
  } finally {
    loading.value = false
  }
}

watch(visible, (open) => {
  if (open) {
    keyword.value = ''
    pickedId.value = null
    void load('')
  }
})

function pick(candidate: ApproverCandidate) {
  pickedId.value = candidate.id
  emit('pick', candidate)
  visible.value = false
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接（对齐 MyInstances 写法）
function pickRow(r: unknown) {
  pick(r as ApproverCandidate)
}

defineExpose({ reload: () => load(keyword.value) })
</script>

<template>
  <el-dialog v-model="visible" :title="t('approverPicker.title')" width="560px">
    <div class="approver-picker">
      <el-input
        v-model="keyword"
        :placeholder="t('approverPicker.searchPlaceholder')"
        clearable
        @keyup.enter="load(keyword)"
        @clear="load('')"
      />
      <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />
      <el-table v-loading="loading" :data="candidates" size="small" max-height="320">
        <el-table-column :label="t('approverPicker.colUser')" min-width="120">
          <template #default="{ row }">{{ row.realName || row.username }}</template>
        </el-table-column>
        <el-table-column :label="t('approverPicker.colUsername')" min-width="120">
          <template #default="{ row }">{{ row.username }}</template>
        </el-table-column>
        <el-table-column :label="t('approverPicker.colId')" width="110">
          <template #default="{ row }">{{ row.id }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="pickRow(row)">
              {{ t('approverPicker.pick') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <span class="approver-picker__empty">{{ t('approverPicker.empty') }}</span>
        </template>
      </el-table>
      <p v-if="pickedId != null" class="approver-picker__picked">
        {{ t('approverPicker.picked') }}: {{ pickedId }}
      </p>
      <p class="approver-picker__note">{{ t('approverPicker.note') }}</p>
      <p class="approver-picker__note approver-picker__note--muted">
        {{ t('approverPicker.deptTabHidden') }}
      </p>
    </div>
  </el-dialog>
</template>

<style scoped>
.approver-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.approver-picker__empty {
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.approver-picker__picked {
  margin: 0;
  font-size: 13px;
  color: var(--sw-color-primary);
}
.approver-picker__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--sw-text-secondary);
}
.approver-picker__note--muted {
  opacity: 0.75;
}
</style>
