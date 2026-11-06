import { describe, it, expect, vi } from 'vitest';
import { defesaDaFicha, recalcularDefesaDoDummie, definirDefesaManualDoDummie, montarDummieDeNpc } from './gavetaNpc';

vi.mock('./disputaPoder.js', () => ({ getPoderParaDisputa: vi.fn(() => null) }));
vi.mock('./engine.js', () => ({
    BASE_CA: 12,
    calcularCA: vi.fn((ficha, tipo) => {
        if (ficha && ficha.__erroCA) throw new Error('falha');
        const v = tipo === 'evasiva' ? ficha?.__evasiva : ficha?.__resistencia;
        return v === undefined ? 10 : v;
    }),
}));

const fv = (extra = {}) => ({ isNPC: true, vida: { base: 1000, atual: 1000, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 }, poderes: [], inventario: [], ...extra });

describe('defesaDaFicha', () => {
    it('evasiva maior', () => { expect(defesaDaFicha({ __evasiva: 30, __resistencia: 20 })).toEqual({ tipoDefesa: 'evasiva', valorDefesa: 30 }); });
    it('resistencia maior', () => { expect(defesaDaFicha({ __evasiva: 20, __resistencia: 30 })).toEqual({ tipoDefesa: 'resistencia', valorDefesa: 30 }); });
    it('empate fica com evasiva', () => { expect(defesaDaFicha({ __evasiva: 25, __resistencia: 25 }).tipoDefesa).toBe('evasiva'); });
    it('erro no calculo cai em BASE_CA/evasiva', () => { expect(defesaDaFicha({ __erroCA: true })).toEqual({ tipoDefesa: 'evasiva', valorDefesa: 12 }); });
    it('CA 0 cai em BASE_CA (comportamento atual: 0 e falsy)', () => { expect(defesaDaFicha({ __evasiva: 0, __resistencia: 0 }).valorDefesa).toBe(12); });
    it('ficha nula nao lanca', () => { expect(() => defesaDaFicha(null)).not.toThrow(); });
});

describe('recalcularDefesaDoDummie', () => {
    const d = { nome: 'Goblin #1', fichaOrigem: 'Goblin', tipoDefesa: 'evasiva', valorDefesa: 5, hpMax: 10 };
    it('null sem fichaOrigem', () => { expect(recalcularDefesaDoDummie({ ...d, fichaOrigem: undefined }, { __evasiva: 20 })).toBeNull(); });
    it('null sem ficha', () => {
        expect(recalcularDefesaDoDummie(d, undefined)).toBeNull();
        expect(recalcularDefesaDoDummie(d, null)).toBeNull();
    });
    it('null para dummie nulo', () => { expect(recalcularDefesaDoDummie(null, { __evasiva: 20 })).toBeNull(); });
    it('atualiza tipo e valor, preserva o resto e nao muta o original', () => {
        const copia = JSON.parse(JSON.stringify(d));
        const r = recalcularDefesaDoDummie(d, { __evasiva: 20, __resistencia: 40 });
        expect(r).toEqual({ ...d, tipoDefesa: 'resistencia', valorDefesa: 40 });
        expect(r).not.toBe(d);
        expect(d).toEqual(copia);
    });
});

describe('definirDefesaManualDoDummie', () => {
    const d = { nome: 'X', tipoDefesa: 'resistencia', valorDefesa: 5 };
    it.each([[''], ['   '], ['abc'], ['-1'], ['100001'], ['Infinity'], ['1e3'], ['0x10'], ['-5'], ['1.000,5'], ['1,2,3'], [null], [undefined]])('invalido %j', (t) => {
        const r = definirDefesaManualDoDummie(d, t);
        expect(r.ok).toBe(false);
        expect(typeof r.erro).toBe('string');
        expect(r.erro.length).toBeGreaterThan(0);
    });
    it.each([['25', 25], ['0', 0], ['100000', 100000], ['12,5', 13], ['12.4', 12], ['1.5', 2], ['1,5', 2], ['  30 ', 30], ['0,4', 0]])('valido %j -> %i', (t, esperado) => {
        const r = definirDefesaManualDoDummie(d, t);
        expect(r.ok).toBe(true);
        expect(r.dummie.valorDefesa).toBe(esperado);
    });
    it('mantem tipoDefesa e demais campos, sem mutar o original', () => {
        const r = definirDefesaManualDoDummie(d, '40');
        expect(r.dummie).toEqual({ nome: 'X', tipoDefesa: 'resistencia', valorDefesa: 40 });
        expect(d.valorDefesa).toBe(5);
    });
    it('numero (nao string) tambem funciona', () => { expect(definirDefesaManualDoDummie(d, 7).dummie.valorDefesa).toBe(7); });
});

describe('montarDummieDeNpc usa defesaDaFicha', () => {
    it('mesma defesa que defesaDaFicha', () => {
        const f = fv({ __evasiva: 18, __resistencia: 33 });
        const dm = montarDummieDeNpc('Orc', f, {});
        expect(dm).toMatchObject(defesaDaFicha(f));
        expect(dm.tipoDefesa).toBe('resistencia');
        expect(dm.valorDefesa).toBe(33);
    });
});
