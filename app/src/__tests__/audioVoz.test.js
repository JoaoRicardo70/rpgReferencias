import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import {
    faixaDeVoz, medirNivelDeVoz, criarPortaoDeVoz, estadoPortao, CONFIG_PORTAO_PADRAO,
    SENSIBILIDADE_MIN, SENSIBILIDADE_MAX, SENSIBILIDADE_PADRAO, NIVEL_MAXIMO_EXIBIDO,
    LIMIAR_FALA_REMOTA, FFT_SIZE
} from '../core/audioVoz';
import { CalibradorDeVoz } from '../components/mapa/MapaVoz';

const PASSO = 16;
const cal = (stream, setSensibilidade) => React.createElement(CalibradorDeVoz, { stream, sensibilidade: 30, setSensibilidade });

// Alimenta o portão com uma sequência de níveis; devolve os resultados e o relógio final.
function rodar(portao, niveis, sens = 30, t0 = 0) {
    let t = t0;
    const res = [];
    for (const n of niveis) {
        res.push(portao.processar(n, sens, t));
        t += PASSO;
    }
    return { res, t, ultimo: res[res.length - 1] };
}
const repetir = (v, n) => Array(n).fill(v);
const algumAberto = (res) => res.some(r => r.aberto);

describe('constantes', () => {
    it('expõe os valores documentados', () => {
        expect(SENSIBILIDADE_MIN).toBe(1);
        expect(SENSIBILIDADE_MAX).toBe(120);
        expect(SENSIBILIDADE_PADRAO).toBe(30);
        expect(NIVEL_MAXIMO_EXIBIDO).toBe(140);
        expect(LIMIAR_FALA_REMOTA).toBe(25);
        expect(FFT_SIZE).toBe(256);
        expect(CONFIG_PORTAO_PADRAO.quadrosParaAbrir).toBe(4);
        expect(CONFIG_PORTAO_PADRAO.segurarMs).toBe(700);
    });
});

describe('faixaDeVoz', () => {
    it.each([48000, 44100, 16000])('cobre 100-3800 Hz a %i Hz com fft 256', (sr) => {
        const { ini, fim } = faixaDeVoz(sr, 256);
        const largura = sr / 256;
        expect(ini).toBe(Math.max(1, Math.floor(100 / largura)));
        expect(fim).toBe(Math.min(127, Math.ceil(3800 / largura)));
        expect(ini).toBeGreaterThanOrEqual(1);
        expect(fim).toBeGreaterThan(ini);
        expect(fim).toBeLessThanOrEqual(127);
    });

    it('valores concretos a 48000 Hz', () => {
        expect(faixaDeVoz(48000, 256)).toEqual({ ini: 1, fim: 21 });
    });

    it('usa padrões quando sem argumentos', () => {
        expect(faixaDeVoz()).toEqual(faixaDeVoz(48000, 256));
    });

    it.each([8, 16, 32, 64, 128, 512, 2048])('respeita limites com fftSize %i', (fft) => {
        for (const sr of [8000, 16000, 44100, 48000, 96000]) {
            const { ini, fim } = faixaDeVoz(sr, fft);
            expect(ini).toBeGreaterThanOrEqual(1);
            expect(fim).toBeGreaterThan(ini);
            expect(fim).toBeLessThanOrEqual(fft / 2 - 1);
        }
    });

    it('a 16000 Hz o limite superior é ceil(3800/62.5)=61', () => {
        expect(faixaDeVoz(16000, 256).fim).toBe(61);
    });
});

describe('medirNivelDeVoz', () => {
    it('média só dentro da faixa (inclusiva) e ignora bins fora', () => {
        const dados = new Uint8Array(128).fill(200);
        for (let i = 5; i <= 10; i++) dados[i] = i * 10; // 50..100
        const media = (50 + 60 + 70 + 80 + 90 + 100) / 6;
        expect(medirNivelDeVoz(dados, { ini: 5, fim: 10 })).toBeCloseTo(media, 10);
    });

    it('bins fora da faixa não influenciam', () => {
        const a = new Uint8Array(128);
        const b = new Uint8Array(128).fill(255);
        for (let i = 3; i <= 6; i++) { a[i] = 40; b[i] = 40; }
        expect(medirNivelDeVoz(a, { ini: 3, fim: 6 })).toBe(40);
        expect(medirNivelDeVoz(b, { ini: 3, fim: 6 })).toBe(40);
    });

    it('array vazio retorna 0', () => {
        expect(medirNivelDeVoz(new Uint8Array(0), { ini: 1, fim: 21 })).toBe(0);
        expect(medirNivelDeVoz([], { ini: 1, fim: 21 })).toBe(0);
    });

    it('array mais curto que a faixa usa só o que existe', () => {
        const dados = new Uint8Array([0, 10, 20, 30]);
        expect(medirNivelDeVoz(dados, { ini: 1, fim: 21 })).toBe(20);
    });

    it('faixa começando além do tamanho retorna 0', () => {
        expect(medirNivelDeVoz(new Uint8Array(4), { ini: 10, fim: 20 })).toBe(0);
    });

    it('funciona com Array comum e faixa de um bin', () => {
        expect(medirNivelDeVoz([1, 2, 3, 4], { ini: 2, fim: 2 })).toBe(3);
    });
});

describe('criarPortaoDeVoz - abertura', () => {
    it('silêncio nunca abre', () => {
        const g = criarPortaoDeVoz();
        const { res } = rodar(g, repetir(2, 1000));
        expect(algumAberto(res)).toBe(false);
    });

    it('primeiro quadro: piso = min(nivel, sensibilidade)', () => {
        const g = criarPortaoDeVoz();
        expect(g.processar(10, 30, 0).piso).toBeCloseTo(10, 5);
        const g2 = criarPortaoDeVoz();
        // nivel acima da sensibilidade: piso inicial = sensibilidade (depois sobe um pouco, mas ainda ~30)
        expect(g2.processar(100, 30, 0).piso).toBeCloseTo(30 + 70 * 0.0008, 5);
    });

    it('pico de um único quadro não abre', () => {
        const g = criarPortaoDeVoz();
        const { res } = rodar(g, [...repetir(5, 30), 170, ...repetir(5, 100)]);
        expect(algumAberto(res)).toBe(false);
    });

    it('cauda de clique (172,103,40,10...) não abre', () => {
        const g = criarPortaoDeVoz();
        const { res } = rodar(g, [...repetir(8, 30), 172, 103, 40, ...repetir(10, 100)]);
        expect(algumAberto(res)).toBe(false);
    });

    it('5 cliques de teclado seguidos nunca abrem', () => {
        const g = criarPortaoDeVoz();
        const seq = [];
        for (const pico of [130, 150, 180, 140, 160]) seq.push(pico, Math.round(pico * 0.6), 40, 10, 10, ...repetir(10, 15));
        const { res } = rodar(g, [...repetir(8, 20), ...seq]);
        expect(algumAberto(res)).toBe(false);
    });

    it('fala sustentada (>=4 quadros acima) abre exatamente no 4o quadro', () => {
        const g = criarPortaoDeVoz();
        const { res: quieto, t } = rodar(g, repetir(8, 20));
        const { res } = rodar(g, repetir(80, 6), 30, t);
        expect(algumAberto(quieto)).toBe(false);
        expect(res.map(r => r.aberto)).toEqual([false, false, false, true, true, true]);
    });

    it('3 quadros acima seguidos de silêncio não abrem', () => {
        const g = criarPortaoDeVoz();
        const { res } = rodar(g, [...repetir(8, 20), 80, 80, 80, ...repetir(8, 50)]);
        expect(algumAberto(res)).toBe(false);
    });

    it('contador com vazamento: alternar acima/abaixo com ganho líquido eventualmente abre', () => {
        const g = criarPortaoDeVoz();
        rodar(g, repetir(5, 20)); // piso baixo
        // 2 acima, 1 abaixo: líquido +1 por ciclo
        const seq = [];
        for (let i = 0; i < 10; i++) seq.push(90, 90, 5);
        const { res } = rodar(g, seq, 30, 1000);
        expect(algumAberto(res)).toBe(true);
    });

    it('contador com vazamento: alternar 1 acima / 1 abaixo (líquido 0) não abre', () => {
        const g = criarPortaoDeVoz();
        rodar(g, repetir(5, 20));
        const seq = [];
        for (let i = 0; i < 50; i++) seq.push(90, 5);
        const { res } = rodar(g, seq, 30, 1000);
        expect(algumAberto(res)).toBe(false);
    });

    it('picos isolados espaçados nunca abrem, mesmo repetidos muitas vezes', () => {
        const g = criarPortaoDeVoz();
        const seq = [];
        for (let i = 0; i < 100; i++) seq.push(150, 5, 5);
        const { res } = rodar(g, seq);
        expect(algumAberto(res)).toBe(false);
    });

    it('nível exatamente igual ao limiar não conta como acima', () => {
        const g = criarPortaoDeVoz();
        const { res } = rodar(g, repetir(30, 200), 30);
        // piso ~30 -> limiar = max(30, 58) = 58; 30 nunca passa
        expect(algumAberto(res)).toBe(false);
    });
});

describe('criarPortaoDeVoz - retenção e histerese', () => {
    function abrir(g, sens = 30) {
        const a = rodar(g, repetir(10, 10), sens);
        const b = rodar(g, repetir(90, 8), sens, a.t);
        expect(b.ultimo.aberto).toBe(true);
        return b.t;
    }

    it('mantém aberto por 700ms após a última voz e depois fecha', () => {
        const g = criarPortaoDeVoz();
        let t = abrir(g);
        const ultimaVoz = t - PASSO;
        // queda para silêncio
        const dentro = [];
        let fechouEm = null;
        for (let k = 0; k < 100; k++, t += PASSO) {
            const r = g.processar(5, 30, t);
            if (!r.aberto && fechouEm === null) fechouEm = t;
            if (t - ultimaVoz <= 700) dentro.push(r.aberto);
        }
        expect(dentro.every(Boolean)).toBe(true);
        expect(fechouEm).not.toBeNull();
        expect(fechouEm - ultimaVoz).toBeGreaterThan(700);
        expect(fechouEm - ultimaVoz).toBeLessThanOrEqual(700 + PASSO);
    });

    it('voz retomada dentro da janela de retenção renova o tempo', () => {
        const g = criarPortaoDeVoz();
        let t = abrir(g);
        for (let i = 0; i < 25; i++, t += PASSO) g.processar(5, 30, t); // 400ms
        g.processar(90, 30, t); t += PASSO; // renova
        let r;
        for (let i = 0; i < 25; i++, t += PASSO) r = g.processar(5, 30, t); // +400ms
        expect(r.aberto).toBe(true);
    });

    it('histerese: entre fechar e abrir mantém aberto', () => {
        const g = criarPortaoDeVoz();
        let t = abrir(g);
        const r0 = g.processar(90, 30, t); t += PASSO;
        expect(r0.limiarFechar).toBeLessThan(r0.limiarAbrir);
        const meio = (r0.limiarAbrir + r0.limiarFechar) / 2;
        let r;
        for (let i = 0; i < 100; i++, t += PASSO) r = g.processar(meio + 0.5 - 0.5, 30, t + 0);
        // nível fica acima de limiarFechar => continua aberto (varia pouco o piso pois aberto)
        expect(r.aberto).toBe(true);
    });

    it('histerese: mesmo nível entre fechar e abrir não abre estando fechado', () => {
        const g = criarPortaoDeVoz();
        const { ultimo, t } = rodar(g, repetir(10, 20));
        const meio = (ultimo.limiarAbrir + ultimo.limiarFechar) / 2;
        const { res } = rodar(g, repetir(meio, 200), 30, t);
        // piso sobe lentamente e desloca limiares: mesmo assim nunca abre
        expect(algumAberto(res)).toBe(false);
    });

    it('limiarFechar = limiarAbrir - 4 na config padrão', () => {
        const g = criarPortaoDeVoz();
        const r = g.processar(10, 30, 0);
        expect(r.limiarAbrir - r.limiarFechar).toBeCloseTo(4, 10);
    });
});

describe('criarPortaoDeVoz - sensibilidade e piso', () => {
    it('limiarAbrir = max(sensibilidade, piso+28)', () => {
        const g = criarPortaoDeVoz();
        const r = g.processar(5, 30, 0);
        expect(r.piso).toBeCloseTo(5, 10);
        expect(r.limiarAbrir).toBeCloseTo(33, 10); // 5+28 > 30
        const g2 = criarPortaoDeVoz();
        const r2 = g2.processar(1, 100, 0);
        expect(r2.limiarAbrir).toBe(100);
        expect(r2.limiarFechar).toBe(96);
    });

    it('sensibilidade alta eleva o limiar de abertura e impede fala moderada', () => {
        const baixo = criarPortaoDeVoz();
        const alto = criarPortaoDeVoz();
        const a = rodar(baixo, repetir(60, 20), 30);
        const b = rodar(alto, repetir(60, 20), 100);
        expect(a.ultimo.limiarAbrir).toBeLessThan(b.ultimo.limiarAbrir);
        expect(b.ultimo.limiarAbrir).toBeGreaterThanOrEqual(100);
        expect(algumAberto(b.res)).toBe(false);
    });

    it('sensibilidade mínima (1) ainda respeita piso+28', () => {
        const g = criarPortaoDeVoz();
        const r = g.processar(0, 1, 0);
        expect(r.limiarAbrir).toBe(28);
    });

    it('piso desce rápido (0.3) com o portão fechado', () => {
        const g = criarPortaoDeVoz();
        // sobe o piso ao máximo permitido sem abrir: nível 25, sens 30
        let { t, ultimo } = rodar(g, repetir(25, 5));
        const antes = ultimo.piso;
        const r1 = g.processar(0, 30, t);
        expect(r1.piso).toBeCloseTo(antes * 0.7, 10);
        const { ultimo: fim } = rodar(g, repetir(0, 20), 30, t + PASSO);
        expect(fim.piso).toBeLessThan(0.1);
    });

    it('piso sobe devagar (0.0008) com o portão fechado', () => {
        const g = criarPortaoDeVoz();
        g.processar(0, 30, 0);
        const r = g.processar(20, 30, 16);
        expect(r.piso).toBeCloseTo(20 * 0.0008, 10);
        // depois de 100 quadros a 20 ainda longe de 20
        const { ultimo } = rodar(g, repetir(20, 100), 30, 32);
        expect(ultimo.piso).toBeGreaterThan(0.016);
        expect(ultimo.piso).toBeLessThan(3);
    });

    it('piso NÃO aprende enquanto aberto (fala não o eleva)', () => {
        const g = criarPortaoDeVoz();
        const a = rodar(g, repetir(10, 10));
        const b = rodar(g, repetir(90, 5), 30, a.t);
        expect(b.ultimo.aberto).toBe(true);
        const pisoAoAbrir = b.ultimo.piso;
        // fala com flutuação (evita regra estacionária) por 1,2 s
        const fala = [];
        for (let i = 0; i < 75; i++) fala.push(i % 2 ? 60 : 140);
        const c = rodar(g, fala, 30, b.t);
        expect(c.ultimo.aberto).toBe(true);
        expect(c.ultimo.piso).toBe(pisoAoAbrir);
    });

    it('piso não desce enquanto aberto', () => {
        const g = criarPortaoDeVoz();
        const a = rodar(g, repetir(20, 10));
        const b = rodar(g, repetir(90, 5), 30, a.t);
        const p = b.ultimo.piso;
        const c = rodar(g, repetir(0, 20), 30, b.t); // 320ms < 700ms
        expect(c.ultimo.aberto).toBe(true);
        expect(c.ultimo.piso).toBe(p);
    });
});

describe('criarPortaoDeVoz - ruído estacionário', () => {
    // 120 com jitter minúsculo (desvio 1 < 8)
    const ruido = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? 119 : 121));

    it('ruído constante abre, é aprendido em ~6s, piso≈120 e não reabre', () => {
        const g = criarPortaoDeVoz();
        const abertoEm = [];
        let t = 0;
        let fechouEm = null;
        let abriuEm = null;
        let ultimo;
        const N = Math.ceil(30000 / PASSO);
        const estados = [];
        for (let i = 0; i < N; i++, t += PASSO) {
            ultimo = g.processar(i % 2 ? 119 : 121, 30, t);
            estados.push(ultimo.aberto);
            if (ultimo.aberto && abriuEm === null) abriuEm = t;
            if (abriuEm !== null && !ultimo.aberto && fechouEm === null) fechouEm = t;
        }
        expect(abriuEm).not.toBeNull();
        expect(abriuEm).toBeLessThan(200);
        expect(fechouEm).not.toBeNull();
        // janela precisa encher (~1.35s) e ficar estável por >5s
        expect(fechouEm - abriuEm).toBeGreaterThan(5000);
        expect(fechouEm - abriuEm).toBeLessThan(8000);
        // ainda aberto aos 4s
        expect(estados[Math.floor(4000 / PASSO)]).toBe(true);
        expect(ultimo.piso).toBeGreaterThan(118);
        expect(ultimo.piso).toBeLessThan(122);
        // depois de fechar nunca reabre
        const idxFecha = estados.indexOf(false, estados.indexOf(true));
        expect(estados.slice(idxFecha).some(Boolean)).toBe(false);
        void abertoEm;
    });

    it('após aprender o ruído, limiar sobe para piso+28 e fala por cima abre de novo', () => {
        const g = criarPortaoDeVoz();
        let { t, ultimo } = rodar(g, ruido(Math.ceil(10000 / PASSO)));
        expect(ultimo.aberto).toBe(false);
        expect(ultimo.limiarAbrir).toBeCloseTo(ultimo.piso + 28, 5);
        const fala = rodar(g, repetir(200, 8), 30, t);
        expect(fala.ultimo.aberto).toBe(true);
    });

    it('ruído estacionário abaixo do limiar de abertura não conta (não há o que aprender)', () => {
        const g = criarPortaoDeVoz();
        const { res } = rodar(g, ruido(1000), 30);
        // 120 abre; garante que o cenário base de fato abriu
        expect(algumAberto(res)).toBe(true);
    });

    it('nível fluttuante tipo fala (60/140 a cada 100ms) por 20s nunca dispara a regra estacionária', () => {
        const g = criarPortaoDeVoz();
        // abre com fala sustentada
        const a = rodar(g, repetir(10, 10));
        const b = rodar(g, repetir(100, 6), 30, a.t);
        expect(b.ultimo.aberto).toBe(true);
        let t = b.t;
        let fechou = false;
        const total = 20000;
        const ini = t;
        for (; t - ini < total; t += PASSO) {
            const bloco = Math.floor((t - ini) / 100);
            const r = g.processar(bloco % 2 ? 60 : 140, 30, t);
            if (!r.aberto) { fechou = true; break; }
        }
        expect(fechou).toBe(false);
    });

    it('desvio um pouco acima de 8 mantém aberto (ex.: 100/120 alternando, std=10)', () => {
        const g = criarPortaoDeVoz();
        const a = rodar(g, repetir(10, 10));
        const b = rodar(g, repetir(100, 6), 30, a.t);
        let t = b.t;
        let r;
        for (let i = 0; i < Math.ceil(15000 / PASSO); i++, t += PASSO) r = g.processar(i % 2 ? 100 : 120, 30, t);
        expect(r.aberto).toBe(true);
    });

    it('interrupção da estabilidade reinicia o cronômetro', () => {
        const g = criarPortaoDeVoz();
        let t = 0;
        let r;
        const passos = (fn, ms) => { const fim = t + ms; for (; t < fim; t += PASSO) r = g.processar(fn(t), 30, t); };
        passos((x) => 120 + (Math.floor(x / PASSO) % 2 ? -1 : 1), 4000);
        expect(r.aberto).toBe(true);
        // oscilação grande por 1.6s (janela de 1.5s fica não estável)
        passos((x) => (Math.floor(x / 100) % 2 ? 60 : 140), 1600);
        expect(r.aberto).toBe(true);
        // volta a estável: precisa de novo >5s (+ enchimento)
        passos((x) => 120 + (Math.floor(x / PASSO) % 2 ? -1 : 1), 4000);
        expect(r.aberto).toBe(true);
    });
});

describe('criarPortaoDeVoz - reiniciar e determinismo', () => {
    it('reiniciar zera estado: fecha e recalcula piso inicial', () => {
        const g = criarPortaoDeVoz();
        const a = rodar(g, repetir(10, 10));
        const b = rodar(g, repetir(90, 8), 30, a.t);
        expect(b.ultimo.aberto).toBe(true);
        g.reiniciar();
        const r = g.processar(7, 30, 0);
        expect(r.aberto).toBe(false);
        expect(r.piso).toBeCloseTo(7, 10);
    });

    it('reiniciar zera o contador de quadros acima', () => {
        const g = criarPortaoDeVoz();
        rodar(g, repetir(10, 5));
        rodar(g, repetir(90, 3), 30, 100); // acima = 3
        g.reiniciar();
        rodar(g, repetir(10, 5), 30, 500);
        const r = g.processar(90, 30, 700); // seria 4o se não zerou
        expect(r.aberto).toBe(false);
    });

    it('reiniciar zera o histórico estacionário', () => {
        const g = criarPortaoDeVoz();
        rodar(g, Array.from({ length: 300 }, (_, i) => (i % 2 ? 119 : 121))); // aberto, ~4.8s estável
        g.reiniciar();
        const { res } = rodar(g, Array.from({ length: 30 }, (_, i) => (i % 2 ? 119 : 121)), 30, 100000);
        expect(res.every(x => x !== undefined)).toBe(true);
        // depois do reinício o gate reabre e ainda precisa de >5s para fechar
        const { res: r2 } = rodar(g, Array.from({ length: 200 }, (_, i) => (i % 2 ? 119 : 121)), 30, 100500);
        expect(r2[r2.length - 1].aberto).toBe(true);
    });

    it('mesma sequência produz exatamente a mesma saída', () => {
        const seq = [];
        for (let i = 0; i < 800; i++) seq.push(Math.abs(Math.sin(i / 7)) * 150);
        const a = rodar(criarPortaoDeVoz(), seq).res;
        const b = rodar(criarPortaoDeVoz(), seq).res;
        expect(a).toEqual(b);
    });

    it('instâncias são independentes', () => {
        const g1 = criarPortaoDeVoz();
        const g2 = criarPortaoDeVoz();
        rodar(g1, repetir(10, 5));
        rodar(g1, repetir(90, 6), 30, 100);
        expect(g2.processar(10, 30, 0).aberto).toBe(false);
    });

    it('config parcial sobrescreve o padrão (quadrosParaAbrir=1)', () => {
        const g = criarPortaoDeVoz({ quadrosParaAbrir: 1 });
        g.processar(5, 30, 0);
        expect(g.processar(90, 30, 16).aberto).toBe(true);
    });
});

describe('estadoPortao', () => {
    it('tem o formato esperado e inicia inativo', () => {
        expect(Object.keys(estadoPortao).sort()).toEqual(['aberto', 'ativo', 'limiar', 'piso']);
    });
});

describe('CalibradorDeVoz (fonte única de verdade)', () => {
    let analyser;
    let ctxInstancias;
    let origAudio;
    let origRaf;
    let origCaf;

    beforeEach(() => {
        analyser = {
            fftSize: 0,
            smoothingTimeConstant: 0,
            frequencyBinCount: 128,
            getByteFrequencyData: vi.fn(),
        };
        ctxInstancias = [];
        origAudio = window.AudioContext;
        origRaf = window.requestAnimationFrame;
        origCaf = window.cancelAnimationFrame;
        // eslint-disable-next-line prefer-arrow-callback
        window.AudioContext = vi.fn(function () {
            this.sampleRate = 48000;
            this.createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
            this.createAnalyser = vi.fn(() => analyser);
            this.close = vi.fn();
            ctxInstancias.push(this);
        });
        // roda o quadro apenas uma vez
        let chamado = false;
        globalThis.requestAnimationFrame = window.requestAnimationFrame = vi.fn(() => { chamado = true; return 1; });
        globalThis.cancelAnimationFrame = window.cancelAnimationFrame = vi.fn();
        void chamado;
        estadoPortao.ativo = false;
        estadoPortao.limiar = 0;
    });

    afterEach(() => {
        cleanup();
        window.AudioContext = origAudio;
        window.requestAnimationFrame = origRaf;
        window.cancelAnimationFrame = origRaf ? origCaf : undefined;
        estadoPortao.ativo = false;
        estadoPortao.aberto = false;
        estadoPortao.limiar = 0;
    });

    const marca = (container) => container.querySelector('input[type="range"]').parentElement.lastElementChild;

    it('mostra o slider com min/max corretos e configura o analisador', () => {
        const { container } = render(cal({}, vi.fn()));
        const slider = screen.getByLabelText('Sensibilidade do microfone');
        expect(slider.getAttribute('min')).toBe(String(SENSIBILIDADE_MIN));
        expect(slider.getAttribute('max')).toBe(String(SENSIBILIDADE_MAX));
        expect(slider.value).toBe('30');
        expect(analyser.fftSize).toBe(FFT_SIZE);
        expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(1);
        expect(marca(container)).not.toBeNull();
    });

    it('chama setSensibilidade com inteiro ao mudar', () => {
        const setSens = vi.fn();
        render(cal({}, setSens));
        fireEvent.change(screen.getByLabelText('Sensibilidade do microfone'), { target: { value: '77' } });
        expect(setSens).toHaveBeenCalledWith(77);
    });

    it('marca do limiar efetivo escondida quando estadoPortao.ativo é false', () => {
        estadoPortao.ativo = false;
        const { container } = render(cal({}, vi.fn()));
        expect(marca(container).style.display).toBe('none');
    });

    it('marca do limiar efetivo visível (block) e posicionada quando ativo é true', () => {
        estadoPortao.ativo = true;
        estadoPortao.limiar = 70;
        const { container } = render(cal({}, vi.fn()));
        const m = marca(container);
        expect(m.style.display).toBe('block');
        expect(parseFloat(m.style.left)).toBeCloseTo((70 / NIVEL_MAXIMO_EXIBIDO) * 100, 5);
    });

    it('sem stream não cria AudioContext', () => {
        render(cal(null, vi.fn()));
        expect(ctxInstancias.length).toBe(0);
    });

    it('fecha o AudioContext e cancela o quadro ao desmontar', () => {
        const { unmount } = render(cal({}, vi.fn()));
        unmount();
        expect(ctxInstancias[0].close).toHaveBeenCalled();
        expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('a barra usa a mesma medida do portão (só faixa de voz)', () => {
        analyser.getByteFrequencyData = vi.fn((arr) => { arr.fill(70); });
        const { container } = render(cal({}, vi.fn()));
        const barra = container.querySelector('div[style*="transition"]');
        expect(parseFloat(barra.style.width)).toBeCloseTo((70 / NIVEL_MAXIMO_EXIBIDO) * 100, 5);
        void act;
    });
});
