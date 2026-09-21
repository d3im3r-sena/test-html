/**
 * RoboDocs - Industrial Robotics Documentation Platform
 * Main Controller: document loading, client-side LaTeX parsing, dual-sidebar navigation,
 * scroll-spy outline, search, themes, export tools, and PWA capabilities.
 */

document.addEventListener('DOMContentLoaded', () => {
    const app = new RoboDocsApp();
    window.RoboDocsApp = app;
    app.init();
});

class RoboDocsApp {
    constructor() {
        this.documents = [];
        this.currentDoc = null;
        this.parser = new LatexParser();
        this.currentRawTex = '';
        this.activeView = 'rendered'; // 'rendered' or 'source'
        this.currentTheme = localStorage.getItem('robodocs-theme') || 'dark';
        this.fontSize = 16;
        this.deferredPrompt = null;
        this.scrollObserver = null;
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

            // Inyectar código fuente con numeración en la vista TeX
            this.renderSourceView(rawTex);

            // Renderizar la Tabla de Contenidos (TOC) en la barra lateral derecha
            this.renderRightToc(parsed.toc);

            // Generar paginación inferior (anterior / siguiente)
            this.renderPagination();

            // Disparar renderizado de fórmulas KaTeX / MathJax
            this.typesetMath(contentCanvas);

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

    renderSourceView(rawTex) {
        const sourceGutter = document.getElementById('sourceCodeGutter');
        const sourceLabel = document.getElementById('sourceFilenameLabel');
        if (sourceLabel && this.currentDoc) {
            sourceLabel.textContent = this.currentDoc.filename;
        }

        if (!sourceGutter) return;

        const lines = rawTex.split('\n');
        let htmlLines = '';
        lines.forEach((line, idx) => {
            const num = idx + 1;
            htmlLines += `<div class="code-row"><span class="line-num">${num}</span><span class="line-text">${this.parser.escapeHtml(line)}</span></div>`;
        });
        sourceGutter.innerHTML = htmlLines;
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

        // Añadir evento clic suave
        tocContainer.querySelectorAll('.toc-anchor').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = a.getAttribute('data-target');
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
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

        const headings = document.querySelectorAll('.latex-section, .latex-subsection, .latex-subsubsection');
        if (!headings.length) return;

        const observerOptions = {
            root: document.getElementById('mainContentArea'),
            rootMargin: '0px 0px -70% 0px',
            threshold: 0
        };

        this.scrollObserver = new IntersectionObserver((entries) => {
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
       4. Paginación Inferior (Anterior / Siguiente)
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
                <a href="#${prevDoc.id}" class="pagination-card prev-card" onclick="event.preventDefault(); window.roboDocs.loadDocument('${prevDoc.id}');">
                    <span class="pag-dir">← Documento Anterior</span>
                    <strong class="pag-title">${prevDoc.title}</strong>
                </a>
            `;
        } else {
            html += '<div class="pagination-spacer"></div>';
        }

        if (nextDoc) {
            html += `
                <a href="#${nextDoc.id}" class="pagination-card next-card" onclick="event.preventDefault(); window.roboDocs.loadDocument('${nextDoc.id}');">
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
       7. Eventos de UI, Temas, Vistas y Herramientas
       ========================================================================== */
    bindEvents() {
        // Conmutador de Vistas: Renderizado vs Código TeX
        const btnViewRendered = document.getElementById('btnViewRendered');
        const btnViewSource = document.getElementById('btnViewSource');

        if (btnViewRendered && btnViewSource) {
            btnViewRendered.addEventListener('click', () => this.switchView('rendered'));
            btnViewSource.addEventListener('click', () => this.switchView('source'));
        }

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

        // Descarga de archivo .tex
        const btnDownload = document.getElementById('btnDownloadCurrentTex');
        if (btnDownload) {
            btnDownload.addEventListener('click', () => this.downloadTex());
        }

        // Copiar código TeX
        const btnCopySource = document.getElementById('btnCopySourceCode');
        if (btnCopySource) {
            btnCopySource.addEventListener('click', () => this.copyTexSource());
        }

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

    switchView(view) {
        this.activeView = view;
        const renderedView = document.getElementById('renderedPaperContent');
        const sourceView = document.getElementById('sourceCodeContainer');
        const btnRendered = document.getElementById('btnViewRendered');
        const btnSource = document.getElementById('btnViewSource');

        if (view === 'rendered') {
            if (renderedView) renderedView.style.display = 'block';
            if (sourceView) sourceView.style.display = 'none';
            if (btnRendered) btnRendered.classList.add('active');
            if (btnSource) btnSource.classList.remove('active');
        } else {
            if (renderedView) renderedView.style.display = 'none';
            if (sourceView) sourceView.style.display = 'block';
            if (btnRendered) btnRendered.classList.remove('active');
            if (btnSource) btnSource.classList.add('active');
        }
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

    downloadTex() {
        if (!this.currentRawTex || !this.currentDoc) return;
        const blob = new Blob([this.currentRawTex], { type: 'text/x-tex;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = this.currentDoc.filename;
        a.click();
        URL.revokeObjectURL(a.href);
        this.showToast(`Descargando ${this.currentDoc.filename}`);
    }

    copyTexSource() {
        if (!this.currentRawTex) return;
        navigator.clipboard.writeText(this.currentRawTex).then(() => {
            this.showToast('¡Código LaTeX copiado al portapapeles!');
        }).catch(() => {
            this.showToast('Error al copiar el código.');
        });
    }

    copySnippet(btn) {
        const card = btn.closest('.code-block-card');
        const viewport = card ? card.querySelector('.code-viewport') : null;
        const rawCode = viewport ? viewport.getAttribute('data-raw') : '';
        if (rawCode) {
            navigator.clipboard.writeText(rawCode).then(() => {
                this.showToast('Fragmento de código copiado.');
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
       8. PWA & Estado de Conexión
       ========================================================================= */
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

// Exponer instancia global para handlers de eventos
window.roboDocs = new RoboDocsApp();
