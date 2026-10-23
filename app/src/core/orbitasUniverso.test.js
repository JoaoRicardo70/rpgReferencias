import { describe, it, expect } from 'vitest';
import {
    segmentosDoOito, amostrarTrilha, posicaoNaTrilha, escolherFases, folgaMinimaGeral, folgaAteObstaculos,
    atrasoDaFase, cicloComum, segundosDe
} from './orbitasUniverso';

// Mesma configuracao do MapaMundi.jsx
const CX = 500, CY = 250, DIST = 250;
const CONFIG = {
    terra0: { rx: 160, ry: 245 }, vegeta: { rx: 200, ry: 250 }, namekusei: { rx: 130, ry: 200 }, desconhecido: { rx: 250, ry: 300 }
};
const TAMANHOS = { terra0: 110, vegeta: 45, namekusei: 50, desconhecido: 40 };
const trilhaDe = (id, cfg = CONFIG) => amostrarTrilha(segmentosDoOito(CX, CY, DIST + cfg[id].rx, cfg[id].ry));
const raioDe = (id) => (id === 'terra0' ? TAMANHOS[id] * 1.15 : TAMANHOS[id] / 2);
const corposDoMapa = (cfg = CONFIG) => ['terra0', 'vegeta', 'namekusei', 'desconhecido'].map(id => ({ id, trilha: trilhaDe(id, cfg), periodo: '40s', raio: raioDe(id) }));
const ESTRELAS = [{ x: 250, y: 250, raio: 90 }, { x: 750, y: 250, raio: 90 }];

describe('segmentosDoOito / amostrarTrilha / posicaoNaTrilha', () => {
    it('gera 4 segmentos de Bezier que formam um circuito fechado pelo centro', () => {
        const seg = segmentosDoOito(CX, CY, 400, 200);
        expect(seg).toHaveLength(4);
        expect(seg[0][0]).toEqual([CX, CY]);
        expect(seg[3][3]).toEqual([CX, CY]);
        for (let i = 0; i < 3; i++) expect(seg[i][3]).toEqual(seg[i + 1][0]);
    });
    it('trilha tem comprimento positivo e acumulado crescente', () => {
        const t = trilhaDe('terra0');
        expect(t.total).toBeGreaterThan(0);
        expect(t.pontos).toHaveLength(t.acumulado.length);
        for (let i = 1; i < t.acumulado.length; i++) expect(t.acumulado[i]).toBeGreaterThanOrEqual(t.acumulado[i - 1]);
        expect(t.acumulado[t.acumulado.length - 1]).toBeCloseTo(t.total, 8);
    });
    it('posicaoNaTrilha: fracao 0 e 1 ficam no centro, e da voltas (modulo)', () => {
        const t = trilhaDe('vegeta');
        expect(posicaoNaTrilha(t, 0)).toEqual([CX, CY]);
        const p1 = posicaoNaTrilha(t, 1);
        expect(p1[0]).toBeCloseTo(CX, 6); expect(p1[1]).toBeCloseTo(CY, 6);
        const a = posicaoNaTrilha(t, 0.3), b = posicaoNaTrilha(t, 1.3), c = posicaoNaTrilha(t, -0.7);
        expect(b[0]).toBeCloseTo(a[0], 6); expect(c[0]).toBeCloseTo(a[0], 6);
        expect(c[1]).toBeCloseTo(a[1], 6);
    });
    it('a trilha alcanca +-raioX no eixo X (pontas do oito)', () => {
        const t = trilhaDe('terra0');
        const xs = t.pontos.map(p => p[0]);
        expect(Math.max(...xs)).toBeCloseTo(CX + DIST + 160, 6);
        expect(Math.min(...xs)).toBeCloseTo(CX - DIST - 160, 6);
    });
});

describe('segundosDe / cicloComum', () => {
    it('converte "40s" e numeros', () => {
        expect(segundosDe('40s')).toBe(40);
        expect(segundosDe(25)).toBe(25);
        expect(segundosDe('12.6s')).toBe(13);
    });
    it('invalidos e nao positivos viram 1', () => {
        [undefined, null, '', 'abc', 0, -5, NaN].forEach(v => expect(segundosDe(v)).toBe(1));
    });
    it('periodos iguais -> ciclo igual ao periodo', () => {
        expect(cicloComum(['40s', '40s', '40s', '40s'])).toBe(40);
    });
    it('periodos diferentes -> minimo multiplo comum', () => {
        expect(cicloComum(['4s', '6s'])).toBe(12);
    });
    it('e limitado ao maximo', () => {
        expect(cicloComum([97, 89, 83])).toBe(1200);
        expect(cicloComum([97, 89, 83], 500)).toBe(500);
    });
    it('lista vazia da 1', () => { expect(cicloComum([])).toBe(1); });
});

describe('escolherFases com as 4 trilhas do MapaMundi', () => {
    const corpos = corposDoMapa();
    const fases = escolherFases(corpos, { candidatos: 96 });

    it('devolve uma fase 0-1 por astro e o primeiro fica com a fase inicial', () => {
        expect(Object.keys(fases).sort()).toEqual(['desconhecido', 'namekusei', 'terra0', 'vegeta']);
        Object.values(fases).forEach(f => { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1); });
        expect(fases.terra0).toBe(0);
        expect(escolherFases(corpos, { faseInicial: 0.25 }).terra0).toBe(0.25);
    });
    it('folgaMinimaGeral > 50 (nenhum par chega perto)', () => {
        expect(folgaMinimaGeral(corpos, fases)).toBeGreaterThan(50);
    });
    it('e melhor que todos juntos na fase 0 (que se cruzam no centro)', () => {
        const zeros = { terra0: 0, vegeta: 0, namekusei: 0, desconhecido: 0 };
        expect(folgaMinimaGeral(corpos, fases)).toBeGreaterThan(folgaMinimaGeral(corpos, zeros));
    });
    it('deterministico', () => {
        expect(escolherFases(corpos, { candidatos: 96 })).toEqual(fases);
    });
    it('lista vazia ou invalida -> objeto vazio; um astro so -> fase inicial', () => {
        expect(escolherFases([])).toEqual({});
        expect(escolherFases(null)).toEqual({});
        expect(escolherFases([corpos[0]])).toEqual({ terra0: 0 });
    });
    it('folgaMinimaGeral com um unico astro e Infinity', () => {
        expect(folgaMinimaGeral([corpos[0]], { terra0: 0 })).toBe(Infinity);
    });
});

describe('folgaAteObstaculos (estrelas)', () => {
    it('trilhas novas de terra0 e namekusei tem folga >= 8 contra as estrelas', () => {
        ['terra0', 'namekusei'].forEach(id => {
            // raio do corpo em si (a Terra sem o anel das luas, que so conta contra outros astros)
            expect(folgaAteObstaculos(trilhaDe(id), TAMANHOS[id] / 2, ESTRELAS)).toBeGreaterThanOrEqual(8);
        });
    });
    it('sem obstaculos a folga e Infinity', () => {
        expect(folgaAteObstaculos(trilhaDe('terra0'), 10, [])).toBe(Infinity);
    });
    it('folga diminui quando o astro cresce', () => {
        const t = trilhaDe('vegeta');
        expect(folgaAteObstaculos(t, 50, ESTRELAS)).toBeLessThan(folgaAteObstaculos(t, 10, ESTRELAS));
    });
    it('trilha por cima da estrela da folga negativa', () => {
        const t = amostrarTrilha(segmentosDoOito(CX, CY, 250, 100));
        expect(folgaAteObstaculos(t, 30, ESTRELAS)).toBeLessThan(0);
    });
});

describe('atrasoDaFase', () => {
    it('e negativo e menor que o periodo (em valor absoluto)', () => {
        const s = atrasoDaFase(0.5, '40s');
        expect(s).toBe('-20.000s');
        const n = parseFloat(s);
        expect(n).toBeLessThan(0);
        expect(Math.abs(n)).toBeLessThan(40);
        expect(parseFloat(atrasoDaFase(0.99, '40s'))).toBeGreaterThan(-40);
    });
    it('fase 0 -> zero; fase >= 1 da a volta', () => {
        expect(parseFloat(atrasoDaFase(0, '40s'))).toBeCloseTo(0, 8);
        expect(atrasoDaFase(1.25, '40s')).toBe(atrasoDaFase(0.25, '40s'));
    });
    it('periodo invalido cai em 1s', () => {
        expect(atrasoDaFase(0.5, 'xx')).toBe('-0.500s');
    });
});
