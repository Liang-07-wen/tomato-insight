# Tomato Insight API

本文档说明 Tomato Insight 当前提供的主要 Web 接口。

## 会话标识

系统使用会话标识区分上传图片、检测结果和历史记录。客户端可以通过以下任一方式传递：

- 请求参数或表单字段：`session_id`
- 请求头：`X-Session-Id`

未提供时，后端会生成新的 UUID。

## `GET /session`

初始化或恢复当前会话，并返回会话标识和存储清理状态。

```bash
curl http://127.0.0.1:5000/session
```

## `POST /detect`

上传图片并执行叶片或果实检测，请求格式为 `multipart/form-data`。

| 字段 | 必填 | 说明 |
|---|---|---|
| `image` | 是 | JPG、JPEG、PNG 或 WEBP 图片 |
| `detect_type` | 是 | `leaf` 或 `fruit` |
| `mode` | 否 | `normal` 或 `enhanced`，默认 `normal` |
| `session_id` | 否 | 客户端会话标识 |

叶片普通检测：

```bash
curl -X POST http://127.0.0.1:5000/detect \
  -F "image=@demo-leaf.jpg" \
  -F "detect_type=leaf" \
  -F "mode=normal"
```

果实增强检测：

```bash
curl -X POST http://127.0.0.1:5000/detect \
  -F "image=@demo-fruit.jpg" \
  -F "detect_type=fruit" \
  -F "mode=enhanced"
```

成功响应主要字段：

```json
{
  "success": true,
  "session_id": "SESSION_ID",
  "detect_type": "leaf",
  "detect_mode": "normal",
  "detections": [
    {
      "class_id": 0,
      "class_name": "CLASS_NAME",
      "label_zh": "中文标签",
      "confidence": 0.95,
      "box": [10, 20, 200, 240],
      "advice": "辅助建议"
    }
  ],
  "input_url": "/static/uploads/SESSION_ID/images/INPUT_IMAGE",
  "result_url": "/static/results/SESSION_ID/images/RESULT_IMAGE",
  "result": "检测结果文字",
  "suggestion": "辅助建议文字"
}
```

| 状态码 | 说明 |
|---:|---|
| 200 | 检测完成 |
| 400 | 缺少图片、格式不支持或参数错误 |
| 500 | 检测过程发生异常 |
| 501 | 检测器实现异常 |
| 503 | 模型、标签或运行依赖不可用 |

## `GET /history`

读取当前会话中 `leaf` 或 `fruit` 类型的历史记录。

```bash
curl "http://127.0.0.1:5000/history?target=leaf" \
  -H "X-Session-Id: SESSION_ID"
```

## `DELETE /history`

清空当前会话中指定类型的历史记录及对应运行文件。

```bash
curl -X DELETE "http://127.0.0.1:5000/history?target=fruit" \
  -H "X-Session-Id: SESSION_ID"
```

## 文件格式限制

系统只接受 JPG、JPEG、PNG、WEBP 图片。视频文件和 BMP 图片不进入检测流程。
