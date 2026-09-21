/**
 * RoboDocs - Motor Integral de Renderizado LaTeX & Beamer
 * Soporta documentos académicos, presentaciones Beamer (16:9),
 * macros docentes personalizadas (\Idea, \Practice, \DefBlock, etc.),
 * entornos de código interactivo Python/NumPy y diagramas geométricos 2D TikZ a SVG.
 */

class LatexParser {
    constructor() {
        this.toc = [];
        this.sectionCount = 0;
        this.slideCount = 0;
        this.totalExpectedSlides = 131;
        this.meta = {};
        this.codeCounter = 0;
    }

    /**
     * Parsea contenido LaTeX completo a HTML estructurado
     * @param {string} texContent - Código fuente .tex
     * @returns {Object} { meta, html, toc, raw, isBeamer, slideCount }
     */
    parse(texContent) {
        this.toc = [];
        this.sectionCount = 0;
        this.slideCount = 0;
        this.codeCounter = 0;

        // 1. Extraer Metadatos y Variables Institucionales
        this.meta = this.extractVariables(texContent);

        // 2. Comprobar si es Beamer o documento estándar
        const hasDocumentEnv = texContent.includes('\\begin{document}');
        const isBeamer = texContent.includes('{beamer}') || texContent.includes('\\begin{frame}') || texContent.includes('\\TitleSlide');

        if (!hasDocumentEnv && texContent.includes('\\newcommand{\\CourseName}')) {
            // Es la plantilla institucional template-slide.tex
            return this.renderTemplateDocumentation(texContent);
        }

        // Estimar total de diapositivas en primera pasada
        const titleSlideCount = (texContent.match(/\\TitleSlide/g) || []).length;
        const normasSlideCount = (texContent.match(/\\NormasSlide/g) || []).length;
        const sectionSlideCount = (texContent.match(/\\SectionSlide/g) || []).length;
        const frameCount = (texContent.match(/\\begin\{frame\}/g) || []).length;
        this.totalExpectedSlides = titleSlideCount + normasSlideCount + sectionSlideCount + frameCount;
        if (this.totalExpectedSlides === 0) this.totalExpectedSlides = 131;

        // 3. Extraer cuerpo de documento si existe
        let body = texContent;
        if (hasDocumentEnv) {
            const docStart = texContent.indexOf('\\begin{document}');
            const docEnd = texContent.lastIndexOf('\\end{document}');
            body = texContent.substring(docStart + 16, docEnd !== -1 ? docEnd : texContent.length);
        }

        // Eliminar comentarios de LaTeX
        body = body.replace(/(^|[^\\])%.*$/gm, '$1');

        // Ignorar comandos de input locales
        body = body.replace(/\\input\{[^}]+\}/g, '');

        // Convertir entornos \begin{center} y \end{center}
        body = body.replace(/\\begin\{center\}/g, '<div class="latex-center">');
        body = body.replace(/\\end\{center\}/g, '</div>');

        // 4. Pre-procesar entornos de código (tcolorbox / minted / pythoncode)
        const codeBlocks = [];
        body = this.protectCodeBlocks(body, codeBlocks);

        // 5. Pre-procesar diagramas TikZ para convertirlos a SVG
        const tikzBlocks = [];
        body = this.protectTikzBlocks(body, tikzBlocks);

        // 6. Procesar diapositivas maestras del template (\TitleSlide, \NormasSlide, \SectionSlide)
        body = this.processMasterSlides(body);

        // 7. Si es Beamer, procesar los frames individuales
        if (isBeamer) {
            body = this.processBeamerFrames(body);
        } else {
            body = this.processSections(body);
        }

        // 8. Procesar columnas de Beamer (\begin{columns} y \begin{column})
        body = this.processColumns(body);

        // 9. Procesar bloques docentes (\Idea, \Practice, \DefBlock, \Warning, etc.)
        body = this.processDocentBlocks(body);

        // 10. Procesar ecuaciones matemáticas (display math \[ ... \], equation)
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
        // 1. \TitleSlide -> Portada Institucional idéntica al PDF (Página 1)
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
                    <div class="cover-green-bar top"></div>
                    <div class="cover-center-content">
                        <h1 class="cover-course-title">${this.meta.courseName}</h1>
                        <div class="cover-course-code">${this.meta.courseCode}</div>
                        <div class="cover-institution-block">
                            <p class="cover-faculty-text">${this.meta.faculty}</p>
                            <p class="cover-institution-text">${this.meta.institution}</p>
                        </div>
                        <div class="cover-instructor-block">
                            <p class="cover-instructor-name">${this.meta.instructor}</p>
                            <p class="cover-email-text"><a href="mailto:${this.meta.email}">${this.meta.email}</a></p>
                        </div>
                    </div>
                    <div class="cover-green-bar bottom"></div>
                    ${this.renderSlideFootline(this.slideCount)}
                </section>
            `;
        });

        // 2. \NormasSlide -> Normas del curso con las imágenes PNG oficiales (Página 2)
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
                        <h3 class="frame-title-text">Normas del curso</h3>
                    </header>
                    <div class="frame-body normas-body">
                        <div class="normas-row top-row">
                            <div class="norma-card">
                                <img src="Template/Puntual.png" class="norma-card-img" alt="Puntualidad" />
                                <p class="norma-text"><strong>Cumple con los horarios y demuestra compromiso académico en cada sesión.</strong></p>
                            </div>
                            <div class="norma-card">
                                <img src="Template/Actitud.png" class="norma-card-img" alt="Actitud Profesional" />
                                <p class="norma-text"><strong>Mantén una actitud profesional, ética y orientada al aprendizaje continuo.</strong></p>
                            </div>
                            <div class="norma-card">
                                <img src="Template/Comunicacion.png" class="norma-card-img" alt="Comunicación Asertiva" />
                                <p class="norma-text"><strong>Comunica tus ideas con claridad, respeto y fundamento técnico.</strong></p>
                            </div>
                        </div>
                        <div class="normas-row bottom-row">
                            <div class="norma-card">
                                <img src="Template/Participacion.png" class="norma-card-img" alt="Participación Activa" />
                                <p class="norma-text"><strong>Participa activamente y contribuye al trabajo colaborativo.</strong></p>
                            </div>
                            <div class="norma-card">
                                <img src="Template/Cuidado.png" class="norma-card-img" alt="Uso Responsable" />
                                <p class="norma-text"><strong>Haz uso responsable de los recursos, equipos e instalaciones.</strong></p>
                            </div>
                        </div>
                    </div>
                    ${this.renderSlideFootline(this.slideCount)}
                </section>
            `;
        });

        // 3. \SectionSlide{Título}{Subtítulo} -> Banner de Unidad Temática (Páginas 3, 6, 14, etc.)
        tex = tex.replace(/\\SectionSlide\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/g, (match, title, subtitle) => {
            this.slideCount++;
            const rawTitle = title.trim();
            const rawSub = subtitle.trim();
            const cleanTitle = this.cleanTexorpdfstring(rawTitle);
            const displayTitle = this.formatInline(this.resolveTexorpdfstringDisplay(rawTitle));
            const displaySub = this.formatInline(this.resolveTexorpdfstringDisplay(rawSub));
            const slideId = `slide-${this.slideCount}`;

            this.toc.push({
                id: slideId,
                number: `${this.slideCount}.`,
                text: cleanTitle,
                level: 1
            });

            return `
                <section class="beamer-slide slide-section-banner" id="${slideId}" data-slide="${this.slideCount}">
                    <div class="section-banner-center">
                        <div class="section-banner-card">
                            <h2 class="section-banner-title">${displayTitle}</h2>
                            ${displaySub ? `<p class="section-banner-sub">${displaySub}</p>` : ''}
                        </div>
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

    /**
     * Renderiza el pie de página exacto del Beamer con logo institucional
     */
    renderSlideFootline(num) {
        const total = this.totalExpectedSlides || 131;
        const logoSrc = 'Template/LogoPoli.png';
        return `
            <footer class="frame-footline">
                <div class="footline-left">
                    <span class="footline-nav-btn prev-btn" title="Anterior diapositiva" onclick="event.stopPropagation(); window.roboDocs && window.roboDocs.prevSlide()">◁</span>
                    <span class="footline-pagenum">${num}/${total}</span>
                    <span class="footline-nav-btn next-btn" title="Siguiente diapositiva" onclick="event.stopPropagation(); window.roboDocs && window.roboDocs.nextSlide()">▷</span>
                </div>
                <div class="footline-right">
                    <span class="footline-instructor">${this.meta.instructor}</span>
                    <img src="${logoSrc}" class="footline-logo-img" alt="Politécnico Colombiano Jaime Isaza Cadavid" />
                </div>
            </footer>
        `;
    }

    /**
     * Procesa columnas Beamer (\begin{columns} ... \end{columns})
     */
    processColumns(tex) {
        tex = tex.replace(/\\begin\{column\}\{([^}]+)\}([\s\S]*?)\\end\{column\}/g, (match, widthExpr, colContent) => {
            let flexBasis = '50%';
            const m = widthExpr.match(/([\d\.]+)\\textwidth/);
            if (m) {
                const percent = Math.round(parseFloat(m[1]) * 100);
                flexBasis = `${percent}%`;
            }
            return `<div class="beamer-column" style="flex: 1 1 ${flexBasis}; max-width: ${flexBasis};">\n${colContent.trim()}\n</div>`;
        });

        tex = tex.replace(/\\begin\{columns\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{columns\}/g, (match, columnsContent) => {
            return `<div class="beamer-columns-container">\n${columnsContent.trim()}\n</div>`;
        });

        return tex;
    }

    /**
     * Procesa los bloques pedagógicos Beamer con colores e iconos exactos al PDF
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
            { cmd: 'ExampleBlock', defaultTitle: 'Ejemplo', icon: '🧩', cssClass: 'block-example' },
            { cmd: 'Def', defaultTitle: 'Definición', icon: '📖', cssClass: 'block-def' },
            { cmd: 'Example', defaultTitle: 'Ejemplo', icon: '🧩', cssClass: 'block-example' }
        ];

        for (const b of blocksConfig) {
            let searchIndex = 0;
            const searchToken = `\\${b.cmd}`;

            while (true) {
                const pos = tex.indexOf(searchToken, searchIndex);
                if (pos === -1) break;

                const nextChar = tex[pos + searchToken.length];
                if (nextChar && /[a-zA-Z]/.test(nextChar)) {
                    searchIndex = pos + searchToken.length;
                    continue;
                }

                let cur = pos + searchToken.length;
                while (cur < tex.length && /\s/.test(tex[cur])) cur++;

                let customTitle = b.defaultTitle;
                if (tex[cur] === '[') {
                    const closeBracket = tex.indexOf(']', cur);
                    if (closeBracket !== -1) {
                        customTitle = tex.substring(cur + 1, closeBracket).trim();
                        cur = closeBracket + 1;
                        while (cur < tex.length && /\s/.test(tex[cur])) cur++;
                    }
                }

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

        return tex;
    }

    /**
     * Pre-procesa entornos de código (tcolorbox / minted / pythoncode)
     */
    protectCodeBlocks(tex, storage) {
        const codeEnvs = [
            { env: 'pythoncodedark', lang: 'Python 3 (NumPy)', theme: 'dark' },
            { env: 'pythoncode', lang: 'Python 3 (NumPy)', theme: 'light' },
            { env: 'minted', lang: 'Python', theme: 'dark' },
            { env: 'verbatim', lang: 'Terminal / Texto', theme: 'dark' }
        ];

        for (const env of codeEnvs) {
            const regex = new RegExp(`\\\\begin\\{${env.env}\\}(?:\\[[^\\]]*\\])?([\\s\\S]*?)\\\\end\\{${env.env}\\}`, 'g');
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

    /**
     * Renderiza tarjeta de código interactiva con botón de ejecución y consola
     */
    renderCodeBlockCard(code, lang, theme) {
        this.codeCounter++;
        const codeId = `code-block-${this.codeCounter}`;
        const lines = code.split('\n');
        const numberedLines = lines.map((line, idx) => {
            const safe = this.escapeHtml(line);
            return `<div class="code-line"><span class="line-num">${idx + 1}</span><span class="line-code">${safe || '&nbsp;'}</span></div>`;
        }).join('');

        return `
            <div class="code-block-card interactive-code theme-${theme}" id="${codeId}">
                <div class="code-card-header">
                    <div class="code-lang-indicator">
                        <span class="code-dot red"></span>
                        <span class="code-dot yellow"></span>
                        <span class="code-dot green"></span>
                        <span class="code-lang-name"><i class="fa fa-terminal"></i> ${lang}</span>
                    </div>
                    <div class="code-card-actions">
                        <button type="button" class="btn-code-action btn-code-run" onclick="window.pythonCodeRunner && window.pythonCodeRunner.run('${codeId}')" title="Ejecutar script y ver resultado en terminal">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            <span>▶ Ejecutar</span>
                        </button>
                        <button type="button" class="btn-code-action btn-code-edit" onclick="window.pythonCodeRunner && window.pythonCodeRunner.toggleEdit('${codeId}')" title="Editar parámetros y código">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            <span>Editar</span>
                        </button>
                        <button type="button" class="btn-code-action btn-code-copy" onclick="window.roboDocs && window.roboDocs.copySnippet(this)" title="Copiar código al portapapeles">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            <span>Copiar</span>
                        </button>
                    </div>
                </div>
                <div class="code-viewport" data-raw="${this.escapeHtml(code)}">
                    ${numberedLines}
                </div>
                <textarea class="code-editor-area" style="display: none;" spellcheck="false">${this.escapeHtml(code)}</textarea>
                <div class="code-terminal-console" id="console-${codeId}" style="display: none;">
                    <div class="terminal-bar">
                        <span class="terminal-title"><i class="fa fa-terminal"></i> Terminal Python 3.12 (NumPy)</span>
                        <button type="button" class="btn-terminal-clear" onclick="window.pythonCodeRunner && window.pythonCodeRunner.clearConsole('${codeId}')">✖ Cerrar</button>
                    </div>
                    <pre class="terminal-output" id="output-${codeId}"></pre>
                    <div class="terminal-canvas-container" id="canvas-container-${codeId}" style="display: none;">
                        <div class="canvas-caption">Visualización Gráfica 2D (Matplotlib Quiver)</div>
                        <canvas id="canvas-${codeId}" width="400" height="300"></canvas>
                    </div>
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
            const diagramId = storage.length + 1;
            const placeholder = `___TIKZ_BLOCK_${storage.length}___`;
            const svgHtml = this.renderTikZToSVG(tikzContent.trim(), diagramId);
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
     * Motor de interpretación 2D TikZ a Gráficos Vectoriales SVG con Zoom y Pantalla Completa
     */
    renderTikZToSVG(tikzCode, diagramId = 1) {
        let code = tikzCode.replace(/%.*$/gm, "").replace(/\r?\n/g, " ");

        const width = 460;
        const height = 340;
        const originX = 70;
        const originY = 270;
        const scale = 48;

        const toX = (x) => Math.round(originX + x * scale);
        const toY = (y) => Math.round(originY - y * scale);

        const coordinates = {};
        const resolveCoord = (t) => {
            if (!t) return null;
            t = t.trim();
            const key = t.replace(/[()]/g, "").trim();
            if (coordinates[key]) return coordinates[key];
            const m = t.match(/\(([\d\.\-]+)\s*,\s*([\d\.\-]+)\)/);
            if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
            return null;
        };

        const cleanMathText = (str) => {
            if (!str) return "";
            return str
                .replace(/\$([^\$]+)\$/g, "$1")
                .replace(/\\mathbf\{([^}]+)\}/g, "$1")
                .replace(/\\textbf\{([^}]+)\}/g, "$1")
                .replace(/\\alpha/g, "α")
                .replace(/\\theta/g, "θ")
                .replace(/\\rho/g, "ρ")
                .replace(/\\cos/g, "cos ")
                .replace(/\\sin/g, "sin ")
                .replace(/\\circ/g, "°")
                .trim();
        };

        // Extraer scope si existe (diagrama 7 robot local)
        const scopeMatch = code.match(/\\begin\{scope\}\[([^\]]+)\]([\s\S]*?)\\end\{scope\}/);
        let scopeShift = null;
        let scopeRotate = 0;
        let scopeBody = "";
        if (scopeMatch) {
            const opts = scopeMatch[1];
            scopeBody = scopeMatch[2];
            const sm = opts.match(/shift=\{?\(([^)]+)\)\}?/);
            if (sm) scopeShift = resolveCoord(sm[1]);
            const rm = opts.match(/rotate=([\d\.\-]+)/);
            if (rm) scopeRotate = parseFloat(rm[1]);
            code = code.replace(scopeMatch[0], "");
        }

        const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
        const svgElements = [];

        // 1. Extraer coordenadas
        for (const stmt of statements) {
            const m = stmt.match(/\\coordinate\s*\(([a-zA-Z0-9_]+)\)\s*at\s*\(([\d\.\-]+)\s*,\s*([\d\.\-]+)\)/);
            if (m) coordinates[m[1]] = { x: parseFloat(m[2]), y: parseFloat(m[3]) };

            const nodeCoord = stmt.match(/\\node\s*(?:\[[^\]]*\])?\s*\(([a-zA-Z0-9_]+)\)\s*at\s*\(([\d\.\-]+)\s*,\s*([\d\.\-]+)\)/);
            if (nodeCoord) coordinates[nodeCoord[1]] = { x: parseFloat(nodeCoord[2]), y: parseFloat(nodeCoord[3]) };
        }

        // 2. Procesar sentencias
        for (const stmt of statements) {
            if (stmt.startsWith("\\coordinate")) continue;

            // \filldraw para puntos
            if (stmt.startsWith("\\filldraw") || stmt.startsWith("\\fill")) {
                const ptMatch = stmt.match(/(?:\\filldraw|\\fill)\s*(?:\[([^\]]*)\])?\s*([^\s;]+)\s*circle\s*\(([^)]+)\)/);
                if (ptMatch) {
                    const pt = resolveCoord(ptMatch[2]);
                    if (pt) {
                        svgElements.push(
                            `<circle cx="${toX(pt.x)}" cy="${toY(pt.y)}" r="4.5" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" />`
                        );
                    }
                }
            }

            // \draw para líneas, vectores y arcos
            if (stmt.startsWith("\\draw")) {
                const optMatch = stmt.match(/\\draw\s*\[(.*?)\]/);
                const optStr = optMatch ? optMatch[1] : "";
                const isDashed = optStr.includes("dashed");
                const hasArrow = optStr.includes("->") || optStr.includes("Latex") || optStr.includes("-{");

                let strokeColor = "#334155";
                let markerAttr = "";
                let strokeW = 1.8;

                if (optStr.includes("BrandBlue") || optStr.includes("blue")) {
                    strokeColor = "#1e3c78";
                    if (hasArrow) markerAttr = `marker-end="url(#arr-blue-${diagramId})"`;
                    strokeW = 2.4;
                } else if (optStr.includes("BrandGreen") || optStr.includes("green")) {
                    strokeColor = "#14c486";
                    if (hasArrow) markerAttr = `marker-end="url(#arr-green-${diagramId})"`;
                    strokeW = 2.4;
                } else if (optStr.includes("BrandYellow") || optStr.includes("orange")) {
                    strokeColor = "#f59e0b";
                    if (hasArrow) markerAttr = `marker-end="url(#arr-yellow-${diagramId})"`;
                    strokeW = 2.0;
                } else if (hasArrow) {
                    strokeColor = "#0f172a";
                    markerAttr = `marker-end="url(#arr-axis-${diagramId})"`;
                    strokeW = 2.0;
                }

                if (isDashed) {
                    strokeColor = "#94a3b8";
                    strokeW = 1.4;
                }

                // Arco angular \draw[->] (p1) arc (start:end:radius)
                const arcMatch = stmt.match(/arc\s*\(([\d\.\-]+):([\d\.\-]+):([\d\.\-]+)\)/);
                if (arcMatch) {
                    const startAngle = parseFloat(arcMatch[1]);
                    const endAngle = parseFloat(arcMatch[2]);
                    const rUnits = parseFloat(arcMatch[3]);
                    const rPx = rUnits * scale;

                    const pMatch = stmt.match(/\\draw[^)]*\(([^\)]+)\)\s*arc/);
                    let center = { x: 0, y: 0 };
                    if (pMatch) {
                        const parsed = resolveCoord(pMatch[1]);
                        if (parsed) center = parsed;
                    }

                    const cx = toX(center.x);
                    const cy = toY(center.y);
                    const a1 = (startAngle * Math.PI) / 180;
                    const a2 = (endAngle * Math.PI) / 180;
                    const x1 = Math.round(cx + rPx * Math.cos(a1));
                    const y1 = Math.round(cy - rPx * Math.sin(a1));
                    const x2 = Math.round(cx + rPx * Math.cos(a2));
                    const y2 = Math.round(cy - rPx * Math.sin(a2));
                    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
                    const sweep = endAngle > startAngle ? 0 : 1;

                    svgElements.push(
                        `<path d="M ${x1} ${y1} A ${rPx} ${rPx} 0 ${largeArc} ${sweep} ${x2} ${y2}" fill="none" stroke="#f59e0b" stroke-width="1.8" marker-end="url(#arr-yellow-${diagramId})" />`
                    );
                }

                // Segmentos de línea con --
                const cleanForPoints = stmt.replace(/\[.*?\]/g, "");
                const ptTokens = cleanForPoints.split("--").map((p) => p.trim());
                if (ptTokens.length >= 2) {
                    for (let i = 0; i < ptTokens.length - 1; i++) {
                        const pStart = resolveCoord(ptTokens[i]);
                        const pEnd = resolveCoord(ptTokens[i + 1]);

                        if (pStart && pEnd) {
                            const dashAttr = isDashed ? 'stroke-dasharray="4,4"' : "";
                            svgElements.push(
                                `<line x1="${toX(pStart.x)}" y1="${toY(pStart.y)}" x2="${toX(pEnd.x)}" y2="${toY(pEnd.y)}" stroke="${strokeColor}" stroke-width="${strokeW}" ${dashAttr} ${markerAttr} stroke-linecap="round" />`
                            );
                        }
                    }
                }
            }

            // \node para etiquetas
            const nodeRegex = /\\node\s*(?:\[([^\]]*)\])?\s*(?:\([^)]*\))?\s*(?:at\s*\(([^)]+)\))?\s*\{([^}]*)\}/g;
            let nm;
            while ((nm = nodeRegex.exec(stmt)) !== null) {
                const nodeOpts = nm[1] || "";
                const atStr = nm[2];
                const rawText = nm[3];
                if (!rawText.trim()) continue;

                let pos = atStr ? resolveCoord(atStr) : null;
                if (!pos) {
                    const fallbackPt = stmt.match(/--\s*\(?([^)\s]+)\)?\s*node/);
                    if (fallbackPt) pos = resolveCoord(fallbackPt[1]);
                }

                if (pos) {
                    let dx = 0;
                    let dy = 0;
                    let textAnchor = "middle";

                    if (nodeOpts.includes("right")) { dx = 10; textAnchor = "start"; }
                    if (nodeOpts.includes("left")) { dx = -10; textAnchor = "end"; }
                    if (nodeOpts.includes("above")) { dy = -10; }
                    if (nodeOpts.includes("below")) { dy = 16; }

                    const txt = cleanMathText(rawText);
                    const color = nodeOpts.includes("blue") ? "#1e3c78" : (nodeOpts.includes("green") ? "#14c486" : "#0f172a");

                    svgElements.push(
                        `<text x="${toX(pos.x) + dx}" y="${toY(pos.y) + dy}" fill="${color}" font-family="Outfit, sans-serif" font-weight="700" font-size="13px" text-anchor="${textAnchor}">${this.escapeHtml(txt)}</text>`
                    );
                }
            }
        }

        // Procesar contenido dentro del scope si existe (robot local rotado)
        if (scopeShift) {
            const scopeElements = [];
            const scopeStmts = scopeBody.split(";").map((s) => s.trim()).filter(Boolean);

            for (const s of scopeStmts) {
                if (s.startsWith("\\draw")) {
                    const hasArrow = s.includes("->") || s.includes("Latex");
                    const optMatch = s.match(/\\draw\s*\[(.*?)\]/);
                    const optStr = optMatch ? optMatch[1] : "";
                    const isGreen = optStr.includes("BrandGreen") || optStr.includes("green");

                    const cleanS = s.replace(/\[.*?\]/g, "");
                    const pts = cleanS.split("--").map((p) => p.trim());
                    if (pts.length >= 2) {
                        const p1 = resolveCoord(pts[0]);
                        const p2 = resolveCoord(pts[1]);
                        if (p1 && p2) {
                            const col = isGreen ? "#14c486" : "#0f172a";
                            const mAttr = hasArrow ? `marker-end="url(#arr-green-${diagramId})"` : "";
                            scopeElements.push(
                                `<line x1="${p1.x * scale}" y1="${-p1.y * scale}" x2="${p2.x * scale}" y2="${-p2.y * scale}" stroke="${col}" stroke-width="2.2" ${mAttr} stroke-linecap="round" />`
                            );
                        }
                    }

                    // Etiquetas dentro del scope
                    const nmScope = s.match(/node\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/);
                    if (nmScope) {
                        const opts = nmScope[1] || "";
                        const raw = nmScope[2];
                        let dx = 8;
                        let dy = 0;
                        if (opts.includes("above")) dy = -8;
                        if (opts.includes("right")) dx = 10;
                        const txt = cleanMathText(raw);
                        scopeElements.push(
                            `<text x="${dx}" y="${dy}" fill="#14c486" font-family="Outfit, sans-serif" font-weight="700" font-size="13px">${this.escapeHtml(txt)}</text>`
                        );
                    }
                }
            }

            // Rectángulo del chasis del robot
            scopeElements.unshift(
                `<rect x="-18" y="-14" width="36" height="28" rx="4" fill="rgba(30, 60, 120, 0.15)" stroke="#1e3c78" stroke-width="2" />`
            );

            const scopeSvg = `<g transform="translate(${toX(scopeShift.x)}, ${toY(scopeShift.y)}) rotate(${-scopeRotate})">${scopeElements.join("\n")}</g>`;
            svgElements.push(scopeSvg);
        }

        // Definiciones de marcadores de flecha SVG
        const defs = `
            <defs>
                <marker id="arr-axis-${diagramId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0f172a" />
                </marker>
                <marker id="arr-blue-${diagramId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1e3c78" />
                </marker>
                <marker id="arr-green-${diagramId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#14c486" />
                </marker>
                <marker id="arr-yellow-${diagramId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />
                </marker>
            </defs>
        `;

        const svgItems = svgElements.join("\n");
        const wrapperId = `tikz-diagram-${diagramId}`;
        return `
            <div class="tikz-diagram-wrapper" id="${wrapperId}">
                <div class="tikz-svg-card">
                    <div class="tikz-card-header">
                        <span class="tikz-badge"><i class="fa fa-chart-line"></i> Esquema Geométrico Vectorial</span>
                        <div class="tikz-zoom-controls">
                            <button type="button" class="btn-tikz-zoom" onclick="window.roboDocs && window.roboDocs.zoomDiagram('${wrapperId}', -0.2)" title="Reducir zoom (−)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
                            </button>
                            <span class="tikz-zoom-level" id="zoom-val-${wrapperId}">100%</span>
                            <button type="button" class="btn-tikz-zoom" onclick="window.roboDocs && window.roboDocs.zoomDiagram('${wrapperId}', 0.2)" title="Aumentar zoom (+)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
                            </button>
                            <button type="button" class="btn-tikz-zoom reset" onclick="window.roboDocs && window.roboDocs.resetDiagramZoom('${wrapperId}')" title="Restablecer tamaño (100%)">↺</button>
                            <button type="button" class="btn-tikz-zoom fullscreen" onclick="window.roboDocs && window.roboDocs.openDiagramModal('${wrapperId}')" title="Ver en pantalla completa">⛶</button>
                        </div>
                    </div>
                    <div class="tikz-svg-viewport">
                        <div class="tikz-zoomable-content" id="zoom-content-${wrapperId}">
                            <svg viewBox="0 0 ${width} ${height}" class="tikz-svg-canvas" xmlns="http://www.w3.org/2000/svg">
                                ${defs}
                                <!-- Cuadrícula sutil de fondo -->
                                <line x1="${originX}" y1="20" x2="${originX}" y2="${height - 20}" stroke="rgba(148,163,184,0.18)" stroke-width="1" />
                                <line x1="20" y1="${originY}" x2="${width - 20}" y2="${originY}" stroke="rgba(148,163,184,0.18)" stroke-width="1" />
                                ${svgItems}
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Ecuaciones display: \[ ... \] o \begin{equation}
     */
    processDisplayMath(tex) {
        tex = tex.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
            return `<div class="latex-equation" data-math="${this.escapeHtml(math.trim())}">$$\n${math.trim()}\n$$</div>`;
        });

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
        tex = tex.replace(/\\smartimage(?:\[[^\]]*\])?\{([^}]+)\}/g, (match, path) => {
            const cleanPath = path.trim();
            return `
                <div class="latex-smart-image">
                    <img src="${cleanPath}" alt="${cleanPath}" onerror="this.parentElement.innerHTML='<div class=\\'image-fallback-card\\'><i class=\\'fa fa-image\\'></i> <span>${cleanPath}</span></div>';" />
                </div>
            `;
        });

        tex = tex.replace(/\\smartlogo(?:\[[^\]]*\])?\{([^}]+)\}/g, (match, path) => {
            return `<img src="${path.trim()}" class="smart-logo-img" alt="Logo Institucional" />`;
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
        text = text.replace(/\\textcolor\{BrandBlue\}\{([\s\S]*?)\}/g, '<span style="color: var(--brand-blue); font-weight: 600;">$1</span>');
        text = text.replace(/\\textcolor\{BrandGreen\}\{([\s\S]*?)\}/g, '<span style="color: var(--brand-green); font-weight: 600;">$1</span>');
        text = text.replace(/\\textcolor\{BrandYellow\}\{([\s\S]*?)\}/g, '<span style="color: var(--brand-yellow); font-weight: 600;">$1</span>');
        text = text.replace(/\\textcolor\{black\}\{([\s\S]*?)\}/g, '<span>$1</span>');

        // Símbolos matemáticos inline comunes que puedan estar fuera de $...$
        text = text.replace(/\\theta/g, '$\\theta$');
        text = text.replace(/\\alpha/g, '$\\alpha$');
        text = text.replace(/\\rho/g, '$\\rho$');
        text = text.replace(/\\circ/g, '$^\\circ$');

        // Limpieza de espaciados pequeños
        text = text.replace(/\\\\/g, '<br>');

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
            .replace(/\\theta/g, 'θ')
            .replace(/\\alpha/g, 'α')
            .replace(/\\rho/g, 'ρ')
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            .replace(/\\textit\{([^}]+)\}/g, '$1')
            .replace(/\\\\/g, ' ')
            .trim();
    }

    resolveTexorpdfstringDisplay(text) {
        if (!text) return '';
        return text.replace(/\\texorpdfstring\{([^}]+)\}\{[^}]*\}/g, '$1');
    }

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
            { id: 'sec-code-envs', number: '4.', text: 'Entornos de Código Minted / Tcolorbox', level: 1 }
        ];

        const html = `
            <article class="template-doc-view">
                <header class="template-hero-header">
                    <img src="Template/LogoPoli.png" class="template-hero-logo" alt="Politécnico Colombiano Jaime Isaza Cadavid" />
                    <div class="hero-tag"><i class="fa fa-palette"></i> Plantilla Institucional Beamer</div>
                    <h1 class="hero-title">template-slide.tex</h1>
                    <p class="hero-description">
                        Guía de referencia completa y catálogo interactivo de macros docentes, paleta cromática,
                        entornos de programación y estructura modular para la docencia en Robótica del Servicio e Inteligencia Artificial.
                    </p>
                </header>

                <section id="sec-intro" class="template-section-card">
                    <h2><span class="sec-badge">1</span> Configuración Institucional</h2>
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
                                <small>Cabeceras de diapositiva y bloques IdeaTitle</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #14C486;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>BrandGreen</strong>
                                <code>#14C486</code>
                                <small>Líneas de acento de portada y PracticeTitle</small>
                            </div>
                        </div>
                        <div class="color-swatch-card" style="--swatch-color: #007800;">
                            <div class="swatch-preview"></div>
                            <div class="swatch-info">
                                <strong>ResultTitle</strong>
                                <code>#007800</code>
                                <small>Bloques de resultados y comprobaciones</small>
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
                    </div>
                </section>

                <section id="sec-docent-blocks" class="template-section-card">
                    <h2><span class="sec-badge">3</span> Bloques Docentes Enriquecidos</h2>
                    <div class="docent-samples-container">
                        <div class="docent-block block-idea">
                            <div class="block-title-row"><span class="block-icon">💡</span><span class="block-title-text">\\Idea{Concepto fundamental}</span></div>
                            <div class="block-content-body">La rotación en el plano permite describir cambios de orientación entre el sistema local del robot y el sistema global.</div>
                        </div>
                        <div class="docent-block block-result">
                            <div class="block-title-row"><span class="block-icon">✅</span><span class="block-title-text">\\Result{Ortogonalidad}</span></div>
                            <div class="block-content-body">Las matrices de rotación son matrices ortogonales que satisfacen $R^{-1} = R^T$.</div>
                        </div>
                    </div>
                </section>

                <section id="sec-code-envs" class="template-section-card">
                    <h2><span class="sec-badge">4</span> Entornos de Código (Minted / Tcolorbox)</h2>
                    <div class="code-samples-preview">
                        ${this.renderCodeBlockCard(
                            "import numpy as np\n\ndef matriz_rotacion_2d(theta_rad):\n    c, s = np.cos(theta_rad), np.sin(theta_rad)\n    return np.array([[c, -s], [s, c]])\n\nR_90 = matriz_rotacion_2d(np.pi / 2)\nprint('R(90°):\\n', np.round(R_90, 4))",
                            "Python 3 (NumPy)",
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
            slideCount: 4
        };
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

// Exportar globalmente en navegador y entornos Node.js
if (typeof window !== 'undefined') {
    window.LatexParser = LatexParser;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LatexParser;
}
