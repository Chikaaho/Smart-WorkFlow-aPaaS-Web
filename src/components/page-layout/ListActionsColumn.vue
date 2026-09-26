<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ListActionsColumn — 数据列表统一「操作」列（页型 B，V012-BUG-002/015）。
 *
 * 列固定最右（fixed right）；行内直接可见按钮最多 3 个，超过时第 4 个位置
 * 固定为「更多」下拉（V012-BUG-015：最多四个按钮，最后一个一定是更多）。
 * 按钮 link 纯文字无底色（V012-BUG-015）。权限/状态显隐由页面在 actions
 * 工厂内以 visible 表达（如 hasPerm() 判定；服务端仍是最终权威），
 * visible=false 的项不渲染，不占用直接可见名额。
 */
export interface ListAction {
  /** 稳定键：更多下拉的 command 与 v-for key */
  key: string
  label: string
  onClick: () => void
  /** false 时不渲染（权限/状态显隐由页面判定） */
  visible?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

const props = withDefaults(
  defineProps<{
    /** 行级操作工厂：每行返回操作数组（含 visible=false 的隐藏项） */
    actions: (row: unknown) => ListAction[]
    label?: string
    width?: number | string
  }>(),
  { width: 140 },
)

function visibleActions(row: unknown): ListAction[] {
  return props.actions(row).filter((action) => action.visible !== false)
}

function directActions(row: unknown): ListAction[] {
  return visibleActions(row).slice(0, 3)
}

function restActions(row: unknown): ListAction[] {
  return visibleActions(row).slice(3)
}

function onCommand(row: unknown, command: string | number | object) {
  const action = visibleActions(row).find((a) => a.key === String(command))
  action?.onClick()
}
</script>

<template>
  <el-table-column
    :label="label ?? t('common.actions')"
    :width="width"
    fixed="right"
    column-key="actions"
  >
    <template #default="{ row }">
      <template v-if="visibleActions(row).length > 0">
        <div class="list-actions">
          <el-button
            v-for="action in directActions(row)"
            :key="action.key"
            link
            size="small"
            :type="action.type ?? 'primary'"
            :disabled="action.disabled"
            :loading="action.loading"
            @click.stop="action.onClick()"
          >
            {{ action.label }}
          </el-button>
          <el-dropdown
            v-if="restActions(row).length > 0"
            trigger="click"
            @command="(command) => onCommand(row, command)"
          >
            <el-button link size="small" type="primary" @click.stop>
              {{ t('common.moreActions') }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="action in restActions(row)"
                  :key="action.key"
                  :command="action.key"
                  :disabled="action.disabled"
                >
                  {{ action.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>
      <span v-else>-</span>
    </template>
  </el-table-column>
</template>

<style scoped>
/* V012-BUG-015：操作按钮横排网格对齐，纯文字 link（无底色/无描边） */
.list-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 4px;
}
.list-actions :deep(.el-button.is-link) {
  border: none;
  padding: 0 2px;
}
</style>
