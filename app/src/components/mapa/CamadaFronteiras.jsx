import React, { useEffect, useRef } from 'react';
import mascaraTerra from '../../assets/runeterra-terra-mascara.png';
import { GRADE_L, GRADE_A } from '../../core/fronteiras';

const LARGURA = 1536;
const ALTURA = Math.round(LARGURA * GRADE_A / GRADE_L);

// Resolução em que o contorno suave de cada facção é calculado (metade da tela: barato e já fica liso).
const MEIA_L = LARGURA / 2;
const MEIA_A = ALTURA / 2;

function corEmRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Uma facção vira um desenho liso: a grade é ampliada e borrada (cantos arredondados), e o corte em 50% dá a forma
// final. Dentro da forma entra um véu da cor; na borda, um traço mais forte.
function desenharFaccao(ctx, grade, id, cor) {
    const celulas = document.createElement('canvas');
    celulas.width = GRADE_L; celulas.height = GRADE_A;
    const cx = celulas.getContext('2d');
    if (!cx) return;
    cx.fillStyle = '#fff';
    let algum = false;
    grade.forEach((linha, y) => { for (let x = 0; x < GRADE_L; x++) if (linha[x] === id) { cx.fillRect(x, y, 1, 1); algum = true; } });
    if (!algum) return;

    const campo = document.createElement('canvas');
    campo.width = MEIA_L; campo.height = MEIA_A;
    const kx = campo.getContext('2d', { willReadFrequently: true });
    kx.imageSmoothingEnabled = true;
    kx.filter = 'blur(4px)';
    kx.drawImage(celulas, 0, 0, MEIA_L, MEIA_A);
    const alfa = kx.getImageData(0, 0, MEIA_L, MEIA_A).data;
    const dentro = (x, y) => x >= 0 && y >= 0 && x < MEIA_L && y < MEIA_A && alfa[(y * MEIA_L + x) * 4 + 3] > 127;

    const [r, g, b] = corEmRgb(cor);
    const imagem = kx.createImageData(MEIA_L, MEIA_A);
    const px = imagem.data;
    for (let y = 0; y < MEIA_A; y++) {
        for (let x = 0; x < MEIA_L; x++) {
            if (!dentro(x, y)) continue;
            const j = (y * MEIA_L + x) * 4;
            const borda = !dentro(x - 2, y) || !dentro(x + 2, y) || !dentro(x, y - 2) || !dentro(x, y + 2);
            px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = borda ? 255 : 105;
        }
    }
    const saida = document.createElement('canvas');
    saida.width = MEIA_L; saida.height = MEIA_A;
    saida.getContext('2d').putImageData(imagem, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.drawImage(saida, 0, 0, LARGURA, ALTURA);
    ctx.restore();
}

// Desenha os territórios por cima do mapa: cada facção ganha um véu da sua cor e um contorno liso. Só aparece sobre a
// terra (máscara), nunca sobre o mar.
export function desenharFronteiras(ctx, grade, facoes, mascara) {
    ctx.clearRect(0, 0, LARGURA, ALTURA);
    if (!grade || !facoes.length) return;
    facoes.forEach((f) => desenharFaccao(ctx, grade, f.id, f.cor));
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
    const [mascaraPronta, setMascaraPronta] = React.useState(false);

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
        const quadro = requestAnimationFrame(() => desenharFronteiras(ctx, ativa ? grade : null, facoes || [], mascaraRef.current));
        return () => cancelAnimationFrame(quadro);
    }, [grade, facoes, ativa, mascaraPronta]);

    return <canvas ref={telaRef} className="fronteiras-camada" width={LARGURA} height={ALTURA} aria-hidden="true" />;
}
