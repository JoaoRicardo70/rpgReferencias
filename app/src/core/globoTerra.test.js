import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    CONTINENTES_RUNETERRA,
    ILHAS_RUNETERRA,
    pontosDoCaminho,
    sorteadorComSemente,
    costaOrganica
} from './globoTerra.js';

describe('pontosDoCaminho', () => {
    it('le um caminho M/L/Z em pares [x, y]', () => {
        expect(pontosDoCaminho('M 1 2 L 3 4 L 5 6 Z')).toEqual([[1, 2], [3, 4], [5, 6]]);
    });
    it('aceita decimais e negativos', () => {
        expect(pontosDoCaminho('M -1.5 2.25 L 3 -4.75 Z')).toEqual([[-1.5, 2.25], [3, -4.75]]);
    });
    it('devolve [] para vazio, null e undefined', () => {
        expect(pontosDoCaminho('')).toEqual([]);
        expect(pontosDoCaminho(null)).toEqual([]);
        expect(pontosDoCaminho(undefined)).toEqual([]);
    });
    it('ignora numero sobrando (quantidade impar)', () => {
        expect(pontosDoCaminho('M 1 2 L 3')).toEqual([[1, 2]]);
    });
});

describe('sorteadorComSemente', () => {
    it('e deterministico para a mesma semente', () => {
        const a = sorteadorComSemente(42);
        const b = sorteadorComSemente(42);
        const sa = Array.from({ length: 20 }, () => a());
        const sb = Array.from({ length: 20 }, () => b());
        expect(sa).toEqual(sb);
    });
    it('gera valores em [0, 1)', () => {
        const r = sorteadorComSemente(7);
        for (let i = 0; i < 2000; i++) {
            const v = r();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
    it('sementes diferentes divergem', () => {
        const a = sorteadorComSemente(1);
        const b = sorteadorComSemente(2);
        const sa = Array.from({ length: 10 }, () => a());
        const sb = Array.from({ length: 10 }, () => b());
        expect(sa).not.toEqual(sb);
    });
    it('chamadas sucessivas variam', () => {
        const r = sorteadorComSemente(5);
        expect(r()).not.toBe(r());
    });
});

describe('costaOrganica', () => {
    const quadrado = [[0, 0], [10, 0], [10, 10], [0, 10]];

    it('numero de pontos = n * 2^niveis', () => {
        for (const niveis of [1, 2, 3, 4]) {
            const r = costaOrganica(quadrado, sorteadorComSemente(1), { niveis });
            expect(r.length).toBe(quadrado.length * 2 ** niveis);
        }
        expect(costaOrganica(quadrado, sorteadorComSemente(1)).length).toBe(32);
    });
    it('mantem os vertices originais (posicoes pares e multiplos de 2^niveis)', () => {
        const niveis = 3;
        const r = costaOrganica(quadrado, sorteadorComSemente(9), { niveis });
        quadrado.forEach((p, i) => expect(r[i * 2 ** niveis]).toEqual(p));
        for (let i = 1; i < r.length; i += 2) expect(r[i]).toBeDefined();
        const r1 = costaOrganica(quadrado, sorteadorComSemente(9), { niveis: 1 });
        quadrado.forEach((p, i) => expect(r1[i * 2]).toEqual(p));
    });
    it('e deterministico com a mesma semente e muda com outra', () => {
        const a = costaOrganica(quadrado, sorteadorComSemente(3));
        const b = costaOrganica(quadrado, sorteadorComSemente(3));
        const c = costaOrganica(quadrado, sorteadorComSemente(4));
        expect(a).toEqual(b);
        expect(a).not.toEqual(c);
    });
    it('niveis=0 devolve o mesmo poligono', () => {
        const r = costaOrganica(quadrado, sorteadorComSemente(1), { niveis: 0 });
        expect(r).toEqual(quadrado);
    });
    it('amplitude 0 deixa os pontos medios exatamente no meio', () => {
        const r = costaOrganica(quadrado, sorteadorComSemente(1), { niveis: 1, amplitude: 0 });
        expect(r).toEqual([[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]);
    });
    it('nao altera o array de entrada', () => {
        const copia = JSON.parse(JSON.stringify(quadrado));
        costaOrganica(quadrado, sorteadorComSemente(1));
        expect(quadrado).toEqual(copia);
    });
    it('lista vazia devolve lista vazia', () => {
        expect(costaOrganica([], sorteadorComSemente(1))).toEqual([]);
    });
});

describe('dados de Runeterra', () => {
    it('ha continentes e cada caminho vira >= 3 pontos dentro de 0..200', () => {
        expect(CONTINENTES_RUNETERRA.length).toBeGreaterThan(0);
        for (const caminho of CONTINENTES_RUNETERRA) {
            const pts = pontosDoCaminho(caminho);
            expect(pts.length).toBeGreaterThanOrEqual(3);
            for (const [x, y] of pts) {
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThanOrEqual(200);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThanOrEqual(200);
            }
        }
    });
    it('caminhos comecam com M e terminam com Z', () => {
        for (const c of CONTINENTES_RUNETERRA) {
            expect(c.trim().startsWith('M')).toBe(true);
            expect(c.trim().endsWith('Z')).toBe(true);
        }
    });
    it('ilhas tem 4 numeros positivos e ficam dentro da caixa', () => {
        expect(ILHAS_RUNETERRA.length).toBeGreaterThan(0);
        for (const [cx, cy, rx, ry] of ILHAS_RUNETERRA) {
            expect(rx).toBeGreaterThan(0);
            expect(ry).toBeGreaterThan(0);
            expect(cx - rx).toBeGreaterThanOrEqual(0);
            expect(cx + rx).toBeLessThanOrEqual(200);
            expect(cy - ry).toBeGreaterThanOrEqual(0);
            expect(cy + ry).toBeLessThanOrEqual(200);
        }
    });
});

describe('webglDisponivel', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    async function carregar() {
        vi.resetModules();
        return (await import('./globoTerra.js')).webglDisponivel;
    }

    it('em jsdom (sem WebGL) devolve false', async () => {
        const webglDisponivel = await carregar();
        expect(webglDisponivel()).toBe(false);
    });
    it('devolve true quando getContext devolve objeto com getParameter', async () => {
        const webglDisponivel = await carregar();
        vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => ({ getParameter: () => 1 }) });
        expect(webglDisponivel()).toBe(true);
    });
    it('devolve false se o contexto nao tem getParameter', async () => {
        const webglDisponivel = await carregar();
        vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => ({}) });
        expect(webglDisponivel()).toBe(false);
    });
    it('devolve false quando getContext lanca excecao', async () => {
        const webglDisponivel = await carregar();
        vi.spyOn(document, 'createElement').mockReturnValue({
            getContext: () => { throw new Error('sem webgl'); }
        });
        expect(webglDisponivel()).toBe(false);
    });
    it('tenta webgl2 e cai para webgl', async () => {
        const webglDisponivel = await carregar();
        const getContext = vi.fn((tipo) => (tipo === 'webgl' ? { getParameter: () => 1 } : null));
        vi.spyOn(document, 'createElement').mockReturnValue({ getContext });
        expect(webglDisponivel()).toBe(true);
        expect(getContext).toHaveBeenCalledWith('webgl2');
        expect(getContext).toHaveBeenCalledWith('webgl');
    });
    it('guarda o resultado em cache (nao recria canvas)', async () => {
        const webglDisponivel = await carregar();
        const spy = vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => ({ getParameter: () => 1 }) });
        webglDisponivel();
        webglDisponivel();
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
