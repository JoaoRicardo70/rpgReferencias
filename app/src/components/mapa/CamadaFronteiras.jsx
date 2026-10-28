import React, { useEffect, useRef, useState } from 'react';
import mascaraTerra from '../../assets/runeterra-terra-mascara.png';
import { GRADE_L, GRADE_A } from '../../core/fronteiras';

const LARGURA = 1536;
const ALTURA = Math.round(LARGURA * GRADE_A / GRADE_L);

// Resolução em que o contorno suave de cada facção é calculado (metade da tela: barato e já fica liso).
const ESCALA_CAMPO = (LARGURA / 2) / GRADE_L;
const CELULA = LARGURA / GRADE_L;
const MARGEM = 6; // células a mais em volta do desenho, para o borrão não ser cortado

function corEmRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Uma facção vira um desenho liso: a grade é ampliada e borrada (cantos arredondados), e o corte em 50% dá a forma
// final. Dentro da forma entra um véu da cor; na borda, um traço mais forte. Só a caixa que envolve a facção é
// processada (pintar precisa redesenhar rápido). Devolve { saida, x, y, largura, altura } em pixels da camada.
function desenharFaccao(grade, id, cor) {
    let x0 = GRADE_L; let x1 = -1; let y0 = GRADE_A; let y1 = -1;
    grade.forEach((linha, y) => {
        const i = linha.indexOf(id);
        if (i < 0) return;
        x0 = Math.min(x0, i); x1 = Math.max(x1, linha.lastIndexOf(id));
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    });
    if (x1 < 0) return null;
    const bx0 = Math.max(0, x0 - MARGEM); const by0 = Math.max(0, y0 - MARGEM);
    const bw = Math.min(GRADE_L - 1, x1 + MARGEM) - bx0 + 1; const bh = Math.min(GRADE_A - 1, y1 + MARGEM) - by0 + 1;

    const celulas = document.createElement('canvas');
    celulas.width = bw; celulas.height = bh;
    const cx = celulas.getContext('2d');
    if (!cx) return null;
    cx.fillStyle = '#fff';
    for (let y = y0; y <= y1; y++) {
        const linha = grade[y];
        for (let x = x0; x <= x1; x++) if (linha[x] === id) cx.fillRect(x - bx0, y - by0, 1, 1);
    }

    const cw = Math.max(1, Math.round(bw * ESCALA_CAMPO)); const ch = Math.max(1, Math.round(bh * ESCALA_CAMPO));
    const campo = document.createElement('canvas');
    campo.width = cw; campo.height = ch;
    const kx = campo.getContext('2d', { willReadFrequently: true });
    kx.imageSmoothingEnabled = true;
    kx.filter = 'blur(3px)';
    kx.drawImage(celulas, 0, 0, cw, ch);
    const alfa = kx.getImageData(0, 0, cw, ch).data;
    const dentro = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && alfa[(y * cw + x) * 4 + 3] > 127;

    const [r, g, b] = corEmRgb(cor);
    const imagem = kx.createImageData(cw, ch);
    const px = imagem.data;
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            if (!dentro(x, y)) continue;
            const j = (y * cw + x) * 4;
            const borda = !dentro(x - 2, y) || !dentro(x + 2, y) || !dentro(x, y - 2) || !dentro(x, y + 2);
            px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = borda ? 255 : 105;
        }
    }
    const saida = document.createElement('canvas');
    saida.width = cw; saida.height = ch;
    saida.getContext('2d').putImageData(imagem, 0, 0);
    return { saida, x: bx0 * CELULA, y: by0 * CELULA, largura: bw * CELULA, altura: bh * CELULA };
}

// Facções que tiveram alguma célula mudada entre duas grades (as linhas não tocadas são as mesmas strings).
function faccoesMudadas(antes, depois) {
    const ids = new Set();
    depois.forEach((linha, y) => {
        if (linha === antes[y]) return;
        for (const c of linha) if (c !== '0') ids.add(c);
        for (const c of (antes[y] || '')) if (c !== '0') ids.add(c);
    });
    return ids;
}

export function criarCacheFronteiras() {
    return { grade: null, porId: new Map() };
}

// Desenha os territórios por cima do mapa: cada facção ganha um véu da sua cor e um contorno liso. Só aparece sobre a
// terra (máscara), nunca sobre o mar. Com um cache, só as facções que mudaram são recalculadas.
export function desenharFronteiras(ctx, grade, facoes, mascara, cache = null) {
    ctx.clearRect(0, 0, LARGURA, ALTURA);
    if (!grade || !facoes.length) return;
    const mudadas = cache && cache.grade ? faccoesMudadas(cache.grade, grade) : null;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    facoes.forEach((f) => {
        let item = cache ? cache.porId.get(f.id) : undefined;
        if (item === undefined || item.cor !== f.cor || !mudadas || mudadas.has(f.id)) {
            item = { cor: f.cor, desenho: desenharFaccao(grade, f.id, f.cor) };
            if (cache) cache.porId.set(f.id, item);
        }
        const d = item.desenho;
        if (d) ctx.drawImage(d.saida, d.x, d.y, d.largura, d.altura);
    });
    ctx.restore();
    if (cache) {
        cache.grade = grade;
        // facção removida sai do cache: se o id for reaproveitado, o desenho antigo não pode voltar
        const vivos = new Set(facoes.map((f) => f.id));
        [...cache.porId.keys()].forEach((id) => { if (!vivos.has(id)) cache.porId.delete(id); });
    }
    if (mascara) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mascara, 0, 0, LARGURA, ALTURA);
        ctx.restore();
    }
}

export default function CamadaFronteiras({ grade, facoes, ativa = true }) {
    const telaRef = useRef(null);
    const mascaraRef = useRef(null);
    const cacheRef = useRef(null);
    const [mascaraPronta, setMascaraPronta] = useState(false);

    useEffect(() => {
        if (typeof Image === 'undefined') return undefined;
        const img = new Image();
        let vivo = true;
        img.onload = () => { if (!vivo) return; mascaraRef.current = img; setMascaraPronta(true); };
        img.onerror = () => { /* sem a máscara a camada fica escondida (não vaza sobre o mar) */ };
        img.src = mascaraTerra;
        return () => { vivo = false; };
    }, []);

    useEffect(() => {
        const tela = telaRef.current;
        if (!tela) return;
        const ctx = tela.getContext ? tela.getContext('2d') : null;
        if (!ctx) return; // sem canvas (ex.: testes): fica sem a camada
        // Sem a máscara carregada a camada ficaria vazando para o mar: espera ela.
        if (!mascaraPronta) { ctx.clearRect(0, 0, LARGURA, ALTURA); return; }
        // Pintar dispara muitas mudanças por segundo: redesenha no máximo uma vez por quadro.
        const quadro = requestAnimationFrame(() => {
            if (!cacheRef.current) cacheRef.current = criarCacheFronteiras();
            desenharFronteiras(ctx, ativa ? grade : null, facoes || [], mascaraRef.current, cacheRef.current);
        });
        return () => cancelAnimationFrame(quadro);
    }, [grade, facoes, ativa, mascaraPronta]);

    return <canvas ref={telaRef} className="fronteiras-camada" width={LARGURA} height={ALTURA} aria-hidden="true" />;
}
