import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

import useStore, { fichaPadrao } from './useStore';

// QA — merge do carregarDadosFicha: ficha.esteticaGrimorio sempre passa por migrarEsteticaGrimorio e
// nunca vaza do personagem anterior.

const carregar = (dados) => useStore.getState().carregarDadosFicha(dados);
const estetica = () => useStore.getState().minhaFicha.esteticaGrimorio;

beforeEach(() => {
    useStore.setState({ minhaFicha: JSON.parse(JSON.stringify(fichaPadrao)) });
});

describe('carregarDadosFicha > esteticaGrimorio', () => {
    it('formato antigo (livro) migra sem erro para { corDestaque } a partir da corTinta', () => {
        expect(() => carregar({ esteticaGrimorio: { corPapel: '#f4e4bc', corTexto: '#222', corTinta: '#8B0000', bgImg: 'x', modoFundo: 'imagem', corFundoTint: '#111', diarioFonte: 'Caveat' } })).not.toThrow();
        expect(estetica()).toEqual({ corDestaque: '#8b0000' });
    });

    it('formato antigo com corTinta inválida vira {}', () => {
        carregar({ esteticaGrimorio: { corPapel: '#fff', corTinta: 'nao-e-cor' } });
        expect(estetica()).toEqual({});
    });

    it('formato novo é preservado', () => {
        carregar({ esteticaGrimorio: { corDestaque: '#00aaff' } });
        expect(estetica()).toEqual({ corDestaque: '#00aaff' });
    });

    it('sem esteticaGrimorio reseta para {} (não vaza do personagem anterior)', () => {
        carregar({ esteticaGrimorio: { corDestaque: '#ff0000' } });
        expect(estetica()).toEqual({ corDestaque: '#ff0000' });
        carregar({ donoDaFicha: 'Outro' });
        expect(estetica()).toEqual({});
    });

    it.each([[null], [undefined], [[]], ['#fff'], [42]])('valor %j vira {}', (v) => {
        carregar({ esteticaGrimorio: { corDestaque: '#ff0000' } });
        carregar({ esteticaGrimorio: v });
        expect(estetica()).toEqual({});
    });

    it('carregar dados null não lança e não mexe na estética', () => {
        carregar({ esteticaGrimorio: { corDestaque: '#ff0000' } });
        expect(() => carregar(null)).not.toThrow();
        expect(estetica()).toEqual({ corDestaque: '#ff0000' });
    });

    it('a ficha padrão não traz campos antigos de papel/tinta em esteticaGrimorio', () => {
        const e = fichaPadrao.esteticaGrimorio || {};
        ['corPapel', 'corTexto', 'corTinta', 'bgImg', 'modoFundo', 'corFundoTint', 'diarioFonte'].forEach(k => expect(e).not.toHaveProperty(k));
    });
});

describe('store > pastasAbertasPoder', () => {
    beforeEach(() => { useStore.setState({ pastasAbertasPoder: {} }); });

    it('nasce vazio (tudo fechado)', () => {
        expect(useStore.getState().pastasAbertasPoder).toEqual({});
    });
    it('alternarPastaPoder liga e desliga a chave', () => {
        useStore.getState().alternarPastaPoder('forma::A');
        expect(useStore.getState().pastasAbertasPoder).toEqual({ 'forma::A': true });
        useStore.getState().alternarPastaPoder('forma::A');
        expect(useStore.getState().pastasAbertasPoder).toEqual({});
    });
    it('definirPastasPoder abre/fecha várias de uma vez e tolera lista inválida', () => {
        const { definirPastasPoder } = useStore.getState();
        definirPastasPoder(['forma::A', 'forma::B'], true);
        expect(useStore.getState().pastasAbertasPoder).toEqual({ 'forma::A': true, 'forma::B': true });
        useStore.getState().definirPastasPoder(['forma::A'], false);
        expect(useStore.getState().pastasAbertasPoder).toEqual({ 'forma::B': true });
        expect(() => useStore.getState().definirPastasPoder(null, true)).not.toThrow();
        expect(() => useStore.getState().definirPastasPoder(undefined, false)).not.toThrow();
    });
    it('funciona mesmo se o mapa tiver sido removido do estado', () => {
        useStore.setState({ pastasAbertasPoder: undefined });
        expect(() => useStore.getState().alternarPastaPoder('poder::X')).not.toThrow();
        expect(useStore.getState().pastasAbertasPoder).toEqual({ 'poder::X': true });
    });
});
