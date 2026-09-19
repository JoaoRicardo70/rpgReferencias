// Testes do pipeline de video do gravador (core/pipelineVideo.js): canvas de tamanho fixo 1280x720.
// jsdom nao tem canvas.captureStream nem getContext real: o canvas e o <video> sao falsos.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    criarPipelineDeVideo, encaixarNoCanvas, LARGURA_VIDEO, ALTURA_VIDEO, FPS_VIDEO,
} from '../core/pipelineVideo';

describe('constantes', () => {
    it('1280x720 a 15fps', () => {
        expect(LARGURA_VIDEO).toBe(1280);
        expect(ALTURA_VIDEO).toBe(720);
        expect(FPS_VIDEO).toBe(15);
    });
});

describe('encaixarNoCanvas', () => {
    it('16:9 exato ocupa o canvas inteiro', () => {
        expect(encaixarNoCanvas(1920, 1080)).toEqual({ x: 0, y: 0, largura: 1280, altura: 720 });
        expect(encaixarNoCanvas(1280, 720)).toEqual({ x: 0, y: 0, largura: 1280, altura: 720 });
    });

    it('amplia origem pequena e reduz origem grande mantendo a proporcao', () => {
        expect(encaixarNoCanvas(640, 360)).toEqual({ x: 0, y: 0, largura: 1280, altura: 720 });
        expect(encaixarNoCanvas(3840, 2160)).toEqual({ x: 0, y: 0, largura: 1280, altura: 720 });
    });

    it('4:3 recebe faixas pretas nas laterais (letterbox)', () => {
        // escala = min(1280/800, 720/600) = 1.2 -> 960x720, x = (1280-960)/2 = 160
        expect(encaixarNoCanvas(800, 600)).toEqual({ x: 160, y: 0, largura: 960, altura: 720 });
    });

    it('mais largo que 16:9 recebe faixas em cima e embaixo', () => {
        // 2560x1080 (21:9): escala = 0.5 -> 1280x540, y = 90
        expect(encaixarNoCanvas(2560, 1080)).toEqual({ x: 0, y: 90, largura: 1280, altura: 540 });
    });

    it('retrato (720x1280) fica centralizado com faixas grandes nas laterais', () => {
        // escala = min(1280/720, 720/1280) = 0.5625 -> 405x720, x = floor(875/2) = 437
        expect(encaixarNoCanvas(720, 1280)).toEqual({ x: 437, y: 0, largura: 405, altura: 720 });
    });

    it('nunca passa dos limites do canvas e fica centralizado (varredura de proporcoes)', () => {
        for (const [w, h] of [[1, 1], [100, 37], [1366, 768], [1024, 768], [3440, 1440], [500, 2000], [17, 9999], [9999, 17]]) {
            const r = encaixarNoCanvas(w, h);
            expect(r.largura).toBeGreaterThanOrEqual(2);
            expect(r.altura).toBeGreaterThanOrEqual(2);
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.y).toBeGreaterThanOrEqual(0);
            expect(r.x + r.largura).toBeLessThanOrEqual(LARGURA_VIDEO);
            expect(r.y + r.altura).toBeLessThanOrEqual(ALTURA_VIDEO);
        }
    });

    it('proporcoes extremas: minimo de 2px por lado (evita dimensao 0)', () => {
        const r = encaixarNoCanvas(100000, 1);
        expect(r.altura).toBe(2);
        expect(r.largura).toBe(1280);
    });

    it('respeita um canvas de outro tamanho', () => {
        expect(encaixarNoCanvas(100, 100, 200, 100)).toEqual({ x: 50, y: 0, largura: 100, altura: 100 });
    });

    it.each([[0, 0], [0, 100], [100, 0], [undefined, undefined], [null, 50], [NaN, 50]])('tamanho invalido (%s x %s) -> null', (w, h) => {
        expect(encaixarNoCanvas(w, h)).toBeNull();
    });
});

describe('criarPipelineDeVideo', () => {
    let originalCreate;
    let canvas;
    let ctx;
    let saida;
    let trilha;
    let video;
    let telaStream;

    function instalarDomFalso({ semCaptureStream = false, semContexto = false, semTrilhas = false, captureLanca = false } = {}) {
        trilha = { kind: 'video', stop: vi.fn() };
        saida = {
            getVideoTracks: () => (semTrilhas ? [] : [trilha]),
            getTracks: () => (semTrilhas ? [] : [trilha]),
        };
        ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
        canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => (semContexto ? null : ctx)),
        };
        if (!semCaptureStream) canvas.captureStream = vi.fn(() => { if (captureLanca) throw new Error('nao pode'); return saida; });
        video = {
            muted: false, playsInline: false, srcObject: null, videoWidth: 0, videoHeight: 0,
            play: vi.fn(() => Promise.resolve()),
            pause: vi.fn(),
        };
        originalCreate = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
            if (tag === 'canvas') return canvas;
            if (tag === 'video') return video;
            return originalCreate(tag, ...rest);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        telaStream = { id: 'tela', getTracks: () => [] };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('jsdom real: sem canvas.captureStream devolve null (quem chama grava a trilha original)', () => {
        expect(criarPipelineDeVideo({ id: 'tela' })).toBeNull();
    });

    it('null quando nao ha stream de tela', () => {
        instalarDomFalso();
        expect(criarPipelineDeVideo(null)).toBeNull();
        expect(criarPipelineDeVideo(undefined)).toBeNull();
        expect(canvas.captureStream).not.toHaveBeenCalled();
    });

    it('null quando o canvas nao tem captureStream', () => {
        instalarDomFalso({ semCaptureStream: true });
        expect(criarPipelineDeVideo(telaStream)).toBeNull();
    });

    it('null quando getContext nao devolve contexto 2d', () => {
        instalarDomFalso({ semContexto: true });
        expect(criarPipelineDeVideo(telaStream)).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('null (sem lancar) quando captureStream lanca', () => {
        instalarDomFalso({ captureLanca: true });
        expect(criarPipelineDeVideo(telaStream)).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('null quando o stream capturado nao tem trilha de video', () => {
        instalarDomFalso({ semTrilhas: true });
        expect(criarPipelineDeVideo(telaStream)).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        expect(video.play).not.toHaveBeenCalled();
    });

    it('configura o canvas 1280x720 sem alpha, captura a 15fps e liga o <video> ao stream da tela', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        expect(p).not.toBeNull();
        expect(canvas.width).toBe(1280);
        expect(canvas.height).toBe(720);
        expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
        expect(canvas.captureStream).toHaveBeenCalledWith(15);
        expect(p.trilhas).toEqual([trilha]);
        expect(video.srcObject).toBe(telaStream);
        expect(video.muted).toBe(true);
        expect(video.playsInline).toBe(true);
        expect(video.play).toHaveBeenCalledTimes(1);
        // fundo preto inicial
        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1280, 720);
        p.parar();
    });

    it('fps customizado vai para captureStream e para o intervalo do timer', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream, { fps: 10 });
        expect(canvas.captureStream).toHaveBeenCalledWith(10);
        video.videoWidth = 1280; video.videoHeight = 720;
        vi.advanceTimersByTime(99);
        expect(ctx.drawImage).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        p.parar();
    });

    it('desenha a cada ~67ms com as coordenadas do letterbox', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        video.videoWidth = 800; video.videoHeight = 600;

        vi.advanceTimersByTime(66);
        expect(ctx.drawImage).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 160, 0, 960, 720);

        vi.advanceTimersByTime(67 * 4);
        expect(ctx.drawImage).toHaveBeenCalledTimes(5);
        p.parar();
    });

    it('limpa o canvas de preto antes de cada quadro (faixas do letterbox)', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        video.videoWidth = 800; video.videoHeight = 600;
        ctx.fillRect.mockClear();
        ctx.fillStyle = 'outra';
        vi.advanceTimersByTime(67);
        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1280, 720);
        expect(ctx.fillStyle).toBe('#000');
        p.parar();
    });

    it('acompanha o redimensionamento da janela: novo tamanho de origem, novas coordenadas', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        video.videoWidth = 1920; video.videoHeight = 1080;
        vi.advanceTimersByTime(67);
        expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 1280, 720);

        video.videoWidth = 720; video.videoHeight = 1280; // janela virou retrato
        vi.advanceTimersByTime(67);
        expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 437, 0, 405, 720);
        // o canvas em si nunca muda de tamanho
        expect(canvas.width).toBe(1280);
        expect(canvas.height).toBe(720);
        p.parar();
    });

    it('nao desenha enquanto o video ainda nao tem dimensoes (sem quadro)', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        ctx.fillRect.mockClear();
        vi.advanceTimersByTime(67 * 10);
        expect(ctx.drawImage).not.toHaveBeenCalled();
        expect(ctx.fillRect).not.toHaveBeenCalled();
        video.videoWidth = 1280; video.videoHeight = 720;
        vi.advanceTimersByTime(67);
        expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        p.parar();
    });

    it('parar() limpa o timer, pausa o video, solta o stream e para as trilhas do canvas', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        video.videoWidth = 1280; video.videoHeight = 720;
        expect(vi.getTimerCount()).toBe(1);

        p.parar();
        expect(vi.getTimerCount()).toBe(0);
        expect(video.pause).toHaveBeenCalled();
        expect(video.srcObject).toBeNull();
        expect(trilha.stop).toHaveBeenCalledTimes(1);

        ctx.drawImage.mockClear();
        vi.advanceTimersByTime(1000);
        expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('parar() chamado duas vezes nao lanca', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        p.parar();
        expect(() => p.parar()).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('parar() sobrevive a video.pause() lancando e ainda solta tudo', () => {
        instalarDomFalso();
        const p = criarPipelineDeVideo(telaStream);
        video.pause.mockImplementation(() => { throw new Error('ja parado'); });
        expect(() => p.parar()).not.toThrow();
        expect(video.srcObject).toBeNull();
        expect(trilha.stop).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('play() rejeitado (autoplay) nao gera rejeicao nao tratada nem impede o pipeline', async () => {
        instalarDomFalso();
        video.play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
        const p = criarPipelineDeVideo(telaStream);
        expect(p).not.toBeNull();
        await Promise.resolve();
        await Promise.resolve();
        p.parar();
    });

    it('play() que devolve undefined (navegador antigo) tambem funciona', () => {
        instalarDomFalso();
        video.play = vi.fn(() => undefined);
        const p = criarPipelineDeVideo(telaStream);
        expect(p).not.toBeNull();
        p.parar();
    });

    it('dois pipelines sao independentes: parar um nao interrompe o outro', () => {
        instalarDomFalso();
        const a = criarPipelineDeVideo(telaStream);
        const ctxA = ctx;
        const videoA = video;
        videoA.videoWidth = 1280; videoA.videoHeight = 720;
        expect(vi.getTimerCount()).toBe(1);
        // o segundo reaproveita os mesmos objetos falsos, mas tem seu proprio timer
        const b = criarPipelineDeVideo(telaStream);
        expect(vi.getTimerCount()).toBe(2);
        a.parar();
        expect(vi.getTimerCount()).toBe(1);
        b.parar();
        expect(vi.getTimerCount()).toBe(0);
        expect(ctxA).toBe(ctx);
    });
});
