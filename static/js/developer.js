(function () {
    'use strict';

    const TOGGLE_SELECTOR = '.detail-toggle';
    let ready = false;

    function setExpanded(button, expanded) {
        const card = button.closest('.expandable-card');
        if (!card) {
            return;
        }

        card.classList.toggle('is-expanded', expanded);
        button.setAttribute('aria-expanded', String(expanded));
        button.textContent = expanded ? '收起详情' : (button.dataset.collapsedLabel || '查看详情');
    }

    function initDetailToggles() {
        document.querySelectorAll(TOGGLE_SELECTOR).forEach((button) => {
            button.dataset.collapsedLabel = button.textContent.trim() || '查看详情';
        });
    }

    function onDocumentClick(event) {
        const button = event.target.closest(TOGGLE_SELECTOR);
        if (!button) {
            return;
        }

        const expanded = button.getAttribute('aria-expanded') === 'true';
        setExpanded(button, !expanded);
    }

    function init() {
        if (ready) {
            return;
        }

        ready = true;
        initDetailToggles();
        document.addEventListener('click', onDocumentClick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}());
