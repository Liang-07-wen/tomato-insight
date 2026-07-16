(function () {
    'use strict';

    if (window.__aboutPageInitialized) {
        return;
    }
    window.__aboutPageInitialized = true;

    const SCROLLER_SELECTORS = [
        '.about-flow-grid'
    ];

    const SPEED_PX_PER_SECOND = 20;
    const RESUME_DELAY_MS = 5000;
    const REFRESH_DELAY_MS = 180;
    const TICK_MS = 90;
    const MIN_SCROLLABLE_PX = 8;
    const DATA_DETAILS = {
        leaf: {
            label: 'LEAF DATASET',
            title: '叶片数据基础',
            intro: '围绕番茄叶片病害识别构建的核心数据基础，覆盖复杂叶面纹理、病斑变化与多样拍摄条件。',
            metrics: [
                ['样本规模', '12,800 张', '覆盖叶片病斑、黄化、纹理异常等主要表现。'],
                ['场景覆盖', '多角度 / 多光照 / 多背景', '增强复杂环境下的识别适应性。'],
                ['识别重点', '叶面纹理与异常区域', '支撑病害初步识别与定位分析。'],
                ['模型价值', '复杂叶片场景基础', '为叶片模型检测提供稳定训练支撑。']
            ],
            q1: '为什么叶片数据更多？',
            body1: '叶片病害在实际农业场景中表现更复杂，不同病斑形态、颜色变化、叶脉纹理、阴影遮挡和拍摄距离都会影响识别效果。因此系统需要更大规模的叶片样本来覆盖真实使用场景，提升模型对复杂叶面特征的理解能力。',
            q2: '它在系统中承担什么作用？',
            body2: '叶片数据主要用于支撑叶片模型的病害识别能力，帮助系统从上传图像中识别可疑病斑区域，并输出检测类别、位置和辅助说明，是整个识别链路中的重要基础模块。',
            summary: '叶片数据不是单纯堆数量，而是为复杂场景识别建立稳定基础。'
        },
        fruit: {
            label: 'FRUIT DATASET',
            title: '果实数据基础',
            intro: '围绕番茄果实目标识别与状态分析构建的数据基础，聚焦果实区域定位与异常表现判断。',
            metrics: [
                ['样本规模', '1,981 张', '聚焦番茄果实目标与异常区域。'],
                ['识别重点', '目标定位 / 状态判断', '突出果实成熟状态与问题区域识别。'],
                ['场景特点', '目标更集中', '适合展示果实区域框选与识别输出。'],
                ['模型价值', '实景果实检测支撑', '为果实模型识别提供清晰的目标样本基础。']
            ],
            q1: '为什么果实数据量比叶片少？',
            body1: '果实识别与叶片识别不同，它更偏向目标区域定位和状态识别，关注的是果实整体轮廓、成熟状态和异常区域，因此虽然样本规模较小，但目标更集中、识别指向更明确。',
            q2: '它在系统中承担什么作用？',
            body2: '果实数据主要用于支撑果实模型检测，帮助系统在上传果实图像后，快速给出检测区域、识别类别和可视化结果，更适合做实景目标查看。',
            summary: '果实数据更聚焦目标定位，让检测结果更直观、更适合查看。'
        },
        dual: {
            label: 'DUAL-MODEL RECOGNITION',
            title: '叶片 + 果实双模型识别',
            intro: '系统针对叶片与果实两类场景分别建立识别入口，减少混合场景干扰，形成更清晰的检测逻辑。',
            metrics: [
                ['双模型模式', '叶片模型 / 果实模型', '根据图像类型匹配对应检测模型。'],
                ['识别优势', '场景分离更清晰', '减少不同场景混合带来的识别干扰。'],
                ['检测结果', '更匹配具体任务', '叶片强调病斑识别，果实强调目标定位。'],
                ['使用体验', '流程更直观', '用户更容易理解系统逻辑与检测结果。']
            ],
            q1: '为什么要做双模型？',
            body1: '叶片与果实在视觉特征、识别目标和展示方式上差异较大。分别使用叶片模型与果实模型，可以减少不同任务之间的干扰，让检测逻辑更清晰。',
            q2: '双模型带来的价值是什么？',
            body2: '双模型识别将叶片病害检测和果实目标检测分开处理，使模型任务更聚焦、输出解释更清楚，也更方便在项目说明或技术交流中说明系统结构和应用价值。',
            summary: '双模型不是页面分裂，而是让检测逻辑更清晰、展示表达更专业。'
        },
        result: {
            label: 'INTERPRETABLE RESULT',
            title: '结果可解释输出',
            intro: '系统输出不仅包含检测结论，还以可视化标注和中文说明的方式帮助用户理解识别结果。',
            metrics: [
                ['结果内容', '类别 / 置信度 / 标注框', '以清晰结构展示模型输出。'],
                ['展示方式', '可视化 + 中文说明', '方便用户查看与结果说明。'],
                ['辅助能力', '说明 + 建议', '帮助用户理解结果含义。'],
                ['应用价值', '更容易复查与说明', '适合结果复查、记录保存与说明整理。']
            ],
            q1: '为什么强调可解释？',
            body1: '如果系统只输出一个简单的类别名称，用户很难理解识别依据，也不利于展示项目完整度。因此系统将结果以检测框、类别、置信度和中文辅助说明的方式统一呈现，让识别过程更清楚、结果表达更完整。',
            q2: '它在页面中承担什么作用？',
            body2: '结果可解释模块是连接模型输出与用户理解的重要桥梁。它能够把技术结果转换为更直观的展示形式，提升页面可读性、结果说明能力和实际使用体验。',
            summary: '真正有价值的不是“识别了”，而是“能让人看懂识别了什么”。'
        }
    };

    const controllers = new Map();
    let refreshTimer = 0;

    function renderInlineDetail(panel, detail) {
        if (panel.dataset.detailRendered === 'true') {
            return;
        }

        panel.innerHTML = `
            <button class="about-data-collapse" type="button" data-about-detail-collapse aria-label="收起数据详情">
                <span>收起</span>
            </button>
            <div class="about-data-detail-head">
                <p>${detail.label}</p>
                <h3>${detail.title}</h3>
                <span>${detail.intro}</span>
            </div>
            <div class="about-data-detail-metrics">
                ${detail.metrics.map(([label, value, copy]) => (
                    `<article><span>${label}</span><strong>${value}</strong><p>${copy}</p></article>`
                )).join('')}
            </div>
            <div class="about-data-detail-core">
                <h4>${detail.q1}</h4>
                <p>${detail.body1}</p>
            </div>
            <details class="about-data-more">
                <summary>更多说明</summary>
                <div class="about-data-detail-copy">
                    <article>
                        <h4>${detail.q2}</h4>
                        <p>${detail.body2}</p>
                    </article>
                </div>
            </details>
            <p class="about-data-detail-summary">${detail.summary}</p>
        `;
        panel.dataset.detailRendered = 'true';
    }

    function closeInlineDetail(panel) {
        if (!panel || !panel.classList.contains('is-open')) {
            return;
        }

        panel.style.maxHeight = `${panel.scrollHeight}px`;
        panel.classList.remove('is-open');
        panel.classList.remove('is-switching');
        panel.setAttribute('aria-hidden', 'true');
        window.requestAnimationFrame(() => {
            panel.style.maxHeight = '0px';
        });
    }

    function openInlineDetail(panel, detail) {
        renderInlineDetail(panel, detail);
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        panel.classList.remove('is-switching');
        void panel.offsetWidth;
        panel.classList.add('is-switching');
        panel.style.maxHeight = `${panel.scrollHeight}px`;
    }

    function updateDataDetail(key, buttons, panels) {
        const selectedPanel = panels.find((panel) => panel.dataset.detailFor === key);
        const selectedButton = buttons.find((button) => button.dataset.aboutDetail === key);
        const alreadyOpen = selectedPanel && selectedPanel.classList.contains('is-open');

        if (!selectedPanel || !selectedButton) {
            return;
        }

        if (alreadyOpen) {
            selectedButton.classList.remove('is-active');
            selectedButton.setAttribute('aria-pressed', 'false');
            selectedButton.setAttribute('aria-expanded', 'false');
            closeInlineDetail(selectedPanel);
        } else {
            const detail = DATA_DETAILS[key] || DATA_DETAILS.leaf;
            selectedButton.classList.add('is-active');
            selectedButton.setAttribute('aria-pressed', 'true');
            selectedButton.setAttribute('aria-expanded', 'true');
            openInlineDetail(selectedPanel, detail);
        }
    }

    function initDataDetails() {
        const buttons = Array.from(document.querySelectorAll('[data-about-detail]'));
        const panels = Array.from(document.querySelectorAll('[data-about-detail-panel]'));

        if (!buttons.length || !panels.length) {
            return;
        }

        panels.forEach((panel) => {
            panel.classList.remove('is-open');
            panel.classList.remove('is-switching');
            panel.setAttribute('aria-hidden', 'true');
            panel.style.maxHeight = '0px';
        });

        buttons.forEach((button) => {
            button.classList.remove('is-active');
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-expanded', 'false');
            button.addEventListener('click', () => updateDataDetail(button.dataset.aboutDetail, buttons, panels));
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    updateDataDetail(button.dataset.aboutDetail, buttons, panels);
                }
            });
        });

        panels.forEach((panel) => {
            panel.addEventListener('click', (event) => {
                if (!event.target.closest('[data-about-detail-collapse]')) {
                    return;
                }
                const key = panel.dataset.detailFor;
                const button = buttons.find((item) => item.dataset.aboutDetail === key);
                if (button) {
                    button.classList.remove('is-active');
                    button.setAttribute('aria-pressed', 'false');
                    button.setAttribute('aria-expanded', 'false');
                }
                closeInlineDetail(panel);
            });
        });

        window.addEventListener('resize', () => {
            panels.forEach((panel) => {
                if (panel.classList.contains('is-open')) {
                    panel.style.maxHeight = `${panel.scrollHeight}px`;
                }
            });
        }, { passive: true });
    }

    function isMobileMode() {
        if (document.body && document.body.classList && document.body.classList.contains('device-mobile')) {
            return true;
        }
        if (window.DeviceMode && typeof window.DeviceMode.isMobile === 'function') {
            return window.DeviceMode.isMobile() || (window.innerWidth > 0 && window.innerWidth <= 1024);
        }
        return window.innerWidth > 0 && window.innerWidth <= 1024;
    }

    function getMaxScroll(element) {
        return Math.max(0, element.scrollWidth - element.clientWidth);
    }

    function isScrollable(element) {
        return getMaxScroll(element) > MIN_SCROLLABLE_PX;
    }

    function createController(element) {
        let rafId = 0;
        let resumeTimer = 0;
        let lastFrameTime = 0;
        let targetScrollLeft = 0;
        let cloneNodes = [];
        let cycleDistance = 0;
        let originalChildCount = 0;
        let active = false;
        let paused = false;
        let programmaticScroll = false;
        let isInViewport = !('IntersectionObserver' in window);
        let viewportObserver = null;
        const originalScrollSnapType = element.style.scrollSnapType;

        function canAutoplay() {
            return !document.hidden && isInViewport && isMobileMode() && isScrollable(element);
        }

        function clearTimers() {
            window.clearTimeout(resumeTimer);
            resumeTimer = 0;
        }

        function cancelFrame() {
            if (rafId) {
                window.clearInterval(rafId);
                rafId = 0;
            }
        }

        function scheduleFrame() {
            if (!rafId && canAutoplay()) {
                lastFrameTime = performance.now();
                rafId = window.setInterval(() => tick(performance.now()), TICK_MS);
            }
        }

        function setAutoplaySnapMode(enabled) {
            element.style.scrollSnapType = enabled ? 'none' : originalScrollSnapType;
        }

        function getOriginalChildren() {
            return Array.from(element.children).filter((child) => child.dataset.aboutAutoplayClone !== 'true');
        }

        function removeClones() {
            cloneNodes.forEach((clone) => clone.remove());
            cloneNodes = [];
            cycleDistance = 0;
            originalChildCount = 0;
            delete element.dataset.aboutLoopClones;
        }

        function disableCloneFocus(clone) {
            clone.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach((node) => {
                node.setAttribute('tabindex', '-1');
            });
        }

        function setupClones() {
            removeClones();

            const originalChildren = getOriginalChildren();
            if (!originalChildren.length || !isScrollable(element)) {
                return false;
            }

            cloneNodes = originalChildren.map((child) => {
                const clone = child.cloneNode(true);
                clone.dataset.aboutAutoplayClone = 'true';
                clone.setAttribute('aria-hidden', 'true');
                disableCloneFocus(clone);
                element.appendChild(clone);
                return clone;
            });

            const firstOriginal = originalChildren[0];
            const firstClone = cloneNodes[0];
            cycleDistance = firstClone.offsetLeft - firstOriginal.offsetLeft;
            originalChildCount = originalChildren.length;

            if (cycleDistance <= MIN_SCROLLABLE_PX) {
                removeClones();
                return false;
            }

            element.dataset.aboutLoopClones = String(originalChildCount);
            return true;
        }

        function normalizeScrollPosition() {
            if (cycleDistance <= MIN_SCROLLABLE_PX) {
                return;
            }

            while (element.scrollLeft >= cycleDistance) {
                element.scrollLeft -= cycleDistance;
            }
            targetScrollLeft = element.scrollLeft;
        }

        function pauseForUser() {
            if (!active) {
                return;
            }
            paused = true;
            targetScrollLeft = element.scrollLeft;
            clearTimers();
            resumeLater();
        }

        function resumeLater(delay = RESUME_DELAY_MS) {
            if (!active) {
                return;
            }
            window.clearTimeout(resumeTimer);
            resumeTimer = window.setTimeout(() => {
                if (!active || !canAutoplay()) {
                    return;
                }
                setAutoplaySnapMode(true);
                normalizeScrollPosition();
                paused = false;
                lastFrameTime = performance.now();
                scheduleFrame();
            }, delay);
        }

        function handleUserIntent() {
            if (programmaticScroll) {
                return;
            }
            pauseForUser();
        }

        function handleUserDone() {
            if (programmaticScroll) {
                return;
            }
            setAutoplaySnapMode(false);
            targetScrollLeft = element.scrollLeft;
            resumeLater();
        }

        function tick(now) {
            if (!active) {
                return;
            }

            if (!canAutoplay() || cycleDistance <= MIN_SCROLLABLE_PX) {
                stop();
                return;
            }

            if (paused) {
                lastFrameTime = now;
                return;
            }

            if (!lastFrameTime) {
                lastFrameTime = now;
            }

            const elapsedSeconds = Math.min((now - lastFrameTime) / 1000, 0.08);
            lastFrameTime = now;

            targetScrollLeft = Math.max(targetScrollLeft, element.scrollLeft);
            targetScrollLeft += SPEED_PX_PER_SECOND * elapsedSeconds;
            programmaticScroll = true;
            setAutoplaySnapMode(true);

            if (cycleDistance > MIN_SCROLLABLE_PX && targetScrollLeft >= cycleDistance) {
                targetScrollLeft -= cycleDistance;
            }

            element.scrollLeft = targetScrollLeft;
            normalizeScrollPosition();
            programmaticScroll = false;
        }

        function start() {
            if (active || !canAutoplay()) {
                return;
            }
            active = true;
            paused = false;
            lastFrameTime = performance.now();
            if (!setupClones()) {
                active = false;
                return;
            }
            normalizeScrollPosition();
            targetScrollLeft = element.scrollLeft;
            setAutoplaySnapMode(true);
            element.dataset.aboutAutoplay = 'active';
            scheduleFrame();
        }

        function stop() {
            active = false;
            paused = false;
            programmaticScroll = false;
            lastFrameTime = 0;
            clearTimers();
            cancelFrame();
            setAutoplaySnapMode(false);
            removeClones();
            delete element.dataset.aboutAutoplay;
        }

        function refresh() {
            if (!canAutoplay()) {
                stop();
            } else if (active) {
                const currentScrollLeft = element.scrollLeft;
                if (!setupClones()) {
                    stop();
                    return;
                }
                element.scrollLeft = cycleDistance > MIN_SCROLLABLE_PX
                    ? currentScrollLeft % cycleDistance
                    : currentScrollLeft;
                normalizeScrollPosition();
                lastFrameTime = performance.now();
                if (!paused) {
                    scheduleFrame();
                }
            } else {
                start();
            }
        }

        if ('IntersectionObserver' in window) {
            viewportObserver = new IntersectionObserver((entries) => {
                isInViewport = entries.some((entry) => entry.isIntersecting);
                refresh();
            }, {
                root: null,
                rootMargin: '120px 0px',
                threshold: 0.01
            });
            viewportObserver.observe(element);
        }

        element.addEventListener('pointerdown', handleUserIntent, { passive: true });
        element.addEventListener('pointerup', handleUserDone, { passive: true });
        element.addEventListener('pointercancel', handleUserDone, { passive: true });
        element.addEventListener('touchstart', handleUserIntent, { passive: true });
        element.addEventListener('touchend', handleUserDone, { passive: true });
        element.addEventListener('wheel', () => {
            handleUserIntent();
            handleUserDone();
        }, { passive: true });
        element.addEventListener('keydown', handleUserIntent);
        element.addEventListener('keyup', handleUserDone);
        element.addEventListener('focusin', handleUserIntent);
        element.addEventListener('focusout', handleUserDone);

        return {
            element,
            start,
            stop,
            refresh,
            destroy() {
                stop();
                if (viewportObserver) {
                    viewportObserver.disconnect();
                    viewportObserver = null;
                }
            }
        };
    }

    function collectScrollers() {
        return SCROLLER_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    }

    function refreshControllers() {
        collectScrollers().forEach((element) => {
            if (!controllers.has(element)) {
                controllers.set(element, createController(element));
            }
        });

        controllers.forEach((controller) => controller.refresh());
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refreshControllers, REFRESH_DELAY_MS);
    }

    function formatCount(value) {
        return Math.round(value).toLocaleString('en-US');
    }

    function easeOutCubic(progress) {
        return 1 - Math.pow(1 - progress, 3);
    }

    function setCountFinal(node) {
        const target = Number(node.dataset.target || 0);
        node.textContent = formatCount(target);
        node.dataset.countAnimated = 'true';
        node.classList.add('is-count-complete');
    }

    function animateCount(node) {
        if (node.dataset.countAnimated === 'true') {
            return;
        }

        const target = Number(node.dataset.target || 0);
        if (!target) {
            return;
        }

        const reduceMotion = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reduceMotion) {
            setCountFinal(node);
            return;
        }

        const startValue = 1;
        const duration = 1050;
        const startTime = performance.now();

        node.dataset.countAnimated = 'true';
        node.classList.remove('is-count-complete');
        node.textContent = formatCount(startValue);

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);
            const current = startValue + ((target - startValue) * eased);

            node.textContent = formatCount(Math.min(current, target));

            if (progress < 1) {
                window.requestAnimationFrame(tick);
                return;
            }

            node.textContent = formatCount(target);
            node.classList.add('is-count-complete');
        }

        window.requestAnimationFrame(tick);
    }

    function initCountUpNumbers() {
        const numbers = Array.from(document.querySelectorAll('.about-data-count[data-target]'));

        if (!numbers.length) {
            return;
        }

        numbers.forEach((node) => {
            if (!node.textContent.trim() || node.textContent.trim() === '0') {
                node.textContent = '1';
            }
        });

        if (!('IntersectionObserver' in window)) {
            numbers.forEach(animateCount);
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting && entry.intersectionRatio <= 0) {
                    return;
                }

                animateCount(entry.target);
                observer.unobserve(entry.target);
            });
        }, {
            root: null,
            rootMargin: '0px 0px -8% 0px',
            threshold: 0.32
        });

        numbers.forEach((node) => observer.observe(node));
    }

    function init() {
        initDataDetails();
        initCountUpNumbers();
        refreshControllers();
        window.addEventListener('device-mode-change', scheduleRefresh);
        window.addEventListener('load', scheduleRefresh, { once: true });
        window.addEventListener('resize', scheduleRefresh, { passive: true });
        window.addEventListener('orientationchange', scheduleRefresh, { passive: true });
        document.addEventListener('visibilitychange', scheduleRefresh);
        window.setTimeout(scheduleRefresh, 600);
        window.addEventListener('pagehide', () => {
            controllers.forEach((controller) => controller.destroy());
            controllers.clear();
        }, { once: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}());
