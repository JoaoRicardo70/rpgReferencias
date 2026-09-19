// Pipeline de vídeo do gravador: a captura de tela (que muda de tamanho quando a janela é
// redimensionada) passa por um canvas de tamanho FIXO e a gravação sai do canvas.
//
// Por quê: o MP4/H.264 fixa a resolução no cabeçalho — se a janela muda de tamanho no meio da
// gravação o vídeo quebra (erro de decodificação); o canvas mantém sempre 1280x720 (com faixas
// pretas quando a proporção da janela é outra), com quadros em ritmo constante (15 fps). Também
// limita a resolução (telas HiDPI gerariam vídeos enormes) e remove o canal alfa da captura.

export const LARGURA_VIDEO = 1280;
export const ALTURA_VIDEO = 720;
export const FPS_VIDEO = 15;

// Calcula onde desenhar um quadro de origem (w x h) dentro do canvas, mantendo a proporção.
export function encaixarNoCanvas(w, h, larguraCanvas = LARGURA_VIDEO, alturaCanvas = ALTURA_VIDEO) {
    if (!w || !h) return null;
    const escala = Math.min(larguraCanvas / w, alturaCanvas / h);
    const largura = Math.max(2, Math.round(w * escala));
    const altura = Math.max(2, Math.round(h * escala));
    return { x: Math.floor((larguraCanvas - largura) / 2), y: Math.floor((alturaCanvas - altura) / 2), largura, altura };
}

// Retorna { trilhas, parar } ou null quando o ambiente não suporta (sem canvas.captureStream):
// nesse caso quem chamou grava a trilha original, como antes.
export function criarPipelineDeVideo(telaStream, { fps = FPS_VIDEO } = {}) {
    if (typeof document === 'undefined' || !telaStream) return null;
    let canvas;
    let ctx;
    let saida;
    try {
        canvas = document.createElement('canvas');
        if (typeof canvas.captureStream !== 'function') return null;
        canvas.width = LARGURA_VIDEO;
        canvas.height = ALTURA_VIDEO;
        ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return null;
        saida = canvas.captureStream(fps);
    } catch (e) {
        return null;
    }
    const trilhas = saida.getVideoTracks();
    if (!trilhas || trilhas.length === 0) return null;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = telaStream;
    const tocando = video.play();
    if (tocando && tocando.catch) tocando.catch(() => { /* sem autoplay: os quadros só começam quando liberar */ });

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LARGURA_VIDEO, ALTURA_VIDEO);

    // Timer (e não requestAnimationFrame): o rAF para quando a janela é minimizada.
    const desenhar = () => {
        const pos = encaixarNoCanvas(video.videoWidth, video.videoHeight);
        if (!pos) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, LARGURA_VIDEO, ALTURA_VIDEO);
        ctx.drawImage(video, pos.x, pos.y, pos.largura, pos.altura);
    };
    const timer = setInterval(desenhar, Math.round(1000 / fps));

    return {
        trilhas,
        parar() {
            clearInterval(timer);
            try { video.pause(); } catch (e) { /* já parado */ }
            video.srcObject = null;
            saida.getTracks().forEach(t => t.stop());
        },
    };
}
