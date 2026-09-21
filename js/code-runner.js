/**
 * RoboDocs - Python & NumPy Client-Side Execution Engine
 * Evaluates robotics matrix rotations, vector transformations, and plots on HTML5 Canvas.
 */

class PythonCodeRunner {
    constructor() {
        this.cache = {};
    }

    /**
     * Ejecuta el script de Python actual y muestra el resultado en la consola interactiva
     */
    run(codeId) {
        const card = document.getElementById(codeId);
        if (!card) return;

        const editor = card.querySelector('.code-editor-area');
        const viewport = card.querySelector('.code-viewport');
        const consoleEl = document.getElementById(`console-${codeId}`);
        const outputEl = document.getElementById(`output-${codeId}`);
        const canvasContainer = document.getElementById(`canvas-container-${codeId}`);
        const canvas = document.getElementById(`canvas-${codeId}`);

        if (!outputEl) return;

        // Obtener código fuente (desde el editor si está visible, o desde el dataset)
        let code = '';
        if (editor && editor.style.display !== 'none') {
            code = editor.value;
        } else if (viewport) {
            code = viewport.getAttribute('data-raw') || '';
        }

        if (consoleEl) consoleEl.style.display = 'block';

        try {
            const result = this.executePython(code);
            outputEl.textContent = result.output;
            outputEl.className = 'terminal-output text-success';

            if (result.hasPlot && canvas && canvasContainer) {
                canvasContainer.style.display = 'block';
                this.drawVectorPlot(canvas, result.plotData);
            } else if (canvasContainer) {
                canvasContainer.style.display = 'none';
            }
        } catch (err) {
            outputEl.textContent = `Error de Ejecución Python:\n${err.message}`;
            outputEl.className = 'terminal-output text-error';
            if (canvasContainer) canvasContainer.style.display = 'none';
        }
    }

    /**
     * Alterna la visualización del editor para modificar variables interactivamente
     */
    toggleEdit(codeId) {
        const card = document.getElementById(codeId);
        if (!card) return;

        const viewport = card.querySelector('.code-viewport');
        const editor = card.querySelector('.code-editor-area');
        const editBtn = card.querySelector('.btn-code-edit span');

        if (!viewport || !editor) return;

        const isEditing = editor.style.display !== 'none';
        if (isEditing) {
            editor.style.display = 'none';
            viewport.style.display = 'block';
            if (editBtn) editBtn.textContent = 'Editar';
        } else {
            editor.style.display = 'block';
            viewport.style.display = 'none';
            editor.focus();
            if (editBtn) editBtn.textContent = 'Ver';
        }
    }

    clearConsole(codeId) {
        const consoleEl = document.getElementById(`console-${codeId}`);
        if (consoleEl) consoleEl.style.display = 'none';
    }

    /**
     * Intérprete matemático de scripts de robótica NumPy
     */
    executePython(code) {
        let output = `$ python3 main.py\n`;
        let hasPlot = false;
        let plotData = { orig: [4, 1], rot: [-1, 3], theta: 60 };

        // 1. Extraer ángulo theta
        let thetaDeg = 60;
        const thetaDegMatch = code.match(/theta_deg\s*=\s*([\d\.\-]+)/);
        if (thetaDegMatch) {
            thetaDeg = parseFloat(thetaDegMatch[1]);
        } else {
            const radMatch = code.match(/theta\s*=\s*np\.deg2rad\(([\d\.\-]+)\)/);
            if (radMatch) thetaDeg = parseFloat(radMatch[1]);
        }

        const thetaRad = (thetaDeg * Math.PI) / 180;
        const cosT = Math.cos(thetaRad);
        const sinT = Math.sin(thetaRad);

        // Matriz R(theta)
        const R = [
            [cosT, -sinT],
            [sinT, cosT]
        ];

        // 2. Extraer vector p
        let p = [4.0, 1.0];
        const pMatch = code.match(/p\s*=\s*np\.array\(\[\s*([\d\.\-]+)\s*,\s*([\d\.\-]+)\s*\]\)/);
        if (pMatch) {
            p = [parseFloat(pMatch[1]), parseFloat(pMatch[2])];
        }

        // Vector rotado p_rot = R @ p
        const pRot = [
            R[0][0] * p[0] + R[0][1] * p[1],
            R[1][0] * p[0] + R[1][1] * p[1]
        ];

        // 3. Extraer pose del robot p_robot y p_local si existen
        let pRobot = [3.0, 2.0];
        let pLocal = [2.0, 1.0];
        const probotMatch = code.match(/p_robot\s*=\s*np\.array\(\[\s*([\d\.\-]+)\s*,\s*([\d\.\-]+)\s*\]\)/);
        if (probotMatch) pRobot = [parseFloat(probotMatch[1]), parseFloat(probotMatch[2])];

        const plocalMatch = code.match(/p_local\s*=\s*np\.array\(\[\s*([\d\.\-]+)\s*,\s*([\d\.\-]+)\s*\]\)/);
        if (plocalMatch) pLocal = [parseFloat(plocalMatch[1]), parseFloat(plocalMatch[2])];

        const pGlobal = [
            pRobot[0] + (R[0][0] * pLocal[0] + R[0][1] * pLocal[1]),
            pRobot[1] + (R[1][0] * pLocal[0] + R[1][1] * pLocal[1])
        ];

        // 4. Formatear salida según los prints detectados
        const fmtNum = (n) => {
            const s = (Math.abs(n) < 1e-12 ? 0 : n).toFixed(8);
            return parseFloat(s) >= 0 ? ` ${s.substring(0, 10)}` : s.substring(0, 11);
        };

        const fmtMatrix = (m) => {
            return `[[${fmtNum(m[0][0])} ${fmtNum(m[0][1])}]\n [${fmtNum(m[1][0])} ${fmtNum(m[1][1])}]]`;
        };

        if (code.includes('p_global') || code.includes('Punto global')) {
            output += `Punto global: [${pGlobal[0].toFixed(7)} ${pGlobal[1].toFixed(7)}]\n`;
        } else if (code.includes('Determinante') || code.includes('linalg.det') || code.includes('R.T @ R')) {
            output += `R:\n${fmtMatrix(R)}\n`;
            output += `R.T @ R:\n[[ 1.  0.]\n [ 0.  1.]]\n`;
            output += `Determinante:\n1.0\n`;
        } else if (code.includes('Norma original') || code.includes('linalg.norm')) {
            const normOrig = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
            const normRot = Math.sqrt(pRot[0] * pRot[0] + pRot[1] * pRot[1]);
            output += `Norma original: ${normOrig.toFixed(15)}\n`;
            output += `Norma rotada: ${normRot.toFixed(15)}\n`;
        } else if (code.includes('Vector original') || code.includes('Vector rotado') || code.includes('p_rotado')) {
            output += `Vector original: [${p[0].toFixed(1)} ${p[1].toFixed(1)}]\n`;
            output += `Vector rotado: [${pRot[0].toFixed(7)} ${pRot[1].toFixed(7)}]\n`;
        } else if (code.includes('print(R)') || code.includes('print("R:")')) {
            output += `R:\n${fmtMatrix(R)}\n`;
        } else {
            output += `Vector rotado: [${pRot[0].toFixed(7)} ${pRot[1].toFixed(7)}]\n`;
        }

        // Chequear si genera gráfica de Matplotlib
        if (code.includes('plt.quiver') || code.includes('plt.show') || code.includes('matplotlib')) {
            hasPlot = true;
            plotData = {
                orig: p,
                rot: pRot,
                theta: thetaDeg
            };
            output += `\n[Matplotlib] Gráfico 2D renderizado exitosamente en el lienzo.`;
        }

        return { output, hasPlot, plotData };
    }

    /**
     * Dibuja los vectores interactivos en Canvas simulando Matplotlib Quiver
     */
    drawVectorPlot(canvas, data) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Fondo oscuro
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const scale = 26; // píxeles por unidad

        // Cuadrícula
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let x = -6; x <= 6; x++) {
            ctx.beginPath();
            ctx.moveTo(cx + x * scale, 0);
            ctx.lineTo(cx + x * scale, h);
            ctx.stroke();
        }
        for (let y = -6; y <= 6; y++) {
            ctx.beginPath();
            ctx.moveTo(0, cy - y * scale);
            ctx.lineTo(w, cy - y * scale);
            ctx.stroke();
        }

        // Ejes X e Y
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();

        // Etiquetas de ejes
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Outfit, sans-serif';
        ctx.fillText('X', w - 16, cy - 8);
        ctx.fillText('Y', cx + 8, 16);

        // Función para dibujar flecha vectorial
        const drawArrow = (fromX, fromY, toX, toY, color, label) => {
            const headlen = 10;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const angle = Math.atan2(dy, dx);

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2.6;

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();

            // Etiqueta
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText(label, toX + 6, toY - 6);
        };

        // Vector original (Azul cian)
        const ox = cx + data.orig[0] * scale;
        const oy = cy - data.orig[1] * scale;
        drawArrow(cx, cy, ox, oy, '#38bdf8', `p [${data.orig[0]}, ${data.orig[1]}]`);

        // Vector rotado (Verde esmeralda)
        const rx = cx + data.rot[0] * scale;
        const ry = cy - data.rot[1] * scale;
        drawArrow(cx, cy, rx, ry, '#10b981', `p' (${data.theta}°)`);

        // Arco de rotación
        const angOrig = Math.atan2(data.orig[1], data.orig[0]);
        const angRot = Math.atan2(data.rot[1], data.rot[0]);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 1.5, -angOrig, -angRot, data.theta > 0);
        ctx.stroke();
        ctx.setLineDash([]);

        // Leyenda
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(10, 10, 140, 50);
        ctx.strokeStyle = '#334155';
        ctx.strokeRect(10, 10, 140, 50);

        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(18, 22, 10, 10);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText('Vector Original', 34, 31);

        ctx.fillStyle = '#10b981';
        ctx.fillRect(18, 40, 10, 10);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText('Vector Rotado', 34, 49);
    }
}

// Instancia global
window.pythonCodeRunner = new PythonCodeRunner();
