import mascaraTerra from '../../assets/runeterra-terra-mascara.png';
import { GRADE_L, GRADE_A } from '../../core/fronteiras';

const LARGURA = 768;
const ALTURA = Math.round(LARGURA * GRADE_A / GRADE_L);

let terraEmCache = null;
function carregarTerra() {
    if (!terraEmCache) {
        terraEmCache = new Promise((ok) => {
            if (typeof Image === 'undefined') { ok(null); return; }
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = () => ok(null);
            img.src = mascaraTerra;
        });
    }
    return terraEmCache;
}

// Silhueta do território ATUAL de uma facção (com as fronteiras que o Mestre pintou), para acender só ela na região em
// foco: células da grade ampliadas e borradas (borda suave), cortadas pela terra para não cobrir o mar. Devolve um
// data URL (PNG) para usar como máscara CSS, ou null quando não há canvas ou a facção não tem território.
export async function mascaraDaFaccao(grade, id) {
    if (typeof document === 'undefined' || !grade || !id) return null;
    const celulas = document.createElement('canvas');
    celulas.width = GRADE_L; celulas.height = GRADE_A;
    const cx = celulas.getContext ? celulas.getContext('2d') : null;
    if (!cx) return null;
    cx.fillStyle = '#fff';
    let algum = false;
    grade.forEach((linha, y) => { for (let x = 0; x < GRADE_L; x++) if (linha[x] === id) { cx.fillRect(x, y, 1, 1); algum = true; } });
    if (!algum) return null;

    const saida = document.createElement('canvas');
    saida.width = LARGURA; saida.height = ALTURA;
    const sx = saida.getContext('2d', { willReadFrequently: true });
    sx.imageSmoothingEnabled = true;
    sx.filter = 'blur(3px)';
    sx.drawImage(celulas, 0, 0, LARGURA, ALTURA);
    sx.filter = 'none';
    // borda mais firme: o borrão vira um degradê curto em volta da forma
    const dados = sx.getImageData(0, 0, LARGURA, ALTURA);
    const px = dados.data;
    for (let i = 3; i < px.length; i += 4) px[i] = Math.max(0, Math.min(255, (px[i] - 90) * 2.2));
    sx.putImageData(dados, 0, 0);

    const terra = await carregarTerra();
    if (terra) {
        sx.globalCompositeOperation = 'destination-in';
        sx.drawImage(terra, 0, 0, LARGURA, ALTURA);
    }
    return saida.toDataURL('image/png');
}
