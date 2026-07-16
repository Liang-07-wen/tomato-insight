const pageBody = document.body;
const rootElement = document.documentElement;
const startFlowBtn = document.getElementById('startFlowBtn');
const resetFlowBtn = document.getElementById('resetFlowBtn');
const homeResetLink = document.querySelector('[data-home-reset]');
const entryGrid = document.querySelector('.entry-grid');
const entryCards = Array.from(document.querySelectorAll('.entry-card'));
let entryFocusClearTimer = 0;
let lastTouchInteractionTime = 0;
let selectionExitFrame = 0;

function forceHomeScrollTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    rootElement.scrollTop = 0;
    pageBody.scrollTop = 0;
}

function enterSelectionMode() {
    if (pageBody.classList.contains('home-selection-visible')) {
        return;
    }

    window.cancelAnimationFrame(selectionExitFrame);
    clearEntryFocusState();
    rootElement.classList.remove('home-lock-scroll');
    pageBody.classList.add('home-selection-mode');
    forceHomeScrollTop();

    window.requestAnimationFrame(() => {
        pageBody.classList.add('home-selection-visible');
    });
}

function exitSelectionMode() {
    if (!pageBody.classList.contains('home-selection-mode')) {
        forceHomeScrollTop();
        return;
    }

    window.cancelAnimationFrame(selectionExitFrame);
    rootElement.classList.remove('home-lock-scroll');
    pageBody.classList.remove('home-selection-visible');
    clearEntryFocusState();
    forceHomeScrollTop();

    selectionExitFrame = window.requestAnimationFrame(() => {
        forceHomeScrollTop();
        pageBody.classList.remove('home-selection-mode');
        rootElement.classList.add('home-lock-scroll');
        forceHomeScrollTop();

        selectionExitFrame = window.requestAnimationFrame(() => {
            forceHomeScrollTop();
            selectionExitFrame = 0;
        });
    });
}

function clearEntryFocusState() {
    window.clearTimeout(entryFocusClearTimer);
    entryFocusClearTimer = 0;
    pageBody.classList.remove('home-card-transitioning');
    entryCards.forEach((card) => {
        card.classList.remove('is-clicked', 'is-dimmed', 'is-exit-left', 'is-exit-right');
    });
}

function scheduleEntryFocusClear(delay = 260) {
    window.clearTimeout(entryFocusClearTimer);
    entryFocusClearTimer = window.setTimeout(clearEntryFocusState, delay);
}

function markTouchInteraction() {
    lastTouchInteractionTime = Date.now();
}

function shouldUseEntryTransition(event = null) {
    if (event?.pointerType && event.pointerType !== 'mouse') {
        return false;
    }
    if (Date.now() - lastTouchInteractionTime < 900) {
        return false;
    }
    if (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none), (pointer: coarse)').matches) {
        return false;
    }
    return true;
}

function focusEntryCard(card, event = null) {
    if (event?.defaultPrevented || event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey || (typeof event?.button === 'number' && event.button !== 0)) {
        return;
    }

    if (!shouldUseEntryTransition(event)) {
        clearEntryFocusState();
        return;
    }

    if (!card.getAttribute('href') || pageBody.classList.contains('home-card-transitioning')) {
        return;
    }

    pageBody.classList.add('home-card-transitioning');
    const selectedIndex = entryCards.indexOf(card);
    entryCards.forEach((item) => {
        if (item === card) {
            item.classList.add('is-clicked');
            return;
        }

        const itemIndex = entryCards.indexOf(item);
        item.classList.add('is-dimmed', itemIndex < selectedIndex ? 'is-exit-left' : 'is-exit-right');
    });
    scheduleEntryFocusClear();
}

window.addEventListener('DOMContentLoaded', () => {
    rootElement.classList.add('home-lock-scroll');

    window.setTimeout(() => {
        pageBody.classList.add('home-content-visible');
    }, 1660);

    startFlowBtn?.addEventListener('click', enterSelectionMode);
    resetFlowBtn?.addEventListener('click', exitSelectionMode);

    homeResetLink?.addEventListener('click', (event) => {
        event.preventDefault();
        exitSelectionMode();
    });

    entryGrid?.addEventListener('pointerleave', () => clearEntryFocusState());

    entryCards.forEach((card) => {
        card.addEventListener('pointerdown', (event) => focusEntryCard(card, event));
        card.addEventListener('click', (event) => focusEntryCard(card, event));
        card.addEventListener('pointerleave', () => clearEntryFocusState());
    });

    window.addEventListener('pointerup', () => scheduleEntryFocusClear(80));
    window.addEventListener('pointercancel', clearEntryFocusState);
    window.addEventListener('touchstart', markTouchInteraction, { passive: true });
    window.addEventListener('touchend', clearEntryFocusState, { passive: true });
    window.addEventListener('touchcancel', clearEntryFocusState, { passive: true });
    window.addEventListener('pageshow', clearEntryFocusState);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            clearEntryFocusState();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            clearEntryFocusState();
        }
    });
});
