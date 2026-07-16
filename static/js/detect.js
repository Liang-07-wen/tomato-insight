const page = document.querySelector('.detect-page');
const pageType = page?.dataset.pageType || 'leaf';
const detectLabel = page?.dataset.detectLabel || '开始识别';
const historyEmptyText = page?.dataset.historyEmpty || '当前暂无识别记录，上传图片后将在此保留结果。';
const summaryEmptyText = page?.dataset.summaryEmpty || '暂无识别结果。';
const adviceEmptyText = page?.dataset.adviceEmpty || '暂无分析建议。';
const imageInput = document.getElementById('imageInput');
const uploadZone = document.getElementById('uploadZone');
const previewFrame = document.getElementById('previewFrame');
const previewImage = document.getElementById('previewImage');
const annotationLayer = document.getElementById('annotationLayer');
const annotationToggle = document.getElementById('annotationToggle');
const detectBtn = document.getElementById('detectBtn');
const clearBtn = document.getElementById('clearBtn');
const demoBtn = document.getElementById('demoBtn');
const fileHint = document.getElementById('fileHint');
const resultSummary = document.getElementById('resultSummary');
const adviceBox = document.getElementById('adviceBox');
const resultCount = document.getElementById('resultCount');
const resultModelMeta = document.getElementById('resultModelMeta');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const toast = document.getElementById('toast');
const detectModeInputs = Array.from(document.querySelectorAll('input[name="detectMode"]'));
const previewStatus = document.getElementById('previewStatus');

const THUMBNAIL_MAX_DATA_URL_LENGTH = 120 * 1024;
const MAX_UPLOAD_BEFORE_COMPRESS = 2 * 1024 * 1024;
const COMPRESSED_IMAGE_MAX_SIDE = 1600;
const COMPRESSED_IMAGE_QUALITY = 0.82;
const COMPRESSED_IMAGE_TYPE = 'image/jpeg';
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const SESSION_STORAGE_KEY = 'tomatoDetectionSessionId';
const demoImagesByType = {
    leaf: [
        '/static/demos/demo-leaf-01.jpg',
        '/static/demos/demo-leaf-02.jpg',
        '/static/demos/demo-leaf-03.jpg',
        '/static/demos/demo-leaf-04.jpg',
        '/static/demos/demo-leaf-05.jpg'
    ],
    fruit: [
        '/static/demos/demo-fruit-01.jpg',
        '/static/demos/demo-fruit-02.jpg',
        '/static/demos/demo-fruit-03.jpg',
        '/static/demos/demo-fruit-04.jpg',
        '/static/demos/demo-fruit-05.jpg'
    ]
};

let currentFile = null;
let previewUrl = '';
let toastTimer = null;
let currentDetections = [];
let annotationsVisible = true;
let hasUserSelectedImage = false;
let isDemoDetection = false;
let detectionRequestToken = 0;
let activeDetectionController = null;
let isDetectionInFlight = false;
let sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY) || '';
let annotationResizeFrame = 0;

const PAGE_CONFIG = {
    leaf: {
        defaultFileHint: '上传清晰叶片图像，开始智能检测',
        model: 'YOLO26s｜ONNX Runtime',
        normalMode: '普通检测',
        normalNote: '直接基于原图进行目标识别与结果输出',
        enhancedMode: '增强检测',
        enhancement: '清晰度增强',
        enhancedNote: '提升叶片纹理与病斑边缘可见性，辅助识别分析',
        displayLabels: {
            'Tomato Bacterial Spot': '番茄细菌性斑点病',
            Tomato_Bacterial_spot: '番茄细菌性斑点病',
            'Tomato Early blight': '番茄早疫病',
            Tomato_Early_blight: '番茄早疫病',
            'Tomato Late blight': '番茄晚疫病',
            Tomato_Late_blight: '番茄晚疫病',
            'Tomato Leaf Mold': '番茄叶霉病',
            Tomato_Leaf_Mold: '番茄叶霉病',
            'Tomato Septoria leaf spot': '番茄斑枯病',
            Tomato_Septoria_leaf_spot: '番茄斑枯病',
            'Tomato Spider mites Two-spotted spider mite': '番茄二斑叶螨危害',
            Tomato_Spider_mites_Two_spotted_spider_mite: '番茄二斑叶螨危害',
            'Tomato Target Spot': '番茄靶斑病',
            Tomato_Target_Spot: '番茄靶斑病',
            'Tomato Yellow Leaf Curl Virus': '番茄黄化曲叶病毒病',
            Tomato_Yellow_Leaf_Curl_Virus: '番茄黄化曲叶病毒病',
            'Tomato healthy': '健康叶片',
            Tomato_healthy: '健康叶片',
            'Tomato mosaic virus': '番茄花叶病毒病',
            Tomato_mosaic_virus: '番茄花叶病毒病'
        }
    },
    fruit: {
        defaultFileHint: '上传清晰果实图像，开始智能检测',
        model: 'YOLO26s｜ONNX Runtime',
        normalMode: '普通检测',
        normalNote: '直接基于原图进行目标识别与结果输出',
        enhancedMode: '增强检测',
        enhancement: '伪近红外增强',
        enhancedNote: '突出果面颜色层次与目标特征，辅助结果展示',
        displayLabels: {
            Anthracnose: '炭疽病',
            Blossom_End_Rot: '脐腐病',
            Catfaced: '畸形果',
            Fruit_Cracking: '裂果',
            Healthy_Tomato: '番茄健康',
            Late_Blight: '晚疫病',
            Mold: '霉斑',
            Spotted_Wilt_Virus: '斑萎病毒病',
            Stem_End_Rot: '蒂腐病',
            Sun_scald: '日灼病',
            Worms: '虫害',
            Golden_blotches: '金色斑驳',
            Blotchy_Ripeness: '着色不均'
        }
    }
};

const currentPageConfig = PAGE_CONFIG[pageType] || PAGE_CONFIG.leaf;

function runWhenIdle(callback, timeout = 1800) {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(callback, { timeout });
        return;
    }

    window.setTimeout(callback, Math.min(timeout, 900));
}

function isValidSessionId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function syncSessionId(value) {
    if (!isValidSessionId(value)) {
        return sessionId;
    }
    sessionId = value;
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    return sessionId;
}

async function ensureSessionId() {
    if (isValidSessionId(sessionId)) {
        return sessionId;
    }

    const url = sessionId
        ? `/session?session_id=${encodeURIComponent(sessionId)}`
        : '/session';
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false || !isValidSessionId(data.session_id)) {
        throw new Error('会话初始化失败');
    }
    return syncSessionId(data.session_id);
}

function appendSessionId(formData) {
    if (isValidSessionId(sessionId)) {
        formData.append('session_id', sessionId);
    }
}

function buildHistoryUrl() {
    const params = new URLSearchParams({
        target: pageType,
        session_id: sessionId
    });
    return `/history?${params.toString()}`;
}


function normalizePreprocessMode(mode) {
    return mode === 'enhanced' ? 'enhanced' : 'normal';
}

function syncDetectModeState(mode = getSelectedDetectMode()) {
    const normalizedMode = normalizePreprocessMode(mode);
    page?.classList.toggle('is-mode-enhanced', normalizedMode === 'enhanced');
    page?.classList.toggle('is-mode-normal', normalizedMode !== 'enhanced');
    if (page) {
        page.dataset.detectMode = normalizedMode;
    }
    setResultModelMeta();
    return normalizedMode;
}

function setDetectMode(mode, options = {}) {
    const { updateInputs = true } = options;
    const normalizedMode = syncDetectModeState(mode);
    if (updateInputs) {
        detectModeInputs.forEach((input) => {
            input.checked = input.value === normalizedMode;
        });
    }
    return normalizedMode;
}

function runLayeredPageIntro() {
    if (!page || !uploadZone) {
        return;
    }

    document.body.classList.add('detect-page-entering');

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            if (page?.classList.contains('leaf-studio-page')) {
                document.body.classList.add(
                    'detect-intro-card',
                    'detect-intro-copy',
                    'detect-intro-preview',
                    'detect-intro-result'
                );

                window.setTimeout(() => {
                    document.body.classList.add('detect-intro-history');
                }, 260);

                window.setTimeout(() => {
                    document.body.classList.remove('detect-page-entering');
                }, 620);
                return;
            }

            document.body.classList.add('detect-intro-card');

            window.setTimeout(() => {
                document.body.classList.add('detect-intro-copy');
            }, 140);

            window.setTimeout(() => {
                document.body.classList.add('detect-intro-preview');
            }, 260);

            window.setTimeout(() => {
                document.body.classList.add('detect-intro-result');
            }, 400);

            window.setTimeout(() => {
                document.body.classList.add('detect-intro-history');
            }, 540);

            window.setTimeout(() => {
                document.body.classList.remove('detect-page-entering');
            }, 860);
        });
    });
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function isSupportedImageFile(file) {
    if (!file) {
        return false;
    }
    const extension = file.name?.split('.').pop()?.toLowerCase() || '';
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
        return false;
    }
    return !file.type || file.type.startsWith('image/');
}

function normalizeStaticUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
        return '';
    }
    if (/^(https?:)?\/\//i.test(value) || value.startsWith('/')) {
        return value;
    }
    return `/${value}`;
}

function getCompressedImageName(filename) {
    const safeName = filename || 'tomato-upload';
    const stem = safeName.replace(/\.[^.]+$/, '') || 'tomato-upload';
    return `${stem}_compressed.jpg`;
}

function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('图片读取失败'));
        image.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
                return;
            }
            reject(new Error('图片压缩失败'));
        }, type, quality);
    });
}

async function compressImageByCanvas(file, options = {}) {
    const {
        maxSide = COMPRESSED_IMAGE_MAX_SIDE,
        quality = COMPRESSED_IMAGE_QUALITY,
        outputType = COMPRESSED_IMAGE_TYPE
    } = options;
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = await loadImageFromUrl(objectUrl);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
            throw new Error('图片尺寸读取失败');
        }

        const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('浏览器不支持图片压缩');
        }

        context.fillStyle = '#fff';
        context.fillRect(0, 0, targetWidth, targetHeight);
        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        const blob = await canvasToBlob(canvas, outputType, quality);
        return new File([blob], getCompressedImageName(file.name), {
            type: outputType,
            lastModified: Date.now()
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function compressImageIfNeeded(file) {
    if (!file || file.size <= MAX_UPLOAD_BEFORE_COMPRESS) {
        return file;
    }

    try {
        const compressedFile = await compressImageByCanvas(file);
        showToast('图片较大，已自动压缩后上传');
        return compressedFile;
    } catch (error) {
        showToast('图片压缩失败，已使用原图上传');
        return file;
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function normalizeConfidence(confidence) {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
        return '';
    }
    const value = confidence <= 1 ? confidence * 100 : confidence;
    return `${value.toFixed(1)}%`;
}

function isDirtyValue(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || text === 'undefined' || text === 'null' || text.includes('undefined');
}

function getDisplayDetectType(item) {
    return item?.detect_type || item?.detectType || item?.pageType || pageType;
}

function getDisplayLabel(rawLabel, detectType = pageType) {
    const normalizedLabel = String(rawLabel ?? '').trim();
    if (!normalizedLabel) {
        return '';
    }
    const displayLabels = PAGE_CONFIG[detectType]?.displayLabels || {};
    const labelCandidates = [
        normalizedLabel,
        normalizedLabel.replace(/\s+/g, '_'),
        normalizedLabel.replace(/[-\s]+/g, '_')
    ];
    const lowerNormalized = normalizedLabel.toLowerCase();
    const matchedKey = Object.keys(displayLabels).find((key) => key.toLowerCase() === lowerNormalized);
    for (const candidate of labelCandidates) {
        if (displayLabels[candidate]) {
            return displayLabels[candidate];
        }
    }
    return matchedKey ? displayLabels[matchedKey] : normalizedLabel;
}

function getDetectionLabel(item, detectType = getDisplayDetectType(item)) {
    return getDisplayLabel(
        item?.label_zh
        || item?.name_zh
        || item?.zh_name
        || item?.chinese_name
        || item?.label
        || item?.class_name
        || item?.name
        || '',
        detectType
    ) || '未知类别';
}

function getResultImageUrl(data) {
    const value = data?.result_image_url || data?.image_url || data?.resultImageUrl || data?.result_image || '';
    return !isDirtyValue(value) ? value : '';
}

function getSourceImageUrl(data) {
    const value = data?.source_image_url || data?.original_image_url || data?.originalImageUrl || data?.thumbnail_url || data?.image_url || '';
    return !isDirtyValue(value) ? value : '';
}

function getHistoryThumbnailUrl(item) {
    if (isCompressedHistoryThumbnail(item?.thumbnail_data_url)) {
        return item.thumbnail_data_url;
    }
    const thumbnailUrl = item?.thumbnail_url || item?.thumbnailUrl || item?.source_image_url || item?.original_image_url || '';
    if (!isDirtyValue(thumbnailUrl) && !isDataImageString(thumbnailUrl)) {
        return thumbnailUrl;
    }

    const imageUrl = item?.image_url || '';
    const resultImageUrl = item?.result_image_url || item?.resultImageUrl || '';
    if (!isDirtyValue(imageUrl) && !isDataImageString(imageUrl) && imageUrl !== resultImageUrl) {
        return imageUrl;
    }

    return !isDirtyValue(resultImageUrl) && !isDataImageString(resultImageUrl) ? resultImageUrl : '';
}

function setDefaultFileHint() {
    if (fileHint) {
        fileHint.textContent = currentPageConfig.defaultFileHint;
    }
}

function getSelectedDetectMode() {
    return detectModeInputs.find((item) => item.checked)?.value || 'normal';
}

function formatHistoryTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return '时间未知';
    }
    return date.toLocaleString();
}

function setPreviewStatus(text) {
    if (previewStatus) {
        previewStatus.textContent = text;
    }
}

function getModelStrategyMeta(data) {
    const detectType = data?.detect_type || data?.detectType || pageType;
    const detectMode = normalizePreprocessMode(data?.detect_mode || data?.detectMode || page?.dataset?.detectMode || getSelectedDetectMode());
    const config = PAGE_CONFIG[detectType] || PAGE_CONFIG.leaf;
    return {
        model: config.model,
        mode: detectMode === 'enhanced' ? config.enhancedMode : config.normalMode,
        enhancement: detectMode === 'enhanced' ? config.enhancement : '',
        note: detectMode === 'enhanced' ? config.enhancedNote : config.normalNote,
        isEnhanced: detectMode === 'enhanced'
    };
}

function setResultModelMeta(data = null) {
    if (!resultModelMeta) {
        return;
    }
    const meta = getModelStrategyMeta(data);
    resultModelMeta.innerHTML = `
        <div class="model-meta-item">
            <span class="model-meta-label">识别模型</span>
            <strong class="model-meta-value">${meta.model}</strong>
        </div>
        <div class="model-meta-item">
            <span class="model-meta-label">运行模式</span>
            <strong class="model-meta-value">${meta.mode}</strong>
        </div>
        ${meta.isEnhanced ? `
        <div class="model-meta-item">
            <span class="model-meta-label">增强策略</span>
            <strong class="model-meta-value">${meta.enhancement}</strong>
        </div>` : ''}
        <p class="model-meta-note">说明：${meta.note}</p>
    `;
}

function clearRenderedResultState() {
    page?.classList.remove('has-result');
    clearAnnotationOverlay();
}

function resetResultPanel() {
    clearRenderedResultState();
    resultSummary.textContent = summaryEmptyText;
    adviceBox.textContent = adviceEmptyText;
    setResultModelMeta();
}

function markDetectionPending() {
    resetResultPanel();
    resultCount.textContent = currentFile ? '已上传' : '等待上传';
    setPreviewStatus(currentFile ? '已上传未识别' : '未上传');
}

function handleDetectModeChange(mode) {
    syncDetectModeState(mode);
    if (currentFile || previewFrame?.classList.contains('has-image') || page?.classList.contains('has-result')) {
        cancelActiveDetection();
        markDetectionPending();
        page?.classList.remove('is-detecting', 'has-result');
        detectBtn.disabled = !currentFile;
        detectBtn.textContent = detectLabel;
        demoBtn.disabled = false;
        showToast(`检测模式切换成功，请点击${detectLabel}`);
    }
}

function showDetectionError(message, options = {}) {
    const {
        title = '识别失败',
        advice = '请检查文件、检测类型或稍后重试。'
    } = options;
    resetResultPanel();
    resultCount.textContent = title;
    resultSummary.textContent = message || title;
    adviceBox.textContent = advice;
    setResultModelMeta();
    showToast(message || title);
}

function getResponseErrorMessage(data, response) {
    return data?.user_message
        || data?.detail
        || data?.error
        || data?.message
        || `识别请求失败（${response?.status || '未知状态'}）`;
}

function isModelConfigError(data) {
    const errorText = [
        data?.error,
        data?.user_message,
        data?.detail,
        data?.message
    ].map((item) => String(item || '').trim()).filter(Boolean).join(' ');
    return /模型文件不存在|标签文件不可用|标签文件缺失|模型无法加载|类别配置错误|类别配置异常|classes\.json|classes\.txt|best\.onnx|ONNX Runtime/i.test(errorText);
}

function getDetectionErrorDisplay(data, response) {
    if (isModelConfigError(data)) {
        return {
            title: '模型配置异常',
            advice: '请确认对应模型目录中的 best.onnx、classes.json、classes.txt 是否完整且匹配。'
        };
    }

    const responseMessage = getResponseErrorMessage(data, response);
    if (response?.status === 413) {
        return {
            title: '文件过大',
            advice: '请压缩文件或选择较小的图片后重新上传。'
        };
    }

    if (response?.status === 400 || /上传|图片|文件|格式|类型|detect_type|检测类型|参数|扩展名|MIME/i.test(responseMessage)) {
        return {
            title: '请求参数错误',
            advice: '请按页面提示重新选择图片或检测类型后再试。'
        };
    }

    return {
        title: '识别失败',
        advice: '请稍后重试；如果持续失败，再检查后端模型和运行环境。'
    };
}

function isDataImageString(value) {
    return typeof value === 'string' && value.trim().toLowerCase().startsWith('data:image/');
}

function isCompressedHistoryThumbnail(value) {
    return isDataImageString(value) && value.length <= THUMBNAIL_MAX_DATA_URL_LENGTH;
}

function normalizeHistoryRecord(item) {
    if (item?.type === 'video') {
        return null;
    }
    const target = item?.target || item?.detect_type || item?.pageType || pageType;
    const mode = normalizePreprocessMode(item?.mode || item?.detect_mode || 'normal');
    const resultUrl = normalizeStaticUrl(item?.result_url || item?.result_image_url || '');
    const inputUrl = normalizeStaticUrl(item?.input_url || item?.source_image_url || '');
    return {
        ...item,
        type: 'image',
        target,
        pageType: target,
        detect_type: target,
        mode,
        detect_mode: mode,
        input_url: inputUrl,
        result_url: resultUrl,
        result_image_url: resultUrl,
        time: item?.time || new Date().toISOString()
    };
}

async function fetchServerHistory() {
    try {
        await ensureSessionId();
        const response = await fetch(buildHistoryUrl(), {
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            return [];
        }
        syncSessionId(data.session_id);
        return Array.isArray(data.history)
            ? data.history.map(normalizeHistoryRecord).filter(Boolean).slice(0, 5)
            : [];
    } catch {
        return [];
    }
}

function getHistoryRecordTitle(item) {
    const targetText = item.target === 'fruit' ? '果实检测' : '叶片检测';
    return `${targetText}图片`;
}

function applyHistoryRecord(item) {
    const record = normalizeHistoryRecord(item);
    if (!record) {
        return;
    }
    setDetectMode(record.mode);
    clearRenderedResultState();
    currentFile = null;
    hasUserSelectedImage = false;
    isDemoDetection = false;
    imageInput.value = '';
    detectBtn.disabled = true;
    fileHint.textContent = '已载入历史记录，当前为结果回看模式';
    page?.classList.add('has-result');

    if (record.result_url) {
        previewImage.src = record.result_url;
        previewFrame.classList.add('has-image');
    }
    resultCount.textContent = '历史图片';
    resultSummary.textContent = '已载入历史图片检测结果。';
    adviceBox.textContent = '可在左侧预览区查看已绘制检测框、类别名和置信度的结果图片。';
    setPreviewStatus('历史图片');
}

async function renderHistory() {
    const visibleItems = await fetchServerHistory();
    historyList.innerHTML = '';

    if (!visibleItems.length) {
        historyList.innerHTML = `<div class="history-empty">${escapeHtml(historyEmptyText)}</div>`;
        return;
    }

    visibleItems.forEach((item) => {
        const button = document.createElement('button');
        const title = getHistoryRecordTitle(item);
        const mediaUrl = item.result_url || item.input_url;
        const mediaHtml = mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(title)}">` : '<div class="history-image-fallback">暂无文件</div>';
        button.className = 'history-item';
        button.type = 'button';
        button.innerHTML = `
            ${mediaHtml}
            <strong>${escapeHtml(title)}</strong>
            <div>${escapeHtml(formatHistoryTime(item.time))}</div>
            <span class="history-brief">${escapeHtml(item.mode === 'enhanced' ? '增强检测' : '普通检测')}</span>
        `;
        button.addEventListener('click', () => {
            applyHistoryRecord(item);
        });
        button.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                applyHistoryRecord(item);
            }
        });
        historyList.appendChild(button);
    });
}

function buildResultHtml(detections, fallbackText) {
    if (!detections.length) {
        return escapeHtml(fallbackText || '暂未检测到明显病害目标。');
    }

    const grouped = detections.reduce((acc, item) => {
        const label = getDetectionLabel(item);
        const rawConfidence = typeof item.confidence === 'number'
            ? (item.confidence <= 1 ? item.confidence * 100 : item.confidence)
            : null;
        if (!acc[label]) {
            acc[label] = {
                label,
                count: 0,
                sum: 0,
                max: 0,
                confidenceCount: 0
            };
        }
        acc[label].count += 1;
        if (rawConfidence !== null && !Number.isNaN(rawConfidence)) {
            acc[label].sum += rawConfidence;
            acc[label].max = Math.max(acc[label].max, rawConfidence);
            acc[label].confidenceCount += 1;
        }
        return acc;
    }, {});

    return `
        <div class="detection-list">
            ${Object.values(grouped).map((item) => {
                const avg = item.confidenceCount ? `${(item.sum / item.confidenceCount).toFixed(1)}%` : '暂无';
                const max = item.confidenceCount ? `${item.max.toFixed(1)}%` : '暂无';
                return `
                <div class="detection-item">
                    <strong>${escapeHtml(item.label)}</strong>
                    <div class="detection-meta">数量 ${item.count} | 平均置信度 ${escapeHtml(avg)}</div>
                    <div class="detection-confidence">最高置信度 ${escapeHtml(max)}</div>
                </div>
            `; }).join('')}
        </div>
    `;
}

function getDetectionBox(item) {
    const box = item?.box || item?.bbox || item?.boxes;
    if (Array.isArray(box) && box.length >= 4) {
        return box.slice(0, 4).map(Number);
    }
    const { x1, y1, x2, y2 } = item || {};
    if ([x1, y1, x2, y2].every((value) => Number.isFinite(Number(value)))) {
        return [Number(x1), Number(y1), Number(x2), Number(y2)];
    }
    return null;
}

function getPreviewImageMetrics() {
    if (!previewImage?.complete || !previewImage.naturalWidth || !previewImage.naturalHeight) {
        return null;
    }

    const frameRect = previewFrame.getBoundingClientRect();
    const imageRect = previewImage.getBoundingClientRect();
    const style = window.getComputedStyle(previewImage);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const areaWidth = Math.max(0, imageRect.width - paddingLeft - paddingRight);
    const areaHeight = Math.max(0, imageRect.height - paddingTop - paddingBottom);
    const scale = Math.min(areaWidth / previewImage.naturalWidth, areaHeight / previewImage.naturalHeight);
    const renderedWidth = previewImage.naturalWidth * scale;
    const renderedHeight = previewImage.naturalHeight * scale;

    return {
        scale,
        left: imageRect.left - frameRect.left + paddingLeft + (areaWidth - renderedWidth) / 2,
        top: imageRect.top - frameRect.top + paddingTop + (areaHeight - renderedHeight) / 2,
        width: renderedWidth,
        height: renderedHeight
    };
}

function clampNumber(value, min, max) {
    if (max < min) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function rectsOverlap(first, second) {
    if (!first || !second) {
        return false;
    }
    return first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;
}

function getAnnotationToggleRect(frameRect) {
    if (!annotationToggle || annotationToggle.hidden) {
        return null;
    }

    const toggleRect = annotationToggle.getBoundingClientRect();
    if (!toggleRect.width || !toggleRect.height) {
        return null;
    }

    const safeGap = 8;
    return {
        left: toggleRect.left - frameRect.left - safeGap,
        top: toggleRect.top - frameRect.top - safeGap,
        right: toggleRect.right - frameRect.left + safeGap,
        bottom: toggleRect.bottom - frameRect.top + safeGap
    };
}

function placeAnnotationLabel(node, labelNode, boxMetrics, frameRect) {
    if (!node || !labelNode || !boxMetrics || !frameRect) {
        return;
    }

    const framePadding = 6;
    const labelGap = 6;
    const maxLabelWidth = Math.max(96, Math.min(260, frameRect.width - framePadding * 2));
    labelNode.style.setProperty('--annotation-label-max-width', `${maxLabelWidth}px`);

    const labelRect = labelNode.getBoundingClientRect();
    const labelWidth = Math.min(labelRect.width || labelNode.offsetWidth || maxLabelWidth, maxLabelWidth);
    const labelHeight = labelRect.height || labelNode.offsetHeight || 30;
    const avoidRect = getAnnotationToggleRect(frameRect);
    const candidates = [
        { placement: 'above', top: -labelHeight - labelGap },
        { placement: 'inside', top: labelGap },
        { placement: 'below', top: boxMetrics.height + labelGap }
    ];

    let fallback = null;
    let selected = null;

    for (const candidate of candidates) {
        const left = clampNumber(
            0,
            framePadding - boxMetrics.left,
            frameRect.width - framePadding - labelWidth - boxMetrics.left
        );
        const top = candidate.top;
        const rect = {
            left: boxMetrics.left + left,
            top: boxMetrics.top + top,
            right: boxMetrics.left + left + labelWidth,
            bottom: boxMetrics.top + top + labelHeight
        };
        const isInsideFrame = rect.left >= framePadding
            && rect.right <= frameRect.width - framePadding
            && rect.top >= framePadding
            && rect.bottom <= frameRect.height - framePadding;
        const touchesToggle = rectsOverlap(rect, avoidRect);

        if (isInsideFrame && !touchesToggle) {
            selected = { ...candidate, left };
            break;
        }

        if (!fallback && isInsideFrame) {
            fallback = { ...candidate, left };
        }
    }

    const placement = selected || fallback || {
        placement: 'inside',
        left: clampNumber(
            0,
            framePadding - boxMetrics.left,
            frameRect.width - framePadding - labelWidth - boxMetrics.left
        ),
        top: clampNumber(
            labelGap,
            framePadding - boxMetrics.top,
            frameRect.height - framePadding - labelHeight - boxMetrics.top
        )
    };

    labelNode.style.setProperty('--annotation-label-left', `${placement.left}px`);
    labelNode.style.setProperty('--annotation-label-top', `${placement.top}px`);
    node.dataset.labelPlacement = placement.placement;
}

function clearAnnotationOverlay() {
    currentDetections = [];
    if (annotationLayer) {
        annotationLayer.innerHTML = '';
        annotationLayer.classList.remove('is-visible');
    }
    if (annotationToggle) {
        annotationToggle.hidden = true;
        annotationToggle.setAttribute('aria-pressed', 'true');
        annotationToggle.textContent = '隐藏标注';
    }
    annotationsVisible = true;
}

function renderAnnotationOverlay(detections = currentDetections) {
    if (!annotationLayer || !previewImage || !previewFrame) {
        return;
    }
    currentDetections = Array.isArray(detections) ? detections : [];
    annotationLayer.innerHTML = '';

    if (!currentDetections.length || !previewFrame.classList.contains('has-image')) {
        annotationLayer.classList.remove('is-visible');
        if (annotationToggle) {
            annotationToggle.hidden = true;
        }
        return;
    }

    const metrics = getPreviewImageMetrics();
    if (!metrics) {
        return;
    }

    if (annotationToggle) {
        annotationToggle.hidden = !currentDetections.length;
        annotationToggle.textContent = annotationsVisible ? '隐藏标注' : '显示标注';
        annotationToggle.setAttribute('aria-pressed', String(annotationsVisible));
    }

    const frameRect = previewFrame.getBoundingClientRect();

    currentDetections.forEach((item) => {
        const box = getDetectionBox(item);
        if (!box) {
            return;
        }
        const [x1, y1, x2, y2] = box;
        const left = metrics.left + x1 * metrics.scale;
        const top = metrics.top + y1 * metrics.scale;
        const width = Math.max(1, (x2 - x1) * metrics.scale);
        const height = Math.max(1, (y2 - y1) * metrics.scale);
        const node = document.createElement('span');
        node.className = 'annotation-box';
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;
        node.style.width = `${width}px`;
        node.style.height = `${height}px`;
        const label = getDetectionLabel(item);
        const confidence = normalizeConfidence(item.confidence);
        const labelNode = document.createElement('span');
        labelNode.textContent = `${label}${confidence ? ` · 置信度 ${confidence}` : ''}`;
        node.appendChild(labelNode);
        annotationLayer.appendChild(node);
        placeAnnotationLabel(node, labelNode, { left, top, width, height }, frameRect);
    });

    annotationLayer.classList.toggle('is-visible', annotationsVisible);
}

function normalizeResultData(data) {
    const detections = Array.isArray(data?.detections) ? data.detections : [];
    const sourceImageUrl = getSourceImageUrl(data);
    const resultImageUrl = getResultImageUrl(data);
    const mode = detections.find((item) => item?.mode)?.mode || data?.mode || '';
    return {
        detections,
        image_url: sourceImageUrl,
        result_image_url: resultImageUrl,
        detect_type: data?.detect_type || data?.detectType || pageType,
        detect_mode: data?.detect_mode || data?.detectMode || data?.mode_type || 'normal',
        mode,
        result: data?.result || '',
        suggestion: data?.suggestion || '',
        model_name: data?.model_name || data?.modelName || '',
        model_path: data?.model_path || data?.modelPath || '',
        class_count: data?.class_count ?? data?.classCount ?? ''
    };
}

function applyResult(rawData, options = {}) {
    const {
        shouldSave = true,
        isDemo = false,
        isRealUpload = hasUserSelectedImage && !isDemoDetection,
        thumbnailUrl = '',
        previewStatusText = '历史结果',
        fromHistory = false
    } = typeof options === 'boolean' ? { shouldSave: options } : options;
    const data = normalizeResultData(rawData || {});
    setDetectMode(data.detect_mode);
    const detections = data.detections;
    const title = detections.length ? getDetectionLabel(detections[0]) : '暂未检测到明显病害目标';
    const resultImageUrl = data.result_image_url || getResultImageUrl(data);
    const candidateThumbnailUrl = thumbnailUrl || (fromHistory ? getHistoryThumbnailUrl(rawData || {}) : '');
    const cleanThumbnailUrl = isDataImageString(candidateThumbnailUrl)
        ? (isCompressedHistoryThumbnail(candidateThumbnailUrl) ? candidateThumbnailUrl : '')
        : candidateThumbnailUrl;
    const previewImageUrl = fromHistory ? (cleanThumbnailUrl || data.image_url || resultImageUrl) : resultImageUrl;

    clearRenderedResultState();
        resultCount.textContent = detections.length
        ? `共检测到 ${detections.length} 个目标`
        : '暂未检测到目标';
    resultSummary.innerHTML = buildResultHtml(detections, data.result);
    adviceBox.textContent = data.suggestion || '暂无处理建议。';
    setResultModelMeta(data);

    if (fromHistory) {
        currentFile = null;
        hasUserSelectedImage = false;
        isDemoDetection = false;
        imageInput.value = '';
        detectBtn.disabled = true;
        fileHint.textContent = '已载入历史记录，当前为结果回看模式';
    }

    if (previewImageUrl) {
        if (fromHistory || !currentFile) {
            previewImage.src = previewImageUrl;
            previewFrame.classList.add('has-image');
        }
        if (fromHistory || !currentFile) {
            setPreviewStatus(previewStatusText);
        }
    }
    renderAnnotationOverlay(detections);
    page?.classList.add('has-result');

    if (shouldSave && isRealUpload && !isDemo) {
        renderHistory();
    }
}

function cancelActiveDetection() {
    detectionRequestToken += 1;
    if (activeDetectionController) {
        activeDetectionController.abort();
        activeDetectionController = null;
    }
    isDetectionInFlight = false;
    page?.classList.remove('is-detecting');
}

function setPreviewFile(file, hintText = '', options = {}) {
    const { isDemo = false } = options;
    if (!file) {
        return false;
    }
    if (!isSupportedImageFile(file)) {
        clearAll();
        showToast('仅支持 JPG、JPEG、PNG、WEBP 图片。');
        return false;
    }
    cancelActiveDetection();
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
    }
    currentFile = file;
    hasUserSelectedImage = !isDemo;
    isDemoDetection = isDemo;
    previewUrl = URL.createObjectURL(file);
    clearAnnotationOverlay();
    previewImage.src = previewUrl;
    previewFrame.classList.add('has-image');
    markDetectionPending();
    detectBtn.disabled = false;
    detectBtn.textContent = detectLabel;
    fileHint.textContent = hintText || `${file.name} 已选择（图片）`;
    return true;
}

function clearAll() {
    cancelActiveDetection();
    currentFile = null;
        hasUserSelectedImage = false;
    isDemoDetection = false;
    imageInput.value = '';
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = '';
    }
    previewImage.removeAttribute('src');
    previewFrame.classList.remove('has-image');
    resetResultPanel();
    resultCount.textContent = '等待上传';
    setPreviewStatus('未上传');
    setDefaultFileHint();
    page?.classList.remove('is-detecting', 'has-result');
    detectBtn.disabled = true;
    detectBtn.textContent = detectLabel;
    demoBtn.disabled = false;
}

async function submitDetection(options = {}) {
    const { successMessage = '识别完成', isDemo = isDemoDetection, shouldSave = !isDemo } = options;
    if (!currentFile) {
        showToast('请先上传文件');
        return null;
    }

    if (isDetectionInFlight) {
        showToast('正在检测中，请稍候');
        return null;
    }

    const requestToken = detectionRequestToken + 1;
    detectionRequestToken = requestToken;
    if (activeDetectionController) {
        activeDetectionController.abort();
    }
    activeDetectionController = new AbortController();
    isDetectionInFlight = true;
    const submittedFile = currentFile;
    const shouldCompress = submittedFile.size > MAX_UPLOAD_BEFORE_COMPRESS;
    detectBtn.disabled = true;
    detectBtn.textContent = shouldCompress ? '压缩图片中...' : '处理中...';
    setPreviewStatus(shouldCompress ? '压缩图片中' : '处理中');
    resultCount.textContent = shouldCompress ? '压缩图片中' : '处理中';
    page?.classList.add('is-detecting');

    try {
        await ensureSessionId();
        const fileToUpload = await compressImageIfNeeded(submittedFile);
        if (requestToken !== detectionRequestToken || currentFile !== submittedFile) {
            return null;
        }
        const formData = new FormData();
        formData.append('image', fileToUpload);
        formData.append('detect_type', pageType === 'fruit' ? 'fruit' : 'leaf');
        formData.append('mode', syncDetectModeState());
        appendSessionId(formData);

        detectBtn.textContent = '识别中...';
        setPreviewStatus('识别中');
        resultCount.textContent = '识别中';
        const response = await fetch('/detect', {
            method: 'POST',
            body: formData,
            signal: activeDetectionController.signal
        });
        let data = {};
        try {
            data = await response.json();
        } catch {
            data = {};
        }
        if (requestToken !== detectionRequestToken || currentFile !== submittedFile) {
            return null;
        }
        if (!response.ok) {
            const errorMessage = getResponseErrorMessage(data, response);
            showDetectionError(errorMessage, getDetectionErrorDisplay(data, response));
            setPreviewStatus(currentFile === submittedFile ? '已上传未识别' : '未上传');
            return null;
        }
        if (data.success === false || data.error) {
            showDetectionError(getResponseErrorMessage(data, response), getDetectionErrorDisplay(data, response));
            setPreviewStatus('已上传未识别');
            return null;
        }
        if (requestToken !== detectionRequestToken || currentFile !== submittedFile) {
            return null;
        }
        syncSessionId(data.session_id);
        applyResult(data, {
            shouldSave,
            isDemo,
            isRealUpload: hasUserSelectedImage && !isDemo
        });
        setPreviewStatus('识别完成');
        showToast(successMessage);
        return data;
    } catch (error) {
        if (error.name !== 'AbortError' && requestToken === detectionRequestToken && currentFile === submittedFile) {
            setPreviewStatus('已上传未识别');
            showDetectionError(error.message || '识别失败');
        }
        return null;
    } finally {
        if (requestToken === detectionRequestToken) {
            activeDetectionController = null;
            isDetectionInFlight = false;
            page?.classList.remove('is-detecting');
            detectBtn.disabled = currentFile !== submittedFile || !currentFile;
            detectBtn.textContent = detectLabel;
        }
    }
}

async function getDemoFile(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error('示例图片加载失败');
    }
    const blob = await response.blob();
    const filename = imageUrl.split('/').pop() || 'tomato-demo.jpg';
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

async function runDemo() {
    const demoImages = demoImagesByType[pageType] || demoImagesByType.leaf;
    const image = demoImages[Math.floor(Math.random() * demoImages.length)];
    demoBtn.disabled = true;
    detectBtn.disabled = true;
    fileHint.textContent = '正在载入示例图片并提交识别...';

    try {
        const demoFile = await getDemoFile(image);
        const ready = setPreviewFile(demoFile, '示例图片已载入，正在进行真实检测...', { isDemo: true });
        if (!ready) {
            return;
        }
        await submitDetection({ successMessage: '示例识别完成', isDemo: true, shouldSave: false });
    } catch (error) {
        showToast(error.message || '示例识别失败');
        fileHint.textContent = '示例识别失败，请重新尝试或手动上传图片。';
    } finally {
        demoBtn.disabled = false;
    }
}

imageInput.addEventListener('change', (event) => setPreviewFile(event.target.files[0]));
detectBtn.addEventListener('click', () => submitDetection());
clearBtn.addEventListener('click', clearAll);
demoBtn.addEventListener('click', runDemo);
detectModeInputs.forEach((input) => {
    input.closest('label')?.setAttribute('data-mode', input.value);
    input.addEventListener('change', () => {
        if (input.checked) {
            handleDetectModeChange(input.value);
        }
    });
});
clearHistoryBtn.addEventListener('click', async () => {
    try {
        await ensureSessionId();
        const response = await fetch(buildHistoryUrl(), {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        syncSessionId(data.session_id);
        renderHistory();
        showToast('识别记录已清空');
    } catch {
        showToast('清空记录失败，请稍后重试');
    }
});

uploadZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadZone.classList.remove('dragover');
    setPreviewFile(event.dataTransfer.files[0]);
});

previewFrame.addEventListener('dragover', (event) => {
    event.preventDefault();
    previewFrame.classList.add('dragover');
});

previewFrame.addEventListener('dragleave', () => previewFrame.classList.remove('dragover'));
previewFrame.addEventListener('drop', (event) => {
    event.preventDefault();
    previewFrame.classList.remove('dragover');
    setPreviewFile(event.dataTransfer.files[0]);
});

previewImage.addEventListener('load', () => renderAnnotationOverlay());

window.addEventListener('resize', () => {
    if (annotationResizeFrame) {
        return;
    }
    annotationResizeFrame = window.requestAnimationFrame(() => {
        annotationResizeFrame = 0;
        renderAnnotationOverlay();
    });
});

annotationToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    annotationsVisible = !annotationsVisible;
    annotationLayer?.classList.toggle('is-visible', annotationsVisible);
    annotationToggle.textContent = annotationsVisible ? '隐藏标注' : '显示标注';
    annotationToggle.setAttribute('aria-pressed', String(annotationsVisible));
});

previewFrame.addEventListener('click', (event) => {
    if (event.target.closest('button,label,input') || previewFrame.classList.contains('has-image')) {
        return;
    }
    imageInput.click();
});

syncDetectModeState();
setDefaultFileHint();
runLayeredPageIntro();
ensureSessionId()
    .catch(() => {
        showToast('会话初始化失败，历史记录暂不可用');
    })
    .finally(() => runWhenIdle(renderHistory, 2200));
