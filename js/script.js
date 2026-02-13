// Tahigami Music Box D1-40 - Interactive functionality
console.log('Tahigami Music Box D1-40 - JavaScript loaded');

// Tab switching functionality
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const targetPane = document.getElementById(targetTab);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add scroll-based nav background
    let lastScroll = 0;
    const nav = document.querySelector('.nav');
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            nav.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
        } else {
            nav.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        }
        
        lastScroll = currentScroll;
    });

    /* Lightbox implementation */
    const lightbox = document.getElementById('lightbox');
    const lbImage = lightbox.querySelector('.lightbox-inner img');
    const triggers = Array.from(document.querySelectorAll('.lightbox-trigger'));
    const btnClose = lightbox.querySelector('.lightbox-close');
    const btnNext = lightbox.querySelector('.lightbox-next');
    const btnPrev = lightbox.querySelector('.lightbox-prev');
    let current = 0;

    function openLightbox(index) {
        const img = triggers[index];
        const src = img.dataset.full || img.src;
        lbImage.src = src;
        lbImage.alt = img.alt || '';
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        current = index;
        btnClose.focus();
    }

    function closeLightbox() {
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        lbImage.src = '';
        triggers[current]?.focus();
    }

    function showNext() {
        current = (current + 1) % triggers.length;
        const src = triggers[current].dataset.full || triggers[current].src;
        lbImage.src = src;
        lbImage.alt = triggers[current].alt || '';
    }

    function showPrev() {
        current = (current - 1 + triggers.length) % triggers.length;
        const src = triggers[current].dataset.full || triggers[current].src;
        lbImage.src = src;
        lbImage.alt = triggers[current].alt || '';
    }

    triggers.forEach((t, i) => t.addEventListener('click', (e) => { e.preventDefault(); openLightbox(i); }));
    btnClose.addEventListener('click', closeLightbox);
    btnNext.addEventListener('click', showNext);
    btnPrev.addEventListener('click', showPrev);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('open')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight') showNext();
        if (e.key === 'ArrowLeft') showPrev();
    });
});
