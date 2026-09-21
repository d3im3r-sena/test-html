/**
 * RoboDocs - Motor Integral de Renderizado LaTeX & Beamer
 * Soporta documentos académicos, presentaciones Beamer (16:9),
 * macros docentes personalizadas (\Idea, \Practice, \DefBlock, etc.),
 * entornos de código Minted/Tcolorbox y diagramas geométricos 2D TikZ a SVG.
 */

class LatexParser {
    constructor() {
        this.toc = [];
        this.sectionCount = 0;
        this.slideCount = 0;
        this.meta = {};
    }

    /**
     * Parsea contenido LaTeX completo a HTML estructurado
     * @param {string} texContent - Código fuente .tex
     * @returns {Object} { meta, html, toc, raw, isBeamer }
     */
    parse(texContent) {
        this.toc = [];
        this.sectionCount = 0;
        this.slideCount = 0;

        // 1. Extraer Metadatos y Variables Institucionales (del template o del documento)
        this.meta = this.extractVariables(texContent);

        // 2. Comprobar si es un archivo de plantilla puro (sin \begin{document})
        const hasDocumentEnv = texContent.includes('\\begin{document}');
        const isBeamer = texContent.includes('{beamer}') || texContent.includes('\\begin{frame}') || texContent.includes('\\TitleSlide');

        if (!hasDocumentEnv && texContent.includes('\\newcommand{\\CourseName}')) {
            // Es la plantilla institucional template-slide.tex
            return this.renderTemplateDocumentation(texContent);
        }

        // 3. Extraer cuerpo de documento si existe
        let body = texContent;
        if (hasDocumentEnv) {
            const docStart = texContent.indexOf('\\begin{document}');
            const docEnd = texContent.lastIndexOf('\\end{document}');
            body = texContent.substring(docStart + 16, docEnd !== -1 ? docEnd : texContent.length);
        }

        // Eliminar comentarios que no sean parte de comandos (\% queda protegido)
        body = body.replace(/(^|[^\\])%.*$/gm, '$1');

        // Ignorar comandos de input de plantillas locales
        body = body.replace(/\\input\{[^}]+\}/g, '');

        // 4. Pre-procesar entornos de código (tcolorbox / minted / verbatim) para protegerlos de reemplazos
        const codeBlocks = [];
        body = this.protectCodeBlocks(body, codeBlocks);

        // 5. Pre-procesar diagramas TikZ para convertirlos a SVG
        const tikzBlocks = [];
        body = this.protectTikzBlocks(body, tikzBlocks);

        // 6. Procesar diapositivas maestras del template
        body = this.processMasterSlides(body);

        // 7. Si es Beamer, procesar los frames individuales
        if (isBeamer) {
            body = this.processBeamerFrames(body);
        } else {
            // Documento técnico estándar: procesar secciones regulares
            body = this.processSections(body);
        }

        // 8. Procesar columnas de Beamer (\begin{columns} y \begin{column})
        body = this.processColumns(body);

        // 9. Procesar bloques docentes (\Idea, \Practice, \DefBlock, \Warning, etc.)
        body = this.processDocentBlocks(body);

        // 10. Procesar ecuaciones matemáticas (display math \[ ... \], equation, align)
        body = this.processDisplayMath(body);

        // 11. Procesar listas (itemize, enumerate)
        body = this.processLists(body);

        // 12. Procesar imágenes y logos institucionales
        body = this.processImages(body);

        // 13. Formato en línea (negrita, cursiva, código, matemáticas inline $...$)
        body = this.formatInline(body);

        // 14. Restaurar diagramas TikZ (convertidos a SVG)
        body = this.restoreTikzBlocks(body, tikzBlocks);

        // 15. Restaurar bloques de código protegidos
        body = this.restoreCodeBlocks(body, codeBlocks);

        // 16. Limpieza de espaciados vacíos de LaTeX
        body = body.replace(/\\vspace\*?\{[^}]+\}/g, '');
        body = body.replace(/\\hspace\*?\{[^}]+\}/g, '');
        body = body.replace(/\\leavevmode/g, '');
        body = body.replace(/\\centering/g, '');

        // 17. Ensamblar documento final
        const finalHtml = `
            <article class="latex-beamer-deck ${isBeamer ? 'is-beamer-presentation' : 'is-academic-paper'}">
                <header class="deck-main-header">
                    <div class="deck-header-badge">
                        <span class="badge-icon">🎓</span>
                        <span>${this.meta.institution || 'Politécnico Colombiano Jaime Isaza Cadavid'}</span>
                        <span class="badge-sep">•</span>
                        <span>${this.meta.courseCode || 'ING'}</span>
                    </div>
                    <h1 class="deck-main-title">${this.meta.courseName || this.meta.title}</h1>
                    ${this.meta.subtitle ? `<div class="deck-main-subtitle">${this.meta.subtitle}</div>` : ''}
                    <div class="deck-meta-bar">
                        <div class="meta-item"><i class="fa fa-user-tie"></i> <strong>Docente:</strong> ${this.meta.instructor || this.meta.author}</div>
                        ${this.meta.email ? `<div class="meta-item"><i class="fa fa-envelope"></i> ${this.meta.email}</div>` : ''}
                        <div class="meta-item"><i class="fa fa-calendar-alt"></i> <strong>Periodo:</strong> ${this.meta.date || '2026-2'}</div>
                        <div class="meta-item meta-slides-counter"><i class="fa fa-layer-group"></i> <strong>${this.slideCount} Diapositivas</strong></div>
                    </div>
                </header>

                <div class="deck-slides-canvas">
                    ${body}
                </div>
            </article>
        `;

        return {
            meta: this.meta,
            html: finalHtml,
            toc: this.toc,
            raw: texContent,
            isBeamer: isBeamer,
            slideCount: this.slideCount
        };
    }

    /**
     * Extrae variables institucionales definidas con \newcommand o \renewcommand
     */
    extractVariables(tex) {
        const getVal = (varName) => {
            const regex = new RegExp(`\\\\(?:re)?newcommand{\\\\${varName}}{([\\s\\S]*?)}`);
            const m = tex.match(regex);
            return m ? m[1].replace(/\\_/g, '_').trim() : '';
        };

        const getCmdVal = (cmdName) => {
            const regex = new RegExp(`\\\\${cmdName}{([\\s\\S]*?)}`);
            const m = tex.match(regex);
            return m ? m[1].replace(/\\\\/g, ' ').replace(/\\_/g, '_').trim() : '';
        };

        return {
            courseName: getVal('CourseName') || getCmdVal('title') || 'Robótica del Servicio',
            courseCode: getVal('CourseCode') || 'ING 01335',
            faculty: getVal('Faculty') || 'Facultad de Ingeniería',
            institution: getVal('Institution') || 'Politécnico Colombiano Jaime Isaza Cadavid',
            instructor: getVal('Instructor') || getCmdVal('author') || 'Deimer Miranda Montoya, MSc.(c).',
            email: getVal('Email') || 'deimer_miranda91162@elpoli.edu.co',
            logo: getVal('InstitutionLogo') || 'Template/LogoPoli.png',
            title: getCmdVal('title') || getVal('CourseName') || 'Robótica del Servicio',
            subtitle: getCmdVal('subtitle') || '',
            date: getCmdVal('date') || '2026-2',
            author: getVal('Instructor') || getCmdVal('author') || 'Deimer Miranda Montoya'
        };
    }

    /**
     * Diapositivas maestras del template institucional (\TitleSlide, \NormasSlide, \SectionSlide)
     */
    processMasterSlides(tex) {
        // \TitleSlide -> Portada Institucional
        tex = tex.replace(/\\TitleSlide/g, () => {
            this.slideCount++;
            const slideId = `slide-${this.slideCount}`;
            this.toc.push({
                id: slideId,
                number: `${this.slideCount}.`,
                text: `Portada: ${this.meta.courseName}`,
                level: 1
            });

            return `
                <section class="beamer-slide slide-cover-institutional" id="${slideId}" data-slide="${this.slideCount}">
                    <div class="cover-accent-rule top"></div>
                    <div class="cover-body">
                        <div class="cover-logo-badge">
                            <span class="institution-pill">${this.meta.institution}</span>
                            <span class="faculty-pill">${this.meta.faculty}</span>
                        </div>
                        <h1 class="cover-title">${this.meta.courseName}</h1>
                        <div class="cover-code">${this.meta.courseCode}</div>
                        ${this.meta.subtitle ? `<p class="cover-subtitle">${this.meta.subtitle}</p>` : ''}
                        
                        <div class="cover-footer-info">
                            <div class="instructor-card">
                                <div class="instructor-icon">👨‍🏫</div>
                                <div class="instructor-details">
                                    <div class="instructor-name">${this.meta.instructor}</div>
                                    <div class="instructor-email"><a href="mailto:${this.meta.email}">${this.meta.email}</a></div>
                                </div>
                            </div>
                            <div class="period-badge">Semestre ${this.meta.date}</div>
                        </div>
                    </div>
                    <div class="cover-accent-rule bottom"></div>
                </section>
            `;
        });

        // \NormasSlide -> Normas de Convivencia y Compromiso Académico
        tex = tex.replace(/\\NormasSlide/g, () => {
            this.slideCount++;
            const slideId = `slide-${this.slideCount}`;
            this.toc.push({
                id: slideId,
                number: `${this.slideCount}.`,
                text: 'Normas del curso',
                level: 1
            });

            return `
                <section class="beamer-slide slide-normas" id="${slideId}" data-slide="${this.slideCount}">
                    <header class="frame-title-bar">
                        <span class="frame-slide-num">#${this.slideCount}</span>
                        <h3 class="frame-title-text"><i class="fa fa-clipboard-check"></i> Normas del Curso</h3>
                    </header>
                    <div class="frame-body">
                        <div class="normas-grid">
                            <div class="norma-card">
                                <div class="norma-icon-circle icon-yellow">⏰</div>
                                <div class="norma-header">Puntualidad</div>
                                <p>Cumple con los horarios y demuestra compromiso académico en cada sesión.</p>
                            </div>
                            <div class="norma-card">
                                <div class="norma-icon-circle icon-green">💡</div>
                                <div class="norma-header">Actitud Profesional</div>
                                <p>Mantén una actitud profesional, ética y orientada al aprendizaje continuo.</p>
                            </div>
                            <div class="norma-card">
                                <div class="norma-icon-circle icon-blue">💬</div>
                                <div class="norma-header">Comunicación Asertiva</div>
                                <p>Comunica tus ideas con claridad, respeto y fundamento técnico.</p>
                            </div>
                            <div class="norma-card wide-card">
                                <div class="norma-icon-circle icon-teal">🤝</div>
                                <div class="norma-header">Participación Activa</div>
                                <p>Participa activamente y contribuye de forma solidaria al trabajo colaborativo.</p>
                            </div>
                            <div class="norma-card wide-card">
                                <div class="norma-icon-circle icon-purple">🛡️</div>
                                <div class="norma-header">Uso Responsable</div>
                                <p>Haz uso responsable y riguroso de los recursos, equipos de cómputo e instalaciones.</p>
                            </div>
                        </div>
                    </div>
                    ${this.renderSlideFootline(this.slideCount)}
                </section>
            `;
        });

        // \SectionSlide{Título}{Subtítulo} -> Diapositiva de Sección
        tex = tex.replace(/\\SectionSlide\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/g, (match, title, subtitle) => {
            this.slideCount++;
            const cleanTitle = this.cleanTexorpdfstring(title.trim());
            const cleanSub = this.cleanTexorpdfstring(subtitle.trim());
            const slideId = `slide-${this.slideCount}`;

            this.toc.push({
                id: slideId,
                number: `${this.slideCount}.`,
                text: cleanTitle,
                level: 1
            });

            return `
                <section class="beamer-slide slide-section-banner" id="${slideId}" data-slide="${this.slideCount}">
                    <div class="section-banner-card">
                        <div class="section-banner-pill"><i class="fa fa-folder-open"></i> Unidad Temática</div>
                        <h2 class="section-banner-title">${this.formatInline(cleanTitle)}</h2>
                        <div class="section-banner-rule"></div>
                        <p class="section-banner-sub">${this.formatInline(cleanSub)}</p>
                    </div>
                    ${this.renderSlideFootline(this.slideCount)}
                </section>
            `;
        });

        // \section{...} -> Registrar sección en TOC
        tex = tex.replace(/\\section\{([\s\S]*?)\}/g, (match, sectionTitle) => {
            this.sectionCount++;
            const clean = this.cleanTexorpdfstring(sectionTitle.trim());
            return `<div class="latex-section-marker" data-section="${this.escapeHtml(clean)}"></div>`;
        });

        return tex;
    }

    /**
     * Procesa los frames Beamer: \begin{frame}{Título} ... \end{frame}
     */
    processBeamerFrames(tex) {
        // Expresión regular para frames con título opcional o obligatorio
        // Soporta: \begin{frame}{Titulo}, \begin{frame}[opciones]{Titulo}, \begin{frame}
        const frameRegex = /\\begin\{frame\}(?:\[[^\]]*\])?(?:\{([\s\S]*?)\})?([\s\S]*?)\\end\{frame\}/g;

        return tex.replace(frameRegex, (match, frameTitle, frameContent) => {
            this.slideCount++;
            const slideId = `slide-${this.slideCount}`;
            const rawTitle = frameTitle ? frameTitle.trim() : `Diapositiva ${this.slideCount}`;
            const cleanTitle = this.cleanTexorpdfstring(rawTitle);
            const displayTitle = this.formatInline(this.resolveTexorpdfstringDisplay(rawTitle));

            // Agregar a la tabla de contenidos (TOC)
            this.toc.push({
                id: slideId,
                number: `${this.slideCount}.`,
                text: cleanTitle,
                level: 2
            });

            return `
                <section class="beamer-slide frame-standard" id="${slideId}" data-slide="${this.slideCount}">
                    <header class="frame-title-bar">
                        <span class="frame-slide-num">#${this.slideCount}</span>
                        <h3 class="frame-title-text">${displayTitle}</h3>
                    </header>
                    <div class="frame-body">
                        ${frameContent.trim()}
                    </div>
                    ${this.renderSlideFootline(this.slideCount)}
                </section>
            `;
        });
    }

    renderSlideFootline(num) {
        return `
            <footer class="frame-footline">
                <div class="footline-left">
                    <span class="footline-course">${this.meta.courseCode} • ${this.meta.courseName}</span>
                </div>
                <div class="footline-right">
                    <span class="footline-instructor">${this.meta.instructor}</span>
                    <span class="footline-page-num">${num}</span>
                </div>
            </footer>
        `;
    }

    /**
     * Procesa columnas Beamer (\begin{columns} ... \end{columns})
     */
    processColumns(tex) {
        // 1. Columnas individuales
        tex = tex.replace(/\\begin\{column\}\{([^}]+)\}([\s\S]*?)\\end\{column\}/g, (match, widthExpr, colContent) => {
            let flexBasis = '50%';
            const m = widthExpr.match(/([\d\.]+)\\textwidth/);
            if (m) {
                const percent = Math.round(parseFloat(m[1]) * 100);
                flexBasis = `${percent}%`;
            }
            return `<div class="beamer-column" style="flex: 1 1 ${flexBasis}; max-width: ${flexBasis};">\n${colContent.trim()}\n</div>`;
        });

        // 2. Contenedor columns
        tex = tex.replace(/\\begin\{columns\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{columns\}/g, (match, content) => {
            return `<div class="beamer-columns">\n${content.trim()}\n</div>`;
        });

        return tex;
    }

    /**
     * Procesa los bloques docentes del template-slide.tex
     */
    processDocentBlocks(tex) {
        const blocksConfig = [
            { cmd: 'Idea', defaultTitle: 'Idea clave', icon: '💡', cssClass: 'block-idea' },
            { cmd: 'Practice', defaultTitle: 'Actividad práctica', icon: '💻', cssClass: 'block-practice' },
            { cmd: 'DefBlock', defaultTitle: 'Definición', icon: '📖', cssClass: 'block-def' },
            { cmd: 'Result', defaultTitle: 'Resultado', icon: '✅', cssClass: 'block-result' },
            { cmd: 'Warning', defaultTitle: 'Atención', icon: '⚠️', cssClass: 'block-warning' },
            { cmd: 'Compare', defaultTitle: 'Comparación', icon: '⚖️', cssClass: 'block-compare' },
            { cmd: 'Question', defaultTitle: 'Pregunta guía', icon: '❓', cssClass: 'block-question' },
            { cmd: 'ExampleBlock', defaultTitle: 'Ejemplo', icon: '🧩', cssClass: 'block-example' }
        ];

        for (const b of blocksConfig) {
            // Soportar tanto \Cmd[Titulo]{Cuerpo} como \Cmd{Cuerpo}
            // Utilizamos extracción balanceada de llaves para no truncar si hay fórmulas o negritas internas
            let searchIndex = 0;
            const searchToken = `\\${b.cmd}`;

            while (true) {
                const pos = tex.indexOf(searchToken, searchIndex);
                if (pos === -1) break;

                // Asegurar que es el comando exacto y no parte de otra palabra
                const nextChar = tex[pos + searchToken.length];
                if (nextChar && /[a-zA-Z]/.test(nextChar)) {
                    searchIndex = pos + searchToken.length;
                    continue;
                }

                let cur = pos + searchToken.length;
                // Saltar espacios
                while (cur < tex.length && /\s/.test(tex[cur])) cur++;

                // Chequear argumento opcional [Titulo]
                let customTitle = b.defaultTitle;
                if (tex[cur] === '[') {
                    const closeBracket = tex.indexOf(']', cur);
                    if (closeBracket !== -1) {
                        customTitle = tex.substring(cur + 1, closeBracket).trim();
                        cur = closeBracket + 1;
                        while (cur < tex.length && /\s/.test(tex[cur])) cur++;
                    }
                }

                // Chequear argumento obligatorio {Cuerpo}
                if (tex[cur] === '{') {
                    const braceEnd = this.findMatchingBrace(tex, cur);
                    if (braceEnd !== -1) {
                        const bodyContent = tex.substring(cur + 1, braceEnd);
                        const blockHtml = `
                            <div class="docent-block ${b.cssClass}">
                                <div class="block-title-row">
                                    <span class="block-icon">${b.icon}</span>
                                    <span class="block-title-text">${this.formatInline(customTitle)}</span>
                                </div>
                                <div class="block-content-body">
                                    ${this.formatInline(bodyContent.trim())}
                                </div>
                            </div>
                        `;

                        tex = tex.substring(0, pos) + blockHtml + tex.substring(braceEnd + 1);
                        searchIndex = pos + blockHtml.length;
                        continue;
                    }
                }

                searchIndex = pos + searchToken.length;
            }
        }

        // Bloques Beamer estándar: \begin{block}{Titulo} ... \end{block}
        tex = tex.replace(/\\begin\{block\}\{([^}]+)\}([\s\S]*?)\\end\{block\}/g, (match, title, content) => {
            return `
                <div class="docent-block block-standard">
                    <div class="block-title-row"><span class="block-icon">📌</span><span class="block-title-text">${this.formatInline(title)}</span></div>
                    <div class="block-content-body">${this.formatInline(content.trim())}</div>
                </div>
            `;
        });

        // \begin{alertblock}{Titulo} ... \end{alertblock}
        tex = tex.replace(/\\begin\{alertblock\}\{([^}]+)\}([\s\S]*?)\\end\{alertblock\}/g, (match, title, content) => {
            return `
                <div class="docent-block block-warning">
                    <div class="block-title-row"><span class="block-icon">⚠️</span><span class="block-title-text">${this.formatInline(title)}</span></div>
                    <div class="block-content-body">${this.formatInline(content.trim())}</div>
                </div>
            `;
        });

        return tex;
    }

    /**
     * Pre-procesa y protege entornos de código (minted, tcolorbox, verbatim)
     */
    protectCodeBlocks(tex, storage) {
        const envs = [
            { name: 'pythoncodedark', lang: 'Python (Monokai)', theme: 'dark' },
            { name: 'pythoncode', lang: 'Python (Claro)', theme: 'light' },
            { name: 'bashcodedark', lang: 'Bash', theme: 'dark' },
            { name: 'bashcode', lang: 'Bash', theme: 'light' },
            { name: 'htmlcodedark', lang: 'HTML', theme: 'dark' },
            { name: 'htmlcode', lang: 'HTML', theme: 'light' },
            { name: 'cppcodedark', lang: 'C++', theme: 'dark' },
            { name: 'cppcode', lang: 'C++', theme: 'light' },
            { name: 'sqlcodedark', lang: 'SQL', theme: 'dark' },
            { name: 'sqlcode', lang: 'SQL', theme: 'light' },
            { name: 'javacodedark', lang: 'Java', theme: 'dark' },
            { name: 'javacode', lang: 'Java', theme: 'light' },
            { name: 'consolecodedark', lang: 'Consola', theme: 'dark' },
            { name: 'consolecode', lang: 'Consola', theme: 'light' },
            { name: 'verbatim', lang: 'Texto', theme: 'dark' }
        ];

        for (const env of envs) {
            const regex = new RegExp(`\\\\begin\\{${env.name}\\}([\\s\\S]*?)\\\\end\\{${env.name}\\}`, 'g');
            tex = tex.replace(regex, (match, code) => {
                const placeholder = `___CODE_BLOCK_${storage.length}___`;
                storage.push({
                    placeholder,
                    html: this.renderCodeBlockCard(code.trim(), env.lang, env.theme)
                });
                return placeholder;
            });
        }

        return tex;
    }

    renderCodeBlockCard(code, lang, theme) {
        const lines = code.split('\n');
        const numberedLines = lines.map((line, idx) => {
            const safe = this.escapeHtml(line);
            return `<div class="code-line"><span class="line-num">${idx + 1}</span><span class="line-code">${safe || '&nbsp;'}</span></div>`;
        }).join('');

        return `
            <div class="code-block-card theme-${theme}">
                <div class="code-card-header">
                    <div class="code-lang-indicator">
                        <span class="code-dot red"></span>
                        <span class="code-dot yellow"></span>
                        <span class="code-dot green"></span>
                        <span class="code-lang-name"><i class="fa fa-terminal"></i> ${lang}</span>
                    </div>
                    <button class="btn-copy-code-snippet" onclick="window.RoboDocsApp && window.RoboDocsApp.copySnippet(this)" title="Copiar fragmento">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        <span>Copiar</span>
                    </button>
                </div>
                <div class="code-viewport" data-raw="${this.escapeHtml(code)}">
                    ${numberedLines}
                </div>
            </div>
        `;
    }

    restoreCodeBlocks(tex, storage) {
        for (const item of storage) {
            tex = tex.replace(item.placeholder, item.html);
        }
        return tex;
    }

    /**
     * Pre-procesa diagramas TikZ para renderizarlos en SVG vectorial
     */
    protectTikzBlocks(tex, storage) {
        const regex = /\\begin\{tikzpicture\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{tikzpicture\}/g;
        return tex.replace(regex, (match, tikzContent) => {
            const placeholder = `___TIKZ_BLOCK_${storage.length}___`;
            const svgHtml = this.renderTikZToSVG(tikzContent.trim());
            storage.push({
                placeholder,
                html: svgHtml
            });
            return placeholder;
        });
    }

    restoreTikzBlocks(tex, storage) {
        for (const item of storage) {
            tex = tex.replace(item.placeholder, item.html);
        }
        return tex;
    }

    /**
     * Motor de interpretación 2D TikZ a Gráficos Vectoriales SVG
     */
    renderTikZToSVG(tikzCode) {
        const width = 420;
        const height = 300;
        const originX = 60;
        const originY = 240;
        const scale = 45; // 1 unidad = 45px

        const toSvgX = (x) => originX + x * scale;
        const toSvgY = (y) => originY - y * scale;

        let svgElements = '';
        let recognized = false;

        // Marcador de flecha para vectores y ejes
        const defs = `
            <defs>
                <marker id="arrowhead-main" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <polygon points="0 1, 8 4, 0 7" fill="#14C486" />
                </marker>
                <marker id="arrowhead-blue" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <polygon points="0 1, 8 4, 0 7" fill="#1E3C78" />
                </marker>
                <marker id="arrowhead-axis" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                    <polygon points="0 1, 7 3.5, 0 6" fill="#94A3B8" />
                </marker>
            </defs>
        `;

        // 1. Parsear coordenadas nombradas: \coordinate (P) at (4,3);
        const coordinates = {};
        const coordRegex = /\\coordinate\s*\(([A-Za-z0-9]+)\)\s*at\s*\(([\d\.\-]+),([\d\.\-]+)\);/g;
        let cMatch;
        while ((cMatch = coordRegex.exec(tikzCode)) !== null) {
            coordinates[cMatch[1]] = { x: parseFloat(cMatch[2]), y: parseFloat(cMatch[3]) };
        }

        const resolveCoord = (token) => {
            token = token.trim();
            if (coordinates[token]) return coordinates[token];
            const m = token.match(/\(([\d\.\-]+),([\d\.\-]+)\)/);
            if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
            return null;
        };

        // 2. Dibujar líneas y ejes: \draw[...] (x1,y1) -- (x2,y2);
        const lineRegex = /\\draw\s*(?:\[([^\]]*)\])?\s*(\([^)]+\)|[A-Za-z0-9]+)\s*--\s*(\([^)]+\)|[A-Za-z0-9]+)(?:\s*node[^;]*)?;/g;
        let lMatch;
        while ((lMatch = lineRegex.exec(tikzCode)) !== null) {
            const options = lMatch[1] || '';
            const p1 = resolveCoord(lMatch[2]);
            const p2 = resolveCoord(lMatch[3]);

            if (p1 && p2) {
                recognized = true;
                const isDashed = options.includes('dashed');
                const isArrow = options.includes('->') || options.includes('Latex');
                let stroke = '#94A3B8';
                let strokeWidth = 2;
                let marker = isArrow ? 'url(#arrowhead-axis)' : '';

                if (options.includes('BrandBlue')) {
                    stroke = '#3B82F6';
                    strokeWidth = 3;
                    marker = 'url(#arrowhead-blue)';
                } else if (options.includes('BrandGreen')) {
                    stroke = '#10B981';
                    strokeWidth = 3;
                    marker = 'url(#arrowhead-main)';
                }

                svgElements += `
                    <line x1="${toSvgX(p1.x)}" y1="${toSvgY(p1.y)}" x2="${toSvgX(p2.x)}" y2="${toSvgY(p2.y)}"
                          stroke="${stroke}" stroke-width="${strokeWidth}"
                          ${isDashed ? 'stroke-dasharray="5 4"' : ''}
                          ${marker ? `marker-end="${marker}"` : ''} />
                `;
            }
        }

        // 3. Puntos y círculos: \filldraw[...] (P) circle (2.5pt);
        const circleRegex = /\\filldraw\s*(?:\[([^\]]*)\])?\s*(\([^)]+\)|[A-Za-z0-9]+)\s*circle\s*\(([^)]+)\);/g;
        let cirMatch;
        while ((cirMatch = circleRegex.exec(tikzCode)) !== null) {
            const options = cirMatch[1] || '';
            const pt = resolveCoord(cirMatch[2]);
            if (pt) {
                recognized = true;
                let fill = '#FFB93E';
                if (options.includes('BrandBlue')) fill = '#3B82F6';
                if (options.includes('BrandGreen')) fill = '#10B981';

                svgElements += `
                    <circle cx="${toSvgX(pt.x)}" cy="${toSvgY(pt.y)}" r="5" fill="${fill}" stroke="#ffffff" stroke-width="1.5" />
                `;
            }
        }

        // 4. Arcos angulares: \draw[...] (x,y) arc[start angle=A, end angle=B, radius=R];
        const arcRegex = /\\draw\s*(?:\[([^\]]*)\])?\s*\(([\d\.\-]+),([\d\.\-]+)\)\s*arc\[start angle=([\d\.\-]+),\s*end angle=([\d\.\-]+),\s*radius=([\d\.\-]+)\];/g;
        let arcMatch;
        while ((arcMatch = arcRegex.exec(tikzCode)) !== null) {
            recognized = true;
            const startX = parseFloat(arcMatch[2]);
            const startY = parseFloat(arcMatch[3]);
            const startAngle = (parseFloat(arcMatch[4]) * Math.PI) / 180;
            const endAngle = (parseFloat(arcMatch[5]) * Math.PI) / 180;
            const r = parseFloat(arcMatch[6]);

            // Centro implícito del arco
            const cx = startX - r * Math.cos(startAngle);
            const cy = startY - r * Math.sin(startAngle);

            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);

            const svgP1x = toSvgX(startX);
            const svgP1y = toSvgY(startY);
            const svgP2x = toSvgX(x2);
            const svgP2y = toSvgY(y2);
            const svgR = r * scale;

            svgElements += `
                <path d="M ${svgP1x} ${svgP1y} A ${svgR} ${svgR} 0 0 1 ${svgP2x} ${svgP2y}"
                      fill="none" stroke="#F59E0B" stroke-width="2.5" marker-end="url(#arrowhead-main)" />
            `;
        }

        // 5. Nodos de texto y etiquetas: \node[...] at (x,y) {Texto};
        const nodeRegex = /\\node\s*(?:\[([^\]]*)\])?\s*at\s*\(([\d\.\-]+),([\d\.\-]+)\)\s*\{([\s\S]*?)\};/g;
        let nodeMatch;
        while ((nodeMatch = nodeRegex.exec(tikzCode)) !== null) {
            recognized = true;
            const nx = parseFloat(nodeMatch[2]);
            const ny = parseFloat(nodeMatch[3]);
            let label = nodeMatch[4].trim();

            // Limpiar comandos matemáticos para visualización SVG limpia
            label = label
                .replace(/\$([^\$]+)\$/g, '$1')
                .replace(/\\mathbf\{([^}]+)\}/g, '$1')
                .replace(/\\alpha/g, 'α')
                .replace(/\\theta/g, 'θ')
                .replace(/\\rho/g, 'ρ')
                .replace(/\\cos/g, 'cos')
                .replace(/\\sin/g, 'sin');

            svgElements += `
                <text x="${toSvgX(nx) + 8}" y="${toSvgY(ny) - 6}" fill="#E2E8F0" font-family="'Outfit', sans-serif" font-size="13" font-weight="600">${label}</text>
            `;
        }

        return `
            <div class="tikz-diagram-wrapper">
                <div class="tikz-svg-card">
                    <div class="tikz-card-header">
                        <span class="tikz-badge"><i class="fa fa-chart-line"></i> Esquema Geométrico Vectorial</span>
                    </div>
                    <div class="tikz-svg-viewport">
                        <svg viewBox="0 0 ${width} ${height}" class="tikz-svg-canvas" xmlns="http://www.w3.org/2000/svg">
                            ${defs}
                            <!-- Cuadrícula de fondo -->
                            <line x1="${originX}" y1="20" x2="${originX}" y2="${height - 20}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
                            <line x1="20" y1="${originY}" x2="${width - 20}" y2="${originY}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
                            ${svgElements}
                        </svg>
                    </div>
                </div>
                <details class="tikz-source-collapse">
                    <summary><i class="fa fa-code"></i> Ver definición original en TikZ</summary>
                    <pre class="tikz-raw-code"><code>\\begin{tikzpicture}\n${this.escapeHtml(tikzCode)}\n\\end{tikzpicture}</code></pre>
                </details>
            </div>
        `;
    }

    /**
     * Ecuaciones display: \[ ... \] o \begin{equation}
     */
    processDisplayMath(tex) {
        // \[ ... \]
        tex = tex.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
            return `<div class="latex-equation" data-math="${this.escapeHtml(math.trim())}">$$\n${math.trim()}\n$$</div>`;
        });

        // \begin{equation} ... \end{equation}
        tex = tex.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (match, math) => {
            return `<div class="latex-equation" data-math="${this.escapeHtml(math.trim())}">$$\n${math.trim()}\n$$</div>`;
        });

        return tex;
    }

    /**
     * Listas itemize y enumerate
     */
    processLists(tex) {
        tex = tex.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, content) => {
            const items = this.parseListItems(content);
            return `<ul class="latex-list beamer-itemize">\n${items}\n</ul>`;
        });

        tex = tex.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, content) => {
            const items = this.parseListItems(content);
            return `<ol class="latex-list beamer-enumerate">\n${items}\n</ol>`;
        });

        return tex;
    }

    parseListItems(content) {
        const rawItems = content.split(/\\item\s+/);
        rawItems.shift();
        return rawItems.map(item => `<li>${this.formatInline(item.trim())}</li>`).join('\n');
    }

    /**
     * Manejo de imágenes y logos: \smartimage y \smartlogo
     */
    processImages(tex) {
        // \smartimage[ancho]{ruta}
        tex = tex.replace(/\\smartimage(?:\[[^\]]*\])?\{([^}]+)\}/g, (match, path) => {
            const cleanPath = path.trim();
            return `
                <div class="latex-smart-image">
                    <img src="${cleanPath}" alt="${cleanPath}" onerror="this.parentElement.innerHTML='<div class=\\'image-fallback-card\\'><i class=\\'fa fa-image\\'></i> <span>${cleanPath}</span></div>';" />
                </div>
            `;
        });

        // \smartlogo[alto]{ruta}
        tex = tex.replace(/\\smartlogo(?:\[[^\]]*\])?\{([^}]+)\}/g, (match, path) => {
            return `<span class="smart-logo-badge"><i class="fa fa-university"></i> ${path.split('/').pop()}</span>`;
        });

        return tex;
    }

    /**
     * Formateo en línea: negrita, cursiva, matemáticas inline $ ... $, etc.
     */
    formatInline(text) {
        if (!text) return '';

        // Resuelve \texorpdfstring{display}{clean}
        text = text.replace(/\\texorpdfstring\{([^}]+)\}\{([^}]+)\}/g, '$1');

        // Formatos de texto
        text = text.replace(/\\textbf\{([\s\S]*?)\}/g, '<strong>$1</strong>');
        text = text.replace(/\\textit\{([\s\S]*?)\}/g, '<em>$1</em>');
        text = text.replace(/\\texttt\{([\s\S]*?)\}/g, '<code>$1</code>');
        text = text.replace(/\\underline\{([\s\S]*?)\}/g, '<u>$1</u>');

        // Colores en texto: \textcolor{BrandBlue}{texto}
        text = text.replace(/\\textcolor\{([^}]+)\}\{([\s\S]*?)\}/g, (match, colorName, content) => {
            let color = '#3B82F6';
            if (colorName.includes('BrandGreen')) color = '#10B981';
            if (colorName.includes('BrandYellow')) color = '#F59E0B';
            if (colorName.includes('white')) color = '#ffffff';
            if (colorName.includes('black')) color = '#0f172a';
            return `<span style="color: ${color};">${content}</span>`;
        });

        // Matemáticas inline: $ ... $
        text = text.replace(/(^|[^\$])\$([^\$]+?)\$(?!\$)/g, (match, prefix, math) => {
            return `${prefix}<span class="latex-inline-math" data-math="${this.escapeHtml(math.trim())}">$${math.trim()}$</span>`;
        });

        // Escape de caracteres especiales
        text = text.replace(/\\%/g, '%');
        text = text.replace(/\\&/g, '&amp;');
        text = text.replace(/\\_/g, '_');
        text = text.replace(/\\#/g, '#');

        return text;
    }

    /**
     * Limpia comandos como \texorpdfstring para el TOC
     */
    cleanTexorpdfstring(text) {
        if (!text) return '';
        return text
            .replace(/\\texorpdfstring\{[^}]*\}\{([^}]+)\}/g, '$1')
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            .replace(/\\textit\{([^}]+)\}/g, '$1')
            .replace(/\\\\/g, ' ')
            .trim();
    }

    resolveTexorpdfstringDisplay(text) {
        if (!text) return '';
        return text.replace(/\\texorpdfstring\{([^}]+)\}\{[^}]*\}/g, '$1');
    }

    /**
     * Encuentra la llave de cierre correspondiente considerando anidamientos
     */
    findMatchingBrace(str, openIndex) {
        let depth = 0;
        for (let i = openIndex; i < str.length; i++) {
            if (str[i] === '{' && (i === 0 || str[i - 1] !== '\\')) depth++;
            else if (str[i] === '}' && (i === 0 || str[i - 1] !== '\\')) {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    /**
     * Renderiza una vista especial cuando el archivo cargado es template-slide.tex
     */
    renderTemplateDocumentation(rawContent) {
        this.toc = [
            { id: 'sec-intro', number: '1.', text: 'Especificación de la Plantilla', level: 1 },
            { id: 'sec-palette', number: '2.', text: 'Paleta de Colores Institucionales', level: 1 },
            { id: 'sec-docent-blocks', number: '3.', text: 'Bloques Docentes Personalizados', level: 1 },
            { id: 'sec-code-envs', number: '4.', text: 'Entornos de Código Minted / Tcolorbox', level: 1 },
            { id: 'sec-master-slides', number: '5.', text: 'Diapositivas Maestras y Cabeceras', level: 1 }
        ];

        const html = `
            <article class="template-doc-view">
                <header class="template-hero-header">
                    <div class="hero-tag"><i class="fa fa-palette"></i> Plantilla Institucional Beamer</div>
                    <h1 class="hero-title">template-slide.tex</h1>
                    <p class="hero-description">
                        Guía de referencia completa y catálogo interactivo de macros docentes, paleta cromática,
                        entornos de programación y estructura modular para la docencia en Robótica e Inteligencia Artificial.
                    </p>
                </header>

                <section id="sec-intro" class="template-section-card">
                    <h2><span class="sec-badge">1</span> Configuración Institucional</h2>
                    <p>La plantilla establece las constantes del curso y las directivas de compilación:</p>
                    <div class="spec-grid-cards">
                        <div class="spec-item-card">
                            <span class="spec-label">Institución</span>
                            <span class="spec-val">Politécnico Colombiano Jaime Isaza Cadavid</span>
                        </div>
                        <div class="spec-item-card">
                            <span class="spec-label">Facultad</span>
                            <span class="spec-val">Facultad de Ingenierías</span>
                        </div>
                        <div class="spec-item-card">
                            <span class="spec-label">Docente</span>
                            <span class="spec-val">Deimer Miranda Montoya, MSc.(c).</span>
                        </div>
                        <div class="spec-item-card">
                            <span class="spec-label">Aspect Ratio</span>
                            <span class="spec-val">16:9 Panorámico (Beamer)</span>
                        </div>
                    </div>
                </section>

                <section id="sec-palette" class="template-section-card">
                    <h2><span class="sec-badge">2</span> Paleta de Colores Institucionales</h2>
                    <div class="palette-swatches-grid">
                        <div class="color-swatch-card" style="--swatch-color: #1E3C78;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>BrandBlue</strong>
                                <code>#1E3C78</code>
                                <small>Cabeceras de diapositiva e IdeaTitle</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #14C486;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>BrandGreen</strong>
                                <code>#14C486</code>
                                <small>Líneas de acento y PracticeTitle</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #FFB93E;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>BrandYellow</strong>
                                <code>#FFB93E</code>
                                <small>Puntos geométricos y QuestionTitle</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #5A46A0;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>DefTitle</strong>
                                <code>#5A46A0</code>
                                <small>Bloques de definición teórica</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #A01E1E;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>WarnTitle</strong>
                                <code>#A01E1E</code>
                                <small>Alertas de atención y advertencias</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #1C5C91;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>CompareTitle</strong>
                                <code>#1C5C91</code>
                                <small>Comparaciones y contrastes</small>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="sec-docent-blocks" class="template-section-card">
                    <h2><span class="sec-badge">3</span> Bloques Docentes Enriquecidos</h2>
                    <p>Entornos pedagógicos definidos con <code>\\NewDocumentCommand</code>:</p>
                    <div class="docent-samples-container">
                        <div class="docent-block block-idea">
                            <div class="block-title-row"><span class="block-icon">💡</span><span class="block-title-text">\\Idea{Concepto fundamental}</span></div>
                            <div class="block-content-body">La rotación en el plano permite describir cambios de orientación entre el sistema local del robot y el sistema global.</div>
                        </div>
                        <div class="docent-block block-def">
                            <div class="block-title-row"><span class="block-icon">📖</span><span class="block-title-text">\\DefBlock[Matriz Ortogonal]{Definición}</span></div>
                            <div class="block-content-body">Una matriz $R$ es ortogonal si satisface $R^{-1} = R^T$ y $\det(R) = +1$, preservando distancias y ángulos.</div>
                        </div>
                        <div class="docent-block block-practice">
                            <div class="block-title-row"><span class="block-icon">💻</span><span class="block-title-text">\\Practice{Ejercicio en Python}</span></div>
                            <div class="block-content-body">Implementa en NumPy la función <code>rotacion_2d(theta)</code> y valida la propiedad de ortogonalidad con <code>np.linalg.det</code>.</div>
                        </div>
                        <div class="docent-block block-warning">
                            <div class="block-title-row"><span class="block-icon">⚠️</span><span class="block-title-text">\\Warning{Convención angular}</span></div>
                            <div class="block-content-body">Recuerda que $\\theta > 0$ representa giro antihorario y $\\theta < 0$ giro horario.</div>
                        </div>
                    </div>
                </section>

                <section id="sec-code-envs" class="template-section-card">
                    <h2><span class="sec-badge">4</span> Entornos de Código (Minted / Tcolorbox)</h2>
                    <div class="code-samples-preview">
                        ${this.renderCodeBlockCard(
                            "import numpy as np\n\ndef matriz_rotacion_2d(theta_rad):\n    c, s = np.cos(theta_rad), np.sin(theta_rad)\n    return np.array([[c, -s], [s, c]])\n\nR_90 = matriz_rotacion_2d(np.pi / 2)\nprint('R(90°):\\n', np.round(R_90, 4))",
                            "Python (Monokai Dark)",
                            "dark"
                        )}
                    </div>
                </section>
            </article>
        `;

        return {
            meta: this.meta,
            html: html,
            toc: this.toc,
            raw: rawContent,
            isBeamer: true,
            slideCount: 5
        };
    }

    slugify(str) {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Exportar globalmente
window.LatexParser = LatexParser;
