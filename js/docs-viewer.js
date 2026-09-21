/**
 * Documentation Viewer Controller for Industrial Robotics LaTeX Papers
 * Manages document loading, tab switching, TOC generation, MathJax/KaTeX rendering and export tools
 */

document.addEventListener('DOMContentLoaded', () => {
    const viewer = new DocsViewer();
    viewer.init();
});

class DocsViewer {
    constructor() {
        this.documents = [];
        this.currentDoc = null;
        this.parser = new LatexParser();
        this.currentRawTex = '';
        this.fontSize = 16;
        this.activeView = 'paper'; // 'paper' or 'source'
        this.activeTheme = 'paper-light'; // 'paper-light' or 'paper-dark'
    }

    async init() {
        this.bindUiEvents();
        await this.loadDocumentCatalog();
        this.handleRouting();
    }

    bindUiEvents() {
        // Selector de vista: Paper vs Código
        const tabPaper = document.getElementById('tabPaper');
        const tabSource = document.getElementById('tabSource');
        if (tabPaper && tabSource) {
            tabPaper.addEventListener('click', () => this.switchView('paper'));
            tabSource.addEventListener('click', () => this.switchView('source'));
        }

        // Conmutador de tema de papel
        const themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.togglePaperTheme());
        }

        // Botón de copiado de código fuente
        const copyBtn = document.getElementById('btnCopySource');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copySourceCode());
        }

        // Botón de descarga del archivo .tex
        const downloadBtn = document.getElementById('btnDownloadTex');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadCurrentTex());
        }

        // Botón de impresión a PDF
        const printBtn = document.getElementById('btnPrintDoc');
        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }

        // Ajustes de tamaño de fuente
        const fontInc = document.getElementById('btnFontIncrease');
        const fontDec = document.getElementById('btnFontDecrease');
        if (fontInc) fontInc.addEventListener('click', () => this.adjustFontSize(1));
        if (fontDec) fontDec.addEventListener('click', () => this.adjustFontSize(-1));

        // Búsqueda en catálogo
        const searchInput = document.getElementById('docsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterDocumentList(e.target.value));
        }

        // Menú móvil lateral (drawer de documentos e índice)
        const toggleDocsDrawer = document.getElementById('toggleDocsDrawer');
        const docsSidebar = document.getElementById('docsSidebar');
        const sidebarBackdrop = document.getElementById('sidebarBackdrop');

        if (toggleDocsDrawer && docsSidebar) {
            toggleDocsDrawer.addEventListener('click', () => {
                docsSidebar.classList.toggle('is-open');
                if (sidebarBackdrop) sidebarBackdrop.classList.toggle('is-visible');
            });
        }

        if (sidebarBackdrop) {
            sidebarBackdrop.addEventListener('click', () => {
                if (docsSidebar) docsSidebar.classList.remove('is-open');
                sidebarBackdrop.classList.remove('is-visible');
            });
        }
    }

    async loadDocumentCatalog() {
        try {
            const response = await fetch('docs/index.json');
            if (!response.ok) throw new Error('No se pudo cargar docs/index.json');
            this.documents = await response.json();
            this.renderDocumentList(this.documents);
        } catch (err) {
            console.error('Error cargando catálogo:', err);
            this.showToast('Error cargando índice de documentos.');
        }
    }

    renderDocumentList(docs) {
        const container = document.getElementById('docsList');
        if (!container) return;

        container.innerHTML = '';

        docs.forEach(doc => {
            const item = document.createElement('div');
            item.className = `doc-nav-item ${this.currentDoc?.id === doc.id ? 'active' : ''}`;
            item.setAttribute('data-id', doc.id);
            item.innerHTML = `
                <span class="doc-nav-category">${doc.category}</span>
                <h4 class="doc-nav-title">${doc.title}</h4>
                <div class="doc-nav-meta">
                    <span>${doc.author.split('&')[0].trim()}</span>
                    <span>${doc.date}</span>
                </div>
            `;

            item.addEventListener('click', () => {
                this.loadDocumentById(doc.id);
                // Cerrar drawer en móvil
                const docsSidebar = document.getElementById('docsSidebar');
                const sidebarBackdrop = document.getElementById('sidebarBackdrop');
                if (docsSidebar) docsSidebar.classList.remove('is-open');
                if (sidebarBackdrop) sidebarBackdrop.classList.remove('is-visible');
            });

            container.appendChild(item);
        });
    }

    handleRouting() {
        const hash = window.location.hash.replace('#', '');
        const found = this.documents.find(d => d.id === hash);
        if (found) {
            this.loadDocumentById(found.id);
        } else if (this.documents.length > 0) {
            this.loadDocumentById(this.documents[0].id);
        }
    }

    async loadDocumentById(docId) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        this.currentDoc = doc;
        window.location.hash = doc.id;

        // Actualizar estado activo en la lista
        document.querySelectorAll('.doc-nav-item').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-id') === docId);
        });

        // Mostrar indicador de carga
        const paperContainer = document.getElementById('paperView');
        if (paperContainer) {
            paperContainer.innerHTML = `
                <div class="docs-loading-state">
                    <div class="spinner"></div>
                    <p>Cargando y renderizando <strong>${doc.filename}</strong>...</p>
                </div>
            `;
        }

        try {
            const response = await fetch(`docs/${doc.filename}`);
            if (!response.ok) throw new Error(`No se pudo leer docs/${doc.filename}`);
            const rawTex = await response.text();
            this.currentRawTex = rawTex;

            // Procesar con el motor LaTeX
            const parsed = this.parser.parse(rawTex);

            // 1. Inyectar HTML renderizado
            if (paperContainer) {
                paperContainer.innerHTML = parsed.html;
            }

            // 2. Inyectar código fuente con numeración
            this.renderSourceCode(rawTex);

            // 3. Renderizar Tabla de Contenidos (TOC)
            this.renderTableOfContents(parsed.toc);

            // 4. Disparar renderizado de matemáticas (MathJax / KaTeX)
            this.renderMath(paperContainer);

            // 5. Scroll al inicio
            const mainScroll = document.getElementById('docViewerContent');
            if (mainScroll) mainScroll.scrollTop = 0;

        } catch (err) {
            console.error('Error procesando archivo TeX:', err);
            if (paperContainer) {
                paperContainer.innerHTML = `
                    <div class="docs-error-state">
                        <h3>Error al cargar el documento</h3>
                        <p>${err.message}</p>
                    </div>
                `;
            }
        }
    }

    renderTableOfContents(toc) {
        const tocContainer = document.getElementById('docTocList');
        if (!tocContainer) return;

        if (!toc || toc.length === 0) {
            tocContainer.innerHTML = '<p class="toc-empty">Sin secciones definidas</p>';
            return;
        }

        tocContainer.innerHTML = '';
        const list = document.createElement('ul');
        list.className = 'toc-list';

        toc.forEach(item => {
            const li = document.createElement('li');
            li.className = `toc-item toc-level-${item.level}`;
            li.innerHTML = `
                <a href="#${item.id}" class="toc-link">
                    <span class="toc-num">${item.number}</span>
                    <span class="toc-text">${item.text}</span>
                </a>
            `;

            li.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                const targetEl = document.getElementById(item.id);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });

            list.appendChild(li);
        });

        tocContainer.appendChild(list);
    }

    renderSourceCode(raw) {
        const sourceContainer = document.getElementById('sourceCodeBlock');
        if (!sourceContainer) return;

        const lines = raw.split('\n');
        let numberedLines = '';

        lines.forEach((line, index) => {
            const lineNum = index + 1;
            numberedLines += `<span class="code-line"><span class="line-number">${lineNum}</span><span class="line-content">${this.parser.escapeHtml(line)}</span></span>\n`;
        });

        sourceContainer.innerHTML = numberedLines;
    }

    renderMath(container) {
        if (!container) return;

        // Si MathJax v3 está disponible
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([container]).catch((err) => {
                console.warn('MathJax error:', err);
            });
        } 
        // Si KaTeX está disponible
        else if (window.renderMathInElement) {
            window.renderMathInElement(container, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
    }

    switchView(view) {
        this.activeView = view;
        const paperEl = document.getElementById('paperView');
        const sourceEl = document.getElementById('sourceView');
        const tabPaper = document.getElementById('tabPaper');
        const tabSource = document.getElementById('tabSource');

        if (view === 'paper') {
            if (paperEl) paperEl.style.display = 'block';
            if (sourceEl) sourceEl.style.display = 'none';
            if (tabPaper) tabPaper.classList.add('active');
            if (tabSource) tabSource.classList.remove('active');
        } else {
            if (paperEl) paperEl.style.display = 'none';
            if (sourceEl) sourceEl.style.display = 'block';
            if (tabPaper) tabPaper.classList.remove('active');
            if (tabSource) tabSource.classList.add('active');
        }
    }

    togglePaperTheme() {
        const paperEl = document.getElementById('paperView');
        const btn = document.getElementById('btnThemeToggle');
        if (!paperEl) return;

        if (this.activeTheme === 'paper-light') {
            this.activeTheme = 'paper-dark';
            paperEl.classList.remove('theme-paper-light');
            paperEl.classList.add('theme-paper-dark');
            if (btn) btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                <span>Fondo Claro</span>
            `;
        } else {
            this.activeTheme = 'paper-light';
            paperEl.classList.remove('theme-paper-dark');
            paperEl.classList.add('theme-paper-light');
            if (btn) btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                <span>Fondo Oscuro</span>
            `;
        }
    }

    adjustFontSize(delta) {
        this.fontSize = Math.min(Math.max(this.fontSize + delta, 13), 22);
        const paperEl = document.getElementById('paperView');
        if (paperEl) {
            paperEl.style.fontSize = `${this.fontSize}px`;
        }
    }

    copySourceCode() {
        if (!this.currentRawTex) return;
        navigator.clipboard.writeText(this.currentRawTex).then(() => {
            this.showToast('¡Código LaTeX copiado al portapapeles!');
        }).catch(() => {
            this.showToast('No se pudo copiar automáticamente.');
        });
    }

    downloadCurrentTex() {
        if (!this.currentRawTex || !this.currentDoc) return;
        const blob = new Blob([this.currentRawTex], { type: 'text/x-tex;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = this.currentDoc.filename;
        link.click();
        URL.revokeObjectURL(link.href);
        this.showToast(`Descargando ${this.currentDoc.filename}`);
    }

    filterDocumentList(query) {
        const lower = query.toLowerCase().trim();
        const filtered = this.documents.filter(doc => {
            return doc.title.toLowerCase().includes(lower) ||
                   doc.category.toLowerCase().includes(lower) ||
                   doc.description.toLowerCase().includes(lower) ||
                   doc.tags.some(t => t.toLowerCase().includes(lower));
        });
        this.renderDocumentList(filtered);
    }

    showToast(message) {
        let toast = document.getElementById('docsToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'docsToast';
            toast.className = 'toast show';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }
}
