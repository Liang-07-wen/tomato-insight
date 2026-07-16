# Render 部署说明

本项目已提供 [`render.yaml`](../render.yaml) 和 [`Dockerfile`](../Dockerfile)，可以直接从 GitHub 部署为 Render Web Service。

## 一键部署

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Liang-07-wen/tomato-insight)

1. 登录 Render，建议选择 **Sign in with GitHub**。
2. 打开上方一键部署链接。
3. 授权 Render 访问 `Liang-07-wen/tomato-insight`。
4. 确认 Blueprint 中的服务名称、区域和免费套餐。
5. 点击 **Apply**，等待 Docker 镜像构建和服务启动。
6. 部署成功后打开 Render 分配的 `onrender.com` 地址。

## Blueprint 配置

项目根目录的 `render.yaml` 已设置：

- 服务类型：Web Service
- 运行方式：Docker
- 套餐：Free
- 区域：Singapore
- 分支：`main`
- 健康检查：`/`
- 自动部署：主分支有新提交时触发
- 端口：使用 Render 提供的 `PORT`

## 手动创建服务

如果一键部署页面没有自动识别 Blueprint，可在 Render 控制台中执行：

1. 点击 **New +**。
2. 选择 **Web Service**。
3. 连接 GitHub 仓库 `Liang-07-wen/tomato-insight`。
4. Language 选择 **Docker**。
5. Branch 填写 `main`。
6. Region 选择距离较近的区域，例如 `Singapore`。
7. Instance Type 选择 **Free**。
8. Health Check Path 填写 `/`。
9. 点击 **Deploy Web Service**。

Dockerfile 会自动安装 Python 依赖、复制网站代码和两个 ONNX 模型，并使用 Gunicorn 监听 Render 分配的端口。

## 部署后检查

将 `https://你的服务名.onrender.com` 替换为实际地址，检查以下页面：

```text
/
/leaf
/fruit
/about
/developer
```

随后分别上传叶片与果实 JPG、PNG 或 WEBP 图片，确认检测结果、检测框和置信度可以正常显示。

## 免费服务注意事项

- 免费 Web Service 在一段时间没有访问后会休眠，首次重新访问需要等待实例唤醒。
- 免费实例使用临时文件系统，服务重新部署或重启后，上传图片、检测结果和历史记录可能重置。
- 两个 ONNX 模型随仓库和 Docker 镜像部署，不依赖额外模型下载服务。
- 如果需要长期保留上传、结果和历史记录，应后续接入对象存储或数据库。
