/**
 * BF20261013-022②：脚本函数目录（流程脚本 / 表单脚本两套，供脚本弹窗分类展示）。
 * 每项：name=函数名（含 # 前缀的写法即 snippet 展示）、category=分类、
 * desc=问号悬停说明、snippet=点击插入到脚本输入框的用法片段。
 */

export interface ScriptFunctionDoc {
  name: string
  category: string
  desc: string
  snippet: string
}

/** 流程脚本可用函数（触发器 / 子流程判断 / 参与人表达式等）。 */
export const PROCESS_SCRIPT_FUNCTIONS: ScriptFunctionDoc[] = [
  {
    name: '#获取流程变量',
    category: '流程变量',
    desc: '读取流程变量。取值优先级：本脚本已写入 > 实例变量（含脚本/节点写入） > 授权变量快照；变量未授权或不存在时报错。示例：#获取流程变量(var_dept_ids)',
    snippet: '#获取流程变量(var_example)',
  },
  {
    name: '#设置流程变量',
    category: '流程变量',
    desc: '写入流程变量（本流程实例内，后续脚本与节点均可读取）。值支持 数字/文本/是-否/空/数组。示例：#设置流程变量(var_count, 1)',
    snippet: '#设置流程变量(var_example, 1)',
  },
  {
    name: '#获取部门负责人',
    category: '组织架构',
    desc: '按部门ID返回该部门负责人的用户ID；部门不存在或未设置负责人返回 null。示例：#获取部门负责人(#获取流程变量(var_dept))',
    snippet: '#获取部门负责人(1001)',
  },
  {
    name: '#获取分管领导',
    category: '组织架构',
    desc: '沿部门树向上找最近的、已设置负责人的上级部门（不含本部门），返回其负责人用户ID；找不到返回 null。',
    snippet: '#获取分管领导(1001)',
  },
  {
    name: '#获取上级部门',
    category: '组织架构',
    desc: '返回上级部门ID；根部门或未知部门返回 null。',
    snippet: '#获取上级部门(1001)',
  },
  {
    name: 'String',
    category: '通用',
    desc: '转为文本。示例：String(#获取流程变量(var_count))',
    snippet: 'String(value)',
  },
  {
    name: 'Number',
    category: '通用',
    desc: '转为数字（非数字文本转出 NaN）。示例：Number(#获取流程变量(var_count))',
    snippet: 'Number(value)',
  },
  {
    name: 'Boolean',
    category: '通用',
    desc: '转为是/否（JS 真值规则：0/空串/null 为否）。',
    snippet: 'Boolean(value)',
  },
]

/** 表单脚本可用函数（表单设计器「高级编辑（脚本）」）。 */
export const FORM_SCRIPT_FUNCTIONS: ScriptFunctionDoc[] = [
  {
    name: '#获取字段值',
    category: '字段值',
    desc: '读取同表单另一字段的当前值。示例：#获取字段值(field_a)',
    snippet: '#获取字段值(field_a)',
  },
  {
    name: '#设置字段值',
    category: '字段值',
    desc: '写入同表单另一字段的值。示例：#设置字段值(field_b, "固定值")',
    snippet: '#设置字段值(field_b, "值")',
  },
  {
    name: '#设置必填',
    category: '字段状态',
    desc: '切换字段必填（星标与提交校验随之生效）。示例：#设置必填(field_b, true)',
    snippet: '#设置必填(field_b, true)',
  },
  {
    name: '#设置隐藏',
    category: '字段状态',
    desc: '隐藏/显示字段（隐藏字段不参与校验、不进入提交）。示例：#设置隐藏(field_b, true)',
    snippet: '#设置隐藏(field_b, true)',
  },
  {
    name: '#设置只读',
    category: '字段状态',
    desc: '切换字段只读（不可编辑）。示例：#设置只读(field_b, true)',
    snippet: '#设置只读(field_b, true)',
  },
  {
    name: '#提示消息',
    category: '反馈',
    desc: '弹出提示消息。示例：#提示消息("请补充联系方式的备注")',
    snippet: '#提示消息("提示内容")',
  },
  {
    name: '#获取当前用户',
    category: '当前用户',
    desc: '返回当前登录用户ID。',
    snippet: '#获取当前用户()',
  },
  {
    name: '#获取当前用户姓名',
    category: '当前用户',
    desc: '返回当前登录用户显示名。',
    snippet: '#获取当前用户姓名()',
  },
  {
    name: '#获取当前部门',
    category: '当前用户',
    desc: '返回当前登录用户部门ID。',
    snippet: '#获取当前部门()',
  },
  {
    name: '#获取子表字段值',
    category: '子表',
    desc: '读取已授权子表的指定行、指定列。行号从 0 开始。',
    snippet: '#获取子表字段值(items, 0, qty)',
  },
  {
    name: '#设置子表字段值',
    category: '子表',
    desc: '修改已授权子表的指定行、指定列；只读详情与越权列会拒绝。',
    snippet: '#设置子表字段值(items, 0, qty, 2)',
  },
  {
    name: '#获取流程变量',
    category: '流程上下文',
    desc: '读取当前办理上下文已授权的流程变量。',
    snippet: '#获取流程变量(var_example)',
  },
  {
    name: '#获取流程状态',
    category: '流程上下文',
    desc: '读取当前流程实例状态；新建且未发起时返回空文本。',
    snippet: '#获取流程状态()',
  },
  {
    name: '#文本转大写',
    category: '转换',
    desc: '把文本值转为大写。',
    snippet: '#文本转大写(#获取字段值(code))',
  },
  {
    name: '#文本转小写',
    category: '转换',
    desc: '把文本值转为小写。',
    snippet: '#文本转小写(#获取字段值(code))',
  },
  {
    name: '#去除首尾空格',
    category: '转换',
    desc: '去除文本首尾空格。',
    snippet: '#去除首尾空格(#获取字段值(title))',
  },
  {
    name: '#文本转数字',
    category: '转换',
    desc: '把文本转为数字；非数字结果不可用于业务提交。',
    snippet: '#文本转数字(#获取字段值(amount))',
  },
  {
    name: '#调用集成',
    category: '受控集成',
    desc: '只调用当前表单和身份已授权的稳定集成标识；未授权、只读详情和参数对象不支持时返回明确错误。',
    snippet: '#调用集成(integration_key)',
  },
]
