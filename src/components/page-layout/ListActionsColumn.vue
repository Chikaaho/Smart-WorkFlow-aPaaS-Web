<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
import { MoreFilled } from '@element-plus/icons-vue'

const { t } = useI18n()
/**
 * ListActionsColumn — 数据列表统一「操作」列（页型 B，V012-BUG-002/015）。
 *
 * 列固定最右（fixed right）；行内直接可见按钮最多 3 个，超过时第 4 个位置
 * 固定为「更多」下拉（V012-BUG-015：最多四个按钮，最后一个一定是更多）。
 * 按钮 link 纯文字无底色（V012-BUG-015）。权限/状态显隐由页面在 actions
 * 工厂内以 visible 表达（如 hasPerm() 判定；服务端仍是最终权威），
 * visible=false 的项不渲染，不占用直接可见名额。
 *
 * B021-012：列宽全局钳制 ≤160px（约 10% 设计行宽 1642），历史页面传入的
 * 超大宽度（372/444 等）在组件内收敛，防止「操作列占小半行」回归。
 *
 * B021-012r3（公开案例对齐）：行内按钮之间加 1px 垂直分隔线（Ant Design
 * Divider 官方将「表格操作列」列为 vertical 分割线典型场景，形如
 * 「编辑 | 删除 | 更多」）；「更多」由文字按钮改为 ⋯ 图标按钮（TDesign
 * 口径「表格内详情操作的收纳」、Arco Pro MoreFilled 同款），title/aria-label
 * 保留完整文案。行内按钮文案请用 2 字动词（弹窗/详情处给完整动宾）。
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
  /** 透传到按钮/下拉项的 data-test，便于页面级回归用例定位 */
  testId?: string
}

const props = withDefaults(
  defineProps<{
    /** 行级操作工厂：每行返回操作数组（含 visible=false 的隐藏项） */
    actions: (row: unknown) => ListAction[]
    label?: string
    width?: number | string
    /** 窄操作列可收拢次要动作，默认仍直显最多三个。 */
    inlineLimit?: 1 | 2 | 3
  }>(),
  { width: 140, label: undefined, inlineLimit: 3 },
)

/** B021-012 全局操作列宽度上限：10% 设计行宽（1642×10%≈164，取 160） */
const ACTIONS_WIDTH_CAP = 160

const colWidth = computed(() => {
  const n = Number(props.width)
  // 数值宽度钳制到上限；非数值（百分比等）原样透传
  return Number.isFinite(n) && String(props.width).trim() !== ''
    ? Math.min(n, ACTIONS_WIDTH_CAP)
    : props.width
})

function visibleActions(row: unknown): ListAction[] {
  return props.actions(row).filter((action) => action.visible !== false)
}

function directActions(row: unknown): ListAction[] {
  return visibleActions(row).slice(0, props.inlineLimit)
}

function restActions(row: unknown): ListAction[] {
  return visibleActions(row).slice(props.inlineLimit)
}

function onCommand(row: unknown, command: string | number | object) {
  const action = visibleActions(row).find((a) => a.key === String(command))
  action?.onClick()
}
</script>

<template>
  <el-table-column
    :label="label ?? t('common.actions')"
    :width="colWidth"
    fixed="right"
    column-key="actions"
    class-name="list-actions-col"
  >
    <template #default="{ row }">
      <template v-if="visibleActions(row).length > 0">
        <div class="list-actions">
          <template v-for="(action, i) in directActions(row)" :key="action.key">
            <span v-if="i > 0" class="list-actions__sep" aria-hidden="true" />
            <el-button
              link
              size="small"
              :type="action.type ?? 'primary'"
              :disabled="action.disabled"
              :loading="action.loading"
              :data-test="action.testId"
              @click.stop="action.onClick()"
            >
              {{ action.label }}
            </el-button>
          </template>
          <el-dropdown
            v-if="restActions(row).length > 0"
            trigger="click"
            @command="(command) => onCommand(row, command)"
          >
            <el-button
              link
              size="small"
              type="primary"
              class="list-actions__more"
              :title="t('common.moreActions')"
              :aria-label="t('common.moreActions')"
              @click.stop
            >
              <el-icon :size="16"><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="action in restActions(row)"
                  :key="action.key"
                  :command="action.key"
                  :disabled="action.disabled"
                  :data-test="action.testId"
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
/* V012-BUG-015：操作按钮横排网格对齐，纯文字 link（无底色/无描边）。
   B021-012r3：间距由分隔线承担（gap 归零），形如「编辑 | 停用 | ⋯」。 */
.list-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0;
}
.list-actions :deep(.el-button.is-link) {
  border: none;
  /* B021-012r2：按钮水平 margin/padding 归零（EP 相邻按钮自带 12px 左距与内距，
     与 flex gap 叠加致 190px > 144px 可用宽、「停用」被固定列裁切）；
     宽度按文字自然宽，最长组合 3×2字按钮 + ⋯ = 137px ≤ 144px。 */
  padding-left: 0;
  padding-right: 0;
  margin-left: 0;
  flex: 0 0 auto;
}
/* B021-012r3：1px 垂直分隔线（Ant Design Divider「表格操作列」场景同款语义），
   margin 5px/侧——3 按钮 + ⋯ 时总宽 137px 仍在 144px 可用宽内。 */
.list-actions__sep {
  flex: 0 0 auto;
  width: 1px;
  height: 12px;
  margin: 0 5px;
  background: var(--el-border-color);
}
.list-actions__more {
  padding-left: 5px;
  padding-right: 5px;
}
</style>

<style>
/* B021-012r2：操作列单元格内距 12→8（可用宽 136→144），配合上面的自然宽排布；
   class-name 挂在 td/th 上，经 el-table 渲染进父级树，scoped 选择器不命中，须全局块。
   仅命中 .list-actions-col，不影响其他列。 */
.el-table .list-actions-col .cell {
  padding-left: 8px;
  padding-right: 8px;
}
</style>
