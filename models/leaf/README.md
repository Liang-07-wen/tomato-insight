# YOLO26 model files

Place the trained YOLO26 model assets in this directory.

Recommended files:

- `best.pt`: trained YOLO26 weights from the team.
- `classes.json`: class id to class name mapping used by the trained model.
- `model_config.json`: model metadata such as input size, confidence threshold, and model format.

Do not put model weights under `web/static/`, because files there can be served directly to browsers.
