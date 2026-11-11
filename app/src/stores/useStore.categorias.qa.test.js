import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { fichaPadrao } from './useStore';
import { categoriasVisiveisNaFicha, categoriaDoPoderFicha } from '../core/categoriasPoder';

beforeEach(() => { useStore.setState({ minhaFicha: structuredClone(fichaPadrao) }); });

describe('useStore - hierarquia.ocular', () => {
    it('ficha padrao: ocular false e nenhuma categoria especial visivel', () => {
        expect(fichaPadrao.hierarquia.ocular).toBe(false);
        expect(categoriasVisiveisNaFicha(fichaPadrao).map(c => c.id)).toEqual(['habilidade', 'forma', 'poder']);
    });
    it('carregarDadosFicha com hierarquia antiga (sem ocular) => ocular false e preserva o resto', () => {
        useStore.getState().carregarDadosFicha({ hierarquia: { poder: true, infinity: true, singularidade: '1', poderNome: 'X' } });
        const h = useStore.getState().minhaFicha.hierarquia;
        expect(h.ocular).toBe(false);
        expect(h.infinity).toBe(true);
        expect(h.singularidade).toBe('1');
        expect(h.poderNome).toBe('X');
    });
    it('carregarDadosFicha sem hierarquia: usa o padrao (ocular false)', () => {
        useStore.getState().carregarDadosFicha({});
        expect(useStore.getState().minhaFicha.hierarquia.ocular).toBe(false);
    });
    it('carregarDadosFicha preserva ocular true salvo', () => {
        useStore.getState().carregarDadosFicha({ hierarquia: { ocular: true } });
        expect(useStore.getState().minhaFicha.hierarquia.ocular).toBe(true);
    });
    it('dados antigos: poderes sem categoria continuam como "poder"', () => {
        useStore.getState().carregarDadosFicha({ poderes: [{ id: 1, nome: 'Velho' }, { id: 2, nome: 'Hab', categoria: 'habilidade' }] });
        const ps = useStore.getState().minhaFicha.poderes;
        expect(ps.map(categoriaDoPoderFicha)).toEqual(['poder', 'habilidade']);
    });
    it('updateFicha grava ocular via Immer sem tocar nas outras flags', () => {
        useStore.getState().updateFicha((f) => { f.hierarquia.ocular = true; });
        const h = useStore.getState().minhaFicha.hierarquia;
        expect(h.ocular).toBe(true);
        expect(h.infinity).toBe(false);
        expect(fichaPadrao.hierarquia.ocular).toBe(false);
    });
});
