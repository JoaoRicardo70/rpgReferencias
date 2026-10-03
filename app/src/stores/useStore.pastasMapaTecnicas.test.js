import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA - pastasFechadasMapaTecnicas: persistido em localStorage (chave rpgPastasMapaTecnicas) e
// restaurado ao carregar o store. A leitura inicial acontece no import, entao cada teste
// reimporta o modulo (vi.resetModules).
const CHAVE = 'rpgPastasMapaTecnicas';

async function carregarStore() {
    vi.resetModules();
    const mod = await import('./useStore');
    return mod.default;
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('pastasFechadasMapaTecnicas - leitura inicial', () => {
    it('sem nada salvo comeca como objeto vazio', async () => {
        const store = await carregarStore();
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({});
    });

    it('restaura o mapa salvo no localStorage', async () => {
        localStorage.setItem(CHAVE, JSON.stringify({ 'forma::Transformações': true, 'habilidade::Sem Pasta': false }));
        const store = await carregarStore();
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({ 'forma::Transformações': true, 'habilidade::Sem Pasta': false });
    });

    it('JSON corrompido cai no objeto vazio sem lancar', async () => {
        localStorage.setItem(CHAVE, '{nao-e-json');
        const store = await carregarStore();
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({});
    });

    it('valor "null" salvo vira objeto vazio', async () => {
        localStorage.setItem(CHAVE, 'null');
        const store = await carregarStore();
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({});
    });

    it('string vazia salva vira objeto vazio', async () => {
        localStorage.setItem(CHAVE, '');
        const store = await carregarStore();
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({});
    });
});

describe('setPastasFechadasMapaTecnicas - persistencia', () => {
    it('atualiza o estado e grava o JSON no localStorage', async () => {
        const store = await carregarStore();
        const mapa = { 'forma::Selo': true, 'poder::Sem Pasta': false };
        store.getState().setPastasFechadasMapaTecnicas(mapa);
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual(mapa);
        expect(JSON.parse(localStorage.getItem(CHAVE))).toEqual(mapa);
    });

    it('a ultima gravacao vence (sobrescreve, nao mescla)', async () => {
        const store = await carregarStore();
        store.getState().setPastasFechadasMapaTecnicas({ a: true });
        store.getState().setPastasFechadasMapaTecnicas({ b: false });
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({ b: false });
        expect(JSON.parse(localStorage.getItem(CHAVE))).toEqual({ b: false });
    });

    it('mapa vazio tambem e gravado', async () => {
        const store = await carregarStore();
        store.getState().setPastasFechadasMapaTecnicas({ a: true });
        store.getState().setPastasFechadasMapaTecnicas({});
        expect(localStorage.getItem(CHAVE)).toBe('{}');
    });

    it('sobrevive a "recarregar" o store (round trip)', async () => {
        const store = await carregarStore();
        store.getState().setPastasFechadasMapaTecnicas({ 'forma::Selo': true });
        const store2 = await carregarStore();
        expect(store2.getState().pastasFechadasMapaTecnicas).toEqual({ 'forma::Selo': true });
    });

    it('localStorage.setItem lancando (cota/modo privado) nao quebra: o estado em memoria e atualizado', async () => {
        const store = await carregarStore();
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
        expect(() => store.getState().setPastasFechadasMapaTecnicas({ x: true })).not.toThrow();
        expect(store.getState().pastasFechadasMapaTecnicas).toEqual({ x: true });
    });

    it('nao usa a chave de outras pastas/lore (so rpgPastasMapaTecnicas)', async () => {
        const store = await carregarStore();
        store.getState().setPastasFechadasMapaTecnicas({ x: true });
        expect(Object.keys(localStorage).filter(k => k === CHAVE)).toHaveLength(1);
    });
});
