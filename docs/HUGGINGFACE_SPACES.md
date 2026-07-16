# Hugging Face Spaces 部署

Tomato Insight 可以使用 Docker SDK 部署到 Hugging Face Spaces，保留现有 Flask 页面、ONNX Runtime 推理和叶片/果实双模型检测功能。

## 部署结构

```text
GitHub
└─ 保存完整源码、模型、文档和版本历史

Hugging Face Spaces
└─ 使用 Docker 构建并运行 Flask + Gunicorn + ONNX Runtime
```

## 1. 注册并登录

注册 Hugging Face 账号：

<https://huggingface.co/join>

创建具有写入权限的用户访问令牌：

<https://huggingface.co/settings/tokens>

在项目目录执行：

```powershell
hf auth login
```

按提示粘贴访问令牌。令牌只用于本机 CLI 登录，不写入项目文件。

检查登录状态：

```powershell
hf auth whoami
```

## 2. 一键创建并上传 Space

可以先检查部署文件准备过程：

```powershell
.\scripts\deploy-huggingface-space.ps1 -SpaceId "你的用户名/tomato-insight" -DryRun
```

确认检查通过后执行正式上传：

在项目根目录执行：

```powershell
.\scripts\deploy-huggingface-space.ps1 -SpaceId "你的用户名/tomato-insight"
```

脚本执行以下操作：

1. 核对 Hugging Face 登录状态。
2. 创建公开的 CPU Basic Docker Space。
3. 在系统临时目录准备上传文件。
4. 生成包含 `sdk: docker` 和 `app_port: 7860` 的 Space 项目卡。
5. 上传 Flask 应用、网页资源、依赖和两个 ONNX 模型。
6. 输出 Space 页面地址。

## 3. 构建与启动

Space 收到文件后会自动开始 Docker 构建。可以在 Space 的 `Logs` 页面查看：

- 系统依赖安装
- Python 依赖安装
- Gunicorn 启动
- 模型加载或检测异常

构建成功后页面地址为：

```text
https://huggingface.co/spaces/你的用户名/tomato-insight
```

## 4. 更新部署

GitHub 项目更新并完成提交后，再次执行同一个部署命令：

```powershell
.\scripts\deploy-huggingface-space.ps1 -SpaceId "你的用户名/tomato-insight"
```

Hugging Face 会创建新提交并重新构建 Space。

## 5. 数据说明

免费 Space 的运行磁盘适合临时体验：

- 用户上传图片保存在容器运行目录。
- 检测结果和历史记录可能在 Space 重启后重置。
- 源码、页面资源和两个 ONNX 模型保存在 Space 仓库中。
- 项目未配置外部持久化存储，不用于长期保存访客上传数据。

## 6. 本地 Docker 验证

已安装 Docker 时可以先在本地运行：

```bash
docker build -t tomato-insight .
docker run --rm -p 7860:7860 tomato-insight
```

浏览器打开：

```text
http://127.0.0.1:7860/
```

## 7. 关键配置

- Space SDK：Docker
- 对外端口：7860
- 启动服务：Gunicorn
- Worker：1
- Threads：4
- 超时：180 秒
- 模型：`models/leaf/best.onnx`、`models/fruit/best.onnx`
