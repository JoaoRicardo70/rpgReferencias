import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import { salvarFichaSilencioso, salvarCamposPersonagem } from './firebase-sync';
import { dispararEventoMeu, dispararEventoEmPersonagem, textoDosEventos, dispararResultadoDoAcerto } from './gatilhosEventos';

// QA Fase 2 - services/gatilhosEventos.js (contexto do app: minha ficha vs ficha de outro jogador, gravacao so dos caminhos tocados).
vi.mock('../stores/useStore');
vi.mock('./firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarCamposPersonagem: vi.fn() }));

const F = 1000;
const G = (g) => ({ nome: 'g', ...g });
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const ficha = (gatilhos = [], extra = {}) => ({ vida: { atual: 500 * F, base: 1000000 }, poderes: gatilhos.length ? [{ id: 'p1', nome: 'P', ativa: true, gatilhos }] : [], inventario: [], passivas: [], contadores: [ct('k')], ...extra });
const soma = (evento, v = 1, extra = {}) => G({ id: 'g1', evento, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: v }], ...extra });
let st;
function montar(minha, personagens = {}, extra = {}) {
    st = { minhaFicha: minha, meuNome: 'Eu', personagens, updateFicha: vi.fn((cb) => cb(minha)), cenario: { ativa: 'cenaX' }, ...extra };
    useStore.getState = () => st;
}
beforeEach(() => { vi.clearAllMocks(); });

describe('dispararEventoMeu', () => {
    it('sem minhaFicha ou sem updateFicha: nao faz nada nem lanca', () => {
        montar(null); expect(dispararEventoMeu({ tipo: 'acertou', nivel: 'normal' })).toEqual({ textos: [], caminhos: [], chaves: [], disparou: false });
        montar(ficha(), {}, { updateFicha: undefined }); expect(dispararEventoMeu({ tipo: 'acertou' }).disparou).toBe(false);
    });
    it('ficha sem gatilhos: acertou/errou nem chamam updateFicha (zero custo e zero gravacao)', () => {
        const f = ficha(); montar(f);
        ['acertou', 'errou', 'atingido', 'inimigoErrou', 'turnoFim', 'poderLigou'].forEach(t => dispararEventoMeu({ tipo: t, nivel: 'normal' }));
        expect(st.updateFicha).not.toHaveBeenCalled(); expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('ficha sem gatilhos: turnoInicio e outros nao entram; fimDeLuta entra (reset de cena) e SO salva se algo mudou', () => {
        const f = ficha([], { contadores: [ct('k', { valor: 3 })] }); montar(f);
        dispararEventoMeu({ tipo: 'turnoInicio' });
        expect(st.updateFicha).not.toHaveBeenCalled();
        dispararEventoMeu({ tipo: 'fimDeLuta' });
        expect(st.updateFicha).toHaveBeenCalledTimes(1); expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        f.contadores[0].reset = 'cena';
        dispararEventoMeu({ tipo: 'fimDeLuta' });
        expect(f.contadores[0].valor).toBe(0); expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    it('dispara, usa a cena da mesa (limite por cena) e salva com debounce', () => {
        const f = ficha([soma({ tipo: 'acertou', nivel: 'qualquer' }, 1, { limite: { max: 1, por: 'cena' } })]); montar(f);
        const r = dispararEventoMeu({ tipo: 'acertou', nivel: 'normal' });
        expect(r.disparou).toBe(true); expect(f.contadores[0].valor).toBe(1); expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(f.combate.usosPoderes['p1:g1'].cena).toBe('cenaX');
        dispararEventoMeu({ tipo: 'acertou', nivel: 'normal' }); expect(f.contadores[0].valor).toBe(1);
        st.cenario.ativa = 'cenaY'; dispararEventoMeu({ tipo: 'acertou', nivel: 'normal' }); expect(f.contadores[0].valor).toBe(2);
    });
    it('sem cenario no store: cai em "default" sem lancar', () => {
        const f = ficha([soma({ tipo: 'acertou' })]); montar(f, {}, { cenario: undefined });
        expect(() => dispararEventoMeu({ tipo: 'acertou', nivel: 'normal' })).not.toThrow();
        expect(f.contadores[0].valor).toBe(1);
    });
    it('ctx.nome sobrescreve o nome do store e ctx.rng chega ao sorteio', () => {
        const f = ficha([G({ id: 'g1', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1, sorteio: '1d6' }] })]); montar(f);
        dispararEventoMeu({ tipo: 'acertou', nivel: 'normal' }, { nome: 'Outro', rng: () => 0.999 });
        expect(f.contadores[0].valor).toBe(6);
    });
    it('textoDosEventos: vazio sem textos, "🔔 a · b" com', () => {
        expect(textoDosEventos(null)).toBe(''); expect(textoDosEventos({ textos: [] })).toBe('');
        expect(textoDosEventos({ textos: ['a', 'b'] })).toBe('🔔 a · b');
    });
});

describe('dispararEventoEmPersonagem', () => {
    it('nome vazio ou desconhecido: sem efeito', () => {
        montar(ficha(), {});
        expect(dispararEventoEmPersonagem('', { tipo: 'turnoFim' }).disparou).toBe(false);
        expect(dispararEventoEmPersonagem('Fantasma', { tipo: 'fimDeLuta' }).disparou).toBe(false);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('o nome e o meu: delega para a minha ficha (updateFicha), nunca salvarCamposPersonagem', () => {
        const f = ficha([soma({ tipo: 'turnoFim' })]); montar(f);
        dispararEventoEmPersonagem('Eu', { tipo: 'turnoFim' });
        expect(f.contadores[0].valor).toBe(1); expect(salvarCamposPersonagem).not.toHaveBeenCalled(); expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('outro jogador: o espelho NAO e mutado e so os caminhos tocados sao gravados (indice pelo id)', () => {
        const outro = ficha([soma({ tipo: 'turnoFim' })], { contadores: [ct('a'), ct('b'), ct('k', { valor: 4 })] }); montar(ficha(), { Ana: outro });
        const antes = JSON.stringify(outro);
        const r = dispararEventoEmPersonagem('Ana', { tipo: 'turnoFim' });
        expect(JSON.stringify(outro)).toBe(antes);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'contadores/2/valor': 5 });
        expect(r.textos.join(' ')).toContain('k 4 → 5');
    });
    it('outro jogador sem gatilhos: acertou/turnoFim/turnoInicio nao clonam nem gravam; fimDeLuta so grava se algo zerou', () => {
        const outro = ficha([], { contadores: [ct('k', { valor: 3, reset: 'cena' }), ct('p', { valor: 2 })] }); montar(ficha(), { Ana: outro });
        ['turnoFim', 'turnoInicio', 'inimigoErrou'].forEach(t => dispararEventoEmPersonagem('Ana', { tipo: t }));
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        dispararEventoEmPersonagem('Ana', { tipo: 'fimDeLuta' });
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'contadores/0/valor': 0 });
        salvarCamposPersonagem.mockClear();
        outro.contadores[0].valor = 0; // ja zerado: nada a gravar
        dispararEventoEmPersonagem('Ana', { tipo: 'fimDeLuta' });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('gravacao nunca leva undefined (apagar vira null)', () => {
        const outro = ficha([G({ id: 'g1', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'removerEstado', estado: 'queimado' }] })], { condicoes: [{ id: 'queimado', stacks: 1 }] }); montar(ficha(), { Ana: outro });
        dispararEventoEmPersonagem('Ana', { tipo: 'turnoFim' });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { condicoes: null });
    });
    it('nome com caracteres perigosos para o Firebase e passado como veio (a sanitizacao e de quem monta a chave)', () => {
        const outro = ficha([soma({ tipo: 'turnoFim' })]); montar(ficha(), { 'A.b': outro });
        dispararEventoEmPersonagem('A.b', { tipo: 'turnoFim' });
        expect(salvarCamposPersonagem.mock.calls[0][0]).toBe('A.b');
    });
});

describe('dispararResultadoDoAcerto (errou / inimigoErrou)', () => {
    const errou = (extra = {}) => soma({ tipo: 'errou' }, 1, extra);
    const contra = () => G({ id: 'g1', nome: 'Contra', evento: { tipo: 'inimigoErrou' }, acoes: [{ tipo: 'mensagem', texto: 'Contra-ataque!' }] });
    it('lista vazia/nula: nada', () => {
        montar(ficha([errou()]));
        expect(dispararResultadoDoAcerto([])).toEqual([]); expect(dispararResultadoDoAcerto(null)).toEqual([]); expect(st.updateFicha).not.toHaveBeenCalled();
    });
    it('errou so quando TODOS os alvos escaparam; um acerto no meio cancela', () => {
        const f = ficha([errou()]); montar(f);
        dispararResultadoDoAcerto([{ nome: 'G', acertou: false, dummieId: 'g1' }, { nome: 'H', acertou: true, dummieId: 'g2' }], { atacanteSouEu: true, nomeAtacante: 'Eu' });
        expect(f.contadores[0].valor).toBe(0);
        dispararResultadoDoAcerto([{ nome: 'G', acertou: false, dummieId: 'g1' }, { nome: 'H', acertou: false, dummieId: 'g2' }], { atacanteSouEu: true, nomeAtacante: 'Eu' });
        expect(f.contadores[0].valor).toBe(1);
    });
    it('Mestre agindo por NPC (atacanteSouEu:false) nao dispara errou na propria ficha', () => {
        const f = ficha([errou()]); montar(f);
        dispararResultadoDoAcerto([{ nome: 'G', acertou: false, dummieId: 'g1' }], { atacanteSouEu: false, nomeAtacante: 'Goblin' });
        expect(f.contadores[0].valor).toBe(0);
    });
    it('inimigoErrou: dispara em cada alvo-personagem que escapou (pj:Nome), com o nome na frase, gravando na ficha dele', () => {
        const ana = ficha([contra()]); const bia = ficha([contra()]); montar(ficha(), { Ana: ana, Bia: bia });
        const t = dispararResultadoDoAcerto([{ nome: 'Ana', acertou: false, dummieId: 'pj:Ana' }, { nome: 'Bia', acertou: true, dummieId: 'pj:Bia' }], { atacanteSouEu: true, nomeAtacante: 'Eu' });
        expect(t).toEqual(['Ana: Contra: Contra-ataque!']);
    });
    it('inimigoErrou em Dummie (id g1) nao dispara; alvo = o proprio atacante nao dispara', () => {
        const eu = ficha([contra()]); montar(eu);
        const t = dispararResultadoDoAcerto([{ nome: 'Goblin', acertou: false, dummieId: 'g1' }], { atacanteSouEu: true, nomeAtacante: 'Eu' });
        expect(t).toEqual([]);
        const t2 = dispararResultadoDoAcerto([{ nome: 'Eu', acertou: false, dummieId: 'pj:Eu' }], { atacanteSouEu: true, nomeAtacante: 'Eu' });
        expect(t2).toEqual([]);
    });
    it('alvo sem dummieId resolvido por nome: so se o nome e de um personagem conhecido', () => {
        const ana = ficha([contra()]); montar(ficha(), { Ana: ana });
        expect(dispararResultadoDoAcerto([{ nome: 'Ana', acertou: false }], { atacanteSouEu: false, nomeAtacante: 'Mestre' })).toEqual(['Ana: Contra: Contra-ataque!']);
        expect(dispararResultadoDoAcerto([{ nome: 'Zumbi', acertou: false }], { atacanteSouEu: false, nomeAtacante: 'Mestre' })).toEqual([]);
    });
    it('alvo desconhecido (pj:Fantasma) nao quebra', () => {
        montar(ficha(), {});
        expect(dispararResultadoDoAcerto([{ nome: 'F', acertou: false, dummieId: 'pj:Fantasma' }], { atacanteSouEu: false })).toEqual([]);
    });
    // BUG CONHECIDO (baixa probabilidade): a resolucao por nome ignora o dummieId; um Dummie com o mesmo nome de um jogador aciona o gatilho do jogador.
    it('Dummie de nome igual a um jogador, com id proprio, NAO deve acionar o gatilho do jogador', () => {
        const ana = ficha([contra()]); montar(ficha(), { Ana: ana });
        // Dummie "Ana" (id d9) escapou: o evento so deve ir para o personagem se o alvo FOR o personagem (id pj:Ana).
        const t = dispararResultadoDoAcerto([{ nome: 'Ana', acertou: false, dummieId: 'd9' }], { atacanteSouEu: false, nomeAtacante: 'Mestre' });
        expect(t).toEqual([]);
    });
});

describe('dispararResultadoDoAcerto - Dummie homonimo vs pj:Nome', () => {
    it('Dummie "Ana" nao aciona o jogador Ana; o alvo pj:Ana aciona', () => {
        const ana = ficha([G({ id: 'g1', nome: 'Contra', evento: { tipo: 'inimigoErrou' }, acoes: [{ tipo: 'mensagem', texto: 'ok' }] })]); montar(ficha(), { Ana: ana });
        const o = { atacanteSouEu: false, nomeAtacante: 'Mestre' };
        expect(dispararResultadoDoAcerto([{ nome: 'Ana', acertou: false, dummieId: 'd9' }], o)).toEqual([]);
        expect(dispararResultadoDoAcerto([{ nome: 'Ana', acertou: false, dummieId: 'pj:Ana' }], o)).toEqual(['Ana: Contra: ok']);
    });
});
