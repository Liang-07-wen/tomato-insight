# Fruit Detection Model

本目录保存 Tomato Insight 番茄果实病害及果面异常检测模型与类别配置。

## 文件说明

- `best.onnx`：果实检测 ONNX 模型。
- `classes.json`：类别名称、中文标签和辅助建议。
- `classes.txt`：模型类别顺序。
- `model_config.json`：模型格式、输入尺寸及检测阈值。

## 模型配置

| 项目 | 配置 |
|---|---|
| 模型格式 | ONNX |
| 类别数量 | 13 |
| 输入尺寸 | 640 × 640 |
| 置信度阈值 | 0.6 |
| IoU 阈值 | 0.45 |
| 推理框架 | ONNX Runtime |

果实模型设置独立阈值，并在未检测到有效果实目标时返回无目标提示，减少跨场景低置信度误判。

模型权重通过 Git LFS 管理。克隆仓库后请执行：

```bash
git lfs pull
```

模型文件位于非静态目录中，不会由 Flask 静态文件路由直接公开。
