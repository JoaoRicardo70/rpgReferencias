import { describe, it, expect } from 'vitest';
import {
    PONTOS_VIDA_TOTAL_PADRAO, getPontosVidaTotal, getVidaMaxExibidaDummie, getVidaMaxExibidaFicha,
    getFatorVida, escalarDanoPelaVida,
} from './danoProporcional';

// Ficha real com Vida conhecida: divisores.vida neutraliza o Multiplicador de Forca incidental
// (mesmo truque de Marcados.editarBarraVida.test.jsx). vida.base 200.000.000 bruto = 200.000 exibido.
function fichaComVida(base) {
    return {
        vida: { base }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
    };
}

describe('danoProporcional - constantes e pontos da mesa', () => {
    it('o padrao e 200 pontos de dado = Vida inteira', () => {
        expect(PONTOS_VIDA_TOTAL_PADRAO).toBe(200);
    });
    it('sem cenario / cenario vazio usa o padrao', () => {
        expect(getPontosVidaTotal(undefined)).toBe(200);
        expect(getPontosVidaTotal(null)).toBe(200);
        expect(getPontosVidaTotal({})).toBe(200);
    });
    it('usa cenario.pontosDanoVida quando >= 1', () => {
        expect(getPontosVidaTotal({ pontosDanoVida: 100 })).toBe(100);
        expect(getPontosVidaTotal({ pontosDanoVida: 1 })).toBe(1);
        expect(getPontosVidaTotal({ pontosDanoVida: 1000.5 })).toBe(1000.5);
        expect(getPontosVidaTotal({ pontosDanoVida: '50' })).toBe(50);
    });
    it('valores invalidos (<1, 0, negativo, NaN, texto, Infinity) caem no padrao', () => {
        for (const v of [0, 0.99, -5, NaN, 'abc', null, undefined, Infinity, {}]) {
            expect(getPontosVidaTotal({ pontosDanoVida: v })).toBe(200);
        }
    });
});

describe('danoProporcional - Vida maxima exibida', () => {
    it('dummie: hpMax bruto / 1000', () => {
        expect(getVidaMaxExibidaDummie({ hpMax: 200000000 })).toBe(200000);
        expect(getVidaMaxExibidaDummie({ hpMax: 1500 })).toBe(1.5);
    });
    it('dummie sem hpMax, zero, negativo, NaN ou inexistente = null', () => {
        expect(getVidaMaxExibidaDummie({})).toBeNull();
        expect(getVidaMaxExibidaDummie({ hpMax: 0 })).toBeNull();
        expect(getVidaMaxExibidaDummie({ hpMax: -1000 })).toBeNull();
        expect(getVidaMaxExibidaDummie({ hpMax: 'x' })).toBeNull();
        expect(getVidaMaxExibidaDummie({ hpMax: Infinity })).toBeNull();
        expect(getVidaMaxExibidaDummie(null)).toBeNull();
        expect(getVidaMaxExibidaDummie(undefined)).toBeNull();
    });
    it('ficha real: 200.000.000 bruto = 200.000 exibido', () => {
        expect(getVidaMaxExibidaFicha(fichaComVida(200000000))).toBe(200000);
    });
    it('ficha sem Vida, nula ou so com vida.atual = null', () => {
        expect(getVidaMaxExibidaFicha(fichaComVida(0))).toBeNull();
        expect(getVidaMaxExibidaFicha(null)).toBeNull();
        expect(getVidaMaxExibidaFicha(undefined)).toBeNull();
        expect(getVidaMaxExibidaFicha({ vida: { atual: 1e9 }, afinidades: {}, inventario: [], poderes: [] })).toBeNull();
    });
});

describe('danoProporcional - getFatorVida', () => {
    it('Vida / pontos', () => {
        expect(getFatorVida(200000, 200)).toBe(1000);
        expect(getFatorVida(200, 200)).toBe(1);
        expect(getFatorVida(100, 200)).toBe(0.5);
        expect(getFatorVida(200000, 100)).toBe(2000);
    });
    it('pontos omitidos usam 200', () => {
        expect(getFatorVida(2000)).toBe(10);
    });
    it('pontos invalidos (<1, NaN, 0) caem em 200', () => {
        expect(getFatorVida(2000, 0)).toBe(10);
        expect(getFatorVida(2000, -3)).toBe(10);
        expect(getFatorVida(2000, NaN)).toBe(10);
        expect(getFatorVida(2000, 'x')).toBe(10);
    });
    it('Vida desconhecida/zero/negativa/NaN = fator 1', () => {
        for (const v of [null, undefined, 0, -100, NaN, 'abc', Infinity]) expect(getFatorVida(v, 200)).toBe(1);
    });
});

describe('danoProporcional - escalarDanoPelaVida', () => {
    it('exemplo da regra: rolagem 35 contra Vida 200.000 = 35.000', () => {
        expect(escalarDanoPelaVida(35, 200000, 200)).toBe(35000);
    });
    it('1 ponto = 0,5% da Vida', () => {
        expect(escalarDanoPelaVida(1, 200000, 200)).toBe(1000);
        expect(escalarDanoPelaVida(200, 200000, 200)).toBe(200000);
        expect(escalarDanoPelaVida(100, 8000, 200)).toBe(4000);
    });
    it('pontos custom da mesa mudam a escala', () => {
        expect(escalarDanoPelaVida(35, 200000, 100)).toBe(70000);
        expect(escalarDanoPelaVida(35, 200000, 1000)).toBe(7000);
        expect(escalarDanoPelaVida(35, 200000, 1)).toBe(7000000);
    });
    it('pontos omitidos = 200', () => {
        expect(escalarDanoPelaVida(35, 200000)).toBe(35000);
    });
    it('Vida desconhecida mantem o dano (arredondado para inteiro)', () => {
        expect(escalarDanoPelaVida(35, null, 200)).toBe(35);
        expect(escalarDanoPelaVida(35, undefined)).toBe(35);
        expect(escalarDanoPelaVida(35, 0, 200)).toBe(35);
        expect(escalarDanoPelaVida(35, -500, 200)).toBe(35);
        expect(escalarDanoPelaVida(35, NaN, 200)).toBe(35);
        expect(escalarDanoPelaVida(35.9, null)).toBe(35);
    });
    it('dano zero, negativo, NaN, nulo ou texto vira 0 (nunca negativo/NaN)', () => {
        for (const d of [0, -10, NaN, null, undefined, 'abc', {}]) {
            const r = escalarDanoPelaVida(d, 200000, 200);
            expect(r).toBe(0);
            expect(Number.isNaN(r)).toBe(false);
        }
    });
    it('dano em texto numerico e aceito', () => {
        expect(escalarDanoPelaVida('35', 200000, 200)).toBe(35000);
    });
    it('arredonda para BAIXO (floor)', () => {
        expect(escalarDanoPelaVida(1, 100, 200)).toBe(0);      // 0,5
        expect(escalarDanoPelaVida(3, 100, 200)).toBe(1);      // 1,5
        expect(escalarDanoPelaVida(7, 1001, 200)).toBe(35);    // 35,035
        expect(escalarDanoPelaVida(2.5, 100, 200)).toBe(1);    // 1,25
    });
    it('imprecisao de ponto flutuante nao perde 1 (35 x 1000 e similares)', () => {
        // 0,1 + 0,2 style: 7 * (3 / 7) pode dar 2,9999999
        expect(escalarDanoPelaVida(7, 3 * 200 / 7, 200)).toBe(3);
        for (let d = 1; d <= 200; d++) expect(escalarDanoPelaVida(d, 200000, 200)).toBe(d * 1000);
    });
    it('resultado sempre inteiro', () => {
        for (const [d, v, p] of [[13, 777, 200], [0.3, 12345, 7], [99, 1e6, 333]]) {
            expect(Number.isInteger(escalarDanoPelaVida(d, v, p))).toBe(true);
        }
    });
    it('numeros enormes continuam finitos e proporcionais', () => {
        expect(escalarDanoPelaVida(35, 2e12, 200)).toBe(3.5e11);
        expect(escalarDanoPelaVida(1e9, 1e15, 200)).toBe(5e21);
    });
    it('overflow para Infinity vira MAX_SAFE_INTEGER (nunca Infinity)', () => {
        expect(escalarDanoPelaVida(Number.MAX_VALUE, Number.MAX_VALUE, 1)).toBe(Number.MAX_SAFE_INTEGER);
        expect(escalarDanoPelaVida(Infinity, 200000, 200)).toBe(Number.MAX_SAFE_INTEGER);
    });
    it('integra com a ficha real: 35 contra Vida 200.000 da ficha = 35.000', () => {
        const vida = getVidaMaxExibidaFicha(fichaComVida(200000000));
        expect(escalarDanoPelaVida(35, vida, 200)).toBe(35000);
    });
    it('integra com dummie: hpMax 200.000.000 bruto, 35 = 35.000', () => {
        expect(escalarDanoPelaVida(35, getVidaMaxExibidaDummie({ hpMax: 200000000 }), 200)).toBe(35000);
    });
});
