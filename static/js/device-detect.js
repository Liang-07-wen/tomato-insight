(function () {
    'use strict';

    var DEVICE_CLASSES = [
        'device-mobile',
        'device-desktop',
        'device-uncertain',
        'has-touch',
        'no-touch',
        'viewport-phone',
        'viewport-tablet',
        'viewport-desktop'
    ];

    var lastResult = null;
    var lastClassKey = '';
    var refreshTimer = 0;
    var DEBOUNCE_MS = 140;

    function safeNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function safeMatch(query) {
        try {
            return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
        } catch (error) {
            return false;
        }
    }

    function getViewport() {
        var doc = document.documentElement || {};
        var width = safeNumber(window.innerWidth, 0) || safeNumber(doc.clientWidth, 0) || 0;
        var height = safeNumber(window.innerHeight, 0) || safeNumber(doc.clientHeight, 0) || 0;

        return {
            width: Math.max(0, Math.round(width)),
            height: Math.max(0, Math.round(height))
        };
    }

    function getViewportType(width) {
        if (!width || width <= 480) {
            return 'phone';
        }
        if (width <= 1024) {
            return 'tablet';
        }
        return 'desktop';
    }

    function readUaDataMobile(nav) {
        try {
            if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean') {
                return nav.userAgentData.mobile;
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    function getFeatures() {
        var nav = window.navigator || {};
        var maxTouchPoints = safeNumber(nav.maxTouchPoints, safeNumber(nav.msMaxTouchPoints, 0));
        var hasTouch = maxTouchPoints > 0;

        try {
            hasTouch = hasTouch || 'ontouchstart' in window;
        } catch (error) {
            hasTouch = maxTouchPoints > 0;
        }

        var coarsePointer = safeMatch('(pointer: coarse)');
        var finePointer = safeMatch('(pointer: fine)');
        var anyCoarsePointer = safeMatch('(any-pointer: coarse)');
        var anyFinePointer = safeMatch('(any-pointer: fine)');
        var hover = safeMatch('(hover: hover)');
        var anyHover = safeMatch('(any-hover: hover)');

        return {
            hasNavigator: !!window.navigator,
            hasMatchMedia: typeof window.matchMedia === 'function',
            hasTouch: !!(hasTouch || anyCoarsePointer),
            coarsePointer: !!coarsePointer,
            finePointer: !!finePointer,
            anyCoarsePointer: !!anyCoarsePointer,
            anyFinePointer: !!anyFinePointer,
            hover: !!hover,
            anyHover: !!anyHover,
            maxTouchPoints: Math.max(0, maxTouchPoints),
            uaDataMobile: readUaDataMobile(nav)
        };
    }

    function getUaFlags(features) {
        var nav = window.navigator || {};
        var ua = '';
        var platform = '';

        try {
            ua = String(nav.userAgent || '');
            platform = String(nav.platform || '');
        } catch (error) {
            ua = '';
            platform = '';
        }

        var mobileUa = /(iphone|ipod|windows phone|iemobile|android.*mobile|blackberry|bb10|opera mini|mobile safari|mobile\/|mobi)/i.test(ua);
        var tabletUa = /(ipad|tablet|playbook|silk|kindle|android(?!.*mobile)|nexus 7|nexus 9|sm-t|harmonyos.*(pad|tablet)|openharmony.*(pad|tablet))/i.test(ua);
        var harmonyUa = /(harmonyos|openharmony|arkweb)/i.test(ua);
        var embeddedMobileUa = /(micromessenger|alipayclient|mqqbrowser|qqbrowser|dingtalk|weibo|fb_iab|instagram|\bwv\b)/i.test(ua);
        var ipadMasquerade = platform === 'MacIntel' && features.maxTouchPoints > 1;

        return {
            ua: ua,
            platform: platform,
            mobileUa: mobileUa,
            tabletUa: tabletUa,
            harmonyUa: harmonyUa,
            embeddedMobileUa: embeddedMobileUa,
            ipadMasquerade: ipadMasquerade
        };
    }

    function buildResult(mode, confidence, reasons, viewport, features, uncertain) {
        return {
            mode: mode,
            isMobile: mode === 'mobile',
            isDesktop: mode === 'desktop',
            confidence: confidence,
            reason: reasons.slice(),
            uncertain: !!uncertain,
            viewport: {
                width: viewport.width,
                height: viewport.height
            },
            features: {
                hasTouch: features.hasTouch,
                coarsePointer: features.coarsePointer,
                finePointer: features.finePointer,
                hover: features.hover,
                maxTouchPoints: features.maxTouchPoints,
                uaDataMobile: features.uaDataMobile
            }
        };
    }

    function classifyDeviceMode() {
        var viewport = getViewport();
        var features = getFeatures();
        var uaFlags = getUaFlags(features);
        var width = viewport.width;
        var reasons = [];

        if (features.uaDataMobile === true) {
            reasons.push('navigator.userAgentData.mobile=true');
            return buildResult('mobile', 'high', reasons, viewport, features, false);
        }

        if (uaFlags.ipadMasquerade) {
            reasons.push('platform=MacIntel with maxTouchPoints>1');
            return buildResult('mobile', 'high', reasons, viewport, features, false);
        }

        if (uaFlags.mobileUa) {
            reasons.push('mobile userAgent token');
            return buildResult('mobile', 'high', reasons, viewport, features, false);
        }

        if (uaFlags.tabletUa) {
            reasons.push('tablet userAgent token');
            return buildResult('mobile', 'high', reasons, viewport, features, false);
        }

        if (uaFlags.harmonyUa && (features.hasTouch || features.coarsePointer || width <= 1024)) {
            reasons.push('HarmonyOS/OpenHarmony with mobile-like features');
            return buildResult('mobile', 'medium', reasons, viewport, features, false);
        }

        if (width > 0 && width <= 768) {
            reasons.push('viewport width <= 768');
            return buildResult('mobile', 'high', reasons, viewport, features, false);
        }

        if (features.coarsePointer && !features.finePointer) {
            reasons.push('primary pointer is coarse without fine pointer');
            return buildResult('mobile', 'high', reasons, viewport, features, false);
        }

        if (uaFlags.embeddedMobileUa && (features.hasTouch || features.coarsePointer || width <= 1024)) {
            reasons.push('embedded mobile browser with mobile-like features');
            return buildResult('mobile', 'medium', reasons, viewport, features, false);
        }

        if (
            width >= 1024 &&
            features.hover &&
            features.finePointer &&
            features.uaDataMobile !== true &&
            !uaFlags.mobileUa &&
            !uaFlags.tabletUa &&
            !uaFlags.ipadMasquerade
        ) {
            reasons.push('wide viewport with hover:hover and pointer:fine');
            return buildResult('desktop', 'high', reasons, viewport, features, false);
        }

        if (width > 0 && width <= 1024) {
            reasons.push('viewport width <= 1024');
            return buildResult('mobile', 'medium', reasons, viewport, features, false);
        }

        if (width > 1024 && features.hasTouch && !(features.hover && features.finePointer)) {
            reasons.push('large touch-capable environment without clear desktop pointer');
            return buildResult('mobile', 'medium', reasons, viewport, features, true);
        }

        if (!width || !features.hasNavigator || !features.hasMatchMedia) {
            reasons.push('incomplete browser feature data');
            return buildResult('mobile', 'fallback', reasons, viewport, features, true);
        }

        reasons.push('no reliable desktop signal');
        return buildResult('mobile', 'fallback', reasons, viewport, features, true);
    }

    function copyResult(result) {
        return {
            mode: result.mode,
            isMobile: result.isMobile,
            isDesktop: result.isDesktop,
            confidence: result.confidence,
            reason: result.reason.slice(),
            viewport: {
                width: result.viewport.width,
                height: result.viewport.height
            },
            features: {
                hasTouch: result.features.hasTouch,
                coarsePointer: result.features.coarsePointer,
                finePointer: result.features.finePointer,
                hover: result.features.hover,
                maxTouchPoints: result.features.maxTouchPoints,
                uaDataMobile: result.features.uaDataMobile
            }
        };
    }

    function getClassKey(result) {
        return [
            result.mode,
            result.confidence,
            result.uncertain ? 'uncertain' : 'certain',
            result.features.hasTouch ? 'touch' : 'no-touch',
            getViewportType(result.viewport.width)
        ].join('|');
    }

    function applyBodyClasses(result) {
        var body = document.body;
        var viewportType = getViewportType(result.viewport.width);
        var i;

        if (!body || !body.classList) {
            return;
        }

        for (i = 0; i < DEVICE_CLASSES.length; i += 1) {
            body.classList.remove(DEVICE_CLASSES[i]);
        }

        body.classList.add(result.isDesktop ? 'device-desktop' : 'device-mobile');
        if (result.uncertain || result.confidence === 'fallback') {
            body.classList.add('device-uncertain');
        }
        body.classList.add(result.features.hasTouch ? 'has-touch' : 'no-touch');
        body.classList.add('viewport-' + viewportType);
    }

    function emitChange(previous, next, changed) {
        if (!changed || typeof window.CustomEvent !== 'function') {
            return;
        }

        window.dispatchEvent(new CustomEvent('device-mode-change', {
            detail: {
                previous: previous ? copyResult(previous) : null,
                current: copyResult(next)
            }
        }));
    }

    function refresh() {
        var previous = lastResult;
        var next = classifyDeviceMode();
        var nextClassKey = getClassKey(next);
        var changed = nextClassKey !== lastClassKey;

        applyBodyClasses(next);
        lastResult = next;
        lastClassKey = nextClassKey;
        emitChange(previous, next, changed);

        return copyResult(next);
    }

    function get() {
        return copyResult(lastResult || refresh());
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refresh, DEBOUNCE_MS);
    }

    window.DeviceMode = {
        get: get,
        refresh: refresh,
        isMobile: function () {
            return get().isMobile;
        },
        isDesktop: function () {
            return get().isDesktop;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    } else {
        refresh();
    }

    window.addEventListener('resize', scheduleRefresh, { passive: true });
    window.addEventListener('orientationchange', scheduleRefresh, { passive: true });

    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
        window.visualViewport.addEventListener('resize', scheduleRefresh, { passive: true });
    }

    if (window.screen && window.screen.orientation && typeof window.screen.orientation.addEventListener === 'function') {
        window.screen.orientation.addEventListener('change', scheduleRefresh, { passive: true });
    }
}());
