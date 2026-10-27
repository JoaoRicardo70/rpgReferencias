import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSS_PLANOS } from './planosCss';

// As cidadelas ficam só na área livre do reino: não podem cobrir a Ordem (esquerda), o aro dos Planos Internos nem os rótulos.
function caixa(classe) {
    const bloco = new RegExp(`\\.${classe} \\{([^}]*)\\}`).exec(CSS_PLANOS);
    expect(bloco, `regra .${classe}`).toBeTruthy();
    const n = (prop) => parseFloat(new RegExp(`${prop}: ([0-9.]+)%`).exec(bloco[1])[1]);
    return { esq: n('left'), topo: n('top'), larg: n('width'), alt: n('height') };
}

// Plano da Ordem no mapa: left 6.4%, top 41%, 11% x 18%.
const ORDEM = { topo: 41, base: 59, dir: 17.4 };
const DIVISA = 50;

describe('cidadelas do Mapa dos Planos', () => {
    it('ficam atrás do aro dos Planos Internos (parte escondida, nada na frente)', () => {
        const z = (sel) => parseInt(new RegExp(`\\.${sel} \\{[^}]*z-index: (\\d+)`).exec(CSS_PLANOS)[1], 10);
        // acima das zonas Céus/Inferno (camada 2); no mesmo nível do aro, mas antes dele no DOM (MapaMundi.jsx)
        expect(z('planos-castelo')).toBeGreaterThan(z('planos-reino'));
        expect(z('planos-castelo')).toBeLessThanOrEqual(z('planos-aro-fundo'));
        const jsx = readFileSync('src/components/mapa/MapaMundi.jsx', 'utf8');
        expect(jsx.indexOf('planos-castelo-ceus')).toBeLessThan(jsx.indexOf('planos-aro-fundo'));
        expect(jsx.indexOf('planos-castelo-inferno')).toBeLessThan(jsx.indexOf('planos-aro-fundo'));
    });

    it('os dois castelos existem como imagem SVG', () => {
        expect(CSS_PLANOS).toMatch(/\.planos-castelo-ceus \{[^}]*background-image: url\("data:image\/svg\+xml/);
        expect(CSS_PLANOS).toMatch(/\.planos-castelo-inferno \{[^}]*background-image: url\("data:image\/svg\+xml/);
    });

    it('Céus: fica acima da divisa, à direita da Ordem e não passa do centro do aro', () => {
        const c = caixa('planos-castelo-ceus');
        expect(c.topo + c.alt).toBeLessThanOrEqual(DIVISA);
        expect(c.esq + c.larg).toBeLessThanOrEqual(46);
        expect(c.topo).toBeGreaterThanOrEqual(10);
        expect(c.esq).toBeGreaterThanOrEqual(ORDEM.dir);
    });

    it('Inferno: começa abaixo da divisa, sem tocar a Ordem, e termina acima do rótulo "Inferno"', () => {
        const c = caixa('planos-castelo-inferno');
        expect(c.topo).toBeGreaterThan(DIVISA);
        expect(c.esq + c.larg).toBeLessThanOrEqual(46);
        expect(c.topo + c.alt).toBeLessThanOrEqual(87);
        // a caixa invade a faixa da Ordem, mas o desenho começa ~10% dentro dela (montanha), sem tocar o planeta
        expect(c.esq + c.larg * 0.1).toBeGreaterThanOrEqual(ORDEM.dir - 2);
    });

    it('as caixas respeitam a proporção do desenho (nada é esticado)', () => {
        // O palco é 5:3; a proporção em pixels é (larg*5)/(alt*3).
        const ceus = caixa('planos-castelo-ceus');
        const inf = caixa('planos-castelo-inferno');
        expect((ceus.larg * 5) / (ceus.alt * 3)).toBeCloseTo(160 / 150, 1);
        expect((inf.larg * 5) / (inf.alt * 3)).toBeCloseTo(100 / 60, 1);
    });
});
