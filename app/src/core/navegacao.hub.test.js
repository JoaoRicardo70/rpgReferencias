import { describe, it, expect } from 'vitest';
import { GRUPOS_NAVEGACAO, listarDestinos, DESTINO_HUB, posicaoNoCirculo, destinoDoAtalho } from './navegacao';

describe('navegacao - aba-combate', () => {
    it('esta no grupo Combate, em primeiro', () => {
        const g = GRUPOS_NAVEGACAO.find(x => x.id === 'combate');
        expect(g.abas[0].id).toBe('aba-combate');
        expect(listarDestinos().find(d => d.id === 'aba-combate').grupo).toBe('combate');
    });
});

describe('listarDestinos modo hub', () => {
    it('sem modo nao inclui o hub', () => expect(listarDestinos().some(d => d.id === 'aba-hub')).toBe(false));
    it('modo hub poe DESTINO_HUB em 1o', () => {
        const l = listarDestinos({ modo: 'hub' });
        expect(l[0].id).toBe(DESTINO_HUB.id);
        expect(l[0].grupo).toBe('hub');
    });
    it('hub + mestre: hub, mestre, resto', () => {
        const l = listarDestinos({ modo: 'hub', isMestre: true });
        expect(l[0].id).toBe('aba-hub');
        expect(l[1].id).toBe('aba-mestre');
    });
    it('outros modos nao incluem o hub', () => {
        ['orbe', 'mesa', 'barra'].forEach(modo => expect(listarDestinos({ modo }).some(d => d.id === 'aba-hub')).toBe(false));
    });
    it('nao muta DESTINO_HUB', () => {
        listarDestinos({ modo: 'hub' })[0].nome = 'x';
        expect(DESTINO_HUB.nome).toBe('Mesa (tela inicial)');
    });
});

describe('posicaoNoCirculo', () => {
    it('n=4: topo, direita, baixo, esquerda (horario)', () => {
        expect(posicaoNoCirculo(0, 4, 100)).toEqual({ x: 0, y: -100 });
        expect(posicaoNoCirculo(1, 4, 100)).toEqual({ x: 100, y: 0 });
        expect(posicaoNoCirculo(2, 4, 100)).toEqual({ x: 0, y: 100 });
        expect(posicaoNoCirculo(3, 4, 100)).toEqual({ x: -100, y: 0 });
    });
    it('n=1 fica no topo', () => expect(posicaoNoCirculo(0, 1, 50)).toEqual({ x: 0, y: -50 }));
    it('n=0 e seguro (sem NaN)', () => {
        const p = posicaoNoCirculo(0, 0, 50);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p).toEqual({ x: 0, y: -50 });
    });
    it('raio 0 fica no centro', () => {
        const p = posicaoNoCirculo(2, 5, 0);
        expect(Math.abs(p.x)).toBe(0);
        expect(Math.abs(p.y)).toBe(0);
    });
    it('todos os pontos ficam a distancia do raio', () => {
        for (let i = 0; i < 12; i++) {
            const { x, y } = posicaoNoCirculo(i, 12, 170);
            expect(Math.abs(Math.hypot(x, y) - 170)).toBeLessThan(1);
        }
    });
});

describe('destinoDoAtalho', () => {
    const l = listarDestinos({ modo: 'hub' });
    it('1 = primeiro, 2 = segundo', () => {
        expect(destinoDoAtalho(l, 1).id).toBe('aba-hub');
        expect(destinoDoAtalho(l, '2').id).toBe(l[1].id);
    });
    it('fora de 1..9 ou alem da lista = null', () => {
        expect(destinoDoAtalho(l, 0)).toBeNull();
        expect(destinoDoAtalho(l, 10)).toBeNull();
        expect(destinoDoAtalho(l, 'a')).toBeNull();
        expect(destinoDoAtalho([l[0]], 5)).toBeNull();
    });
});
