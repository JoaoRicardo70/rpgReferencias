import { describe, it, expect } from 'vitest';
import { efeitosAtivosDoItem, efeitosPassivosDoItem, efeitosAtivosLigados } from './efeitosItem.js';
import { getBuffs } from './attributes.js';
import { calcularCA } from './engine.js';

const ef = (atributo, propriedade, valor) => ({ nome: 'x', atributo, propriedade, valor });
const fichaCom = (item) => ({ destreza: { base: 85 }, poderes: [], inventario: [{ id: 1, nome: 'Anel', tipo: 'artefato', equipado: true, ...item }] });

describe('efeitosItem', () => {
    it('ligado por padrão (itens antigos) e quando true', () => {
        const i = { efeitos: [ef('forca', 'base', 5)] };
        expect(efeitosAtivosLigados(i)).toBe(true);
        expect(efeitosAtivosDoItem(i)).toHaveLength(1);
        expect(efeitosAtivosDoItem({ ...i, efeitosAtivos: true })).toHaveLength(1);
    });

    it('desligado devolve [] e passivos continuam', () => {
        const i = { efeitosAtivos: false, efeitos: [ef('forca', 'base', 5)], efeitosPassivos: [ef('forca', 'base', 2)] };
        expect(efeitosAtivosLigados(i)).toBe(false);
        expect(efeitosAtivosDoItem(i)).toEqual([]);
        expect(efeitosPassivosDoItem(i)).toHaveLength(1);
    });

    it('entradas inválidas não quebram', () => {
        expect(efeitosAtivosDoItem(null)).toEqual([]);
        expect(efeitosAtivosDoItem({ efeitos: 'x' })).toEqual([]);
        expect(efeitosPassivosDoItem(undefined)).toEqual([]);
    });

    it('getBuffs: item não-arma conta; toggle desligado tira só os ativos', () => {
        const base = { efeitos: [ef('forca', 'base', 10)], efeitosPassivos: [ef('forca', 'base', 3)] };
        expect(getBuffs(fichaCom(base), 'forca').base).toBe(13);
        expect(getBuffs(fichaCom({ ...base, efeitosAtivos: false }), 'forca').base).toBe(3);
        expect(getBuffs(fichaCom({ ...base, equipado: false }), 'forca').base).toBe(0);
    });

    it('calcularCA: ativos desligados não contam', () => {
        const base = { efeitos: [ef('evasiva', 'base', 50)] };
        const ligado = calcularCA(fichaCom(base), 'evasiva');
        const desligado = calcularCA(fichaCom({ ...base, efeitosAtivos: false }), 'evasiva');
        expect(ligado).toBeGreaterThan(desligado);
    });
});
