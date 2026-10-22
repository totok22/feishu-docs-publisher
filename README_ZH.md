# 飞书文档发布器 (Feishu Docs Publisher)

[English](./README.md) | 简体中文

通过本机 `lark-cli` 将 Markdown 笔记、目录和 PDF 发布到飞书 / Lark 云文档，并保持同步。

适合把 Obsidian 作为本地写作源，再把内容同步给团队在飞书 / Lark 中阅读、协作和评论。

---

## 网络与第三方账号披露

- **第三方账号**：同步需要飞书或 Lark 账号。登录、退出和重新授权都可以在插件设置的「CLI 与授权」中完成；插件只调用本机 [`lark-cli`](https://github.com/larksuite/cli)，不收集应用密钥。
- **网络访问**：安装或升级 `lark-cli` 时，插件会调用本机 npm 访问 npm Registry，并由 `@larksuite/cli` 的安装脚本下载对应平台的官方程序。发布、同步、覆盖、查找链接和版本检查会调用 `lark-cli`，向飞书 / Lark 官方 Open API 发送 HTTPS 请求（飞书账号使用 `open.feishu.cn`，Lark 账号使用 `open.larksuite.com`）。手动同步或发布时会发起请求；开启「保存后同步」或 Git `pre-push` hook 后，这些操作也会发起请求。插件没有单独的统计上报通道。
- **凭据存储**：登录凭据保存在本机 `lark-cli` 的认证存储中。本插件不会把应用密钥或 access token 写入笔记、`data.json` 或日志。文档 URL 和绑定保存在插件数据中；开启对应设置时，也会写入笔记 frontmatter。

---

## 来源与致谢

本项目基于 [wanghuan9/obsidian-feishu-lark-cli-sync](https://github.com/wanghuan9/obsidian-feishu-lark-cli-sync)（作者 huan.wang，GitHub 用户 wanghuan）按 MIT 许可证派生。原仓库和原作者的 GitHub 账号已不可用。原插件「Feishu Lark CLI Sync」已在 Obsidian 社区插件目录中归档。本项目从 0.1.26 继续开发，由 [totok22](https://github.com/totok22) 维护，并增加了已发布链接管理、PDF 同步与去重等相关能力，插件 ID 改为 `feishu-docs-publisher`。本项目与原作者没有官方隶属关系。它与 [zktww/feishu-lark-sync](https://github.com/zktww/feishu-lark-sync)（「Feishu Lark Sync」）无关，后者是独立代码库。原作者版权保留在 `LICENSE` 中。

---

## 从 Feishu Lark CLI Sync 迁移

插件 ID 从 `feishu-lark-cli-sync` 改为 `feishu-docs-publisher`，因此 Obsidian 会把数据放在新目录。桌面端启动时，如果 `.obsidian/plugins/feishu-docs-publisher/data.json` 还不存在，插件会在旧目录 `.obsidian/plugins/feishu-lark-cli-sync/` 中找到 `data.json` 和 `lark-sync-state.json` 时把它们复制过来。旧目录保持原样，不会被删除或修改。

启用新插件后，请禁用已归档的旧插件，避免两份数据同时同步同一批笔记。

Git `pre-push` hook 在新目录已有 `data.json` 时读取新目录，否则回退到旧目录。用本插件或其前身安装过 hook 时，打开一次 Obsidian 会刷新 hook 辅助脚本。如果设置页里的 Git Hook 状态不是已安装，请在设置中重新安装 hook。

如果希望在打开 Obsidian 之前就放好文件：

```bash
mkdir -p "/path/to/your/vault/.obsidian/plugins/feishu-docs-publisher"
cp "/path/to/your/vault/.obsidian/plugins/feishu-lark-cli-sync/data.json" \
  "/path/to/your/vault/.obsidian/plugins/feishu-docs-publisher/data.json"
cp "/path/to/your/vault/.obsidian/plugins/feishu-lark-cli-sync/lark-sync-state.json" \
  "/path/to/your/vault/.obsidian/plugins/feishu-docs-publisher/lark-sync-state.json"
```

不存在的文件可以跳过。新目录里已经存在的文件不会被覆盖。

---

## 安装方法

需要 Obsidian 1.13.0 或更高版本的桌面端。

### 方式一：社区插件

审核上架后：

1. 打开 **设置 → 社区插件**。
2. 关闭安全模式，点击「浏览」。
3. 搜索 `Feishu Docs Publisher`，点击「安装」并「启用」。

### 方式二：从 Release 手动安装

1. 从 [GitHub Releases](https://github.com/totok22/feishu-docs-publisher/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在库中创建 `.obsidian/plugins/feishu-docs-publisher/`。
3. 把这三个文件放入该目录。
4. 重新加载社区插件并启用 **Feishu Docs Publisher**。

Git hook 脚本已嵌入 `main.js`，安装 hook 时会写入 `.git/hooks`。通过社区插件或 Release 安装时，插件目录不需要额外的脚本文件。

### 方式三：从源码构建

```bash
git clone https://github.com/totok22/feishu-docs-publisher.git
cd feishu-docs-publisher
npm install
npm run build
./install.sh "/path/to/your/vault"
```

安装脚本会把构建结果复制到 `.obsidian/plugins/feishu-docs-publisher/`。如果该库已经安装过本插件的 hook，脚本会刷新 hook 辅助脚本。重启 Obsidian 后启用 **Feishu Docs Publisher**。

启用后按下一节的「首次使用」在插件设置中安装、配置并登录 `lark-cli`，不需要在终端执行依赖安装命令。

GitHub 仓库名和库内插件目录都是 `feishu-docs-publisher`。

---

## 首次使用

首次使用时不需要打开终端。打开 Obsidian 设置中的 **Feishu Docs Publisher → CLI 与授权**，按页面状态操作：

1. 如果未找到 npm，点击「下载 Node.js」，完成 Node.js 安装后回到设置页点击「重新检测」。
2. 点击「安装 lark-cli」。以后有更新时，同一位置会显示版本并可升级。
3. 首次使用且未配置 CLI 应用时，在「CLI 应用配置」选择飞书或 Lark，点击「创建应用」，在浏览器完成官方创建流程。
4. 点击「登录 / 重新授权」，在浏览器确认所需权限。成功后会显示当前登录用户；需要切换账号时，先「退出登录」再重新授权。

插件要求 `lark-cli > 1.0.53`。版本过低可能导致新建文档标题为 `Untitled`，或在同步时报错；设置页会直接提示并允许升级。

如果自动探测不到可执行文件，可在「lark-cli 路径」中填写绝对路径。设置页还会显示 npm 与 CLI 的版本、最新版本和登录状态。

### 网络代理

设置中的「网络代理」有三档：

- **继承系统环境变量（推荐）**：沿用当前环境的 `HTTPS_PROXY`、`HTTP_PROXY` 或 `ALL_PROXY`。
- **使用自定义 HTTP 代理**：填写主机和端口，例如 `127.0.0.1` 和 `7890`。
- **不使用代理**：插件启动的 CLI 和 npm 子进程会忽略代理环境变量。

代理设置只作用于本插件启动的 `lark-cli`、npm 以及 Git `pre-push` hook 中的同步进程，不修改操作系统或 `lark-cli` 的全局配置。插件不会把代理用户名或密码写入插件数据。

---

## 使用

### 单篇同步

Markdown、PDF 和文件夹的右键菜单提供四个入口：

- `Lark: 同步到飞书`：同步当前笔记、PDF 或目录；没有绑定时首次发布。
- `Lark: 覆盖同步到飞书`：按本地内容覆盖，并清理对应远端父目录中的其他同名文档。
- `Lark: 设置飞书链接`：绑定已有的飞书文档、PDF 或目录。
- `Lark: 打开飞书链接`：打开已绑定的远端页面；没有链接时不可用。

命令面板中的「覆盖同步到飞书」执行相同的单篇覆盖操作。一个远端文件只能绑定一个本地文件。设置链接、恢复绑定和同步前都会检查冲突；已有共享绑定时，需要先改成互不冲突的链接。

手动覆盖会保留已绑定文档。没有绑定时，会从同名文档中选择一个固定目标，先保存绑定并确认本地内容已写入，再删除同一远端父目录中的其他同名文档。普通同步、保存后同步和 Git hook 不会删除同名文档。已被另一个本地文件绑定的远端文档也不会被删除。

如果待删除的 Wiki 文档还有子页面，插件会先把子页面移到保留文档下。目录覆盖会递归覆盖 Markdown 和 PDF，并把目录文档正文重置为原生子页面列表。同级笔记如果使用相同文档标题，覆盖会停止并提示修改标题。

![操作入口](./docs/images/obsidian-actions.png)

同步方向是单向的：Obsidian Markdown 是源内容，飞书 / Lark 文档是输出结果。

绑定保存在插件数据中。开启「写入 frontmatter 绑定信息」时，还会写入以下可选字段：

```yaml
---
lark_doc_url: "https://example.feishu.cn/docx/xxxx"
---
```

### 本地图片

```md
![[diagram.png]]
![[diagram.png|600]]
![[diagram.png|600x400]]
![架构图](../assets/diagram.png)
```

支持 PNG、JPEG/JPG、GIF、WebP 和 BMP。图片必须位于当前库内。HTTP(S) 图片仍由 Markdown 导入处理。保存后同步和 Git pre-push 会在图片文件单独变化时，同步引用它的已绑定笔记。

### 目录同步

在目录上右键，选择 `Lark: 同步到飞书`。插件会创建对应的远端层级，同步 Markdown 和 PDF，并把上传正文中的 Markdown 内部链接改写成远端文档引用。

没有被任何笔记引用的图片不会出现在飞书里，所以目录同步会把它们收集到一篇自动生成的 `<目录名> 图片.md` 中。这篇笔记与图片放在同一目录，用 `![[路径]]` 嵌入每张未引用的图片，并和其他笔记一样发布。已被笔记嵌入的图片会跳过。之后再次同步目录时，笔记会随图片的新增、删除或被引用而刷新。可以重命名这篇笔记，插件靠第一行的隐藏注释识别它。

在设置中打开「删除本地已不存在的飞书文件」（默认关闭），目录同步还会清理你在本地删除或移走的文件。目录同步成功后，插件会列出该目录下由它发布、但本地文件已不存在的飞书文档和 PDF，你确认后才会删除。只处理有发布记录的文件，你在飞书里手动创建的文档不会被删。在 Obsidian 之外移动的笔记，只要还有现存笔记指向同一篇远端文档就会保留；下面还有子页面的 Wiki 文档会跳过。本地一侧靠 Git 历史兜底，插件无法恢复已删除的远端文件。

目标是 Wiki（`/wiki/...`）或个人文档库时，每一级目录本身也是文档。插件会在各级目录文档中插入飞书 / Lark 原生子页面列表。列表中的文档链接由飞书 / Lark 维护；插件不生成这些链接，也不嵌入子文档正文。

普通目录同步会复用已有列表，并保留目录页上的其他内容。目录覆盖会把目录页正文重置为原生子页面列表。Drive 目标（`/drive/folder/...`）使用普通文件夹，不插入列表。

支持的链接形式：

```md
详细设计见 02-database.md。
[组件设计](03-components.md#section)
[[04-api|接口设计]]
```

本地笔记不会因为链接改写而被修改。

### 忽略文件和文件夹

想让同步文件夹里的部分笔记、PDF 或子文件夹不同步到飞书，把它们写进该文件夹里的 `.feishuignore` 文件。写法和 `.gitignore` 一样：每行一条规则，支持 `*`、`**` 通配符，末尾加 `/` 只匹配文件夹，`!` 开头表示恢复同步，`#` 开头是注释。规则相对于这个文件所在的文件夹，越深层的文件优先级越高（库根目录的 `.feishuignore` 对整个库生效）。它就是一个普通文件，可以手写、提交到 Git，或复制到别的文件夹、别的库里复用。

```gitignore
# Projects/Alpha/.feishuignore
/Drafts/
*.draft.md
!/Drafts/keep.md
```

也可以不手写，直接用「同步忽略」页面：右键文件夹选择「Lark: 选择忽略的文件」，或在「已发布文件」窗口、命令面板、插件设置里进入，再选择要同步的文件夹。页面只显示这个文件夹，并用一棵树列出里面的内容，取消勾选某个文件或子文件夹即可忽略，重新勾选就恢复同步。文件夹里只有部分内容被取消勾选时会显示半选状态；取消勾选整个子文件夹，则里面所有内容（包括之后新增的文件）都会被忽略。页面会把对应的规则写进该文件夹的 `.feishuignore`；「编辑规则文件」可以查看和修改原始文本，「更换文件夹」切换到另一个文件夹，「清空规则」清空当前文件夹的规则文件。

被忽略的内容会被目录同步、保存时自动同步和 Git pre-push 跳过。已经在飞书里的内容不会被删除，只被已忽略笔记嵌入的图片也不会上传。用命令或文件菜单手动同步单篇笔记仍然可用。如果 `.feishuignore` 读取失败，同步会中止，而不是在没有规则的情况下继续发布。Obsidian 的文件列表不显示以点开头的文件，请用这个页面或外部编辑器修改它。

### 已发布文件

点击左侧纸飞机图标，或使用命令面板，打开「已发布文件」。复制链接和查看记录都在这个窗口中。

每一行显示文件名和本地路径。使用「在飞书打开」查看文件。「更多」菜单提供复制链接、打开本地文件、同步、设置链接和移除已保存链接。移除记录后，本地文件和飞书文件都会保留。

旧版本在关闭 frontmatter 时可能没有记下链接。使用「查找已有链接」，按文件名在已关联的飞书目录中匹配。多个同名文件需要手动设置链接。此操作不会创建飞书文件。

### PDF 文件

目录同步把 PDF 作为原生文件上传到对应的 Drive 文件夹或知识库节点。PDF 右键也可以单独上传；默认目标为空时，单个 PDF 上传到 Drive 根目录。

支持的 PDF 引用：

```md
[[规格书/报告.pdf]]
![[规格书/报告.pdf]]
[[报告.pdf|查看规格书]]
![[报告.pdf#page=2]]
[查看规格书](规格书/报告.pdf)
```

PDF 上传成功后，目录同步会把这些引用改写成飞书 / Lark 原生文件引用。单篇首次发布、手动同步和保存后同步也会复用已有 PDF 绑定。PDF 不在当前同步目录中时，请先单独上传，或在同步笔记前绑定已有远端 URL。本地双链和嵌入保持原样。

飞书 / Lark 显示远端 PDF 文件名。别名、页码和预览尺寸不会保留；嵌入也会变成可点击的文件引用。PDF 不会转换成 Docx，也不会在正文中展开预览。未发布、待确认、缺失和代码示例中的引用保持原文。同名文件按 Obsidian 的链接解析结果处理。

Git hook 也会复用 PDF 绑定，并按库路径或相对笔记的路径改写引用。其他目录中的短文件名需要 Obsidian 解析；使用 hook 时请写上路径。

持久绑定和内容哈希会跳过未变化的 PDF。内容变化时覆盖同一个 file token，链接保持不变。本地重命名会迁移关联，远端文件名保持原样。PDF 通过手动操作或目录同步更新；保存后同步和 Git hook 仍只处理 Markdown 及其引用的图片。

手动覆盖 PDF 时，即使本地文件未变化，也会覆盖同一个远端文件。没有绑定时会先复用同名文件；上传成功后再删除该远端父目录中的其他同名 PDF。

上传超时会保留待确认记录，并停止盲目重试。请先在绑定编辑器中核对已有远端文件，再重试。如果确认没有创建远端文件，可以断开待确认记录后重新上传。

### 自动同步

自动同步只处理已经绑定的文档。请先用 `Lark: 同步到飞书` 发布一次并保存绑定，之后的保存后同步或 Git hook 才能更新该文件。是否写入 frontmatter 不影响绑定。

#### 触发方式

- `关闭`：只手动同步。
- `保存后同步`：Obsidian 运行期间，已绑定的 Markdown 在保存后同步。
- `Git pre-push hook`：执行 `git push` 前同步已绑定的 Markdown。

「保存后同步」依赖 Obsidian 收到文件变更事件。在 Obsidian 内编辑，或在 Obsidian 打开该库时用其他编辑器修改，都会触发。Obsidian 关闭时不会触发。

「Git pre-push hook」只依赖 `git push`。在设置页的 `Git Hook` 区域安装。同步失败时，本次 `git push` 会被阻断。

---

## 设置

- `CLI 与授权`：安装或升级 `lark-cli`、创建 CLI 应用、登录/重新授权、退出登录和查看版本状态。
- `网络代理`：选择系统代理、自定义 HTTP 主机与端口，或关闭代理。
- `默认上传位置`：Wiki URL、Wiki 节点 token、文件夹 token；留空则上传到个人文档库。
- `标题来源`：使用第一个 Markdown 标题，或使用文件名。
- `写入 frontmatter 绑定信息`：额外把远端 URL 写入笔记 frontmatter。插件数据中的绑定始终保留。
- `同步策略`：默认自动。小改动增量同步；较大、较复杂或不适合增量的改动会全量覆盖。
- `同步状态缓存`：为精确同步保留多少篇文档的状态。

## 增量同步与远端历史

插件把 Markdown 拆成顶层块，并记录它们在飞书 / Lark 中的 block id。之后的同步会更新发生变化的块，例如替换、插入或删除段落，而不重写整篇文档，因此飞书 / Lark 可以保留对应历史。选择覆盖时，或自动策略判断改动过大、过复杂时，才会重写远端文档。

![远端历史](./docs/images/lark-history.png)

发布绑定和待确认记录保存在 `.obsidian/plugins/feishu-docs-publisher/data.json`，不会随同步状态缓存裁剪而丢失。

精确同步状态保存在：

```text
.obsidian/plugins/feishu-docs-publisher/lark-sync-state.json
```

## 说明

- 自动同步只处理已绑定笔记，不会发布未绑定文件。
- 如果远端文档被手动修改过，请先把这些修改合并回本地 Markdown。本地 Markdown 是内容来源。

## 变更记录与发布

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)。每个 GitHub Release 的正文来自 [`release-notes/`](./release-notes/) 中同版本的文件。

发布新版本时：

1. 在 `CHANGELOG.md` 中加入该版本，并创建 `release-notes/<版本>.md`，文件第一行必须是 `# <版本>`。
2. 运行 `npm version <版本> --no-git-tag-version`。这会更新 `package.json`、`package-lock.json`、`manifest.json` 和 `versions.json`。
3. 运行 `npm run check` 和 `npm run release:check`。
4. 提交并推送改动，然后推送与版本号完全一致、不带 `v` 前缀的标签，例如 `0.3.0`。
5. `.github/workflows/release.yml` 会核对标签和发布说明，运行测试与生产构建，为三个插件文件生成构建证明，并用对应的发布说明创建草稿 Release。审核后发布该草稿。

## 开发

```bash
npm install
npm test
npm run build
```

`npm test` 会做类型检查并运行测试。`npm run build` 生成 `main.js`，该文件已加入 `.gitignore`。`npm run check` 会依次运行测试和生产构建。

## 许可

MIT 许可证。Copyright (c) 2026 huan.wang 与 Copyright (c) 2026 totok22。详见 `LICENSE`。
