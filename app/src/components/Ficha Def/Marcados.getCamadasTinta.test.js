import { describe, it, expect } from 'vitest';
import { getCamadasTinta } from './Marcados';

// ---------------------------------------------------------------------------
// QA — getCamadasTinta(cor): cobertura de regressão pós-fix da Moldura de Avatar.
//
// O bug corrigido foi puramente JSX/CSS (uma camada extra 'multiply' de opacidade
// total, adicionada SOMENTE no bloco de tingimento da Moldura, ANTES das duas
// camadas já existentes vindas de getCamadasTinta). getCamadasTinta em si NÃO foi
// alterada — ela continua sendo a função pura compartilhada por Moldura, Ícone de
// Classe e Fundo. Este arquivo apenas confirma que:
//   1) o sentinela "sem tingimento" (null) continua correto para branco/vazio/nulo;
//   2) o formato {modo1, op1, modo2, op2} retornado para cores escuras e claras
//      continua sem regressão;
//   3) o módulo Marcados.jsx ainda importa/parseia normalmente e a função
//      nomeada (plural) continua exportada e chamável isoladamente.
//
// NOTA: NÃO existe teste de composição visual real de blend-mode aqui — jsdom não
// computa CSS blend compositing, então o efeito visual da correção (moldura branca
// finalmente recebendo matiz) não é (e não pode ser) verificado por teste unitário.
// Isso é coberto apenas por verificação manual/visual no browser real.
// ---------------------------------------------------------------------------

describe('getCamadasTinta — sentinela "sem tingimento" (null)', () => {
    it('retorna null para branco puro (#ffffff)', () => {
        expect(getCamadasTinta('#ffffff')).toBeNull();
    });

    it('retorna null para string vazia', () => {
        expect(getCamadasTinta('')).toBeNull();
    });

    it('retorna null para null', () => {
        expect(getCamadasTinta(null)).toBeNull();
    });

    it('retorna null para undefined', () => {
        expect(getCamadasTinta(undefined)).toBeNull();
    });

    it('retorna null para "transparent"', () => {
        expect(getCamadasTinta('transparent')).toBeNull();
    });
});

describe('getCamadasTinta — formato {modo1, op1, modo2, op2} sem regressão', () => {
    it('cor escura e saturada (#1a0033, roxo quase-preto) retorna modo1 "color" a 100% e modo2 "multiply" proporcional à escuridão', () => {
        const tinta = getCamadasTinta('#1a0033');
        expect(tinta).not.toBeNull();
        expect(tinta.modo1).toBe('color');
        expect(tinta.op1).toBe(1);
        expect(tinta.modo2).toBe('multiply');
        expect(tinta.op2).toBeGreaterThan(0);
        expect(tinta.op2).toBeLessThanOrEqual(0.9);
    });

    it('cor clara e saturada (#ffcc00, dourado) retorna modo1 "color" a 100% e modo2 "overlay" a 0.4', () => {
        const tinta = getCamadasTinta('#ffcc00');
        expect(tinta).toEqual({ modo1: 'color', op1: 1, modo2: 'overlay', op2: 0.4 });
    });

    it('opacidade de multiply nunca ultrapassa 0.9, mesmo para preto absoluto', () => {
        const tinta = getCamadasTinta('#000000');
        expect(tinta.modo2).toBe('multiply');
        expect(tinta.op2).toBeLessThanOrEqual(0.9);
    });

    it('hex malformado (comprimento != 6) cai no fallback seguro sem lançar erro', () => {
        expect(() => getCamadasTinta('#zzz')).not.toThrow();
        expect(getCamadasTinta('#zzz')).toEqual({ modo1: 'color', op1: 1, modo2: 'multiply', op2: 0 });
    });
});

describe('getCamadasTinta — módulo Marcados.jsx importa/parseia corretamente', () => {
    it('a função nomeada (plural) getCamadasTinta é exportada e chamável isoladamente', () => {
        expect(typeof getCamadasTinta).toBe('function');
        expect(() => getCamadasTinta('#00ffff')).not.toThrow();
    });
});
