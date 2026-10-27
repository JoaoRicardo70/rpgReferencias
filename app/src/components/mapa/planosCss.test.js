import { describe, it, expect } from 'vitest';
import { CSS_PLANOS } from './planosCss';

// As cidadelas ficam só na área livre do reino: não podem cobrir a Ordem (esquerda), o aro dos Planos Internos nem os rótulos.
function caixa(classe) {
    const bloco = new RegExp(`\\.${classe} \\{([^}]*)\\}`).exec(CSS_PLANOS);
    expect(bloco, `regra .${classe}`).toBeTruthy();
    const n = (prop) => parseFloat(new RegExp(`${prop}: ([0-9.]+)%`).exec(bloco[1])[1]);
    return { esq: n('left'), topo: n('top'), larg: n('width'), alt: n('height') };
}

// Plano da Ordem no mapa: left 6.4%, top 41%, 11% x 18%.
const ORDEM = { topo: 41, base: 59 };

describe('cidadelas do Mapa dos Planos', () => {
    it('os dois castelos existem como imagem SVG', () => {
        expect(CSS_PLANOS).toMatch(/\.planos-castelo-ceus \{[^}]*background-image: url\("data:image\/svg\+xml/);
        expect(CSS_PLANOS).toMatch(/\.planos-castelo-inferno \{[^}]*background-image: url\("data:image\/svg\+xml/);
    });

    it('Céus: termina acima do Plano da Ordem e não chega ao aro (lado direito)', () => {
        const c = caixa('planos-castelo-ceus');
        expect(c.topo + c.alt).toBeLessThanOrEqual(ORDEM.topo);
        expect(c.esq + c.larg).toBeLessThanOrEqual(31);
        expect(c.topo).toBeGreaterThanOrEqual(8);
    });

    it('Inferno: começa abaixo do Plano da Ordem, fica à esquerda do aro e acima do rótulo "Inferno"', () => {
        const c = caixa('planos-castelo-inferno');
        expect(c.topo).toBeGreaterThanOrEqual(ORDEM.base);
        expect(c.esq + c.larg).toBeLessThanOrEqual(33);
        expect(c.topo + c.alt).toBeLessThanOrEqual(83);
    });

    it('as caixas respeitam a proporção do desenho (nada é esticado)', () => {
        // O palco é 5:3; a proporção em pixels é (larg*5)/(alt*3).
        const ceus = caixa('planos-castelo-ceus');
        const inf = caixa('planos-castelo-inferno');
        expect((ceus.larg * 5) / (ceus.alt * 3)).toBeCloseTo(100 / 80, 1);
        expect((inf.larg * 5) / (inf.alt * 3)).toBeCloseTo(100 / 60, 1);
    });
});
