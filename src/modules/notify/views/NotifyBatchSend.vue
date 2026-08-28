<script setup lang="ts">
/**
 * NotifyBatchSend — 批量发送站内通知页面。
 *
 * 三种接收人维度（可叠加，多维度交叉去重）：
 *   - 用户选择：搜索用户名 → 选中 tag
 *   - 部门选择：部门树 checkbox（含子部门）
 *   - 角色选择：角色 checkbox group
 *
 * 两种内容模式（互斥 Tab）：
 *   - 直接内容模式：标题 + 正文
 *   - 模板模式：模板下拉 + 变量 JSON
 *
 * 点击发送 → 二次确认 → 调用 batchSendNotify API → 成功返回收件箱。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardFormTemplate, FormSection } from '@/components/page-layout'
import { batchSendNotify, resolveCountNotify, pageNotifyTemplates } from '@/modules/notify/api'
import type { NotifyBatchSendReq } from '@/contracts/notify'
import { request, ApiError } from '@/foundation/request'

// ─── 本地类型定义（避免跨模块 import） ───

interface UserSimple {
  id?: string
  username: string
  nickname?: string
  realName?: string
}

interface DeptNode {
  id?: string
  parentId?: string
  name: string
  code: string
  sort?: number
  status?: number
  children?: DeptNode[]
}

interface RoleSimple {
  id: string
  name: string
  code: string
}

interface BackendPageResult<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

// ─── 本地 API（直接 HTTP 调用，不跨模块 import） ───

async function searchUsers(keyword: string): Promise<UserSimple[]> {
  const raw = await request<BackendPageResult<UserSimple>>({
    url: '/system/user/page',
    method: 'POST',
    params: { pageNum: 1, pageSize: 20 },
    data: { username: keyword, realName: keyword, keyword },
  })
  return raw.records ?? []
}

async function fetchDeptTree(): Promise<DeptNode[]> {
  return request<DeptNode[]>({ url: '/system/dept/tree', method: 'GET' })
}

async function fetchRoles(): Promise<RoleSimple[]> {
  const raw = await request<BackendPageResult<RoleSimple>>({
    url: '/system/role/page',
    method: 'POST',
    params: { pageNum: 1, pageSize: 100 },
    data: {},
  })
  return raw.records ?? []
}

const router = useRouter()

// ─── 接收人选择状态 ───

const recipientTab = ref('user')

/** 已选用户 */
const selectedUsers = ref<UserSimple[]>([])
/** 用户搜索关键词 */
const userKeyword = ref('')
/** 用户搜索结果 */
const userCandidates = ref<UserSimple[]>([])
/** 用户搜索中 */
const userSearching = ref(false)

/** 组装后的部门树 */
const deptTreeData = ref<DeptNode[]>([])
/** 已勾选的部门 id 字符串集合（el-tree check 回调用） */
const checkedDeptKeys = ref<string[]>([])
/** el-tree 组件引用 */
const deptTreeRef = ref<Record<string, unknown> | null>(null)

/** 角色列表 */
const roleList = ref<RoleSimple[]>([])
/** 已勾选的角色 code */
const checkedRoleCodes = ref<string[]>([])

// ─── 内容模式状态 ───

const contentMode = ref<'direct' | 'template'>('direct')

/** 直接内容模式 */
const directTitle = ref('')
const directContent = ref('')

/** 模板模式 */
const templateCode = ref('')
const variablesText = ref('{}')

// ─── 通用状态 ───

const submitting = ref(false)
const errorMsg = ref('')

// ─── 模板列表（仅启用的） ───

const enabledTemplates = ref<Array<{ templateCode: string; name: string }>>([])

// ─── 初始化加载 ───

onMounted(async () => {
  try {
    const [deptData, roleData, tplData] = await Promise.all([
      fetchDeptTree(),
      fetchRoles(),
      pageNotifyTemplates({ pageNum: 1, pageSize: 100 }, undefined, true),
    ])
    deptTreeData.value = buildDeptTree(deptData)
    roleList.value = roleData
    enabledTemplates.value = tplData.list.map((t) => ({
      templateCode: t.templateCode,
      name: t.name,
    }))
  } catch {
    // 静默失败，页面仍可操作
  }
})

// ─── 部门树 flat→tree 转换 ───

function buildDeptTree(list: DeptNode[]): DeptNode[] {
  const map = new Map<string, DeptNode>()
  const roots: DeptNode[] = []
  for (const dept of list) {
    map.set(dept.id!, { ...dept, children: [] })
  }
  for (const dept of list) {
    const node = map.get(dept.id!)!
    if (dept.parentId && dept.parentId !== '0' && map.has(dept.parentId)) {
      map.get(dept.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// ─── 部门树勾选回调 ───

function onDeptCheck() {
  const val = deptTreeRef.value as unknown as { getCheckedKeys: () => string[] } | null
  if (val != null) {
    checkedDeptKeys.value = val.getCheckedKeys()
  }
}

// ─── 用户搜索 ───

let searchTimer: ReturnType<typeof globalThis.setTimeout> | null = null

function handleUserSearch(keyword: string) {
  userKeyword.value = keyword
  if (searchTimer) globalThis.clearTimeout(searchTimer)
  if (!keyword.trim()) {
    userCandidates.value = []
    return
  }
  searchTimer = globalThis.setTimeout(async () => {
    userSearching.value = true
    try {
      const result = await searchUsers(keyword.trim())
      userCandidates.value = result.filter((u) => !selectedUsers.value.some((s) => s.id === u.id))
    } catch {
      userCandidates.value = []
    } finally {
      userSearching.value = false
    }
  }, 300)
}

function addUser(user: UserSimple) {
  if (!selectedUsers.value.some((u) => u.id === user.id)) {
    selectedUsers.value.push(user)
  }
  userCandidates.value = userCandidates.value.filter((u) => u.id !== user.id)
  userKeyword.value = ''
}

function removeUser(userId: string) {
  selectedUsers.value = selectedUsers.value.filter((u) => u.id !== userId)
}

// ─── 模式切换互斥 ───

watch(contentMode, (mode) => {
  if (mode === 'direct') {
    templateCode.value = ''
    variablesText.value = '{}'
  } else {
    directTitle.value = ''
    directContent.value = ''
  }
})

// ─── 服务端接收人去重人数 ───

const serverCount = ref(0)
const countLoading = ref(false)
let countTimer: ReturnType<typeof globalThis.setTimeout> | null = null

/** 构建解析请求（与发送请求相同形状） */
function buildResolveReq(): NotifyBatchSendReq {
  return {
    recipientUserIds: selectedUsers.value.map((u) => Number(u.id)),
    recipientDeptIds: checkedDeptKeys.value.map(Number),
    recipientRoleCodes: checkedRoleCodes.value,
  }
}

/** 防抖调用服务端 resolve-count */
async function refreshServerCount() {
  const req = buildResolveReq()
  const hasAny =
    (req.recipientUserIds?.length ?? 0) > 0 ||
    (req.recipientDeptIds?.length ?? 0) > 0 ||
    (req.recipientRoleCodes?.length ?? 0) > 0
  if (!hasAny) {
    serverCount.value = 0
    return
  }
  countLoading.value = true
  try {
    const resp = await resolveCountNotify(req)
    serverCount.value = resp.recipientCount
  } catch {
    serverCount.value = 0
  } finally {
    countLoading.value = false
  }
}

function debouncedRefreshCount() {
  if (countTimer) globalThis.clearTimeout(countTimer)
  countTimer = globalThis.setTimeout(() => {
    refreshServerCount()
  }, 300)
}

// 监听选择变化，触发服务端人数确认
watch([selectedUsers, checkedDeptKeys, checkedRoleCodes], debouncedRefreshCount, { deep: true })

// ─── 发送按钮可点击 ───

const canSubmit = computed(() => {
  if (serverCount.value === 0) return false
  if (contentMode.value === 'direct') {
    return directTitle.value.trim() !== '' && directContent.value.trim() !== ''
  } else {
    return templateCode.value !== ''
  }
})

// ─── 发送 ───

async function handleSend() {
  if (!canSubmit.value || submitting.value) return

  const count = serverCount.value

  try {
    await ElMessageBox.confirm(`确认向 ${count} 人发送通知？`, '确认发送', {
      confirmButtonText: '确认发送',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  const req: NotifyBatchSendReq = {
    recipientUserIds: selectedUsers.value.map((u) => Number(u.id)),
    recipientDeptIds: checkedDeptKeys.value.map(Number),
    recipientRoleCodes: checkedRoleCodes.value,
  }

  if (contentMode.value === 'direct') {
    req.title = directTitle.value.trim()
    req.content = directContent.value.trim()
  } else {
    req.templateCode = templateCode.value
    try {
      req.variables = JSON.parse(variablesText.value)
    } catch {
      ElMessage.error('变量 JSON 格式不正确')
      return
    }
  }

  submitting.value = true
  errorMsg.value = ''
  try {
    const result = await batchSendNotify(req)
    ElMessage.success(`成功向 ${result.recipientCount} 人发送通知`)
    void router.push('/notify/inbox')
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : '发送失败'
    ElMessage.error(errorMsg.value)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <StandardFormTemplate title="发送通知" subtitle="选择接收对象和通知内容后发送">
    <template #alert>
      <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />
    </template>

    <!-- ═══ 接收对象 ═══ -->
    <FormSection title="接收对象">
      <div class="recipient-tabs">
        <el-tabs v-model="recipientTab" type="border-card">
          <!-- 用户选择 Tab -->
          <el-tab-pane label="按用户" name="user">
            <div class="user-search">
              <el-input
                v-model="userKeyword"
                placeholder="搜索用户名..."
                clearable
                @input="handleUserSearch"
              />
              <div v-if="userSearching" class="search-loading">搜索中...</div>
              <div v-if="userCandidates.length > 0" class="candidate-list">
                <div
                  v-for="user in userCandidates"
                  :key="user.id"
                  class="candidate-item"
                  @click="addUser(user)"
                >
                  {{ user.realName || user.username }}
                </div>
              </div>
            </div>
            <div v-if="selectedUsers.length > 0" class="selected-tags">
              <el-tag
                v-for="user in selectedUsers"
                :key="user.id"
                closable
                @close="removeUser(user.id!)"
              >
                {{ user.realName || user.username }}
              </el-tag>
            </div>
          </el-tab-pane>

          <!-- 部门选择 Tab -->
          <el-tab-pane label="按部门" name="dept">
            <el-tree
              ref="deptTreeRef"
              :data="deptTreeData"
              show-checkbox
              node-key="id"
              :props="{ label: 'name', children: 'children' }"
              @check="onDeptCheck"
            />
          </el-tab-pane>

          <!-- 角色选择 Tab -->
          <el-tab-pane label="按角色" name="role">
            <el-checkbox-group v-model="checkedRoleCodes">
              <el-checkbox v-for="role in roleList" :key="role.id" :label="role.code">
                {{ role.name }}
              </el-checkbox>
            </el-checkbox-group>
          </el-tab-pane>
        </el-tabs>
      </div>
    </FormSection>

    <!-- ═══ 通知内容 ═══ -->
    <FormSection title="通知内容">
      <el-tabs v-model="contentMode" type="border-card">
        <!-- 直接内容模式 -->
        <el-tab-pane label="直接内容" name="direct">
          <div class="form-field">
            <label class="form-field__label">标题</label>
            <el-input v-model="directTitle" placeholder="请输入通知标题" maxlength="200" />
          </div>
          <div class="form-field">
            <label class="form-field__label">正文</label>
            <el-input
              v-model="directContent"
              type="textarea"
              :rows="5"
              placeholder="请输入通知正文"
            />
          </div>
        </el-tab-pane>

        <!-- 模板模式 -->
        <el-tab-pane label="使用模板" name="template">
          <div class="form-field">
            <label class="form-field__label">选择模板</label>
            <el-select v-model="templateCode" placeholder="请选择模板" style="width: 100%">
              <el-option
                v-for="tpl in enabledTemplates"
                :key="tpl.templateCode"
                :label="tpl.name"
                :value="tpl.templateCode"
              />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">变量（JSON 格式）</label>
            <el-input
              v-model="variablesText"
              type="textarea"
              :rows="4"
              placeholder='{"userName": "张三"}'
              style="font-family: monospace"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </FormSection>

    <template #actions>
      <div class="send-actions">
        <span class="estimated-count">
          服务端确认人数：<strong>{{ serverCount }}</strong>
          <span v-if="countLoading" class="count-loading">（计算中…）</span>
        </span>
        <el-button @click="router.back()">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSend">
          发送
        </el-button>
      </div>
    </template>
  </StandardFormTemplate>
</template>

<style scoped>
.recipient-tabs {
  width: 100%;
}

.user-search {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-loading {
  font-size: 12px;
  color: #909399;
}

.candidate-list {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.candidate-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.candidate-item:hover {
  background: #f5f7fa;
}

.candidate-item:last-child {
  border-bottom: none;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-field__label {
  font-weight: 500;
  color: #303133;
}

.send-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.estimated-count {
  margin-right: auto;
  font-size: 14px;
  color: #606266;
}
.count-loading {
  color: #909399;
  font-size: 12px;
}
</style>
