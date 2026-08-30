# 该目录为生成产物，禁止手动编辑（do-not-edit）

类型由 `pnpm gen:api-types` 从后端 Swagger/OpenAPI 文档生成，命令见 `scripts/gen-api-types.mjs`。

接入步骤：

1. 拿到后端 Swagger 文档地址，例如 `http://<backend-host>/v3/api-docs`。
2. 执行 `SWAGGER_URL=<上述地址> pnpm gen:api-types`。
3. 生成的 `schema.d.ts` 会出现在本目录下，业务层通过 `contracts/` 下的我方类型间接使用，不直接引用生成产物的内部结构。

骨架阶段尚未接入真实后端，本目录暂无生成产物。
