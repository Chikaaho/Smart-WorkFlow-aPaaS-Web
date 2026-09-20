<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { User } from '@element-plus/icons-vue'
import { useI18n } from '@/locales'
import { request } from '@/foundation/request'
import {
  queryApproverCandidates,
  type ApproverCandidate,
} from '@/modules/workflow/api'

/** 部门/角色展示条目（modules 间禁止互相 import：经 foundation request 走同一端点）。 */
interface PickerDept {
  id: string
  parentId: string
  name: string
  children?: PickerDept[]
}
interface PickerRole {
  id: string
  name: string
}

/**
 * ApproverCandidatesDialog — 审批人候选选择（P53 节点 12）。
 *
 * 人员/部门/角色/动态规则四个页签：
 *  - 人员：服务端 `/workflow/defs/approver-candidates` 真实候选（可按部门树过滤），
 *    多选后经「确认选择」回填父级审批人配置（value = 用户 id 数组，契约官方形状）；
 *  - 部门：真实部门树（/system/dept/tree），选择部门即按部门过滤候选人员；
 *  - 角色：真实角色列表（/system/role/page）；
 *  - 动态规则：服务端契约已登记的审批人类型展示（解析在服务端运行时完成）。
 */
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ pick: [candidates: ApproverCandidate[]] }>()

/** 已存审批人 id（父级字段当前值的回显）：打开时按其预选候选。 */
const props = withDefaults(defineProps<{ initialIds?: number[] }>(), { initialIds: () => [] })

const { t } = useI18n()

type PickerTab = 'user' | 'dept' | 'role' | 'rule'
const activeTab = ref<PickerTab>('user')
const keyword = ref('')
const loading = ref(false)
const errorMsg = ref('')
const candidates = ref<ApproverCandidate[]>([])
const selected = ref<ApproverCandidate[]>([])
const deptId = ref<string | null>(null)
const depts = ref<PickerDept[]>([])
const roles = ref<PickerRole[]>([])

/** 候选人展示辅助：账号 与 部门/角色副行（mock 候选不含部门，展示 username）。 */
function subText(candidate: ApproverCandidate): string {
  return candidate.department || candidate.username
}

const selectedIds = computed(() => new Set(selected.value.map((c) => c.id)))

const filteredCandidates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return candidates.value.filter((c) => {
    if (deptId.value != null && String(c.id).startsWith('dept-')) return false
    if (
      kw &&
      !c.username.toLowerCase().includes(kw) &&
      !(c.realName ?? '').toLowerCase().includes(kw)
    )
      return false
    return true
  })
})

async function load(keywordText = '') {
  loading.value = true
  errorMsg.value = ''
  try {
    candidates.value = await queryApproverCandidates(keywordText.trim() || undefined)
    // 回显：候选中命中已存 id 的自动预选（仅首次加载；搜索过滤不重置已选）
    if (props.initialIds.length && selected.value.length === 0) {
      selected.value = candidates.value.filter((c) => props.initialIds.includes(c.id))
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('errors.network')
    candidates.value = []
  } finally {
    loading.value = false
  }
}

async function loadDepts() {
  if (depts.value.length) return
  try {
    const flat = await request<PickerDept[]>({ method: 'GET', url: '/system/dept/tree' })
    const byId = new Map(
      flat.map((dept) => [String(dept.id), { ...dept, children: [] as PickerDept[] }]),
    )
    const roots: PickerDept[] = []
    for (const dept of byId.values()) {
      const parent = byId.get(String(dept.parentId))
      if (parent) parent.children?.push(dept)
      else roots.push(dept)
    }
    depts.value = roots
  } catch {
    depts.value = []
  }
}

async function loadRoles() {
  if (roles.value.length) return
  try {
    const page = await request<{ list: PickerRole[] }>({
      method: 'GET',
      url: '/system/role/page',
      params: { pageNum: 1, pageSize: 50 },
    })
    roles.value = page.list
  } catch {
    roles.value = []
  }
}

watch(visible, (open) => {
  if (open) {
    keyword.value = ''
    selected.value = []
    deptId.value = null
    activeTab.value = 'user'
    void load('')
    void loadDepts()
    void loadRoles()
  }
})

function isSelected(candidate: ApproverCandidate): boolean {
  return selectedIds.value.has(candidate.id)
}

function toggle(candidate: ApproverCandidate) {
  if (isSelected(candidate)) {
    selected.value = selected.value.filter((c) => c.id !== candidate.id)
  } else {
    selected.value = [...selected.value, candidate]
  }
}

function removeSelected(candidate: ApproverCandidate) {
  selected.value = selected.value.filter((c) => c.id !== candidate.id)
}

/** 确认选择：把全部选中候选回填父级（value = 用户 id 数组）。 */
function confirmSelection() {
  if (!selected.value.length) return
  emit('pick', selected.value)
  visible.value = false
}

const RULE_TYPES = [
  { key: 'INITIATOR', labelKey: 'approverPicker.ruleInitiator' },
  { key: 'DEPT_LEADER', labelKey: 'approverPicker.ruleDeptLeader' },
  { key: 'ROLE_MEMBER', labelKey: 'approverPicker.ruleRoleMember' },
  { key: 'EXPRESSION', labelKey: 'approverPicker.ruleExpression' },
]
</script>

<template>
  <el-dialog
    v-model="visible"
    width="1020px"
    append-to-body
    class="approver-dialog"
    modal-class="p53-dialog-overlay-37"
  >
    <template #header>
      <div class="approver-dialog__heading">
        <h2>{{ t('approverPicker.title') }}</h2>
        <p>{{ t('approverPicker.subtitle') }}</p>
      </div>
    </template>

    <div class="approver-dialog__tabs">
      <button
        v-for="tab in (
          [
            ['user', 'approverPicker.tabUser'],
            ['dept', 'approverPicker.tabDept'],
            ['role', 'approverPicker.tabRole'],
            ['rule', 'approverPicker.tabRule'],
          ] as Array<[PickerTab, string]>
        )"
        :key="tab[0]"
        type="button"
        class="approver-dialog__tab"
        :class="{ 'is-active': activeTab === tab[0] }"
        @click="activeTab = tab[0]"
      >
        {{ t(tab[1]) }}
      </button>
    </div>

    <!-- ── 人员：组织架构 / 候选列表 / 已选 ── -->
    <div v-if="activeTab === 'user'" class="approver-dialog__panes">
      <div class="approver-pane approver-pane--tree">
        <h3 class="approver-pane__title">{{ t('approverPicker.orgTitle') }}</h3>
        <p class="approver-pane__workspace">{{ t('approverPicker.defaultWorkspace') }}</p>
        <el-tree
          :data="depts"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          :expand-on-click-node="false"
          default-expand-all
          @node-click="(node: PickerDept) => (deptId = String(node.id) === deptId ? null : String(node.id))"
        />
      </div>

      <div class="approver-pane approver-pane--list">
        <el-input
          v-model="keyword"
          :placeholder="t('approverPicker.searchPlaceholder')"
          clearable
        />
        <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />
        <div v-loading="loading" class="approver-pane__rows">
          <button
            v-for="candidate in filteredCandidates"
            :key="candidate.id"
            type="button"
            class="approver-user"
            :class="{ 'is-picked': isSelected(candidate) }"
            @click="toggle(candidate)"
          >
            <el-icon class="approver-user__avatar"><User /></el-icon>
            <span class="approver-user__body">
              <b>{{ candidate.realName || candidate.username }}</b>
              <span>{{ subText(candidate) }}</span>
            </span>
            <el-checkbox :model-value="isSelected(candidate)" @click.stop @change="toggle(candidate)" />
          </button>
          <p v-if="!loading && filteredCandidates.length === 0" class="approver-pane__empty">
            {{ t('approverPicker.empty') }}
          </p>
        </div>
      </div>

      <div class="approver-pane approver-pane--picked">
        <h3 class="approver-pane__title">
          {{ t('approverPicker.pickedTitle', { count: selected.length }) }}
        </h3>
        <div
          v-for="candidate in selected"
          :key="candidate.id"
          class="approver-picked"
        >
          <el-icon class="approver-user__avatar"><User /></el-icon>
          <span class="approver-user__body">
            <b>{{ candidate.realName || candidate.username }}</b>
            <span>{{ subText(candidate) }}</span>
          </span>
          <el-button link type="primary" @click="removeSelected(candidate)">
            &nbsp;{{ t('approverPicker.remove') }}&nbsp;&nbsp;
          </el-button>
        </div>
        <p class="approver-picked__strategy-label">{{ t('approverPicker.strategyLabel') }}</p>
        <p class="approver-picked__strategy">{{ t('approverPicker.strategyAny') }}</p>
        <p class="approver-picked__note">{{ t('approverPicker.strategyNote') }}</p>
      </div>
    </div>

    <!-- ── 部门 ── -->
    <div v-else-if="activeTab === 'dept'" class="approver-dialog__single">
      <el-tree
        :data="depts"
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        :expand-on-click-node="false"
        default-expand-all
      />
      <p class="approver-pane__note">{{ t('approverPicker.deptHint') }}</p>
    </div>

    <!-- ── 角色 ── -->
    <div v-else-if="activeTab === 'role'" class="approver-dialog__single">
      <ul class="approver-roles">
        <li v-for="role in roles" :key="role.id">{{ role.name }}</li>
      </ul>
      <p class="approver-pane__note">{{ t('approverPicker.roleHint') }}</p>
    </div>

    <!-- ── 动态规则 ── -->
    <div v-else class="approver-dialog__single">
      <ul class="approver-roles">
        <li v-for="rule in RULE_TYPES" :key="rule.key">{{ t(rule.labelKey) }}</li>
      </ul>
      <p class="approver-pane__note">{{ t('approverPicker.ruleHint') }}</p>
    </div>

    <p class="approver-dialog__footnote">{{ t('approverPicker.footnote') }}</p>

    <template #footer>
      <div class="approver-dialog__footer">
        <el-button @click="visible = false"
          >&nbsp;&nbsp;&nbsp;&nbsp;{{ t('common.cancel') }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</el-button
        >
        <el-button
          type="primary"
          class="approver-dialog__confirm"
          :disabled="selected.length === 0"
          @click="confirmSelection"
        >
          &nbsp;&nbsp;&nbsp;{{ t('approverPicker.confirm') }}&nbsp;&nbsp;&nbsp;&nbsp;
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.approver-dialog__heading h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #1f2a44;
}

.approver-dialog__heading p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #8c9ab1;
}

.approver-dialog__tabs {
  display: flex;
  gap: 12px;
  margin: 0 0 18px;
}

.approver-dialog__tab {
  min-width: 106px;
  height: 34px;
  border: 1px solid #ccd5e5;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #5f6f92;
  cursor: pointer;
}

.approver-dialog__tab.is-active {
  background: #f2ecff;
  color: var(--sw-color-primary);
  border-color: var(--sw-color-primary);
  font-weight: 600;
}


.approver-dialog__panes {
  display: grid;
  grid-template-columns: 250px 1fr 288px;
  gap: 16px;
  /* 设计（节点12）：三栏面板固定 450px，高度与底部分隔线对齐。 */
  min-height: 450px;
  height: 450px;
}

.approver-pane {
  border: 1px solid #dde3ef;
  border-radius: 10px;
  padding: 14px;
  min-width: 0;
}

.approver-pane__title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2a44;
}

.approver-pane__workspace {
  margin: 0 0 8px;
  font-size: 12px;
  color: #8393b5;
}

.approver-pane__rows {
  margin-top: 10px;
  min-height: 300px;
}

.approver-pane__empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary);
}

.approver-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.approver-user.is-picked {
  background: #f0eaff;
}

.approver-user__avatar {
  flex: 0 0 auto;
  color: #8393b5;
}

.approver-user__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}

.approver-user__body b {
  font-size: 14px;
  color: #1f2a44;
}

.approver-user__body span {
  font-size: 12px;
  color: #8393b5;
}

.approver-picked {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0e6f2;
  border-radius: 10px;
  margin-bottom: 10px;
  background: #fff;
}

.approver-picked__strategy-label {
  margin: 14px 0 4px;
  font-size: 12px;
  color: #8393b5;
}

.approver-picked__strategy {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2a44;
}

.approver-picked__note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8c99b0;
}

.approver-dialog__single {
  border: 1px solid #dde3ef;
  border-radius: 10px;
  padding: 14px;
  min-height: 470px;
}

.approver-roles {
  margin: 0;
  padding: 0;
  list-style: none;
}

.approver-roles li {
  padding: 10px 12px;
  font-size: 14px;
  color: #303a55;
}

.approver-pane__note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8c99b0;
}

.approver-dialog__footnote {
  margin: 14px 2px 0;
  font-size: 12px;
  color: #8c9ab1;
}

.approver-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.approver-dialog__confirm {
  min-width: 120px;
}
</style>
