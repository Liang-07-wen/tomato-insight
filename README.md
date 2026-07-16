# Tomato Insight

Tomato Insight——番茄果叶病害智能检测与分析系统。

本项目面向智慧农业场景，基于 YOLO26 构建叶片与果实双模型检测框架，支持图片上传、目标识别、检测框标注、置信度展示、结果分析、防治建议和历史记录回看。

## 主要功能

- 番茄叶片病害检测
- 番茄果实病害及果面异常检测
- 叶片 SE 清晰度增强
- 果实 RGB 伪 NIR 增强
- ONNX Runtime 模型推理
- Flask Web 在线检测
- 电脑端与手机端响应式访问

## 在线体验

http://8.148.199.209/

## 本地运行

1. 创建虚拟环境：python -m venv .venv
2. 激活环境：.venv\Scripts\activate
3. 安装依赖：pip install -r requirements.txt
4. 启动网站：python app.py

## 模型文件

- models/leaf/best.onnx
- models/fruit/best.onnx

模型文件通过 Git LFS 管理。
