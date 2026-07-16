function getDelay(body, name, fallback) {
    const value = Number(body?.dataset?.[name]);
    return Number.isFinite(value) ? value : fallback;
}

function getNavMode() {
    const deviceMode = typeof window.DeviceMode?.refresh === 'function'
        ? window.DeviceMode.refresh()
        : null;

    if (deviceMode?.mode === 'desktop') {
        return 'desktop';
    }
    if (deviceMode?.mode === 'mobile') {
        return 'touch';
    }

    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const supportsHover = typeof window.matchMedia === 'function'
        ? window.matchMedia('(hover: hover)').matches
        : false;
    const hasFinePointer = typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: fine)').matches
        : false;

    if (width >= 1024 && supportsHover && hasFinePointer) {
        return 'desktop';
    }

    return 'touch';
}

function initGlassNav(body = document.body) {
    if (!body || body.dataset.glassNavInitialized === 'true') {
        return;
    }

    body.dataset.glassNavInitialized = 'true';
    const shiftDelay = getDelay(body, 'navShiftDelay', 420);
    const brightDelay = getDelay(body, 'navBrightDelay', 1000);
    const settledDelay = getDelay(body, 'navSettledDelay', 2820);

    requestAnimationFrame(() => {
        body.classList.add('home-intro-visible');
    });

    setTimeout(() => {
        body.classList.add('home-shift');
    }, shiftDelay);

    setTimeout(() => {
        body.classList.add('home-bright');
    }, brightDelay);

    setTimeout(() => {
        body.classList.add('home-settled');
    }, settledDelay);
}

function initExpandableNav() {
    const nav = document.querySelector('.home-nav');
    if (!nav || nav.dataset.expandableNavInitialized === 'true') {
        return;
    }

    nav.dataset.expandableNavInitialized = 'true';
    const body = document.body;
    const toggle = nav.querySelector('.nav-toggle');
    const overlay = document.querySelector('.nav-overlay');
    const navMenu = nav.querySelector('.nav-links');
    const navLinks = Array.from(nav.querySelectorAll('.nav-links a'));

    let collapseTimer = 0;
    let cleanupTimer = 0;
    let resizeTimer = 0;
    let currentMode = '';

    const clearTimers = () => {
        window.clearTimeout(collapseTimer);
        window.clearTimeout(cleanupTimer);
        window.clearTimeout(resizeTimer);
        collapseTimer = 0;
        cleanupTimer = 0;
        resizeTimer = 0;
    };

    const closeDrawer = () => {
        body?.classList.remove('nav-drawer-open');
        nav.classList.remove('is-expanded', 'is-collapsing');
        nav.dataset.navState = 'collapsed';
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', '打开导航菜单');
        }
        if (navMenu && currentMode === 'touch') {
            navMenu.setAttribute('inert', '');
            navMenu.setAttribute('aria-hidden', 'true');
        }
        if (overlay) {
            window.setTimeout(() => {
                if (!body?.classList.contains('nav-drawer-open')) {
                    overlay.hidden = true;
                }
            }, 260);
        }
    };

    const expandNav = () => {
        if (currentMode !== 'desktop') {
            return;
        }
        clearTimers();
        nav.classList.remove('is-collapsing');
        nav.classList.add('is-expanded');
        nav.dataset.navState = 'expanded';
    };

    const shouldStayExpanded = () => nav.matches(':hover') || nav.contains(document.activeElement);

    const collapseNav = () => {
        if (currentMode !== 'desktop') {
            return;
        }
        window.clearTimeout(collapseTimer);
        collapseTimer = window.setTimeout(() => {
            if (shouldStayExpanded()) {
                return;
            }

            nav.classList.add('is-collapsing');
            nav.classList.remove('is-expanded');
            nav.dataset.navState = 'collapsed';

            cleanupTimer = window.setTimeout(() => {
                nav.classList.remove('is-collapsing');
            }, 520);
        }, 180);
    };

    const openDrawer = () => {
        if (currentMode !== 'touch') {
            return;
        }
        clearTimers();
        nav.classList.remove('is-expanded', 'is-collapsing');
        body?.classList.add('nav-drawer-open');
        nav.dataset.navState = 'drawer-open';
        if (overlay) {
            overlay.hidden = false;
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', '关闭导航菜单');
        }
        if (navMenu) {
            navMenu.removeAttribute('inert');
            navMenu.setAttribute('aria-hidden', 'false');
        }
    };

    const toggleDrawer = () => {
        if (currentMode !== 'touch') {
            return;
        }
        if (body?.classList.contains('nav-drawer-open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    };

    const applyNavMode = (mode = getNavMode()) => {
        if (!body || mode === currentMode) {
            return;
        }

        clearTimers();
        currentMode = mode;
        body.classList.remove('nav-mode-desktop', 'nav-mode-touch', 'nav-drawer-open');
        body.classList.add(`nav-mode-${mode}`);
        nav.classList.remove('is-expanded', 'is-collapsing');
        nav.dataset.navMode = mode;
        nav.dataset.navState = 'collapsed';

        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', '打开导航菜单');
        }
        if (navMenu) {
            if (mode === 'touch') {
                navMenu.setAttribute('inert', '');
                navMenu.setAttribute('aria-hidden', 'true');
            } else {
                navMenu.removeAttribute('inert');
                navMenu.removeAttribute('aria-hidden');
            }
        }
        if (overlay) {
            overlay.hidden = true;
        }
    };

    nav.addEventListener('mouseenter', expandNav);
    nav.addEventListener('mouseleave', collapseNav);
    nav.addEventListener('focusin', expandNav);
    nav.addEventListener('focusout', () => {
        window.setTimeout(() => {
            if (!nav.contains(document.activeElement)) {
                collapseNav();
            }
        }, 0);
    });
    toggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleDrawer();
    });
    overlay?.addEventListener('click', closeDrawer);
    navLinks.forEach((link) => {
        link.addEventListener('click', () => {
            if (currentMode === 'touch') {
                window.setTimeout(closeDrawer, 0);
            }
        });
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && currentMode === 'touch') {
            closeDrawer();
            toggle?.focus();
        }
    });
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            applyNavMode(getNavMode());
        }, 120);
    });
    window.addEventListener('device-mode-change', () => {
        applyNavMode(getNavMode());
    });

    applyNavMode(getNavMode());
}

function canPrefetchResources() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) {
        return false;
    }
    if (['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) {
        return false;
    }

    return document.visibilityState !== 'hidden';
}

function getMobileLikelyNextResource() {
    const path = window.location.pathname;
    if (path.startsWith('/leaf')) {
        return { href: '/fruit', as: 'document' };
    }
    if (path.startsWith('/fruit')) {
        return { href: '/about', as: 'document' };
    }
    if (path.startsWith('/about')) {
        return { href: '/developer', as: 'document' };
    }
    if (path.startsWith('/developer')) {
        return { href: '/leaf', as: 'document' };
    }
    return { href: '/leaf', as: 'document' };
}

function getIdlePrefetchResources() {
    const homePrefetchResources = [
        { href: '/leaf', as: 'document' },
        { href: '/fruit', as: 'document' },
        { href: '/about', as: 'document' },
        { href: '/developer', as: 'document' },
        { href: '/static/css/developer.css', as: 'style' },
        { href: '/static/js/developer.js', as: 'script' }
    ];

    if (window.location.pathname === '/') {
        return homePrefetchResources;
    }

    if (getNavMode() === 'touch') {
        return [getMobileLikelyNextResource()];
    }

    return [
        { href: '/leaf', as: 'document' },
        { href: '/fruit', as: 'document' },
        { href: '/about', as: 'document' },
        { href: '/developer', as: 'document' }
    ];
}

function addPrefetchLink(resource) {
    if (!resource?.href || document.querySelector(`link[data-idle-prefetch="${resource.href}"]`)) {
        return;
    }

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = resource.href;
    link.dataset.idlePrefetch = resource.href;
    if (resource.as) {
        link.as = resource.as;
    }
    if (resource.type) {
        link.type = resource.type;
    }
    document.head.appendChild(link);
}

function scheduleIdleResourcePreload() {
    if (!canPrefetchResources() || document.documentElement.dataset.idlePrefetchReady === 'true') {
        return;
    }

    document.documentElement.dataset.idlePrefetchReady = 'true';
    const run = () => {
        const prefetch = () => {
            if (!canPrefetchResources()) {
                return;
            }
            getIdlePrefetchResources().forEach(addPrefetchLink);
        };

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(prefetch, { timeout: 3200 });
            return;
        }

        window.setTimeout(prefetch, 1600);
    };

    if (document.readyState === 'complete') {
        window.setTimeout(run, 1200);
        return;
    }

    window.addEventListener('load', () => window.setTimeout(run, 1200), { once: true });
}

function runModulePageTransition() {
    try {
        sessionStorage.removeItem('moduleTransition');
    } catch {
        // Ignore storage failures; page navigation should remain unaffected.
    }
}

window.initGlassNav = initGlassNav;
window.initExpandableNav = initExpandableNav;
window.getNavMode = getNavMode;
window.scheduleIdleResourcePreload = scheduleIdleResourcePreload;
window.runModulePageTransition = runModulePageTransition;

window.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    initExpandableNav();
    runModulePageTransition();
    if (body?.dataset.navAnimation === 'enabled') {
        initGlassNav(body);
    }
    scheduleIdleResourcePreload();
});
