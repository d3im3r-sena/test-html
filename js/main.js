/**
 * Centro de Ciencia Nova - JavaScript Principal
 * Gestión de interactividad responsive, filtros, modal, calculadora y animaciones
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initStarfield();
    initActivityFilter();
    initActivityModal();
    initTicketCalculator();
    initFaqAccordion();
    initNewsletter();
});

/* ==========================================================================
   1. Navegación Móvil Responsive
   ========================================================================== */
function initMobileNav() {
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const mobileLinks = document.querySelectorAll('.mobile-nav-link');

    if (!toggleBtn || !mobileMenu) return;

    function openMenu() {
        toggleBtn.setAttribute('aria-expanded', 'true');
        mobileMenu.classList.add('is-open');
        if (menuOverlay) menuOverlay.classList.add('is-active');
        document.body.classList.add('menu-locked');
    }

    function closeMenu() {
        toggleBtn.setAttribute('aria-expanded', 'false');
        mobileMenu.classList.remove('is-open');
        if (menuOverlay) menuOverlay.classList.remove('is-active');
        document.body.classList.remove('menu-locked');
    }

    toggleBtn.addEventListener('click', () => {
        const isOpen = toggleBtn.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    if (menuOverlay) {
        menuOverlay.addEventListener('click', closeMenu);
    }

    mobileLinks.forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
            closeMenu();
        }
    });
}

/* ==========================================================================
   2. Fondo Estelar Interactivo (Canvas)
   ========================================================================== */
function initStarfield() {
    const canvas = document.getElementById('starsCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let stars = [];
    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        createStars();
    }

    window.addEventListener('resize', resize);

    function createStars() {
        stars = [];
        const count = Math.min(Math.floor((width * height) / 12000), 120);
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.7 + 0.3,
                speed: Math.random() * 0.25 + 0.05,
                twinkle: Math.random() * 0.02 + 0.005
            });
        }
    }

    createStars();

    function animate() {
        ctx.clearRect(0, 0, width, height);

        for (let star of stars) {
            star.y -= star.speed;
            if (star.y < 0) {
                star.y = height;
                star.x = Math.random() * width;
            }

            // Efecto parpadeo sutil
            star.alpha += star.twinkle;
            if (star.alpha > 0.9 || star.alpha < 0.2) {
                star.twinkle = -star.twinkle;
            }

            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 225, 255, ${Math.max(0, star.alpha)})`;
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
            ctx.fill();
        }

        animationFrameId = requestAnimationFrame(animate);
    }

    animate();
}

/* ==========================================================================
   3. Filtro de Categorías de Actividades
   ========================================================================== */
function initActivityFilter() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const activityCards = document.querySelectorAll('.actividad-card');

    if (!filterButtons.length || !activityCards.length) return;

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });

            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');

            const category = button.getAttribute('data-category');

            activityCards.forEach(card => {
                const cardCategory = card.getAttribute('data-category');
                if (category === 'all' || cardCategory === category) {
                    card.style.display = 'flex';
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, 20);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(12px)';
                    setTimeout(() => {
                        card.style.display = 'none';
                    }, 200);
                }
            });
        });
    });
}

/* ==========================================================================
   4. Modal Detallado de Actividades
   ========================================================================== */
const activityDetailsData = {
    robotica: {
        title: "Taller de Robótica & Inteligencia Artificial",
        category: "Robótica e Ingeniería",
        duration: "90 minutos",
        age: "Para jóvenes de 10 a 18 años y adultos curiosos",
        capacity: "18 participantes por sesión",
        description: "Sumérgete en el diseño y programación de exploradores móviles inspirados en los rovers de Marte (Curiosity y Perseverance). Aprenderás lógica de control sensorial, visión por computador básica y resolución de obstáculos autónoma usando microcontroladores.",
        topics: [
            "Arquitectura básica de microcontroladores y sensores ultrasónicos",
            "Algoritmos de detección de colisiones y evasión",
            "Mapeo de superficies y comunicación por telemetría",
            "Desafío grupal: ¡Rescate en la superficie marciana!"
        ],
        badgeColor: "var(--color-cyan)"
    },
    astronomia: {
        title: "Taller de Astronomía & Cartografía Celeste",
        category: "Astrofísica y Observación",
        duration: "120 minutos",
        age: "Todas las edades (niños acompañados)",
        capacity: "25 participantes por sesión",
        description: "Aprende a calibrar telescopios computarizados y manuales de alta gama. Descubriremos cómo leer mapas celestes, reconocer constelaciones de nuestro hemisferio y capturar tu primera astrofotografía lunar en vivo utilizando cámaras con sensor CMOS de astronomía.",
        topics: [
            "Manejo de telescopios refractores, reflectores y Schmidt-Cassegrain",
            "Identificación de cúmulos estelares, nebulosas y planetas visibles",
            "Observación solar segura con filtros H-Alfa y espectro visible",
            "Introducción a la astrofotografía con smartphones y cámaras dedicadas"
        ],
        badgeColor: "var(--color-purple)"
    },
    energia: {
        title: "Laboratorio de Energías Limpias & Fusión Cuántica",
        category: "Física y Sustentabilidad",
        duration: "75 minutos",
        age: "A partir de 12 años",
        capacity: "20 participantes por sesión",
        description: "Explora las tecnologías que impulsarán el futuro de la humanidad en la Tierra y en bases espaciales. Experimenta en vivo con celdas de hidrógeno verde, paneles solares con cristales de perovskita y una maqueta funcional de confinamiento magnético para energía de fusión.",
        topics: [
            "Generación de hidrógeno mediante electrólisis del agua",
            "Rendimiento de celdas solares de nueva generación",
            "Principios de superconductividad y levitación magnética",
            "Modelos computacionales de reactores tipo Tokamak"
        ],
        badgeColor: "var(--color-amber)"
    },
    biologia: {
        title: "Laboratorio de Biotecnología & ADN Sintético",
        category: "Ciencias de la Vida",
        duration: "80 minutos",
        age: "A partir de 8 años",
        capacity: "16 participantes por sesión",
        description: "Conviértete en bio-investigador por un día en nuestro laboratorio estéril. Extraerás material genético real de células vegetales, observarás microorganismos extremófilos (tardígrados) bajo microscopios electrónicos y comprenderás la genética del futuro.",
        topics: [
            "Extracción y aislamiento de ADN con reactivos de laboratorio",
            "Visualización de extremófilos y adaptación a ambientes hostiles",
            "Bioluminiscencia en bacterias marinas y algas",
            "Ética e impacto de la edición genética CRISPR en la medicina"
        ],
        badgeColor: "var(--color-emerald)"
    }
};

function initActivityModal() {
    const modal = document.getElementById('activityModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const detailButtons = document.querySelectorAll('.btn-detail');

    if (!modal) return;

    function openModal(activityKey) {
        const data = activityDetailsData[activityKey];
        if (!data) return;

        document.getElementById('modalTitle').textContent = data.title;
        document.getElementById('modalCategory').textContent = data.category;
        document.getElementById('modalDuration').textContent = data.duration;
        document.getElementById('modalAge').textContent = data.age;
        document.getElementById('modalCapacity').textContent = data.capacity;
        document.getElementById('modalDescription').textContent = data.description;

        const topicsList = document.getElementById('modalTopics');
        topicsList.innerHTML = '';
        data.topics.forEach(topic => {
            const li = document.createElement('li');
            li.textContent = topic;
            topicsList.appendChild(li);
        });

        modal.classList.add('is-visible');
        if (modalBackdrop) modalBackdrop.classList.add('is-visible');
        document.body.classList.add('menu-locked');
    }

    function closeModal() {
        modal.classList.remove('is-visible');
        if (modalBackdrop) modalBackdrop.classList.remove('is-visible');
        document.body.classList.remove('menu-locked');
    }

    detailButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const key = btn.getAttribute('data-target');
            openModal(key);
        });
    });

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-visible')) {
            closeModal();
        }
    });
}

/* ==========================================================================
   5. Calculadora Dinámica de Entradas
   ========================================================================== */
function initTicketCalculator() {
    const prices = {
        general: 25000,
        estudiante: 15000,
        infantil: 12000,
        familiar: 60000
    };

    const counts = {
        general: 1,
        estudiante: 0,
        infantil: 0,
        familiar: 0
    };

    const totalDisplay = document.getElementById('calcTotal');
    const reserveForm = document.getElementById('ticketForm');

    function updateCalculations() {
        let total = 0;
        let totalTickets = 0;

        for (let key in counts) {
            total += counts[key] * prices[key];
            totalTickets += counts[key];
            const countEl = document.getElementById(`count-${key}`);
            if (countEl) countEl.textContent = counts[key];
        }

        if (totalDisplay) {
            totalDisplay.textContent = `$${total.toLocaleString('es-CO')} COP`;
        }

        const totalTicketsEl = document.getElementById('calcTotalTickets');
        if (totalTicketsEl) {
            totalTicketsEl.textContent = totalTickets;
        }
    }

    document.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type');
            const action = btn.getAttribute('data-action');

            if (action === 'increase') {
                if (counts[type] < 20) counts[type]++;
            } else if (action === 'decrease') {
                if (counts[type] > 0) counts[type]--;
            }

            updateCalculations();
        });
    });

    if (reserveForm) {
        const dateInput = document.getElementById('visitDate');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
            dateInput.value = today;
        }

        reserveForm.addEventListener('submit', (e) => {
            e.preventDefault();

            let totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
            if (totalCount === 0) {
                alert('Por favor selecciona al menos una entrada para continuar.');
                return;
            }

            showToast('¡Reserva registrada con éxito! Te esperamos en Nova.');
        });
    }

    updateCalculations();
}

function showToast(message) {
    const toast = document.getElementById('reserveToast');
    if (!toast) return;

    const messageEl = toast.querySelector('.toast-text');
    if (messageEl) messageEl.textContent = message;

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4500);
}

/* ==========================================================================
   6. Acordeón de Preguntas Frecuentes (FAQ)
   ========================================================================== */
function initFaqAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const questionBtn = item.querySelector('.faq-question');
        if (!questionBtn) return;

        questionBtn.addEventListener('click', () => {
            const isExpanded = questionBtn.getAttribute('aria-expanded') === 'true';

            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    const otherBtn = otherItem.querySelector('.faq-question');
                    const otherAnswer = otherItem.querySelector('.faq-answer');
                    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
                    if (otherAnswer) otherAnswer.style.maxHeight = null;
                    otherItem.classList.remove('is-open');
                }
            });

            const answer = item.querySelector('.faq-answer');
            if (isExpanded) {
                questionBtn.setAttribute('aria-expanded', 'false');
                item.classList.remove('is-open');
                if (answer) answer.style.maxHeight = null;
            } else {
                questionBtn.setAttribute('aria-expanded', 'true');
                item.classList.add('is-open');
                if (answer) answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });
}

/* ==========================================================================
   7. Suscripción al Boletín
   ========================================================================== */
function initNewsletter() {
    const form = document.getElementById('newsletterForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (input && input.value) {
            showToast(`¡Gracias! Te has suscrito con: ${input.value}`);
            input.value = '';
        }
    });
}
