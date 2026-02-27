/* ============================================================
   JanSetu — Main Script
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ─── Slider ──────────────────────────────────────────────
    const slides = document.querySelectorAll('.slider__slide');
    const indicators = document.querySelectorAll('.slider__indicator');
    const prevBtn = document.getElementById('slider-prev');
    const nextBtn = document.getElementById('slider-next');
    const totalSlides = slides.length;
    let currentSlide = 0;
    let autoPlayTimer = null;

    function goToSlide(index) {
        if (index < 0) index = totalSlides - 1;
        if (index >= totalSlides) index = 0;

        // Remove active from all
        slides.forEach(s => s.classList.remove('slider__slide--active'));
        indicators.forEach(d => d.classList.remove('slider__indicator--active'));

        // Activate target
        slides[index].classList.add('slider__slide--active');
        indicators[index].classList.add('slider__indicator--active');

        // Update active nav link
        document.querySelectorAll('.top-header__nav-link[data-slide]').forEach(link => {
            link.classList.toggle('active', parseInt(link.dataset.slide) === index);
        });

        currentSlide = index;
    }

    function nextSlide() { goToSlide(currentSlide + 1); }
    function prevSlide() { goToSlide(currentSlide - 1); }

    // Arrow buttons
    if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetAutoPlay(); });
    if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetAutoPlay(); });

    // Indicator buttons
    indicators.forEach(ind => {
        ind.addEventListener('click', () => {
            goToSlide(parseInt(ind.dataset.index));
            resetAutoPlay();
        });
    });

    // Nav links with data-slide
    document.querySelectorAll('.top-header__nav-link[data-slide]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            goToSlide(parseInt(link.dataset.slide));
            resetAutoPlay();
        });
    });

    // Auto-play (5 second interval like gov sites)
    function startAutoPlay() {
        autoPlayTimer = setInterval(nextSlide, 5000);
    }

    function resetAutoPlay() {
        clearInterval(autoPlayTimer);
        startAutoPlay();
    }

    startAutoPlay();

    // Pause on hover
    const sliderEl = document.getElementById('hero-slider');
    if (sliderEl) {
        sliderEl.addEventListener('mouseenter', () => clearInterval(autoPlayTimer));
        sliderEl.addEventListener('mouseleave', () => startAutoPlay());
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { nextSlide(); resetAutoPlay(); }
        if (e.key === 'ArrowLeft') { prevSlide(); resetAutoPlay(); }
    });

    // Touch / swipe support
    let touchStartX = 0;
    if (sliderEl) {
        sliderEl.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        sliderEl.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) nextSlide();
                else prevSlide();
                resetAutoPlay();
            }
        }, { passive: true });
    }


    // ─── Mobile Menu ─────────────────────────────────────────
    const hamburger = document.getElementById('hamburger-btn');
    const navList = document.getElementById('nav-list');

    if (hamburger && navList) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('open');
            navList.classList.toggle('open');
        });

        // Close menu on link click (mobile)
        navList.querySelectorAll('.top-header__nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('open');
                navList.classList.remove('open');
            });
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!navList.contains(e.target) && !hamburger.contains(e.target)) {
                hamburger.classList.remove('open');
                navList.classList.remove('open');
            }
        });
    }


    // ─── Font Size Controls ──────────────────────────────────
    const fontIncrease = document.getElementById('font-increase');
    const fontDefault = document.getElementById('font-default');
    const fontDecrease = document.getElementById('font-decrease');
    let currentFontSize = 16;

    if (fontIncrease) {
        fontIncrease.addEventListener('click', () => {
            if (currentFontSize < 22) {
                currentFontSize += 1;
                document.documentElement.style.fontSize = currentFontSize + 'px';
            }
        });
    }
    if (fontDefault) {
        fontDefault.addEventListener('click', () => {
            currentFontSize = 16;
            document.documentElement.style.fontSize = '16px';
        });
    }
    if (fontDecrease) {
        fontDecrease.addEventListener('click', () => {
            if (currentFontSize > 12) {
                currentFontSize -= 1;
                document.documentElement.style.fontSize = currentFontSize + 'px';
            }
        });
    }


    // ─── Search Bar ──────────────────────────────────────────
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.querySelector('.search-bar__search-btn');

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) {
                // Placeholder: scroll to relevant section or show alert
                alert('Searching for: ' + query);
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchBtn.click();
            }
        });
    }

});
