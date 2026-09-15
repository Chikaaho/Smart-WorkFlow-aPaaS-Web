<script setup lang="ts">
/**
 * IotScriptList — 受控脚本管理（P21 A4）。
 *
 * JS/Java 脚本创建、草稿编辑、语法/安全校验、试运行（默认无副作用）、发布、停用、执行记录。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listScripts,
  createScript,
  updateScriptDraft,
  validateScript,
  dryRunScript,
  publishScript,
  disableScript,
  listScriptExecs,
  type IotScript,
  type IotScriptExec,
} from '../api'

const loading = ref(false)
const list = ref<IotScript[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  code: '',
  name: '',
  language: 'JS',
  triggerType: 'MESSAGE',
  sourceCode: '',
  timeoutMs: 5000,
})

const execVisible = ref(false)
const execs = ref<IotScriptExec[]>([])
const execLoading = ref(false)

const isEmpty = computed(() => !loading.value && list.value.length === 0)

const JS_SAMPLE = `// handler(input) 为唯一入口；可用宿主函数：
// fun_publish / fun_subscribe / fun_getProperty / fun_setProperty /
// fun_emitEvent / fun_invokeAction / fun_startProcess / fun_log
function handler(input) {
  fun_log('INFO', '收到消息', { topic: input.topic });
  return { ok: true, deviceKey: input.deviceKey };
}`
const JAVA_SAMPLE = `import com.sw.ck.iot.script.api.IotJavaScript;
import com.sw.ck.iot.script.api.IotScriptApi;
import java.util.HashMap;
import java.util.Map;

public class DemoScript implements IotJavaScript {
    @Override
    public Object execute(IotScriptApi api, Map<String, Object> input) {
        api.funLog("INFO", "hello", null);
        Map<String, Object> out = new HashMap<>(input);
        out.put("ok", true);
        return out;
    }
}`

async function load() {
  loading.value = true
  try {
    list.value = await listScripts()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    code: '',
    name: '',
    language: 'JS',
    triggerType: 'MESSAGE',
    sourceCode: JS_SAMPLE,
    timeoutMs: 5000,
  })
  dialogVisible.value = true
}

function openEdit(row: IotScript) {
  editingId.value = row.id
  Object.assign(form, {
    code: row.code,
    name: row.name,
    language: row.language,
    triggerType: row.triggerType,
    sourceCode: '',
    timeoutMs: row.timeoutMs,
  })
  dialogVisible.value = true
}

async function save() {
  const body: Record<string, unknown> = { ...form }
  if (editingId.value) {
    await updateScriptDraft(editingId.value, body)
    ElMessage.success('草稿已更新（新版本）')
  } else {
    await createScript(body)
    ElMessage.success('脚本已创建')
  }
  dialogVisible.value = false
  void load()
}

async function handleValidate(row: IotScript) {
  const result = await validateScript(row.id)
  if (result.status === 'SUCCESS') ElMessage.success('校验通过')
  else ElMessage.error(`校验失败：${result.error}`)
}

async function handleDryRun(row: IotScript) {
  const exec = await dryRunScript(row.id, { topic: 'demo/topic', deviceKey: 'demo', payload: '{}' })
  if (exec.status === 'SUCCESS')
    ElMessage.success(`试运行成功（${exec.durationMs}ms）：${exec.outputJson ?? '无输出'}`)
  else ElMessage.error(`试运行 ${exec.status}：${exec.error}`)
}

async function handlePublish(row: IotScript) {
  try {
    await publishScript(row.id)
    ElMessage.success('已发布')
  } catch {
    ElMessage.error('发布失败：先通过校验')
  }
  void load()
}

async function handleDisable(row: IotScript) {
  await ElMessageBox.confirm(`停用脚本「${row.name}」？`, '停用', { type: 'warning' })
  await disableScript(row.id)
  ElMessage.success('已停用')
  void load()
}

async function openExecs(row: IotScript) {
  execLoading.value = true
  execVisible.value = true
  try {
    execs.value = await listScriptExecs(row.id)
  } finally {
    execLoading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">受控脚本</h3>
      <el-button type="primary" @click="openCreate">新增脚本</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="编码" min-width="120" />
      <el-table-column prop="name" label="名称" min-width="130" />
      <el-table-column prop="language" label="语言" width="70" />
      <el-table-column prop="triggerType" label="触发" width="90" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'PUBLISHED' ? 'success' : row.status === 'DISABLED' ? 'danger' : 'info'
            "
            size="small"
            >{{ row.status }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column label="版本" width="120">
        <template #default="{ row }">
          草稿 v{{ row.currentVersion }} / 发布 v{{ row.publishedVersion ?? '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleValidate(row as IotScript)">校验</el-button>
          <el-button size="small" @click="handleDryRun(row as IotScript)">试运行</el-button>
          <el-button
            v-if="row.status !== 'PUBLISHED'"
            size="small"
            type="success"
            @click="handlePublish(row as IotScript)"
            >发布</el-button
          >
          <el-button
            v-if="row.status !== 'DISABLED'"
            size="small"
            type="danger"
            @click="handleDisable(row as IotScript)"
            >停用</el-button
          >
          <el-button size="small" @click="openExecs(row as IotScript)">执行记录</el-button>
          <el-button size="small" @click="openEdit(row as IotScript)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无脚本" />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑草稿（生成新版本）' : '新增脚本'"
      width="760px"
    >
      <el-form label-width="80px">
        <el-form-item label="编码" required
          ><el-input v-model="form.code" :disabled="!!editingId"
        /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="语言">
          <el-radio-group v-model="form.language" :disabled="!!editingId">
            <el-radio value="JS">JavaScript</el-radio>
            <el-radio value="JAVA">Java</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="触发类型">
          <el-select v-model="form.triggerType">
            <el-option label="消息 MESSAGE" value="MESSAGE" />
            <el-option label="规则 RULE" value="RULE" />
            <el-option label="手动 MANUAL" value="MANUAL" />
          </el-select>
        </el-form-item>
        <el-form-item label="超时(ms)"
          ><el-input-number v-model="form.timeoutMs" :min="500" :max="30000" :step="500"
        /></el-form-item>
        <el-form-item label="源码">
          <el-input v-model="form.sourceCode" type="textarea" :rows="18" spellcheck="false" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button @click="form.sourceCode = form.language === 'JS' ? JS_SAMPLE : JAVA_SAMPLE"
          >填入示例</el-button
        >
        <el-button type="primary" @click="save">保存草稿</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="execVisible" title="脚本执行记录" width="720px">
      <el-table v-loading="execLoading" :data="execs" stripe size="small">
        <el-table-column prop="scriptVersion" label="版本" width="60" />
        <el-table-column prop="triggerSource" label="来源" width="90" />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="durationMs" label="耗时(ms)" width="90" />
        <el-table-column prop="outputJson" label="输出" min-width="180" show-overflow-tooltip />
        <el-table-column prop="error" label="错误" min-width="160" show-overflow-tooltip />
        <el-table-column prop="createTime" label="时间" min-width="150" />
      </el-table>
    </el-dialog>
  </div>
</template>
