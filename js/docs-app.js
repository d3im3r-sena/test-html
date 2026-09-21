/**
 * RoboDocs - Industrial Robotics Documentation Platform
 * Main Controller: document loading, client-side LaTeX parsing, dual-sidebar navigation,
 * scroll-spy outline, search, themes, presentation slideshow mode, diagram zoom, and PWA capabilities.
 */

document.addEventListener('DOMContentLoaded', () => {
    const app = new RoboDocsApp();
    window.RoboDocsApp = app;
    window.roboDocs = app;
    app.init();
});

class RoboDocsApp {
    constructor() {
        this.documents = [];
        this.currentDoc = null;
        this.parser = new LatexParser();
        this.currentRawTex = '';
        this.currentTheme = localStorage.getItem('robodocs-theme') || 'dark';
        this.fontSize = 16;
        this.deferredPrompt = null;
        this.scrollObserver = null;

        // Estado del Modo Presentación
        this.isPresentationMode = false;
        this.currentSlideIndex = 1;
        this.totalSlides = 1;

        // Niveles de zoom para diagramas TikZ
        this.diagramScales = {};
    }

    async init() {
        this.applyTheme(this.currentTheme);
        this.bindEvents();
        this.initPwa();
        await this.loadCatalog();
        this.handleInitialRoute();
    }

    /* ==========================================================================
       1. Catálogo y Enrutamiento
       ========================================================================== */
    async loadCatalog() {
        try {
            const res = await fetch('docs/index.json');
            if (!res.ok) throw new Error('No se pudo cargar el catálogo de documentos');
            this.documents = await res.json();
            this.renderLeftSidebar(this.documents);
        } catch (err) {
            console.error('Error cargando catálogo:', err);
            this.showToast('Error cargando el catálogo de documentación.');
        }
    }

    handleInitialRoute() {
        const hash = window.location.hash.replace('#', '');
        const targetDoc = this.documents.find(d => d.id === hash);
        if (targetDoc) {
            this.loadDocument(targetDoc.id);
        } else if (this.documents.length > 0) {
            this.loadDocument(this.documents[0].id);
        }

        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.replace('#', '');
            if (this.currentDoc && this.currentDoc.id !== newHash) {
                const found = this.documents.find(d => d.id === newHash);
                if (found) this.loadDocument(found.id, false);
            }
        });
    }

    /* ==========================================================================
       2. Carga y Renderizado de Archivos .tex
       ========================================================================== */
    async loadDocument(docId, updateHash = true) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        this.currentDoc = doc;
        if (updateHash) window.location.hash = doc.id;

        // Actualizar elementos activos en la barra lateral izquierda
        document.querySelectorAll('.nav-doc-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-id') === docId);
        });

        // Actualizar migas de pan (Breadcrumbs)
        const breadcrumbCat = document.getElementById('breadcrumbCategory');
        const breadcrumbTitle = document.getElementById('breadcrumbTitle');
        if (breadcrumbCat) breadcrumbCat.textContent = doc.category;
        if (breadcrumbTitle) breadcrumbTitle.textContent = doc.title;

        // Mostrar estado de carga en el lienzo principal
        const contentCanvas = document.getElementById('renderedPaperContent');
        if (contentCanvas) {
            contentCanvas.innerHTML = `
                <div class="docs-loader">
                    <div class="loader-spinner"></div>
                    <p>Compilando y renderizando <strong>${doc.filename}</strong>...</p>
                </div>
            `;
        }

        try {
            const res = await fetch(`docs/${doc.filename}`);
            if (!res.ok) throw new Error(`No se pudo leer docs/${doc.filename}`);
            const rawTex = await res.text();
            this.currentRawTex = rawTex;

            // Procesar con LatexParser
            const parsed = this.parser.parse(rawTex);

            // Inyectar HTML renderizado
            if (contentCanvas) {
                contentCanvas.innerHTML = parsed.html;
            }

            // Calcular total de diapositivas Beamer disponibles
            const slides = contentCanvas ? contentCanvas.querySelectorAll('.beamer-slide') : [];
            this.totalSlides = slides.length || 1;
            this.currentSlideIndex = 1;

            // Si está en modo presentación, posicionar en primera diapositiva
            if (this.isPresentationMode) {
                this.goToSlide(1);
            }

            // Renderizar la Tabla de Contenidos (TOC) en la barra lateral derecha
            this.renderRightToc(parsed.toc);

            // Generar paginación inferior (anterior / siguiente)
            this.renderPagination();

            // Disparar renderizado de fórmulas KaTeX / MathJax
            this.typesetMath(contentCanvas);

            // Actualizar dock de presentación
            this.updatePresentationDockUI();

            // Reiniciar scroll del contenedor principal al tope
            const mainViewport = document.getElementById('mainContentArea');
            if (mainViewport) mainViewport.scrollTop = 0;

            // Actualizar scroll-spy
            this.initScrollSpy();

            // Cerrar menú móvil si está abierto
            this.closeMobileDrawers();

        } catch (err) {
            console.error('Error al procesar el archivo .tex:', err);
            if (contentCanvas) {
                contentCanvas.innerHTML = `
                    <div class="docs-error-box">
                        <h3>Error al renderizar el documento</h3>
                        <p>${err.message}</p>
                    </div>
                `;
            }
        }
    }

    /* ==========================================================================
       3. Barra Lateral Derecha (Tabla de Contenidos & Scroll-Spy)
       ========================================================================== */
    renderRightToc(toc) {
        const tocContainer = document.getElementById('rightTocNav');
        if (!tocContainer) return;

        if (!toc || toc.length === 0) {
            tocContainer.innerHTML = '<p class="toc-placeholder">Sin secciones registradas</p>';
            return;
        }

        let html = '<ul class="toc-tree">';
        toc.forEach(item => {
            html += `
                <li class="toc-node level-${item.level}">
                    <a href="#${item.id}" class="toc-anchor" data-target="${item.id}">
                        <span class="toc-index">${item.number}</span>
                        <span class="toc-label">${item.text}</span>
                    </a>
                </li>
            `;
        });
        html += '</ul>';
        tocContainer.innerHTML = html;

        // Añadir evento clic que respeta el modo presentación y modo lista
        tocContainer.querySelectorAll('.toc-anchor').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = a.getAttribute('data-target');
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    if (this.isPresentationMode) {
                        const slideNum = parseInt(targetEl.getAttribute('data-slide'), 10);
                        if (!isNaN(slideNum)) {
                            this.goToSlide(slideNum);
                            return;
                        }
                        const parentSlide = targetEl.closest('.beamer-slide');
                        if (parentSlide) {
                            const pNum = parseInt(parentSlide.getAttribute('data-slide'), 10);
                            if (!isNaN(pNum)) {
                                this.goToSlide(pNum);
                                return;
                            }
                        }
                    }
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    history.replaceState(null, '', `#${this.currentDoc.id}`);
                }
            });
        });
    }

    initScrollSpy() {
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
        }

        const headings = document.querySelectorAll('.beamer-slide, .latex-section, .latex-subsection');
        if (!headings.length) return;

        const observerOptions = {
            root: document.getElementById('mainContentArea'),
            rootMargin: '0px 0px -70% 0px',
            threshold: 0
        };

        this.scrollObserver = new IntersectionObserver((entries) => {
            if (this.isPresentationMode) return; // En presentación el TOC se sincroniza con goToSlide
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    document.querySelectorAll('.toc-anchor').forEach(a => {
                        a.classList.toggle('is-current', a.getAttribute('data-target') === id);
                    });
                }
            });
        }, observerOptions);

        headings.forEach(h => this.scrollObserver.observe(h));
    }

    /* ==========================================================================
       4. Paginación Inferior (Anterior / Siguiente Documento)
       ========================================================================== */
    renderPagination() {
        const container = document.getElementById('docPagination');
        if (!container || !this.currentDoc) return;

        const currentIndex = this.documents.findIndex(d => d.id === this.currentDoc.id);
        const prevDoc = currentIndex > 0 ? this.documents[currentIndex - 1] : null;
        const nextDoc = currentIndex < this.documents.length - 1 ? this.documents[currentIndex + 1] : null;

        let html = '';

        if (prevDoc) {
            html += `
                <a href="#${prevDoc.id}" class="pagination-card prev-card" onclick="event.preventDefault(); window.RoboDocsApp.loadDocument('${prevDoc.id}');">
                    <span class="pag-dir">← Documento Anterior</span>
                    <strong class="pag-title">${prevDoc.title}</strong>
                </a>
            `;
        } else {
            html += '<div class="pagination-spacer"></div>';
        }

        if (nextDoc) {
            html += `
                <a href="#${nextDoc.id}" class="pagination-card next-card" onclick="event.preventDefault(); window.RoboDocsApp.loadDocument('${nextDoc.id}');">
                    <span class="pag-dir">Siguiente Documento →</span>
                    <strong class="pag-title">${nextDoc.title}</strong>
                </a>
            `;
        }

        container.innerHTML = html;
    }

    /* ==========================================================================
       5. Renderizado Matemático (KaTeX / MathJax)
       ========================================================================== */
    typesetMath(element) {
        if (!element) return;

        const tryRender = () => {
            if (window.renderMathInElement) {
                try {
                    window.renderMathInElement(element, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\[', right: '\\]', display: true },
                            { left: '\\(', right: '\\)', display: false }
                        ],
                        throwOnError: false
                    });
                    return true;
                } catch (e) {
                    console.warn('KaTeX render:', e);
                }
            }
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([element]).catch(err => console.warn(err));
                return true;
            }
            return false;
        };

        if (!tryRender()) {
            setTimeout(tryRender, 250);
            setTimeout(tryRender, 800);
            setTimeout(tryRender, 2000);
        }
    }

    /* ==========================================================================
       6. Barra Lateral Izquierda (Catálogo y Búsqueda)
       ========================================================================== */
    renderLeftSidebar(docs) {
        const navContainer = document.getElementById('leftDocsNav');
        if (!navContainer) return;

        const countEl = document.querySelector('.sidebar-count');
        if (countEl) countEl.textContent = `${docs.length} ${docs.length === 1 ? 'Archivo' : 'Archivos'} .tex`;

        // Agrupar por categoría
        const categories = {};
        docs.forEach(doc => {
            if (!categories[doc.category]) {
                categories[doc.category] = [];
            }
            categories[doc.category].push(doc);
        });

        let html = '';
        for (const [catName, catDocs] of Object.entries(categories)) {
            html += `
                <div class="sidebar-nav-group">
                    <h3 class="nav-group-title">${catName}</h3>
                    <ul class="nav-group-list">
            `;

            catDocs.forEach(doc => {
                const isActive = this.currentDoc && this.currentDoc.id === doc.id;
                html += `
                    <li>
                        <a href="#${doc.id}" class="nav-doc-link ${isActive ? 'active' : ''}" data-id="${doc.id}">
                            <div class="doc-link-header">
                                <span class="doc-link-title">${doc.title}</span>
                            </div>
                            <div class="doc-link-meta">
                                <span>${doc.author.split('&')[0].trim()}</span>
                            </div>
                        </a>
                    </li>
                `;
            });

            html += `
                    </ul>
                </div>
            `;
        }

        navContainer.innerHTML = html;

        navContainer.querySelectorAll('.nav-doc-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const docId = link.getAttribute('data-id');
                this.loadDocument(docId);
            });
        });
    }

    filterDocs(query) {
        const q = query.toLowerCase().trim();
        const filtered = this.documents.filter(doc => {
            return doc.title.toLowerCase().includes(q) ||
                   doc.category.toLowerCase().includes(q) ||
                   doc.description.toLowerCase().includes(q) ||
                   doc.tags.some(t => t.toLowerCase().includes(q));
        });
        this.renderLeftSidebar(filtered);
    }

    /* ==========================================================================
       7. Modo Presentación (Diapositivas Beamer)
       ========================================================================== */
    setPresentationMode(enable) {
        this.isPresentationMode = !!enable;
        document.body.classList.toggle('is-presentation-mode', this.isPresentationMode);

        const btnCont = document.getElementById('btnViewContinuous');
        const btnPres = document.getElementById('btnViewPresentation');
        const dock = document.getElementById('presentationDock');

        if (btnCont) {
            btnCont.classList.toggle('active', !this.isPresentationMode);
            btnCont.setAttribute('aria-selected', (!this.isPresentationMode).toString());
        }
        if (btnPres) {
            btnPres.classList.toggle('active', this.isPresentationMode);
            btnPres.setAttribute('aria-selected', this.isPresentationMode.toString());
        }

        if (dock) {
            dock.style.display = this.isPresentationMode ? 'flex' : 'none';
        }

        const slides = document.querySelectorAll('.beamer-slide');
        this.totalSlides = slides.length || 1;

        if (this.isPresentationMode) {
            this.goToSlide(this.currentSlideIndex || 1);
            this.showToast('Modo Presentación activado. Usa flechas o barra espaciadora para navegar.');
        } else {
            // En modo continuo, remover clase active-slide
            slides.forEach(s => s.classList.remove('active-slide'));
            // Desplazar suavemente a la diapositiva actual para mantener contexto
            const currentEl = document.getElementById(`slide-${this.currentSlideIndex}`);
            if (currentEl) {
                currentEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    goToSlide(index) {
        const slides = document.querySelectorAll('.beamer-slide');
        if (!slides.length) return;

        this.totalSlides = slides.length;
        const clamped = Math.max(1, Math.min(index, this.totalSlides));
        this.currentSlideIndex = clamped;

        slides.forEach((s, idx) => {
            const isCur = (idx + 1) === clamped;
            s.classList.toggle('active-slide', isCur);
        });

        this.updatePresentationDockUI();

        // Reiniciar scroll del viewport central al tope
        const mainViewport = document.getElementById('mainContentArea');
        if (mainViewport) mainViewport.scrollTop = 0;

        // Resaltar en la barra lateral derecha (TOC)
        const targetId = `slide-${clamped}`;
        document.querySelectorAll('.toc-anchor').forEach(a => {
            a.classList.toggle('is-current', a.getAttribute('data-target') === targetId);
        });
    }

    nextSlide() {
        if (this.currentSlideIndex < this.totalSlides) {
            this.goToSlide(this.currentSlideIndex + 1);
        }
    }

    prevSlide() {
        if (this.currentSlideIndex > 1) {
            this.goToSlide(this.currentSlideIndex - 1);
        }
    }

    firstSlide() {
        this.goToSlide(1);
    }

    lastSlide() {
        this.goToSlide(this.totalSlides);
    }

    updatePresentationDockUI() {
        const curEl = document.getElementById('presCurrentNum');
        const totEl = document.getElementById('presTotalNum');
        const barEl = document.getElementById('presentationProgressBar');

        if (curEl) curEl.textContent = this.currentSlideIndex;
        if (totEl) totEl.textContent = this.totalSlides;
        if (barEl) {
            const pct = this.totalSlides > 0 ? (this.currentSlideIndex / this.totalSlides) * 100 : 0;
            barEl.style.width = `${Math.max(1, Math.min(pct, 100))}%`;
        }
    }

    async toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (e) {
            console.warn('Error al cambiar pantalla completa:', e);
        }
    }

    /* ==========================================================================
       8. Zoom Interactivo en Diagramas TikZ
       ========================================================================== */
    zoomDiagram(wrapperId, delta) {
        if (!this.diagramScales) this.diagramScales = {};
        const currentScale = this.diagramScales[wrapperId] || 1.0;
        const newScale = Math.min(Math.max(Math.round((currentScale + delta) * 10) / 10, 0.6), 3.0);
        this.diagramScales[wrapperId] = newScale;

        const contentEl = document.getElementById(`zoom-content-${wrapperId}`);
        const badgeEl = document.getElementById(`zoom-val-${wrapperId}`);

        if (contentEl) {
            contentEl.style.transform = `scale(${newScale})`;
            contentEl.style.transformOrigin = 'center center';
        }
        if (badgeEl) {
            badgeEl.textContent = `${Math.round(newScale * 100)}%`;
        }
    }

    resetDiagramZoom(wrapperId) {
        if (!this.diagramScales) this.diagramScales = {};
        this.diagramScales[wrapperId] = 1.0;

        const contentEl = document.getElementById(`zoom-content-${wrapperId}`);
        const badgeEl = document.getElementById(`zoom-val-${wrapperId}`);

        if (contentEl) {
            contentEl.style.transform = 'scale(1)';
        }
        if (badgeEl) {
            badgeEl.textContent = '100%';
        }
    }

    /* ==========================================================================
       9. Eventos de UI, Atajos de Teclado y Herramientas
       ========================================================================== */
    bindEvents() {
        // Conmutador de Vistas: Modo Lista vs Modo Presentación
        const btnViewContinuous = document.getElementById('btnViewContinuous');
        const btnViewPresentation = document.getElementById('btnViewPresentation');

        if (btnViewContinuous) {
            btnViewContinuous.addEventListener('click', () => this.setPresentationMode(false));
        }
        if (btnViewPresentation) {
            btnViewPresentation.addEventListener('click', () => this.setPresentationMode(true));
        }

        // Controles del Dock de Presentación
        const btnPresFirst = document.getElementById('btnPresFirst');
        const btnPresPrev = document.getElementById('btnPresPrev');
        const btnPresNext = document.getElementById('btnPresNext');
        const btnPresLast = document.getElementById('btnPresLast');
        const btnPresFullscreen = document.getElementById('btnPresFullscreen');
        const btnPresExit = document.getElementById('btnPresExit');

        if (btnPresFirst) btnPresFirst.addEventListener('click', () => this.firstSlide());
        if (btnPresPrev) btnPresPrev.addEventListener('click', () => this.prevSlide());
        if (btnPresNext) btnPresNext.addEventListener('click', () => this.nextSlide());
        if (btnPresLast) btnPresLast.addEventListener('click', () => this.lastSlide());
        if (btnPresFullscreen) btnPresFullscreen.addEventListener('click', () => this.toggleFullscreen());
        if (btnPresExit) btnPresExit.addEventListener('click', () => this.setPresentationMode(false));

        // Atajos de Teclado Globales
        window.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

            if (this.isPresentationMode) {
                if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key.toLowerCase() === 'd') {
                    e.preventDefault();
                    this.nextSlide();
                } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key.toLowerCase() === 'a') {
                    e.preventDefault();
                    this.prevSlide();
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    this.firstSlide();
                } else if (e.key === 'End') {
                    e.preventDefault();
                    this.lastSlide();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        this.setPresentationMode(false);
                    }
                } else if (e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    this.toggleFullscreen();
                }
            }
        });

        // Conmutador de Tema (Dark Industrial vs Light Paper)
        const themeBtn = document.getElementById('btnToggleTheme');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
                this.applyTheme(nextTheme);
            });
        }

        // Zoom de Fuente
        const btnZoomIn = document.getElementById('btnZoomIn');
        const btnZoomOut = document.getElementById('btnZoomOut');
        if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.adjustFontSize(1));
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.adjustFontSize(-1));

        // Imprimir / Exportar a PDF
        const btnPrint = document.getElementById('btnPrintDocument');
        if (btnPrint) {
            btnPrint.addEventListener('click', () => window.print());
        }

        // Búsqueda en barra lateral
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterDocs(e.target.value));
        }

        // Menús móviles (Drawer Izquierdo y Drawer Derecho)
        const toggleLeftDrawer = document.getElementById('toggleNavDrawer');
        const toggleRightDrawer = document.getElementById('toggleTocDrawer');
        const leftSidebar = document.getElementById('leftDocsSidebar');
        const rightSidebar = document.getElementById('rightTocSidebar');
        const backdrop = document.getElementById('docsBackdrop');

        if (toggleLeftDrawer && leftSidebar) {
            toggleLeftDrawer.addEventListener('click', () => {
                leftSidebar.classList.toggle('is-open');
                if (rightSidebar) rightSidebar.classList.remove('is-open');
                if (backdrop) backdrop.classList.toggle('is-active', leftSidebar.classList.contains('is-open'));
            });
        }

        if (toggleRightDrawer && rightSidebar) {
            toggleRightDrawer.addEventListener('click', () => {
                rightSidebar.classList.toggle('is-open');
                if (leftSidebar) leftSidebar.classList.remove('is-open');
                if (backdrop) backdrop.classList.toggle('is-active', rightSidebar.classList.contains('is-open'));
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', () => this.closeMobileDrawers());
        }
    }

    closeMobileDrawers() {
        const leftSidebar = document.getElementById('leftDocsSidebar');
        const rightSidebar = document.getElementById('rightTocSidebar');
        const backdrop = document.getElementById('docsBackdrop');
        if (leftSidebar) leftSidebar.classList.remove('is-open');
        if (rightSidebar) rightSidebar.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-active');
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        localStorage.setItem('robodocs-theme', theme);
        document.documentElement.setAttribute('data-theme', theme);

        const themeBtn = document.getElementById('btnToggleTheme');
        if (themeBtn) {
            if (theme === 'light') {
                themeBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    <span>Modo Oscuro</span>
                `;
            } else {
                themeBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                    <span>Modo Claro</span>
                `;
            }
        }
    }

    adjustFontSize(delta) {
        this.fontSize = Math.min(Math.max(this.fontSize + delta, 13), 22);
        const paper = document.getElementById('renderedPaperContent');
        if (paper) {
            paper.style.fontSize = `${this.fontSize}px`;
        }
    }

    copySnippet(btn) {
        const card = btn.closest('.code-block-card');
        const viewport = card ? card.querySelector('.code-viewport') : null;
        const rawCode = viewport ? viewport.getAttribute('data-raw') : '';
        if (rawCode) {
            navigator.clipboard.writeText(rawCode).then(() => {
                this.showToast('Fragmento copiado al portapapeles.');
                const span = btn.querySelector('span');
                if (span) {
                    const prevText = span.textContent;
                    span.textContent = '¡Copiado!';
                    setTimeout(() => { span.textContent = prevText; }, 1800);
                }
            }).catch(() => {
                this.showToast('No se pudo copiar el fragmento.');
            });
        }
    }

    /* ==========================================================================
       10. PWA & Estado de Conexión
       ========================================================================== */
    initPwa() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('[RoboDocs SW] Registrado con éxito:', reg.scope))
                    .catch(err => console.warn('[RoboDocs SW] Fallo de registro:', err));
            });
        }

        const installBtn = document.getElementById('btnInstallPwa');
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (installBtn) installBtn.style.display = 'inline-flex';
        });

        if (installBtn) {
            installBtn.addEventListener('click', () => {
                if (!this.deferredPrompt) return;
                this.deferredPrompt.prompt();
                this.deferredPrompt.userChoice.then(() => {
                    this.deferredPrompt = null;
                    installBtn.style.display = 'none';
                });
            });
        }

        window.addEventListener('online', () => this.showToast('Conexión a internet restablecida.'));
        window.addEventListener('offline', () => this.showToast('Modo sin conexión: Documentación en caché activa.'));
    }

    showToast(msg) {
        let toast = document.getElementById('appToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'appToast';
            toast.className = 'app-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('is-visible');
        setTimeout(() => toast.classList.remove('is-visible'), 3500);
    }
}
