<script setup lang="ts">
/**
 * FormDefList — 表单定义列表页（页型B）。
 *
 * 套 StandardListTemplate，接 GET /api/form/def/page 分页端点。
 * 提供「新建」「编辑」入口，跳转 form-designer 路由。
 *
 * 本页面不碰第四刀核心逻辑（draft-actions / definition-convert / FormDesigner 灰化逻辑）。
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/foundation/request'
import { pageFormDefs } from '@/modules/form/api/form-def'
import { getFormDefStatusLabel, getFormDefStatusType } from '@/modules/form/utils/form-def-status'
import type { FormDefListItem } from '@/modules/form/api/form-def'
import type { PageQuery } from '@/contracts/common'
import { StandardListTemplate } from '@/components/page-layout'

const router = useRouter()

// ─── 列表状态 ───

const list = ref<FormDefListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// 搜索
const keyword = ref('')
const currentKeyword = ref('')

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageFormDefs(pageQuery, currentKeyword.value || undefined)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载表单定义列表失败'
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentKeyword.value = keyword.value.trim()
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  keyword.value = ''
  currentKeyword.value = ''
  pageNum.value = 1
  void loadList()
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 操作 ───

function goCreate() {
  // P52：用 path 而非 name —— 菜单动态路由与工作台静态路由不同名，
  // path 直达带 :id 的工作台路由，避免同名替换导致的参数丢失。
  void router.push('/form/designer')
}

function goEdit(row: FormDefListItem) {
  void router.push(`/form/designer/${row.id}`)
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function editRow(r: unknown) {
  goEdit(r as FormDefListItem)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="表单管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="goCreate">新建表单</el-button>
    </template>

    <!-- 筛选区：名称搜索 -->
    <template #filter>
      <el-input
        v-model="keyword"
        placeholder="表单名称 / 标识"
        clearable
        style="width: 240px"
        @keyup.enter="handleQuery"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </template>

    <!-- 表格 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" label="表单名称" min-width="160" />
      <el-table-column prop="formKey" label="业务标识" min-width="140" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getFormDefStatusType(row.status)" size="small">
            {{ getFormDefStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="180" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态 -->
    <template #empty-action>
      <el-button type="primary" @click="goCreate">新建表单</el-button>
    </template>
  </StandardListTemplate>
</template>
