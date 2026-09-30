import { describe, it, expect, vi } from 'vitest';
import { executarFerramenta, DECLARACOES_FERRAMENTAS } from './sextaFeiraFerramentas';

const estadoBase = (over = {}) => ({
    meuNome: 'Ana', isMestre: false, podeVerFuturo: false, minhaFicha: {}, personagens: {}, dummies: {},
    resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 }, cenario: {}, feedCombate: [], divisorPoderMesa: 1,
    capitulosPresente: [], capitulosFuturo: [], ...over,
});
const chamar = (n, a, e, x) => executarFerramenta(n, a, e, x);
const mk = (min, autor, texto, tipo) => ({ timestamp: Date.now() - min * 60000, autor, texto, tipo });

describe('declaracoes das novas ferramentas', () => {
    it('memorizar_fato exige texto; transcricoes_recentes tem horas e termo', () => {
        const m = DECLARACOES_FERRAMENTAS.find(d => d.name === 'memorizar_fato');
        expect(m.parameters.required).toEqual(['texto']);
        const t = DECLARACOES_FERRAMENTAS.find(d => d.name === 'transcricoes_recentes');
        expect(Object.keys(t.parameters.properties)).toEqual(['horas', 'termo']);
    });
});

describe('transcricoes_recentes', () => {
    it('sem carregarTranscricoes devolve erro', async () => {
        expect((await chamar('transcricoes_recentes', {}, estadoBase())).erro).toMatch(/indispon/);
    });
    it('padrao 6h: passa desde ~ agora-6h, ordena cronologicamente e marca NPC', async () => {
        const carregar = vi.fn(async () => [mk(10, 'Mestre', 'segunda'), mk(50, 'Goblin', 'primeira', 'npc')]);
        const antes = Date.now();
        const r = await chamar('transcricoes_recentes', {}, estadoBase(), { carregarTranscricoes: carregar });
        expect(Math.abs(carregar.mock.calls[0][0] - (antes - 6 * 3600000))).toBeLessThan(2000);
        expect(r.horas).toBe(6);
        expect(r.falas).toEqual(['Goblin (NPC): "primeira"', 'Mestre: "segunda"']);
    });
    it('clamp de horas entre 0.5 e 48', async () => {
        const ex = { carregarTranscricoes: vi.fn(async () => []) };
        const h = async (v) => (await chamar('transcricoes_recentes', { horas: v }, estadoBase(), ex)).horas;
        expect(await h(999)).toBe(48);
        expect(await h(0.1)).toBe(0.5);
        expect(await h(-3)).toBe(0.5);
        expect(await h(0)).toBe(6);
        expect(await h('abc')).toBe(6);
        expect(await h(2)).toBe(2);
    });
    it('filtro por termo (autor ou texto, case-insensitive, trim)', async () => {
        const carregar = async () => [mk(5, 'Mestre', 'O Dragao chegou'), mk(4, 'Ana', 'oi'), mk(3, 'DRAGAO', 'rugido')];
        const r = await chamar('transcricoes_recentes', { termo: '  dragao ' }, estadoBase(), { carregarTranscricoes: carregar });
        expect(r.falas).toHaveLength(2);
    });
    it('descarta falas fora da janela, sem texto e nulas', async () => {
        const carregar = async () => [mk(600, 'Velho', 'antigo'), null, { timestamp: Date.now(), autor: 'X', texto: '' }, mk(1, 'Ok', 'bom')];
        const r = await chamar('transcricoes_recentes', { horas: 1 }, estadoBase(), { carregarTranscricoes: carregar });
        expect(r.falas).toEqual(['Ok: "bom"']);
    });
    it('maximo 80 (mantem as mais recentes) e corta fala em 300 chars', async () => {
        const carregar = async () => Array.from({ length: 100 }, (_, i) => mk(200 - i, 'A', i === 99 ? 'z'.repeat(500) : `f${i} `));
        const r = await chamar('transcricoes_recentes', {}, estadoBase(), { carregarTranscricoes: carregar });
        expect(r.falas).toHaveLength(80);
        expect(r.falas[0]).toContain('f20');
        expect(r.falas[79].length).toBe('A: ""'.length + 300);
    });
    it('vazio devolve mensagem', async () => {
        const r = await chamar('transcricoes_recentes', {}, estadoBase(), { carregarTranscricoes: async () => [] });
        expect(r.falas).toEqual([]);
        expect(r.mensagem).toMatch(/Nenhuma fala/);
    });
    it('aceita objeto como retorno e autor ausente vira ?', async () => {
        const r = await chamar('transcricoes_recentes', {}, estadoBase(), { carregarTranscricoes: async () => ({ a: mk(1, '', 'oi') }) });
        expect(r.falas).toEqual(['?: "oi"']);
    });
    it('erro no carregamento vira { erro }, sem lancar', async () => {
        const r = await chamar('transcricoes_recentes', {}, estadoBase(), { carregarTranscricoes: async () => { throw new Error('boom'); } });
        expect(r.erro).toBeTruthy();
    });
});

describe('memorizar_fato', () => {
    it('jogador nao pode e nao chama memorizar', async () => {
        const memorizar = vi.fn();
        const r = await chamar('memorizar_fato', { texto: 'x' }, estadoBase({ isMestre: false }), { memorizar });
        expect(r.erro).toMatch(/Mestre/);
        expect(memorizar).not.toHaveBeenCalled();
    });
    it('Mestre grava texto trimado e soMestre booleano', async () => {
        const memorizar = vi.fn(async () => {});
        const r = await chamar('memorizar_fato', { texto: '  O rei morreu  ', soMestre: 1 }, estadoBase({ isMestre: true }), { memorizar });
        expect(memorizar).toHaveBeenCalledWith({ texto: 'O rei morreu', soMestre: true });
        expect(r).toEqual({ ok: true, memorizado: 'O rei morreu', soMestre: true });
    });
    it('soMestre padrao false', async () => {
        const r = await chamar('memorizar_fato', { texto: 'a' }, estadoBase({ isMestre: true }), { memorizar: async () => {} });
        expect(r.soMestre).toBe(false);
    });
    it('capa em 500 caracteres', async () => {
        const memorizar = vi.fn(async () => {});
        const r = await chamar('memorizar_fato', { texto: 'q'.repeat(900) }, estadoBase({ isMestre: true }), { memorizar });
        expect(r.memorizado).toHaveLength(500);
        expect(memorizar.mock.calls[0][0].texto).toHaveLength(500);
    });
    it('texto vazio/ausente e sem memorizar', async () => {
        const memorizar = vi.fn();
        const est = estadoBase({ isMestre: true });
        expect((await chamar('memorizar_fato', { texto: '   ' }, est, { memorizar })).erro).toMatch(/Nada/);
        expect((await chamar('memorizar_fato', {}, est, { memorizar })).erro).toMatch(/Nada/);
        expect(memorizar).not.toHaveBeenCalled();
        expect((await chamar('memorizar_fato', { texto: 'a' }, est, {})).erro).toMatch(/indispon/);
    });
    it('falha do memorizar vira { erro }', async () => {
        const r = await chamar('memorizar_fato', { texto: 'a' }, estadoBase({ isMestre: true }), { memorizar: async () => { throw new Error('x'); } });
        expect(r.erro).toBeTruthy();
    });
});
