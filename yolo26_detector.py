import json
import os

import cv2
import numpy as np


class YOLO26ModelNotFoundError(FileNotFoundError):
    """Raised when the required ONNX model file is missing."""


class YOLO26ModelLoadError(RuntimeError):
    """Raised when ONNX Runtime cannot initialize or execute the model."""


class YOLO26LabelLoadError(RuntimeError):
    """Raised when label files are missing, inconsistent, or incompatible."""


class YOLO26Detector:
    """ONNX Runtime YOLO detector. Missing or broken models fail closed."""

    def __init__(
        self,
        model_dir=None,
        model_path=None,
        classes_path=None,
        input_size=640,
        conf_threshold=0.25,
        iou_threshold=0.45,
    ):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.model_dir = model_dir or os.path.join(base_dir, "models", "leaf")
        self.model_path = model_path or os.path.join(self.model_dir, "best.onnx")
        self.classes_path = classes_path or os.path.join(self.model_dir, "classes.json")
        self.classes_txt_path = os.path.join(self.model_dir, "classes.txt")
        self.input_size = input_size
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.session = None
        self.input_name = None
        self.input_width = input_size
        self.input_height = input_size
        self.label_source = None
        self.classes = self.load_classes()

    def _normalize_json_classes(self, data):
        if isinstance(data, list):
            classes = []
            for index, item in enumerate(data):
                if isinstance(item, dict):
                    class_id = int(item.get("class_id", index))
                    class_name = item.get("class_name", item.get("label", f"class_{class_id}"))
                    label_zh = (
                        item.get("label_zh")
                        or item.get("name_zh")
                        or item.get("zh_name")
                        or item.get("chinese_name")
                        or class_name
                    )
                    classes.append({
                        "class_id": class_id,
                        "class_name": class_name,
                        "label_zh": label_zh,
                        "advice": item.get("advice", ""),
                    })
                else:
                    label = str(item)
                    classes.append({
                        "class_id": index,
                        "class_name": label,
                        "label_zh": label,
                        "advice": "",
                    })
            return classes

        if isinstance(data, dict):
            classes = []
            for index, (class_id, value) in enumerate(data.items()):
                normalized_id = int(class_id) if str(class_id).isdigit() else index
                if isinstance(value, dict):
                    class_name = value.get("class_name", value.get("label", f"class_{normalized_id}"))
                    label_zh = (
                        value.get("label_zh")
                        or value.get("name_zh")
                        or value.get("zh_name")
                        or value.get("chinese_name")
                        or class_name
                    )
                    classes.append({
                        "class_id": normalized_id,
                        "class_name": class_name,
                        "label_zh": label_zh,
                        "advice": value.get("advice", ""),
                    })
                else:
                    label = str(value)
                    classes.append({
                        "class_id": normalized_id,
                        "class_name": label,
                        "label_zh": label,
                        "advice": "",
                    })
            return classes

        raise YOLO26LabelLoadError(
            f"Unsupported label file structure: {self.classes_path}"
        )

    def _load_json_classes(self):
        if not os.path.exists(self.classes_path):
            return None

        try:
            with open(self.classes_path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
        except Exception as exc:
            raise YOLO26LabelLoadError(
                f"Failed to read labels file: {self.classes_path}"
            ) from exc

        classes = self._normalize_json_classes(data)
        if not classes:
            raise YOLO26LabelLoadError(f"Labels file is empty: {self.classes_path}")
        return classes

    def _load_txt_classes(self):
        if not os.path.exists(self.classes_txt_path):
            return None

        try:
            with open(self.classes_txt_path, "r", encoding="utf-8-sig") as f:
                lines = [line.strip() for line in f.readlines() if line.strip()]
        except Exception as exc:
            raise YOLO26LabelLoadError(
                f"Failed to read labels file: {self.classes_txt_path}"
            ) from exc

        if not lines:
            raise YOLO26LabelLoadError(f"Labels file is empty: {self.classes_txt_path}")

        return [{
            "class_id": index,
            "class_name": label,
            "label_zh": label,
            "advice": "",
        } for index, label in enumerate(lines)]

    def _labels_match(self, json_classes, txt_classes):
        if len(json_classes) != len(txt_classes):
            return False

        for json_item, txt_item in zip(json_classes, txt_classes):
            json_candidates = {
                str(json_item.get("label_zh", "")).strip(),
                str(json_item.get("class_name", "")).strip(),
            }
            if str(txt_item.get("label_zh", "")).strip() not in json_candidates:
                return False
        return True

    def load_classes(self):
        json_classes = self._load_json_classes()
        txt_classes = self._load_txt_classes()

        if json_classes and txt_classes and not self._labels_match(json_classes, txt_classes):
            raise YOLO26LabelLoadError(
                f"Label sources do not match: {self.classes_path} vs {self.classes_txt_path}"
            )

        if json_classes:
            self.label_source = self.classes_path
            return json_classes

        if txt_classes:
            self.label_source = self.classes_txt_path
            return txt_classes

        raise YOLO26LabelLoadError(
            f"Missing label file for model directory: {self.model_dir}"
        )

    def load_model(self):
        if not os.path.exists(self.model_path):
            raise YOLO26ModelNotFoundError(
                f"Required ONNX model not found: {self.model_path}"
            )

        try:
            import onnxruntime as ort

            self.session = ort.InferenceSession(
                self.model_path,
                providers=["CPUExecutionProvider"],
            )
            model_input = self.session.get_inputs()[0]
            self.input_name = model_input.name
        except ModuleNotFoundError:
            raise
        except Exception as exc:
            raise YOLO26ModelLoadError(
                f"Failed to initialize ONNX model: {self.model_path}"
            ) from exc

        shape = model_input.shape
        if len(shape) == 4:
            height = shape[2] if isinstance(shape[2], int) else self.input_size
            width = shape[3] if isinstance(shape[3], int) else self.input_size
            self.input_height = int(height)
            self.input_width = int(width)

    def letterbox(self, image_array):
        source_height, source_width = image_array.shape[:2]
        scale = min(self.input_width / source_width, self.input_height / source_height)
        resized_width = int(round(source_width * scale))
        resized_height = int(round(source_height * scale))

        resized = cv2.resize(
            image_array,
            (resized_width, resized_height),
            interpolation=cv2.INTER_LINEAR,
        )
        canvas = np.full((self.input_height, self.input_width, 3), 114, dtype=np.uint8)

        pad_x = (self.input_width - resized_width) // 2
        pad_y = (self.input_height - resized_height) // 2
        canvas[pad_y:pad_y + resized_height, pad_x:pad_x + resized_width] = resized

        return canvas, scale, pad_x, pad_y

    def preprocess(self, image):
        rgb_image = image.convert("RGB")
        image_array = np.array(rgb_image)
        original_height, original_width = image_array.shape[:2]
        padded, scale, pad_x, pad_y = self.letterbox(image_array)
        blob = padded.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))[None, :, :, :]
        return blob, (original_width, original_height), scale, pad_x, pad_y

    def normalize_outputs(self, outputs):
        predictions = []

        for output in outputs:
            array = np.asarray(output)
            if array.ndim == 3 and array.shape[0] == 1:
                array = array[0]
            if array.ndim == 3:
                array = array.reshape(-1, array.shape[-1])
            if array.ndim != 2:
                continue

            if array.shape[0] < array.shape[1] and array.shape[0] <= len(self.classes) + 5:
                array = array.T

            predictions.append(array)

        if not predictions:
            return np.empty((0, 0), dtype=np.float32)

        return np.concatenate(predictions, axis=0)

    def parse_prediction(self, row):
        if row.shape[0] < 5:
            return None

        class_count = len(self.classes)

        if row.shape[0] == 6:
            x1, y1, x2, y2, score, class_id = row[:6]
            return float(score), int(class_id), [float(x1), float(y1), float(x2), float(y2)]

        if row.shape[0] == 4 + class_count:
            class_scores = row[4:]
            class_id = int(np.argmax(class_scores))
            score = float(class_scores[class_id])
        else:
            objectness = float(row[4])
            class_scores = row[5:]
            if class_scores.size == 0:
                return None
            class_id = int(np.argmax(class_scores))
            score = objectness * float(class_scores[class_id])

        cx, cy, width, height = [float(value) for value in row[:4]]
        if max(cx, cy, width, height) <= 1.5:
            cx *= self.input_width
            width *= self.input_width
            cy *= self.input_height
            height *= self.input_height

        x1 = cx - width / 2
        y1 = cy - height / 2
        x2 = cx + width / 2
        y2 = cy + height / 2
        return score, class_id, [x1, y1, x2, y2]

    def scale_box(self, box, original_size, scale, pad_x, pad_y):
        original_width, original_height = original_size
        x1, y1, x2, y2 = box

        x1 = (x1 - pad_x) / scale
        y1 = (y1 - pad_y) / scale
        x2 = (x2 - pad_x) / scale
        y2 = (y2 - pad_y) / scale

        return [
            int(round(max(0, min(original_width, x1)))),
            int(round(max(0, min(original_height, y1)))),
            int(round(max(0, min(original_width, x2)))),
            int(round(max(0, min(original_height, y2)))),
        ]

    def get_class_info(self, class_id):
        for item in self.classes:
            if int(item.get("class_id", -1)) == int(class_id):
                return item

        raise YOLO26LabelLoadError(
            f"Predicted class_id {class_id} is not present in labels source: {self.label_source or self.classes_path}"
        )

    def get_runtime_info(self):
        return {
            "model_path": self.model_path,
            "model_name": os.path.basename(self.model_path),
            "label_source": self.label_source or self.classes_path,
            "class_count": len(self.classes),
            "input_width": self.input_width,
            "input_height": self.input_height,
        }

    def detect(self, image):
        if self.session is None:
            self.load_model()

        blob, original_size, scale, pad_x, pad_y = self.preprocess(image)
        try:
            outputs = self.session.run(None, {self.input_name: blob})
        except Exception as exc:
            raise YOLO26ModelLoadError("ONNX inference failed") from exc
        predictions = self.normalize_outputs(outputs)

        boxes = []
        scores = []
        class_ids = []

        for row in predictions:
            parsed = self.parse_prediction(row)
            if parsed is None:
                continue

            score, class_id, padded_box = parsed
            if score < self.conf_threshold:
                continue

            box = self.scale_box(padded_box, original_size, scale, pad_x, pad_y)
            x1, y1, x2, y2 = box
            box_width = max(0, x2 - x1)
            box_height = max(0, y2 - y1)
            if box_width == 0 or box_height == 0:
                continue

            boxes.append([x1, y1, box_width, box_height])
            scores.append(float(score))
            class_ids.append(int(class_id))

        keep_indexes = cv2.dnn.NMSBoxes(
            boxes,
            scores,
            self.conf_threshold,
            self.iou_threshold,
        )

        detections = []
        if len(keep_indexes) == 0:
            return detections

        for index in np.array(keep_indexes).reshape(-1):
            x, y, width, height = boxes[int(index)]
            class_id = class_ids[int(index)]
            class_info = self.get_class_info(class_id)
            detection_box = [x, y, x + width, y + height]
            detections.append({
                "class_id": int(class_info.get("class_id", class_id)),
                "class_name": class_info.get("class_name", f"class_{class_id}"),
                "label_zh": class_info.get("label_zh", class_info.get("class_name", f"class_{class_id}")),
                "advice": class_info.get("advice", ""),
                "confidence": round(float(scores[int(index)]), 4),
                "box": detection_box,
                "bbox": detection_box,
                "mode": "onnx",
            })

        return detections
