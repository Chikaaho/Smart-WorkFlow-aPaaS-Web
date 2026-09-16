<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotScriptList — 受控脚本管理（P21 A4）。
 *
 * JS/Java 脚本创建、草稿编辑、语法/安全校验、试运行（默认无副作用）、发布、停用、执行记录。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
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
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
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

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && list.value.length === 0,
)

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
  loadError.value = ''
  try {
    list.value = await listScripts()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
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
    ElMessage.success(t('iot.draftUpdatedNewVersion'))
  } else {
    await createScript(body)
    ElMessage.success(t('iot.scriptCreated'))
  }
  dialogVisible.value = false
  void load()
}

async function handleValidate(row: IotScript) {
  const result = await validateScript(row.id)
  if (result.status === 'SUCCESS') ElMessage.success(t('iot.validationPassed'))
  else ElMessage.error(t('iot.validationFailed', { error: result.error }))
}

async function handleDryRun(row: IotScript) {
  const exec = await dryRunScript(row.id, { topic: 'demo/topic', deviceKey: 'demo', payload: '{}' })
  if (exec.status === 'SUCCESS')
    ElMessage.success(
      t('iot.scriptDryRunSuccess', {
        durationMs: exec.durationMs,
        output: exec.outputJson ?? t('iot.noOutput'),
      }),
    )
  else ElMessage.error(t('iot.dryRunFailed', { status: exec.status, error: exec.error }))
}

async function handlePublish(row: IotScript) {
  try {
    await publishScript(row.id)
    ElMessage.success(t('common.statusPublished'))
  } catch {
    ElMessage.error(t('iot.publishNeedsValidation'))
  }
  void load()
}

async function handleDisable(row: IotScript) {
  await ElMessageBox.confirm(
    t('iot.confirmDisableScript', { name: row.name }),
    t('common.disable'),
    { type: 'warning' },
  )
  await disableScript(row.id)
  ElMessage.success(t('common.statusDisabled'))
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
      <h3 style="margin: 0">{{ t('iot.scriptListTitle') }}</h3>
      <el-button type="primary" @click="openCreate">{{ t('iot.newScript') }}</el-button>
    </div>
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="load-error"
    >
      <template #default>
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" :label="t('common.code')" min-width="120" />
      <el-table-column prop="name" :label="t('common.name')" min-width="130" />
      <el-table-column prop="language" :label="t('common.language')" width="70" />
      <el-table-column prop="triggerType" :label="t('iot.trigger')" width="90" />
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'PUBLISHED' ? 'success' : row.status === 'DISABLED' ? 'danger' : 'info'
            "
            size="small"
            >{{ enumLabel('IOT_RELEASE_STATE', row.status) }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column :label="t('common.version')" width="120">
        <template #default="{ row }">
          {{
            t('iot.scriptVersionPairLabel', {
              draftVersion: row.currentVersion,
              publishedVersion: row.publishedVersion ?? '—',
            })
          }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleValidate(row as IotScript)">{{
            t('iot.validate')
          }}</el-button>
          <el-button size="small" @click="handleDryRun(row as IotScript)">{{
            t('iot.dryRun')
          }}</el-button>
          <el-button
            v-if="row.status !== 'PUBLISHED'"
            size="small"
            type="success"
            @click="handlePublish(row as IotScript)"
            >{{ t('common.publish') }}</el-button
          >
          <el-button
            v-if="row.status !== 'DISABLED'"
            size="small"
            type="danger"
            @click="handleDisable(row as IotScript)"
            >{{ t('common.disable') }}</el-button
          >
          <el-button size="small" @click="openExecs(row as IotScript)">{{
            t('iot.executionRecords')
          }}</el-button>
          <el-button size="small" @click="openEdit(row as IotScript)">{{
            t('common.edit')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" :description="t('iot.noScripts')" />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('iot.editScriptDraft') : t('iot.newScript')"
      width="760px"
    >
      <el-form label-width="80px">
        <el-form-item :label="t('common.code')" required
          ><el-input v-model="form.code" :disabled="!!editingId"
        /></el-form-item>
        <el-form-item :label="t('common.name')" required
          ><el-input v-model="form.name"
        /></el-form-item>
        <el-form-item :label="t('common.language')">
          <el-radio-group v-model="form.language" :disabled="!!editingId">
            <el-radio value="JS">JavaScript</el-radio>
            <el-radio value="JAVA">Java</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('iot.triggerType')">
          <el-select v-model="form.triggerType">
            <el-option :label="t('iot.triggerTypeMessage')" value="MESSAGE" />
            <el-option :label="t('iot.triggerTypeRule')" value="RULE" />
            <el-option :label="t('iot.triggerTypeManual')" value="MANUAL" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('iot.timeoutMs')"
          ><el-input-number v-model="form.timeoutMs" :min="500" :max="30000" :step="500"
        /></el-form-item>
        <el-form-item :label="t('iot.sourceCode')">
          <el-input v-model="form.sourceCode" type="textarea" :rows="18" spellcheck="false" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button @click="form.sourceCode = form.language === 'JS' ? JS_SAMPLE : JAVA_SAMPLE">{{
          t('iot.insertSample')
        }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.saveDraft') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="execVisible" :title="t('iot.executionRecordsTitle')" width="720px">
      <el-table v-loading="execLoading" :data="execs" stripe size="small">
        <el-table-column prop="scriptVersion" :label="t('common.version')" width="60" />
        <el-table-column prop="triggerSource" :label="t('common.source')" width="90" />
        <el-table-column prop="status" :label="t('common.status')" width="90" />
        <el-table-column prop="durationMs" :label="t('common.durationMs')" width="90" />
        <el-table-column
          prop="outputJson"
          :label="t('iot.output')"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column
          prop="error"
          :label="t('common.error')"
          min-width="160"
          show-overflow-tooltip
        />
        <el-table-column prop="createTime" :label="t('common.time')" min-width="150" />
      </el-table>
    </el-dialog>
  </div>
</template>
