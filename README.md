# dsh-project-progress

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(DSH)的工作区加一份**共享项目进展文档**:每个工作区根目录一份 `PROGRESS.md`,所有会话共享,新会话开局自动读到项目状态,会话结束自动记录进展。

## 它能做什么

每个工作区一份 `PROGRESS.md`,分两个区:

- **项目档案**:稳定事实——发布状态、GitHub 仓库地址、DSH 插件社区规则、发布/同步流程、安装命令,由模型通过 `project_facts` 工具维护;
- **进展时间线**:只追加的条目——顶层会话结束时自动写一条(标题、轮次/步骤、token 用量),也可以随时用 `project_update` 手动追加"做了什么、结果如何、下一步"。

每个新会话的系统提示词里会注入这份文档(章节 `project-progress`,order 60),所以智能体一开局就知道项目到哪了、发布要遵守什么规则。三个模型工具:

- `project_status` — 读取当前工作区的共享文档;
- `project_update` — 向时间线追加一条进展;
- `project_facts` — 整体替换「项目档案」区(发布状态、社区规则、发布流程等)。

## 安装

### 方式一(最简):一条命令

```sh
dsh plugin --profile web add https://github.com/Jolly-J/dsh-project-progress.git
```

装完重启 `dsh web` 即可(插件自动作为 profile 层加入组合;`lib/` 产物已随仓库提交,无需本地构建)。

### 方式二:让 AI 帮你装

把本仓库地址发给你的 DSH 智能体,对它说一句:

> 帮我把这个插件装到我的 DSH 里:<仓库地址>

你的智能体照着下面 6 步做完,重启 `dsh web` 就好了:

1. 把本仓库放到 DSH 项目的 `packages/extensions/dsh-project-progress`;
2. 在 `packages/bundle/web-app/cordis.patch.yml` 里加一行:
   ```yaml
   - id: dsh-project-progress
     name: 'dsh-project-progress'
   ```
3. 在 `packages/bundle/web-app/package.json` 的 `dependencies` 里加:
   ```json
   "dsh-project-progress": "workspace:^"
   ```
4. 在根目录 `tsconfig.host.json` 的 `references` 里加 `{ "path": "./packages/extensions/dsh-project-progress" }`;
5. 运行 `pnpm install`,然后构建:`pnpm --filter dsh-project-progress bundle`;
6. 重启 `dsh web`。

> 要求:DSH 项目本身能正常构建,`pnpm` 版本 11.7.0(和 DSH 的 `packageManager` 一致)。

## 数据与隐私

- 全部读写都发生在**你本机的工作区**里:只创建/更新工作区根目录的 `PROGRESS.md`,一个纯 Markdown 文件,可随时自己编辑或删除;
- **没有网络调用**,不上传任何内容,不读取任何密钥;
- 只对顶层会话自动追加进展(子代理会话不写),手动记录完全由你(或模型)决定。

## 已知限制

- **只覆盖同一个工作区**——文档就在工作区根目录,不跨工作区聚合;
- **自动条目是结构化的**——会话结束时自动写的是标题与用量统计,自然语言总结请用 `project_update`;
- **时间线只追加**——旧条目不重写,更正请追加新条目,或整体重写「项目档案」区;
- 文案目前是中文。

## License

[MIT](LICENSE)
