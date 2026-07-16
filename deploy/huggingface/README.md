---
title: Tomato Insight
emoji: 🍅
colorFrom: red
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: 番茄果叶病害智能检测与分析系统
tags:
  - computer-vision
  - object-detection
  - smart-agriculture
  - flask
  - onnx
---

# Tomato Insight

Tomato Insight 是面向智慧农业场景的番茄果叶病害智能检测与分析系统。

项目基于 YOLO26 构建叶片与果实双模型检测框架，通过 Flask 和 ONNX Runtime 提供图片上传、目标检测、检测框标注、置信度展示、辅助建议和历史记录功能。

## 功能

- 番茄叶片 10 类目标检测
- 番茄果实 13 类目标检测
- 叶片 SE 清晰度增强
- 果实 RGB 伪 NIR 增强
- 电脑端与手机端响应式页面

> RGB 伪 NIR 是基于可见光图像构建的增强表达，不代表真实近红外传感器采集。

源代码：<https://github.com/Liang-07-wen/tomato-insight>
