import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { LIMITE_FEED_STORE } from '../stores/useStore';
import { executarFerramenta } from '../core/sextaFeiraFerramentas';

const estadoInicial = () => useStore.setState({ feedCombate: [], feedDescartados: 0, personagens: {}, meuNome: '' });
const feedTotal = () => useStore.getState().feedCombate.length + useStore.getState().feedDescartados;

beforeEach(estadoInicial);

describe('store - feedCombate limitado', () => {
    it('limite e 200 e abaixo dele nada e descartado', () => {
        expect(LIMITE_FEED_STORE).toBe(200);
        for (let i = 0; i < 200; i++) useStore.getState().addFeedEntry({ n: i });
        expect(useStore.getState().feedCombate).toHaveLength(200);
        expect(useStore.getState().feedDescartados).toBe(0);
    });
    it('201 entradas descartam a mais antiga e contam 1', () => {
        for (let i = 0; i < 201; i++) useStore.getState().addFeedEntry({ n: i });
        const s = useStore.getState();
        expect(s.feedCombate).toHaveLength(200);
        expect(s.feedCombate[0].n).toBe(1);
        expect(s.feedCombate[199].n).toBe(200);
        expect(s.feedDescartados).toBe(1);
    });
    it('muitas entradas: mantem as ultimas 200 e o total continua crescendo', () => {
        for (let i = 0; i < 530; i++) useStore.getState().addFeedEntry({ n: i });
        const s = useStore.getState();
        expect(s.feedCombate).toHaveLength(200);
        expect(s.feedCombate[0].n).toBe(330);
        expect(s.feedDescartados).toBe(330);
        expect(feedTotal()).toBe(530);
    });
    it('atualizarFeedEntry troca a existente sem mexer no contador', () => {
        useStore.getState().addFeedEntry({ _chave: 'a', v: 1 });
        useStore.getState().atualizarFeedEntry({ _chave: 'a', v: 2 });
        const s = useStore.getState();
        expect(s.feedCombate).toEqual([{ _chave: 'a', v: 2 }]);
        expect(s.feedDescartados).toBe(0);
    });
    it('atualizarFeedEntry com entrada ja podada acrescenta (e poda, se estourar)', () => {
        for (let i = 0; i < 205; i++) useStore.getState().addFeedEntry({ _chave: `k${i}`, v: 0 });
        expect(useStore.getState().feedCombate.find(e => e._chave === 'k0')).toBeUndefined();
        useStore.getState().atualizarFeedEntry({ _chave: 'k0', v: 9 });
        const s = useStore.getState();
        expect(s.feedCombate).toHaveLength(200);
        expect(s.feedCombate[199]).toEqual({ _chave: 'k0', v: 9 });
        expect(s.feedDescartados).toBe(5 + 1);
    });
    it('atualizarFeedEntry sem _chave ou nulo nao quebra', () => {
        useStore.getState().atualizarFeedEntry({ v: 1 });
        expect(useStore.getState().feedCombate).toHaveLength(1);
        expect(() => useStore.getState().atualizarFeedEntry(null)).not.toThrow();
    });
    it('limparFeedStore zera lista e contador', () => {
        for (let i = 0; i < 250; i++) useStore.getState().addFeedEntry({ n: i });
        useStore.getState().limparFeedStore();
        expect(useStore.getState().feedCombate).toEqual([]);
        expect(useStore.getState().feedDescartados).toBe(0);
    });
});

describe('store - updateFichaAlvo', () => {
    it('sem ficha alvo devolve false e nao chama o callback', () => {
        useStore.setState({ meuNome: 'Eu', personagens: { Outro: { x: 1 } } });
        let chamou = false;
        expect(useStore.getState().updateFichaAlvo('Ninguem', () => { chamou = true; })).toBe(false);
        expect(chamou).toBe(false);
    });
    it('nome vazio/nulo devolve false', () => {
        expect(useStore.getState().updateFichaAlvo('', () => {})).toBe(false);
        expect(useStore.getState().updateFichaAlvo(null, () => {})).toBe(false);
    });
    it('personagem da mesa: true e grava', () => {
        useStore.setState({ meuNome: 'Eu', personagens: { Outro: { x: 1 } } });
        expect(useStore.getState().updateFichaAlvo('Outro', (f) => { f.x = 2; })).toBe(true);
        expect(useStore.getState().personagens.Outro.x).toBe(2);
    });
    it('a propria ficha (nome sanitizado): true e grava em minhaFicha', () => {
        useStore.setState({ meuNome: 'Eu.1' });
        expect(useStore.getState().updateFichaAlvo('Eu_1', (f) => { f.marca = 'ok'; })).toBe(true);
        expect(useStore.getState().minhaFicha.marca).toBe('ok');
    });
});

describe('memorizar_fato (confirmacao do Mestre)', () => {
    const mestre = { isMestre: true };
    it('aceitar grava', async () => {
        const chamadas = [];
        const memorizar = async (a) => { chamadas.push(a); return true; };
        const r = await executarFerramenta('memorizar_fato', { texto: ' fato ', soMestre: true }, mestre, { memorizar });
        expect(r).toEqual({ ok: true, memorizado: 'fato', soMestre: true });
        expect(chamadas).toEqual([{ texto: 'fato', soMestre: true }]);
    });
    it('memorizar que devolve undefined (versao antiga) continua gravando', async () => {
        const r = await executarFerramenta('memorizar_fato', { texto: 'x' }, mestre, { memorizar: async () => undefined });
        expect(r.ok).toBe(true);
    });
    it('recusar vira erro e nao grava', async () => {
        const r = await executarFerramenta('memorizar_fato', { texto: 'x' }, mestre, { memorizar: async () => false });
        expect(r.erro).toMatch(/n.o confirmou/);
        expect(r.ok).toBeUndefined();
        expect(r.memorizado).toBeUndefined();
    });
    it('nao-Mestre, sem funcao e texto vazio nao gravam', async () => {
        let n = 0;
        const memorizar = async () => { n++; return true; };
        expect((await executarFerramenta('memorizar_fato', { texto: 'x' }, { isMestre: false }, { memorizar })).erro).toBeTruthy();
        expect((await executarFerramenta('memorizar_fato', { texto: 'x' }, mestre, {})).erro).toBeTruthy();
        expect((await executarFerramenta('memorizar_fato', { texto: '   ' }, mestre, { memorizar })).erro).toBeTruthy();
        expect(n).toBe(0);
    });
    it('texto e cortado em 500 caracteres', async () => {
        const r = await executarFerramenta('memorizar_fato', { texto: 'a'.repeat(900) }, mestre, { memorizar: async () => true });
        expect(r.memorizado).toHaveLength(500);
    });
});
