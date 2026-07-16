import json
import os
import socket
import threading
import time
import uuid
from datetime import datetime

import numpy as np
from flask import Flask, jsonify, make_response, render_template, request
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from yolo26_detector import (
    YOLO26Detector,
    YOLO26LabelLoadError,
    YOLO26ModelLoadError,
    YOLO26ModelNotFoundError,
)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = os.path.join(BASE_DIR, "static")
app.config["UPLOADS_FOLDER"] = os.path.join(app.config["UPLOAD_FOLDER"], "uploads")
app.config["RESULTS_FOLDER"] = os.path.join(app.config["UPLOAD_FOLDER"], "results")
app.config["UPLOAD_IMAGES_FOLDER"] = os.path.join(app.config["UPLOADS_FOLDER"], "images")
app.config["RESULT_IMAGES_FOLDER"] = os.path.join(app.config["RESULTS_FOLDER"], "images")
app.config["HISTORY_FILE"] = os.path.join(BASE_DIR, "detect_history.json")
app.config["MAX_HISTORY_ITEMS"] = 5
app.config["MAX_STORAGE_BYTES"] = 1024 * 1024 * 1024
app.config["RESULTS_MAX_STORAGE_BYTES"] = 18 * 1024 * 1024 * 1024
app.config["RESULT_RETENTION_DAYS"] = 30
app.config["RESULT_RETENTION_MAX_FILES"] = 300
app.config["SESSION_RETENTION_DAYS"] = 30
app.config["SESSION_TOUCH_INTERVAL_SECONDS"] = 10 * 60
app.config["MAX_CONTENT_LENGTH"] = 400 * 1024 * 1024

DETECT_TARGETS = ("leaf", "fruit")
SESSION_META_KEY = "_session_meta"

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs(app.config["UPLOADS_FOLDER"], exist_ok=True)
os.makedirs(app.config["RESULTS_FOLDER"], exist_ok=True)
os.makedirs(app.config["UPLOAD_IMAGES_FOLDER"], exist_ok=True)
os.makedirs(app.config["RESULT_IMAGES_FOLDER"], exist_ok=True)

HISTORY_LOCK = threading.RLock()

MODEL_BASE_DIR = os.path.join(BASE_DIR, "models")
DETECTORS = {
    "leaf": YOLO26Detector(model_dir=os.path.join(MODEL_BASE_DIR, "leaf"), conf_threshold=0.5),
    "fruit": YOLO26Detector(model_dir=os.path.join(MODEL_BASE_DIR, "fruit"), conf_threshold=0.6),
}

DETECT_TYPE_LABELS = {
    "leaf": "叶片检测",
    "fruit": "果实检测",
}

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/pjpeg",
    "image/png",
    "image/x-png",
    "image/webp",
}


ANNOTATION_PALETTES = {
    ("leaf", "normal"): {
        "box": (126, 242, 165, 255),
        "glow": (126, 242, 165, 78),
        "shadow": (2, 18, 12, 165),
        "label_bg": (18, 82, 55, 224),
        "label_border": (126, 242, 165, 110),
        "text": (246, 255, 249, 255),
        "width": 5,
    },
    ("leaf", "enhanced"): {
        "box": (92, 225, 230, 255),
        "glow": (92, 225, 230, 105),
        "shadow": (1, 23, 31, 172),
        "label_bg": (5, 27, 35, 216),
        "label_border": (92, 225, 230, 128),
        "text": (238, 253, 255, 255),
        "width": 5,
    },
    ("fruit", "normal"): {
        "box": (242, 140, 85, 255),
        "glow": (232, 93, 74, 76),
        "shadow": (38, 14, 9, 160),
        "label_bg": (111, 45, 30, 224),
        "label_border": (242, 140, 85, 100),
        "text": (255, 246, 238, 255),
        "width": 5,
    },
    ("fruit", "enhanced"): {
        "box": (255, 90, 58, 255),
        "glow": (255, 90, 58, 112),
        "shadow": (43, 11, 8, 178),
        "label_bg": (90, 25, 19, 230),
        "label_border": (255, 113, 76, 130),
        "text": (255, 250, 245, 255),
        "width": 6,
    },
}


def get_detector(detect_type):
    normalized_type = (detect_type or "").strip().lower()
    if normalized_type not in DETECTORS:
        raise ValueError(f"Unsupported detect_type: {detect_type}")
    return normalized_type, DETECTORS[normalized_type]


def error_response(error, user_message, status_code=400, **payload):
    response = {
        "success": False,
        "error": error,
        "user_message": user_message,
    }
    response.update(payload)
    return jsonify(response), status_code


def normalize_session_id(value):
    try:
        return str(uuid.UUID(str(value or "").strip()))
    except (ValueError, TypeError, AttributeError):
        return ""


def get_request_session_id():
    session_id = normalize_session_id(
        request.values.get("session_id")
        or request.headers.get("X-Session-Id")
    )
    return session_id or str(uuid.uuid4())


def get_session_uploads_folder(session_id):
    return os.path.join(app.config["UPLOADS_FOLDER"], session_id)


def get_session_results_folder(session_id):
    return os.path.join(app.config["RESULTS_FOLDER"], session_id)


def get_session_folder(session_id, root_key, _folder_kind):
    folder_name = "images"
    if root_key == "results":
        return os.path.join(get_session_results_folder(session_id), folder_name)
    return os.path.join(get_session_uploads_folder(session_id), folder_name)


def ensure_session_dirs(session_id):
    folders = [
        get_session_folder(session_id, "uploads", "images"),
        get_session_folder(session_id, "results", "images"),
    ]
    for folder in folders:
        os.makedirs(folder, exist_ok=True)


def get_upload_validation_error(file):
    filename = (file.filename or "").strip()
    extension = os.path.splitext(filename)[1].lower().lstrip(".")
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return "仅支持 JPG、JPEG、PNG、WEBP 图片。"

    mime_type = (file.mimetype or "").lower()
    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        return "仅支持 JPG、JPEG、PNG、WEBP 图片。"

    return ""


def parse_positive_int(value, default, minimum=1, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def make_timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f")


def build_unique_filename(filename, fallback_extension):
    safe_filename = secure_filename(filename or "")
    extension = os.path.splitext(safe_filename)[1].lower() or fallback_extension
    return f"{make_timestamp()}{extension}"


def save_upload_file(file, fallback_extension, folder=None):
    filename = build_unique_filename(file.filename, fallback_extension)
    target_folder = folder or app.config["UPLOADS_FOLDER"]
    os.makedirs(target_folder, exist_ok=True)
    save_path = os.path.join(target_folder, filename)
    file.save(save_path)
    return save_path, filename


def get_static_url(path):
    static_root = os.path.abspath(app.config["UPLOAD_FOLDER"])
    absolute_path = os.path.abspath(path)
    if os.path.commonpath([absolute_path, static_root]) != static_root:
        raise ValueError(f"Path is outside static folder: {path}")
    relative_path = os.path.relpath(absolute_path, static_root).replace(os.sep, "/")
    return f"/static/{relative_path}"


def url_to_static_path(url):
    value = str(url or "").strip()
    if not value:
        return ""
    if value.startswith("/"):
        value = value[1:]
    if not value.startswith("static/"):
        return ""

    static_root = os.path.abspath(app.config["UPLOAD_FOLDER"])
    relative_path = value[len("static/"):].replace("/", os.sep)
    absolute_path = os.path.abspath(os.path.join(static_root, relative_path))
    if os.path.commonpath([absolute_path, static_root]) != static_root:
        return ""
    return absolute_path


def remove_managed_file(path):
    if not path:
        return

    absolute_path = os.path.abspath(path)
    allowed_roots = [app.config["UPLOADS_FOLDER"], app.config["RESULTS_FOLDER"]]
    for root in allowed_roots:
        root = os.path.abspath(root)
        if os.path.commonpath([absolute_path, root]) == root:
            try:
                if os.path.isfile(absolute_path):
                    os.remove(absolute_path)
            except FileNotFoundError:
                pass
            except Exception:
                app.logger.exception("Failed to delete managed file: %s", absolute_path)
            return


def remove_history_files(record):
    for key in ("input_url", "result_url"):
        remove_managed_file(url_to_static_path(record.get(key)))


def backup_corrupt_history_file(history_file):
    backup_path = f"{history_file}.corrupt_{make_timestamp()}"
    try:
        with open(history_file, "rb") as source, open(backup_path, "wb") as target:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                target.write(chunk)
            target.flush()
            try:
                os.fsync(target.fileno())
            except OSError:
                pass
        app.logger.error("Backed up corrupt history file: %s", backup_path)
        return backup_path
    except Exception:
        app.logger.exception("Failed to back up corrupt history file: %s", history_file)
        return ""


def read_history():
    with HISTORY_LOCK:
        history_file = app.config["HISTORY_FILE"]
        if not os.path.exists(history_file):
            return {}
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            app.logger.exception("历史文件读取失败，JSON 内容损坏: %s", history_file)
            backup_path = backup_corrupt_history_file(history_file)
            if backup_path:
                app.logger.error("已备份损坏历史文件: %s", backup_path)
            return {}
        except Exception:
            app.logger.exception("历史文件读取失败: %s", history_file)
            backup_path = backup_corrupt_history_file(history_file)
            if backup_path:
                app.logger.error("已备份读取失败的历史文件: %s", backup_path)
            return {}
        if not isinstance(data, dict):
            return {}
        return data


def write_history(history):
    with HISTORY_LOCK:
        history_file = app.config["HISTORY_FILE"]
        history_dir = os.path.dirname(history_file)
        if history_dir:
            os.makedirs(history_dir, exist_ok=True)
        tmp_path = f"{history_file}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except OSError:
                    pass
            os.replace(tmp_path, history_file)
        except Exception:
            app.logger.exception("Failed to atomically write history file: %s", history_file)
            raise


def history_sort_key(record):
    return str(record.get("time") or "")


def get_session_history(history, session_id):
    session_id = normalize_session_id(session_id)
    if not session_id:
        return {"leaf": [], "fruit": []}
    session_history = history.setdefault(session_id, {})
    for target in DETECT_TARGETS:
        if not isinstance(session_history.get(target), list):
            session_history[target] = []
    return session_history


def clean_old_history(session_id, target, history=None):
    with HISTORY_LOCK:
        session_id = normalize_session_id(session_id)
        target = target if target in DETECT_TARGETS else "leaf"
        history = read_history() if history is None else history
        records = [
            record for record in get_session_history(history, session_id).get(target, [])
            if record.get("type") != "video"
        ]
        records.sort(key=history_sort_key, reverse=True)

        kept = records[:app.config["MAX_HISTORY_ITEMS"]]
        removed = records[app.config["MAX_HISTORY_ITEMS"]:]
        for record in removed:
            remove_history_files(record)

        get_session_history(history, session_id)[target] = kept
        write_history(history)
        return kept


def get_folder_size(folder):
    total = 0
    if not os.path.exists(folder):
        return total

    for root, _dirs, files in os.walk(folder):
        for name in files:
            path = os.path.join(root, name)
            try:
                total += os.path.getsize(path)
            except OSError:
                continue
    return total


def get_storage_size(session_id=None):
    if session_id:
        return (
            get_folder_size(get_session_uploads_folder(session_id))
            + get_folder_size(get_session_results_folder(session_id))
        )
    return (
        get_folder_size(app.config["UPLOADS_FOLDER"])
        + get_folder_size(app.config["RESULTS_FOLDER"])
    )


def iter_managed_files(session_id=None):
    if session_id:
        managed_roots = [
            get_session_folder(session_id, "uploads", "images"),
            get_session_folder(session_id, "results", "images"),
        ]
    else:
        managed_roots = [app.config["UPLOADS_FOLDER"], app.config["RESULTS_FOLDER"]]
    for folder in managed_roots:
        if not os.path.isdir(folder):
            continue
        for root, _dirs, files in os.walk(folder):
            for name in files:
                path = os.path.join(root, name)
                try:
                    yield os.path.getmtime(path), path
                except OSError:
                    continue


def get_history_referenced_paths(history=None, session_id=None):
    referenced = set()
    history = read_history() if history is None else history
    sessions = [normalize_session_id(session_id)] if session_id else list(history.keys())
    for sid in sessions:
        session_history = history.get(sid, {})
        if not isinstance(session_history, dict):
            continue
        for target in DETECT_TARGETS:
            for record in session_history.get(target, []):
                if record.get("type") == "video":
                    continue
                for key in ("input_url", "result_url"):
                    path = url_to_static_path(record.get(key))
                    if path:
                        referenced.add(os.path.abspath(path))
    return referenced


def clean_orphan_files(session_id=None):
    """删除当前 session 中未被历史记录引用的图片文件。"""
    with HISTORY_LOCK:
        session_id = normalize_session_id(session_id)
        if not session_id:
            return
        referenced = get_history_referenced_paths(session_id=session_id)
        for _modified_at, path in sorted(iter_managed_files(session_id), key=lambda item: item[0]):
            absolute_path = os.path.abspath(path)
            name = os.path.basename(absolute_path)
            if absolute_path in referenced:
                continue

            remove_managed_file(absolute_path)


def get_session_meta(history):
    meta = history.get(SESSION_META_KEY)
    if not isinstance(meta, dict):
        meta = {}
        history[SESSION_META_KEY] = meta
    return meta


def parse_history_time(value):
    try:
        return datetime.fromisoformat(str(value or "")).timestamp()
    except (TypeError, ValueError):
        return 0


def get_session_last_activity(history, session_id):
    meta = get_session_meta(history)
    meta_item = meta.get(session_id, {})
    if isinstance(meta_item, dict):
        try:
            last_open = float(meta_item.get("last_open_ts") or 0)
        except (TypeError, ValueError):
            last_open = 0
        if last_open > 0:
            return last_open

    session_history = history.get(session_id, {})
    latest = 0
    if isinstance(session_history, dict):
        for target in DETECT_TARGETS:
            for record in session_history.get(target, []):
                if record.get("type") == "video":
                    continue
                latest = max(latest, parse_history_time(record.get("time")))

    for _modified_at, path in iter_managed_files(session_id):
        try:
            latest = max(latest, os.path.getmtime(path))
        except OSError:
            continue

    return latest


def iter_known_session_ids(history):
    session_ids = {
        sid for sid in history.keys()
        if normalize_session_id(sid)
    }
    for root_key in ("UPLOADS_FOLDER", "RESULTS_FOLDER"):
        root = app.config[root_key]
        if not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            sid = normalize_session_id(name)
            if sid:
                session_ids.add(sid)
    return session_ids


def remove_session_files(session_id):
    removed_files = 0
    for _modified_at, path in sorted(iter_managed_files(session_id), key=lambda item: item[0]):
        if os.path.isfile(path):
            remove_managed_file(path)
            removed_files += 1
    return removed_files


def get_results_storage_size():
    return get_folder_size(app.config["RESULTS_FOLDER"])


def get_session_results_size(session_id):
    session_id = normalize_session_id(session_id)
    if not session_id:
        return 0
    return get_folder_size(get_session_results_folder(session_id))


def clean_results_storage_if_needed(exclude_session_id=None):
    """static/results 超过 18GB 时，删除最后调用时间最久远的 session。"""
    with HISTORY_LOCK:
        limit = app.config["RESULTS_MAX_STORAGE_BYTES"]
        results_size = get_results_storage_size()
        if results_size <= limit:
            return {
                "removed_sessions": 0,
                "removed_files": 0,
                "results_storage_bytes": results_size,
                "max_results_storage_bytes": limit,
            }

        history = read_history()
        meta = get_session_meta(history)
        excluded = normalize_session_id(exclude_session_id)
        removed_sessions = []
        removed_files = 0

        while get_results_storage_size() > limit:
            candidates = [
                session_id for session_id in iter_known_session_ids(history)
                if session_id != excluded and get_session_results_size(session_id) > 0
            ]

            # 如果只有当前 session 占用超限，最后才允许清理当前 session，避免无限增长。
            if not candidates and excluded and get_session_results_size(excluded) > 0:
                candidates = [excluded]

            if not candidates:
                break

            oldest_session_id = sorted(
                candidates,
                key=lambda sid: (get_session_last_activity(history, sid) or 0, sid),
            )[0]
            removed_files += remove_session_files(oldest_session_id)
            history.pop(oldest_session_id, None)
            meta.pop(oldest_session_id, None)
            removed_sessions.append(oldest_session_id)

            if oldest_session_id == excluded:
                excluded = ""

        if removed_sessions:
            write_history(history)
            app.logger.info(
                "Results storage cleanup: removed_sessions=%s removed_files=%s current_size=%s limit=%s",
                len(removed_sessions),
                removed_files,
                get_results_storage_size(),
                limit,
            )

        return {
            "removed_sessions": len(removed_sessions),
            "removed_files": removed_files,
            "results_storage_bytes": get_results_storage_size(),
            "max_results_storage_bytes": limit,
            "removed_session_ids": removed_sessions,
        }


def clean_inactive_sessions():
    """删除连续 30 天没有打开系统的 session 数据。"""
    with HISTORY_LOCK:
        history = read_history()
        meta = get_session_meta(history)
        cutoff = time.time() - app.config["SESSION_RETENTION_DAYS"] * 24 * 60 * 60
        removed_sessions = []
        removed_files = 0

        for session_id in sorted(iter_known_session_ids(history)):
            last_activity = get_session_last_activity(history, session_id)
            if not last_activity or last_activity >= cutoff:
                continue

            removed_files += remove_session_files(session_id)
            history.pop(session_id, None)
            meta.pop(session_id, None)
            removed_sessions.append(session_id)

        if removed_sessions:
            write_history(history)
            app.logger.info(
                "Inactive session cleanup: removed_sessions=%s removed_files=%s",
                len(removed_sessions),
                removed_files,
            )

        return {
            "removed_sessions": len(removed_sessions),
            "removed_files": removed_files,
        }


def touch_session(session_id):
    with HISTORY_LOCK:
        session_id = normalize_session_id(session_id)
        if not session_id:
            return False
        history = read_history()
        meta = get_session_meta(history)
        now = time.time()
        meta_item = meta.get(session_id, {})
        if isinstance(meta_item, dict):
            try:
                last_open = float(meta_item.get("last_open_ts") or 0)
            except (TypeError, ValueError):
                last_open = 0
            if 0 < now - last_open < app.config["SESSION_TOUCH_INTERVAL_SECONDS"]:
                return False
        meta[session_id] = {
            "last_open_ts": now,
            "last_open": datetime.fromtimestamp(now).isoformat(timespec="seconds"),
        }
        write_history(history)
        return True


def clean_storage_if_needed(session_id):
    with HISTORY_LOCK:
        session_id = normalize_session_id(session_id)
        limit = app.config["MAX_STORAGE_BYTES"]
        history = read_history()
        session_history = get_session_history(history, session_id)
        records = []
        for target in DETECT_TARGETS:
            for record in session_history.get(target, []):
                if record.get("type") == "video":
                    continue
                records.append((target, record))
        records.sort(key=lambda item: history_sort_key(item[1]))

        changed = False
        while get_storage_size(session_id) > limit and records:
            target, oldest = records.pop(0)
            remove_history_files(oldest)
            session_history[target] = [
                item for item in session_history.get(target, [])
                if item.get("time") != oldest.get("time")
            ]
            changed = True

        if changed:
            write_history(history)

        if get_storage_size(session_id) > limit:
            for _modified_at, path in sorted(iter_managed_files(session_id), key=lambda item: item[0]):
                remove_managed_file(path)
                if get_storage_size(session_id) <= limit:
                    break

        return get_storage_size(session_id)


def add_history(session_id, target, record):
    with HISTORY_LOCK:
        session_id = normalize_session_id(session_id)
        target = target if target in DETECT_TARGETS else "leaf"
        history_record = {
            "type": "image",
            "input_url": record.get("input_url"),
            "result_url": record.get("result_url"),
            "target": record.get("target"),
            "mode": record.get("mode"),
            "time": record.get("time") or datetime.now().isoformat(timespec="seconds"),
        }
        history = read_history()
        session_history = get_session_history(history, session_id)
        session_history[target].insert(0, history_record)
        clean_old_history(session_id, target, history)
        clean_storage_if_needed(session_id)
        clean_orphan_files(session_id)
        clean_results_storage_if_needed(exclude_session_id=session_id)
        return history_record


def get_history_for_target(session_id, target=None):
    with HISTORY_LOCK:
        session_id = normalize_session_id(session_id)
        normalized_target = (target or "").strip().lower()
        if normalized_target not in DETECT_TARGETS:
            normalized_target = "leaf"
        history = clean_old_history(session_id, normalized_target, read_history())
        return history[:app.config["MAX_HISTORY_ITEMS"]]


def get_detector_runtime_info(detector):
    if hasattr(detector, "get_runtime_info"):
        return detector.get_runtime_info()
    model_path = getattr(detector, "model_path", "")
    return {
        "model_path": model_path,
        "model_name": os.path.basename(model_path) if model_path else "",
        "label_source": getattr(detector, "classes_path", ""),
        "class_count": len(getattr(detector, "classes", [])),
    }


def detect_disease(image, detector):
    return detector.detect(image)


def normalize_detect_mode(mode):
    normalized_mode = (mode or "normal").strip().lower()
    if normalized_mode not in {"normal", "enhanced"}:
        raise ValueError(f"Unsupported mode: {mode}")
    return normalized_mode


def fake_nir_enhance(image):
    rgb_image = image.convert("RGB")
    array = np.asarray(rgb_image).astype(np.float32)
    r = array[:, :, 0]
    g = array[:, :, 1]
    nir_like = (r - g) / (r + g + 1e-6)
    nir_like = (nir_like - nir_like.min()) / (np.ptp(nir_like) + 1e-6)
    nir_uint8 = (nir_like * 255).clip(0, 255).astype(np.uint8)
    nir_rgb = np.stack([nir_uint8, nir_uint8, nir_uint8], axis=-1)
    blended = (array * 0.72 + nir_rgb.astype(np.float32) * 0.28).clip(0, 255).astype(np.uint8)
    return Image.fromarray(blended, mode="RGB")


def sharpen_enhance(image):
    return image.convert("RGB").filter(ImageFilter.SHARPEN)


def warm_visual_enhance(image):
    rgb_image = image.convert("RGB")
    array = np.asarray(rgb_image).astype(np.float32)
    warm = array * np.array([1.028, 1.006, 0.985], dtype=np.float32)
    warm = np.clip((warm - 128.0) * 1.045 + 128.0, 0, 255).astype(np.uint8)
    result = Image.fromarray(warm, mode="RGB")
    result = ImageEnhance.Color(result).enhance(1.035)
    return ImageEnhance.Contrast(result).enhance(1.025)


def get_enhanced_images(image, detect_type, detect_mode):
    if detect_mode != "enhanced":
        return image, image

    if detect_type == "fruit":
        inference_image = fake_nir_enhance(image)
        return inference_image, warm_visual_enhance(image)

    inference_image = sharpen_enhance(image)
    return inference_image, inference_image


def load_label_font(size=18):
    font_candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for font_path in font_candidates:
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size=size)
    return ImageFont.load_default()


def get_annotation_palette(detect_type="leaf", detect_mode="normal"):
    detect_type = detect_type if detect_type in {"leaf", "fruit"} else "leaf"
    detect_mode = detect_mode if detect_mode in {"normal", "enhanced"} else "normal"
    return ANNOTATION_PALETTES[(detect_type, detect_mode)]


def draw_detections(image, detections, detect_type="leaf", detect_mode="normal"):
    result_image = image.convert("RGBA").copy()
    glow_layer = Image.new("RGBA", result_image.size, (0, 0, 0, 0))
    mark_layer = Image.new("RGBA", result_image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    draw = ImageDraw.Draw(mark_layer)
    font = load_label_font()
    palette = get_annotation_palette(detect_type, detect_mode)
    box_width = palette["width"]

    for detection in detections:
        box = detection.get("box")
        if not box or len(box) != 4:
            continue

        x1, y1, x2, y2 = [int(round(value)) for value in box]
        x1 = max(0, min(result_image.width, x1))
        y1 = max(0, min(result_image.height, y1))
        x2 = max(0, min(result_image.width, x2))
        y2 = max(0, min(result_image.height, y2))
        if x2 <= x1 or y2 <= y1:
            continue

        label = detection.get("label_zh") or detection.get("class_name") or "object"
        confidence = detection.get("confidence")
        if isinstance(confidence, (int, float)):
            label = f"{label} {confidence:.2f}"

        glow_draw.rectangle([x1, y1, x2, y2], outline=palette["glow"], width=box_width + 8)
        draw.rectangle([x1, y1, x2, y2], outline=palette["shadow"], width=box_width + 4)
        draw.rectangle([x1, y1, x2, y2], outline=palette["box"], width=box_width)

        text_box = draw.textbbox((0, 0), label, font=font)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]
        label_width = text_width + 12
        label_height = text_height + 9
        label_x1 = min(x1, max(0, result_image.width - label_width))
        label_y1 = max(0, y1 - label_height - 4)
        label_x2 = min(result_image.width, label_x1 + label_width)
        label_y2 = min(result_image.height, label_y1 + label_height)
        label_rect = [label_x1, label_y1, label_x2, label_y2]
        draw.rounded_rectangle(
            label_rect,
            radius=5,
            fill=palette["label_bg"],
            outline=palette["label_border"],
            width=1,
        )
        draw.text((label_x1 + 6, label_y1 + 4), label, fill=palette["text"], font=font)

    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=3))
    result_image = Image.alpha_composite(result_image, glow_layer)
    result_image = Image.alpha_composite(result_image, mark_layer)
    return result_image.convert("RGB")


def cleanup_result_images():
    results_dir = os.path.abspath(app.config["RESULTS_FOLDER"])
    static_dir = os.path.abspath(app.config["UPLOAD_FOLDER"])

    try:
        common_path = os.path.commonpath([results_dir, static_dir])
        if common_path != static_dir or os.path.basename(results_dir) != "results":
            app.logger.warning(
                "Skip result cleanup because results_dir is outside static/results: %s",
                results_dir,
            )
            return

        if not os.path.isdir(results_dir):
            return

        now = time.time()
        max_age_seconds = app.config["RESULT_RETENTION_DAYS"] * 24 * 60 * 60
        max_files = app.config["RESULT_RETENTION_MAX_FILES"]
        candidates = []

        for name in os.listdir(results_dir):
            path = os.path.abspath(os.path.join(results_dir, name))
            try:
                if not os.path.isfile(path):
                    continue
                if os.path.commonpath([path, results_dir]) != results_dir:
                    continue

                modified_at = os.path.getmtime(path)
                if now - modified_at > max_age_seconds:
                    os.remove(path)
                    continue

                candidates.append((modified_at, path))
            except Exception:
                app.logger.exception("Failed to inspect or delete result file: %s", path)

        candidates.sort(key=lambda item: item[0], reverse=True)
        for _, path in candidates[max_files:]:
            try:
                if os.path.commonpath([os.path.abspath(path), results_dir]) == results_dir:
                    os.remove(path)
            except Exception:
                app.logger.exception("Failed to delete excess result file: %s", path)
    except Exception:
        app.logger.exception("Result cleanup failed")


def save_result_image(image, detections, detect_type="leaf", detect_mode="normal", return_path=False, session_id=""):
    filename = f"{make_timestamp()}.jpg"
    result_folder = get_session_folder(session_id, "results", "images") if session_id else app.config["RESULT_IMAGES_FOLDER"]
    os.makedirs(result_folder, exist_ok=True)
    result_path = os.path.join(result_folder, filename)
    result_image = draw_detections(image, detections, detect_type, detect_mode)
    result_image.save(result_path, format="JPEG", quality=92)
    result_url = get_static_url(result_path)
    if return_path:
        return result_url, result_path
    return result_url


def build_result_text(detections, detect_type="leaf"):
    if not detections:
        if detect_type == "fruit":
            return "未检测到果实目标，请上传清晰的番茄果实图片。"
        return "未检测到明显目标。"

    lines = []
    for index, detection in enumerate(detections, start=1):
        label = detection.get("label_zh") or detection.get("class_name") or "未知类别"
        confidence = detection.get("confidence")
        if isinstance(confidence, (int, float)):
            lines.append(f"{index}. {label}，置信度 {confidence * 100:.1f}%")
        else:
            lines.append(f"{index}. {label}")

    return "\n".join(lines)


def get_static_asset_version(*relative_parts):
    asset_path = os.path.join(app.config["UPLOAD_FOLDER"], *relative_parts)
    try:
        return str(int(os.path.getmtime(asset_path)))
    except OSError:
        return "0"


def render_detect_page(template_name, **context):
    response = make_response(render_template(template_name, **context))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def build_suggestion_text(detections, detect_type="leaf"):
    advices = []
    for detection in detections:
        advice = detection.get("advice")
        if advice and advice not in advices:
            advices.append(advice)

    if advices:
        return "\n".join(advices)

    if detect_type == "fruit":
        return "建议继续观察果面状态，必要时结合成熟度、裂果和病斑情况进行复检。"
    return "建议持续观察叶片症状，必要时结合专业农技意见处理。"


def is_port_available(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def find_available_port(preferred_port=5000):
    for port in range(preferred_port, preferred_port + 10):
        if is_port_available(port):
            return port
    raise RuntimeError("No available port found from 5000 to 5009")


@app.route("/")
def index():
    return render_template(
        "home.html",
        global_css_version=get_static_asset_version("css", "global.css"),
        home_css_version=get_static_asset_version("css", "home.css"),
        responsive_css_version=get_static_asset_version("css", "responsive.css"),
        device_detect_js_version=get_static_asset_version("js", "device-detect.js"),
        nav_js_version=get_static_asset_version("js", "nav.js"),
        home_js_version=get_static_asset_version("js", "home.js"),
    )


@app.route("/leaf")
def leaf():
    return render_detect_page(
        "leaf.html",
        page_type="leaf",
        page_title="叶片病害检测",
        page_eyebrow="叶片检测工作台",
        page_subtitle="叶片病虫害通常具有类型多、病斑形态复杂、早期特征细微等特点，因此叶片识别方向采用约 12,800 张训练图像进行模型构建，用于提升复杂场景下的识别稳定性。",
        detect_label="开始叶片检测",
        summary_empty="识别完成后将在此生成结论。",
        advice_empty="识别完成后将在此提供分析建议。",
        history_title="叶片检测记录",
        history_empty="当前暂无识别记录，上传图片后将在此保留结果。",
        global_css_version=get_static_asset_version("css", "global.css"),
        detect_css_version=get_static_asset_version("css", "detect.css"),
        nav_js_version=get_static_asset_version("js", "nav.js"),
        detect_js_version=get_static_asset_version("js", "detect.js"),
    )


@app.route("/fruit")
def fruit():
    return render_detect_page(
        "fruit.html",
        page_type="fruit",
        page_title="果实病害检测",
        page_eyebrow="果实检测工作台",
        page_subtitle="果实识别方向聚焦番茄果实表面典型病害表现，基于约 1,981 张高相关果实图像进行训练，重点提升对果实病斑、腐烂、表面异常等特征的识别能力。",
        detect_label="开始果实检测",
        summary_empty="识别完成后将在此生成结论。",
        advice_empty="识别完成后将在此提供分析建议。",
        history_title="果实检测记录",
        history_empty="当前暂无识别记录，上传图片后将在此保留结果。",
        global_css_version=get_static_asset_version("css", "global.css"),
        detect_css_version=get_static_asset_version("css", "detect.css"),
        nav_js_version=get_static_asset_version("js", "nav.js"),
        detect_js_version=get_static_asset_version("js", "detect.js"),
    )


@app.route("/about")
def about():
    return render_template(
        "about.html",
        global_css_version=get_static_asset_version("css", "global.css"),
        about_css_version=get_static_asset_version("css", "about.css"),
        responsive_css_version=get_static_asset_version("css", "responsive.css"),
        device_detect_js_version=get_static_asset_version("js", "device-detect.js"),
        nav_js_version=get_static_asset_version("js", "nav.js"),
        about_js_version=get_static_asset_version("js", "about.js"),
    )


@app.route("/developer")
def developer():
    return render_template(
        "developer.html",
        global_css_version=get_static_asset_version("css", "global.css"),
        developer_css_version=get_static_asset_version("css", "developer.css"),
        responsive_css_version=get_static_asset_version("css", "responsive.css"),
        device_detect_js_version=get_static_asset_version("js", "device-detect.js"),
        nav_js_version=get_static_asset_version("js", "nav.js"),
        developer_js_version=get_static_asset_version("js", "developer.js"),
    )


@app.route("/session", methods=["GET"])
def session_info():
    session_id = get_request_session_id()
    inactive_cleanup = clean_inactive_sessions()
    ensure_session_dirs(session_id)
    touch_session(session_id)
    results_storage_cleanup = clean_results_storage_if_needed(exclude_session_id=session_id)
    return jsonify({
        "success": True,
        "session_id": session_id,
        "inactive_session_cleanup": inactive_cleanup,
        "results_storage_cleanup": results_storage_cleanup,
    })


@app.errorhandler(RequestEntityTooLarge)
def handle_request_entity_too_large(_exc):
    max_mb = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return error_response(
        "上传文件过大",
        f"上传文件不能超过 {max_mb}MB，请压缩后重试。",
        413,
    )


@app.route("/detect", methods=["POST"])
def detect():
    if "image" not in request.files:
        return error_response("未检测到图片", "请先上传需要识别的图片。", 400)

    file = request.files["image"]
    if file.filename == "":
        return error_response("未选择图片", "请先选择一张图片后再开始识别。", 400)

    detect_type = request.form.get("detect_type")
    detect_mode = request.form.get("mode", "normal")
    session_id = get_request_session_id()
    ensure_session_dirs(session_id)
    touch_session(session_id)
    if not detect_type:
        return error_response(
            "缺少检测类型",
            "请指定 detect_type=leaf 或 detect_type=fruit 后再开始识别。",
            400,
        )

    validation_error = get_upload_validation_error(file)
    if validation_error:
        return error_response(
            "图片类型不支持",
            validation_error,
            400,
            filename=file.filename,
            mimetype=file.mimetype or "",
        )

    try:
        normalized_type, active_detector = get_detector(detect_type)
        normalized_mode = normalize_detect_mode(detect_mode)
    except ValueError as exc:
        return error_response(
            "不支持的识别参数",
            "不支持的识别参数，请使用 detect_type=leaf/fruit 且 mode=normal/enhanced。",
            400,
            detail=str(exc),
        )

    runtime_info = get_detector_runtime_info(active_detector)
    app.logger.info(
        "Detect request: detect_type=%s mode=%s filename=%s model=%s labels=%s",
        normalized_type,
        normalized_mode,
        file.filename,
        runtime_info.get("model_path", ""),
        runtime_info.get("label_source", ""),
    )

    saved_image_path = ""
    input_image_url = ""
    try:
        saved_image_path, _saved_filename = save_upload_file(
            file,
            ".jpg",
            get_session_folder(session_id, "uploads", "images"),
        )
        input_image_url = get_static_url(saved_image_path)
        image = Image.open(saved_image_path)
        image.load()
    except UnidentifiedImageError:
        remove_managed_file(saved_image_path)
        return error_response(
            "图片格式不支持",
            "图片无法读取，请上传 JPG、PNG 或 WebP 格式的清晰图片。",
            400,
        )
    except OSError:
        remove_managed_file(saved_image_path)
        return error_response(
            "图片读取失败",
            "图片文件可能已损坏或不完整，请重新选择清晰图片后再试。",
            400,
        )

    inference_image, result_base_image = get_enhanced_images(image, normalized_type, normalized_mode)

    result_image_path = ""
    try:
        detections = detect_disease(inference_image, active_detector)
        image_url, result_image_path = save_result_image(
            result_base_image,
            detections,
            normalized_type,
            normalized_mode,
            return_path=True,
            session_id=session_id,
        )
        result_text = build_result_text(detections, normalized_type)
        suggestion_text = build_suggestion_text(detections, normalized_type)
        history_record = add_history(session_id, normalized_type, {
            "type": "image",
            "input_url": input_image_url,
            "result_url": image_url,
            "target": normalized_type,
            "mode": normalized_mode,
            "time": datetime.now().isoformat(timespec="seconds"),
        })
    except YOLO26ModelNotFoundError as exc:
        remove_managed_file(saved_image_path)
        module_label = DETECT_TYPE_LABELS.get(normalized_type, normalized_type)
        return error_response(
            "模型文件不存在",
            f"{module_label}模型未配置，请先部署 {normalized_type} 模型。",
            503,
            detail=str(exc),
            detect_type=normalized_type,
            expected_model_path=active_detector.model_path,
            label_source=runtime_info.get("label_source", ""),
        )
    except YOLO26LabelLoadError as exc:
        remove_managed_file(saved_image_path)
        module_label = DETECT_TYPE_LABELS.get(normalized_type, normalized_type)
        return error_response(
            "标签文件不可用",
            f"{module_label}标签文件缺失、损坏或与模型不匹配，请检查 classes.json/classes.txt。",
            503,
            detail=str(exc),
            detect_type=normalized_type,
            model_path=runtime_info.get("model_path", ""),
            label_source=runtime_info.get("label_source", ""),
        )
    except YOLO26ModelLoadError as exc:
        remove_managed_file(saved_image_path)
        module_label = DETECT_TYPE_LABELS.get(normalized_type, normalized_type)
        return error_response(
            "模型无法加载",
            f"{module_label}模型无法加载或执行，请检查 best.onnx 和 ONNX Runtime 环境。",
            503,
            detail=str(exc),
            detect_type=normalized_type,
            expected_model_path=active_detector.model_path,
            label_source=runtime_info.get("label_source", ""),
        )
    except NotImplementedError as exc:
        remove_managed_file(saved_image_path)
        return error_response(
            "检测器未实现",
            "检测器尚未完成推理实现，请检查后端检测模块。",
            501,
            detail=str(exc),
        )
    except ModuleNotFoundError as exc:
        remove_managed_file(saved_image_path)
        app.logger.exception("/detect failed because a Python dependency is missing")
        return error_response(
            "检测依赖缺失",
            "检测依赖缺失，请检查 ONNX Runtime 等运行环境后重试。",
            503,
            detail=str(exc),
            missing_module=getattr(exc, "name", ""),
            detect_type=normalized_type,
            model_path=runtime_info.get("model_path", ""),
            label_source=runtime_info.get("label_source", ""),
        )
    except Exception as exc:
        remove_managed_file(saved_image_path)
        remove_managed_file(result_image_path)
        app.logger.exception("/detect failed")
        return error_response(
            "检测失败",
            "检测失败，请稍后重试。",
            500,
            detail=f"{type(exc).__name__}: {exc}",
            detect_type=normalized_type,
            model_path=runtime_info.get("model_path", ""),
            label_source=runtime_info.get("label_source", ""),
        )

    runtime_info = get_detector_runtime_info(active_detector)
    app.logger.info(
        "Detect success: detect_type=%s mode=%s detections=%s model=%s labels=%s",
        normalized_type,
        normalized_mode,
        len(detections),
        runtime_info.get("model_path", ""),
        runtime_info.get("label_source", ""),
    )

    return jsonify({
        "success": True,
        "detections": detections,
        "image_url": image_url,
        "result_image_url": image_url,
        "input_url": input_image_url,
        "result_url": image_url,
        "history": history_record,
        "session_id": session_id,
        "detect_type": normalized_type,
        "detect_mode": normalized_mode,
        "result": result_text,
        "suggestion": suggestion_text,
        "model_path": runtime_info.get("model_path", ""),
        "model_name": runtime_info.get("model_name", ""),
        "label_source": runtime_info.get("label_source", ""),
        "class_count": runtime_info.get("class_count", 0),
    })


@app.route("/history", methods=["GET"])
def history():
    target = request.args.get("target", "")
    session_id = get_request_session_id()
    ensure_session_dirs(session_id)
    touch_session(session_id)
    return jsonify({
        "success": True,
        "session_id": session_id,
        "history": get_history_for_target(session_id, target),
        "max_items": app.config["MAX_HISTORY_ITEMS"],
        "storage_bytes": get_storage_size(session_id),
        "max_storage_bytes": app.config["MAX_STORAGE_BYTES"],
        "results_storage_bytes": get_results_storage_size(),
        "max_results_storage_bytes": app.config["RESULTS_MAX_STORAGE_BYTES"],
    })


@app.route("/history", methods=["DELETE"])
def clear_history():
    target = (request.args.get("target", "") or "").strip().lower()
    target = target if target in DETECT_TARGETS else "leaf"
    session_id = get_request_session_id()
    ensure_session_dirs(session_id)
    touch_session(session_id)
    history = read_history()
    session_history = get_session_history(history, session_id)
    removed = list(session_history.get(target, []))

    for record in removed:
        remove_history_files(record)

    session_history[target] = []
    write_history(history)
    clean_orphan_files(session_id)
    return jsonify({
        "success": True,
        "session_id": session_id,
        "removed": len(removed),
        "history": get_history_for_target(session_id, target),
    })


if __name__ == "__main__":
    port = find_available_port(5000)
    print("Starting tomato disease detection web server...")
    print(f"Project directory: {BASE_DIR}")
    print(f"Server will be available at: http://127.0.0.1:{port}")
    app.run(
        host="127.0.0.1",
        port=port,
        debug=os.environ.get("FLASK_DEBUG") == "1",
        use_reloader=False,
    )
