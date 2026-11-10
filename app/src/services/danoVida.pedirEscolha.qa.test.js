import { describe, it, expect, vi, afterEach } from 'vitest';
import { criarEscolhaDoDono } from './danoVida';
import { dispararEventoNaFicha } from '../core/gatilhosAplicar';
import { normalizarGatilhos } from '../core/gatilhos';

// QA criarEscolhaDoDono: cache, cancelar, entrada invalida, sem window.prompt; Mestre/clone (sem escolher) nunca abre prompt.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const TEXTOS = ['Curar', 'Escudo', 'Nada'];

describe('criarEscolhaDoDono - Happy Path', () => {
    it('resposta "2" => indice 1 e o prompt lista as opcoes numeradas', () => {
        const p = vi.fn(() => '2');
        const esc = criarEscolhaDoDono(p);
        expect(esc('Qual?', TEXTOS, 'k')).toBe(1);
        const txt = p.mock.calls[0][0];
        expect(txt).toContain('Qual?'); expect(txt).toContain('1) Curar'); expect(txt).toContain('2) Escudo'); expect(txt).toContain('3) Nada');
    });
    it('aceita limites 1 e N e espacos', () => {
        expect(criarEscolhaDoDono(() => '1')('q', TEXTOS, 'k')).toBe(0);
        expect(criarEscolhaDoDono(() => ' 3 ')('q', TEXTOS, 'k')).toBe(2);
    });
    it('usa window.prompt quando nenhum prompt e injetado', () => {
        const wp = vi.fn(() => '1');
        vi.stubGlobal('window', { prompt: wp });
        expect(criarEscolhaDoDono()('q', TEXTOS, 'k')).toBe(0);
        expect(wp).toHaveBeenCalledTimes(1);
    });
});

describe('criarEscolhaDoDono - cache', () => {
    it('mesma chave+pergunta+opcoes: pergunta so uma vez', () => {
        const p = vi.fn(() => '2');
        const esc = criarEscolhaDoDono(p);
        expect(esc('q', TEXTOS, 'k')).toBe(1);
        expect(esc('q', TEXTOS, 'k')).toBe(1);
        expect(p).toHaveBeenCalledTimes(1);
    });
    it('cancelar (null) tambem fica em cache', () => {
        const p = vi.fn(() => null);
        const esc = criarEscolhaDoDono(p);
        expect(esc('q', TEXTOS, 'k')).toBeNull(); expect(esc('q', TEXTOS, 'k')).toBeNull();
        expect(p).toHaveBeenCalledTimes(1);
    });
    it('chave, pergunta ou opcoes diferentes perguntam de novo', () => {
        const p = vi.fn(() => '1');
        const esc = criarEscolhaDoDono(p);
        esc('q', TEXTOS, 'k1'); esc('q', TEXTOS, 'k2'); esc('outra', TEXTOS, 'k1'); esc('q', ['A', 'B'], 'k1');
        expect(p).toHaveBeenCalledTimes(4);
    });
    it('instancias diferentes nao compartilham cache', () => {
        const p = vi.fn(() => '1');
        criarEscolhaDoDono(p)('q', TEXTOS, 'k'); criarEscolhaDoDono(p)('q', TEXTOS, 'k');
        expect(p).toHaveBeenCalledTimes(2);
    });
});

describe('criarEscolhaDoDono - Error Cases', () => {
    it.each([['null', null], ['undefined', undefined], ['vazio', ''], ['espacos', '   '], ['texto', 'abc'], ['zero', '0'], ['acima', '4'], ['negativo', '-1'], ['numero real fora', '99']])('resposta %s => null', (_n, resp) => {
        expect(criarEscolhaDoDono(() => resp)('q', TEXTOS, 'k')).toBeNull();
    });
    it('"2abc" e lido como 2 (parseInt) - comportamento atual', () => {
        expect(criarEscolhaDoDono(() => '2abc')('q', TEXTOS, 'k')).toBe(1);
    });
    it('prompt que lanca => null (e nao propaga)', () => {
        expect(criarEscolhaDoDono(() => { throw new Error('x'); })('q', TEXTOS, 'k')).toBeNull();
    });
    it('textos nao-array => null sem lancar', () => {
        expect(criarEscolhaDoDono(() => '1')('q', undefined, 'k')).toBeNull();
        expect(criarEscolhaDoDono(() => '1')('q', 'abc', 'k')).toBeNull();
    });
    it('lista vazia => null', () => {
        expect(criarEscolhaDoDono(() => '1')('q', [], 'k')).toBeNull();
    });
    it('sem window.prompt (SSR/ambiente sem window) => null', () => {
        vi.stubGlobal('window', undefined);
        expect(criarEscolhaDoDono()('q', TEXTOS, 'k')).toBeNull();
    });
    it('window sem prompt funcao => null', () => {
        vi.stubGlobal('window', { prompt: 'nao' });
        expect(criarEscolhaDoDono()('q', TEXTOS, 'k')).toBeNull();
    });
});

describe('Mestre/clone (sem escolher) nunca abre prompt', () => {
    it('dispararEventoNaFicha sem escolher nao chama window.prompt', () => {
        const wp = vi.fn(() => '1');
        vi.stubGlobal('window', { prompt: wp, confirm: vi.fn(() => true) });
        const { gatilhos } = normalizarGatilhos([{ nome: 'G', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'pedirEscolha', opcoes: [{ texto: 'A', acoes: [{ tipo: 'mensagem', texto: 'a' }] }, { texto: 'B', acoes: [{ tipo: 'mensagem', texto: 'b' }] }] }] }]);
        const f = { vida: { base: 1e8, atual: 5e7, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos }], inventario: [], passivas: [], contadores: [] };
        const r = dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c', nome: 'Mestre' });
        expect(wp).not.toHaveBeenCalled();
        expect(r.textos).toContain('G: escolha ignorada (nenhuma opção aplicada)');
    });
});
