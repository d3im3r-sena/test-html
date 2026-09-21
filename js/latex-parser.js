/**
 * LaTeX Parser & Renderer for Industrial Robotics Documentation
 * Converts .tex documents into structured HTML with TOC, equations, tables and metadata
 */

class LatexParser {
    constructor() {
        this.toc = [];
        this.sectionCount = 0;
        this.subsectionCount = 0;
        this.subsubsectionCount = 0;
    }

    /**
     * Parses a complete LaTeX document string into structured HTML and metadata
     * @param {string} texContent - Raw .tex file content
     * @returns {Object} { meta, html, toc, raw }
     */
    parse(texContent) {
        this.toc = [];
        this.sectionCount = 0;
        this.subsectionCount = 0;
        this.subsubsectionCount = 0;

        // 1. Extraer Metadatos
        const meta = this.extractMetadata(texContent);

        // 2. Extraer el cuerpo del documento (entre \begin{document} y \end{document})
        let body = texContent;
        const docStart = texContent.indexOf('\\begin{document}');
        const docEnd = texContent.indexOf('\\end{document}');

        if (docStart !== -1) {
            body = texContent.substring(docStart + 16, docEnd !== -1 ? docEnd : texContent.length);
        }

        // Eliminar comentarios que no sean parte de fórmulas o comandos
        body = body.replace(/(^|[^\\])%.*$/gm, '$1');

        // Extraer y procesar Abstract
        let abstractHtml = '';
        const abstractMatch = body.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
        if (abstractMatch) {
            abstractHtml = `<div class="latex-abstract">
                <h4 class="abstract-title">Resumen</h4>
                <p>${this.formatInline(abstractMatch[1].trim())}</p>
            </div>`;
            body = body.replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/, '');
        }

        // Quitar \maketitle ya que se renderiza el encabezado por separado
        body = body.replace(/\\maketitle/g, '');

        // 3. Procesar Entornos de Bloque
        body = this.processBlockEnvironments(body);

        // 4. Procesar Secciones y Títulos
        body = this.processSections(body);

        // 5. Procesar Listas (itemize, enumerate)
        body = this.processLists(body);

        // 6. Procesar Tablas (table, tabular)
        body = this.processTables(body);

        // 7. Procesar Bibliografía
        body = this.processBibliography(body);

        // 8. Procesar Formato en Línea y Citas
        body = this.formatInline(body);

        // 9. Procesar Párrafos
        body = this.processParagraphs(body);

        // Combinar en resultado final
        const finalHtml = `
            <article class="latex-paper">
                <header class="latex-paper-header">
                    <h1 class="latex-paper-title">${meta.title}</h1>
                    <div class="latex-paper-authors">${meta.author}</div>
                    <div class="latex-paper-date">${meta.date}</div>
                </header>
                ${abstractHtml}
                <div class="latex-paper-body">
                    ${body}
                </div>
            </article>
        `;

        return {
            meta,
            html: finalHtml,
            toc: this.toc,
            raw: texContent
        };
    }

    /**
     * Extrae título, autores y fecha de la cabecera LaTeX
     */
    extractMetadata(tex) {
        const titleMatch = tex.match(/\\title\{([\s\S]*?)\}/);
        const authorMatch = tex.match(/\\author\{([\s\S]*?)\}/);
        const dateMatch = tex.match(/\\date\{([\s\S]*?)\}/);

        const cleanStr = (str) => {
            if (!str) return '';
            return str
                .replace(/\\and/g, ' & ')
                .replace(/\\\\/g, '<br>')
                .replace(/\\textit\{([\s\S]*?)\}/g, '<em>$1</em>')
                .replace(/\\textbf\{([\s\S]*?)\}/g, '<strong>$1</strong>')
                .trim();
        };

        return {
            title: titleMatch ? cleanStr(titleMatch[1]) : 'Documento Técnico de Robótica',
            author: authorMatch ? cleanStr(authorMatch[1]) : 'Laboratorio de Robótica Industrial Nova',
            date: dateMatch ? cleanStr(dateMatch[1]) : '2026'
        };
    }

    /**
     * Procesa ecuaciones de bloque y entornos matemáticos
     */
    processBlockEnvironments(tex) {
        // Ecuaciones: \begin{equation} ... \end{equation}
        tex = tex.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, (match, eqContent) => {
            const trimmed = eqContent.trim();
            return `<div class="latex-equation" data-math="${this.escapeHtml(trimmed)}">$$\n${trimmed}\n$$</div>`;
        });

        // Ecuaciones alineadas: \begin{align} ... \end{align}
        tex = tex.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (match, alignContent) => {
            const trimmed = alignContent.trim();
            return `<div class="latex-equation" data-math="${this.escapeHtml(trimmed)}">$$\\begin{aligned}\n${trimmed}\n\\end{aligned}$$</div>`;
        });

        // Bloques display math con \[ ... \] o $$ ... $$
        tex = tex.replace(/\\\[([\s\S]*?)\\\]/g, (match, mathContent) => {
            const trimmed = mathContent.trim();
            return `<div class="latex-equation" data-math="${this.escapeHtml(trimmed)}">$$\n${trimmed}\n$$</div>`;
        });

        // Bloques verbatim / código
        tex = tex.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (match, code) => {
            return `<pre class="latex-code"><code>${this.escapeHtml(code.trim())}</code></pre>`;
        });

        return tex;
    }

    /**
     * Procesa \section, \subsection y genera la Tabla de Contenidos (TOC)
     */
    processSections(tex) {
        // Secciones principales: \section{...}
        tex = tex.replace(/\\section\{([\s\S]*?)\}/g, (match, title) => {
            this.sectionCount++;
            this.subsectionCount = 0;
            this.subsubsectionCount = 0;

            const cleanTitle = title.trim();
            const slug = `sec-${this.sectionCount}-${this.slugify(cleanTitle)}`;
            const num = `${this.sectionCount}.`;

            this.toc.push({
                id: slug,
                number: num,
                text: cleanTitle,
                level: 1
            });

            return `<h2 id="${slug}" class="latex-section"><span class="section-num">${num}</span> ${cleanTitle}</h2>`;
        });

        // Subsecciones: \subsection{...}
        tex = tex.replace(/\\subsection\{([\s\S]*?)\}/g, (match, title) => {
            this.subsectionCount++;
            this.subsubsectionCount = 0;

            const cleanTitle = title.trim();
            const slug = `subsec-${this.sectionCount}-${this.subsectionCount}-${this.slugify(cleanTitle)}`;
            const num = `${this.sectionCount}.${this.subsectionCount}.`;

            this.toc.push({
                id: slug,
                number: num,
                text: cleanTitle,
                level: 2
            });

            return `<h3 id="${slug}" class="latex-subsection"><span class="subsection-num">${num}</span> ${cleanTitle}</h3>`;
        });

        // Sub-subsecciones: \subsubsection{...}
        tex = tex.replace(/\\subsubsection\{([\s\S]*?)\}/g, (match, title) => {
            this.subsubsectionCount++;

            const cleanTitle = title.trim();
            const slug = `subsubsec-${this.sectionCount}-${this.subsectionCount}-${this.subsubsectionCount}-${this.slugify(cleanTitle)}`;
            const num = `${this.sectionCount}.${this.subsectionCount}.${this.subsubsectionCount}.`;

            this.toc.push({
                id: slug,
                number: num,
                text: cleanTitle,
                level: 3
            });

            return `<h4 id="${slug}" class="latex-subsubsection"><span class="subsubsection-num">${num}</span> ${cleanTitle}</h4>`;
        });

        return tex;
    }

    /**
     * Procesa listas itemize y enumerate
     */
    processLists(tex) {
        // Reemplazar \begin{itemize} ... \end{itemize}
        tex = tex.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, content) => {
            const items = this.parseListItems(content);
            return `<ul class="latex-list latex-itemize">\n${items}\n</ul>`;
        });

        // Reemplazar \begin{enumerate} ... \end{enumerate}
        tex = tex.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, content) => {
            const items = this.parseListItems(content);
            return `<ol class="latex-list latex-enumerate">\n${items}\n</ol>`;
        });

        return tex;
    }

    parseListItems(content) {
        const rawItems = content.split(/\\item\s+/);
        rawItems.shift(); // Quitar texto antes del primer \item

        return rawItems.map(item => {
            return `<li>${item.trim()}</li>`;
        }).join('\n');
    }

    /**
     * Procesa tablas LaTeX (\begin{tabular})
     */
    processTables(tex) {
        tex = tex.replace(/\\begin\{table\}[\s\S]*?\\begin\{tabular\}\{[^}]*?\}([\s\S]*?)\\end\{tabular\}[\s\S]*?\\end\{table\}/g, (match, tabularContent) => {
            return this.renderTabular(tabularContent);
        });

        // Tabular suelto sin entorno table
        tex = tex.replace(/\\begin\{tabular\}\{[^}]*?\}([\s\S]*?)\\end\{tabular\}/g, (match, tabularContent) => {
            return this.renderTabular(tabularContent);
        });

        return tex;
    }

    renderTabular(content) {
        const rows = content.split(/\\\\/).map(r => r.replace(/\\hline/g, '').trim()).filter(r => r.length > 0);
        if (!rows.length) return '';

        let tableHtml = '<div class="table-responsive"><table class="latex-table">';

        // Fila de encabezado
        const headerRow = rows[0];
        const headerCells = headerRow.split('&').map(c => c.trim());
        tableHtml += '<thead><tr>';
        headerCells.forEach(cell => {
            tableHtml += `<th>${this.formatInline(cell)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        // Filas del cuerpo
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].split('&').map(c => c.trim());
            tableHtml += '<tr>';
            cells.forEach(cell => {
                tableHtml += `<td>${this.formatInline(cell)}</td>`;
            });
            tableHtml += '</tr>';
        }

        tableHtml += '</tbody></table></div>';
        return tableHtml;
    }

    /**
     * Procesa la bibliografía (\begin{thebibliography})
     */
    processBibliography(tex) {
        return tex.replace(/\\begin\{thebibliography\}\{[^}]*?\}([\s\S]*?)\\end\{thebibliography\}/g, (match, content) => {
            const items = content.split(/\\bibitem\{([^}]+)\}/).filter(Boolean);
            let bibHtml = '<section class="latex-bibliography"><h3 class="latex-bib-title">Referencias Bibliográficas</h3><ol class="latex-bib-list">';

            for (let i = 0; i < items.length; i += 2) {
                const key = items[i];
                const text = items[i + 1] ? items[i + 1].trim() : '';
                bibHtml += `<li id="cite-${key}" class="latex-bib-item">${this.formatInline(text)}</li>`;
            }

            bibHtml += '</ol></section>';
            return bibHtml;
        });
    }

    /**
     * Formatea estilos en línea como negrita, cursiva, citas y fórmulas en línea
     */
    formatInline(text) {
        if (!text) return '';

        // Formato tipográfico
        text = text.replace(/\\textbf\{([\s\S]*?)\}/g, '<strong>$1</strong>');
        text = text.replace(/\\textit\{([\s\S]*?)\}/g, '<em>$1</em>');
        text = text.replace(/\\emph\{([\s\S]*?)\}/g, '<em>$1</em>');
        text = text.replace(/\\underline\{([\s\S]*?)\}/g, '<u>$1</u>');
        text = text.replace(/\\texttt\{([\s\S]*?)\}/g, '<code>$1</code>');

        // Citas bibliográficas: \cite{key} -> [key]
        text = text.replace(/\\cite\{([^}]+)\}/g, (match, key) => {
            return `<a href="#cite-${key}" class="latex-citation">[${key}]</a>`;
        });

        // Fórmulas matemáticas en línea: $ ... $ (evitando confundir con dobles $$)
        text = text.replace(/(^|[^\$])\$([^\$]+?)\$(?!\$)/g, (match, prefix, math) => {
            return `${prefix}<span class="latex-inline-math" data-math="${this.escapeHtml(math.trim())}">$${math.trim()}$</span>`;
        });

        // Caracteres especiales escapados
        text = text.replace(/\\%/g, '%');
        text = text.replace(/\\&/g, '&amp;');
        text = text.replace(/\\_/g, '_');
        text = text.replace(/\\#/g, '#');

        return text;
    }

    /**
     * Convierte bloques de texto plano separados por líneas en blanco en párrafos <p>
     */
    processParagraphs(text) {
        const blocks = text.split(/\n\s*\n/);
        return blocks.map(block => {
            const trimmed = block.trim();
            if (!trimmed) return '';
            // Si el bloque ya es una etiqueta HTML de bloque, conservarlo
            if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<table') || 
                trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<pre') || 
                trimmed.startsWith('<section') || trimmed.startsWith('<article')) {
                return trimmed;
            }
            return `<p>${trimmed}</p>`;
        }).filter(Boolean).join('\n\n');
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
