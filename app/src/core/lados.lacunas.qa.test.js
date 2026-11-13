import { describe, it, expect } from 'vitest';
import {
    relacaoEntre, relacaoEntreEquipes, ehAliado, ehInimigo, ehNeutro, equipeDe, alvoNoFiltro, comoCombatente,
    definirRelacao, removerRelacoesDaEquipe, sanitizarRelacoes, sanitizarEquipes, moverParaEquipe, textoMudancaDeLado,
    rotuloDoLado, ROTULO_LADO_OCULTO,
} from './lados.js';
import { encerrarCombateNoCenario, combateAtivo, getRodada, avancarRodadaSeVoltou, iniciarCombateNoCenario } from './combateEstado.js';
import { montarContextoAdaptacao, poderDoOponenteMaisForte } from './adaptacaoTurno.js';

const fp = (vida, combate = {}, extra = {}) => ({ combate: { ...combate }, vida: { base: vida }, ascensaoBase: 1, ...extra });
const eq = (id) => ({ id, nome: id.toUpperCase(), cor: '#112233', icone: 'x' });

describe('relações (lacunas)', () => {
    const cen = { equipes: [eq('a'), eq('b'), eq('c')], relacoes: { 'a|b': 'aliada', 'b|c': 'aliada' } };
    it('NÃO é transitiva: A aliada B e B aliada C => A e C neutras', () => {
        expect(relacaoEntreEquipes(cen, 'a', 'b')).toBe('aliada');
        expect(relacaoEntreEquipes(cen, 'b', 'c')).toBe('aliada');
        expect(relacaoEntreEquipes(cen, 'a', 'c')).toBe('neutra');
        expect(relacaoEntreEquipes(cen, 'c', 'a')).toBe('neutra');
    });
    it('hostil também não propaga', () => {
        const c = { equipes: [eq('a'), eq('b'), eq('c')], relacoes: { 'a|b': 'hostil', 'b|c': 'hostil' } };
        expect(relacaoEntreEquipes(c, 'a', 'c')).toBe('neutra');
    });
    it('relação não definida = neutra (sem relacoes / valor inválido / array / cenário nulo)', () => {
        expect(relacaoEntreEquipes({ equipes: [eq('a'), eq('b')] }, 'a', 'b')).toBe('neutra');
        expect(relacaoEntreEquipes({ equipes: [eq('a'), eq('b')], relacoes: { 'a|b': 'xyz' } }, 'a', 'b')).toBe('neutra');
        expect(relacaoEntreEquipes({ equipes: [eq('a'), eq('b')], relacoes: [1, 2] }, 'a', 'b')).toBe('neutra');
        expect(relacaoEntreEquipes(null, 'x', 'y')).toBe('neutra');
        expect(relacaoEntreEquipes(undefined, 'aliados', 'inimigos')).toBe('hostil');
    });
    it('mesma equipe é sempre aliada, mesmo com relação gravada contraditória', () => {
        const c = { equipes: [eq('a')], relacoes: { 'a|a': 'hostil' } };
        expect(relacaoEntreEquipes(c, 'a', 'a')).toBe('aliada');
        expect(relacaoEntre(c, fp(1, { equipe: 'a' }), fp(1, { equipe: 'a' }))).toBe('aliada');
        expect(definirRelacao({}, 'a', 'a', 'hostil')).toEqual({});
    });
    it('relação padrão sobrescrita: aliados<->inimigos aliada se o Mestre definir', () => {
        const c = { relacoes: { 'aliados|inimigos': 'aliada' } };
        expect(ehAliado(c, fp(1), fp(1, {}, { isNPC: true }))).toBe(true);
        expect(ehInimigo(c, fp(1), fp(1, {}, { isNPC: true }))).toBe(false);
    });
    it('ehNeutro: neutros x qualquer = neutra no padrão', () => {
        expect(ehNeutro({}, fp(1, { equipe: 'neutros' }), fp(1))).toBe(true);
        expect(ehNeutro({}, fp(1, { equipe: 'neutros' }), fp(1, {}, { isNPC: true }))).toBe(true);
    });
    it('equipe apagada cai no padrão automático', () => {
        const c = { equipes: [eq('a'), eq('b')] };
        expect(equipeDe(fp(1, { equipe: 'sumiu' }), c)).toBe('aliados');
        expect(equipeDe(fp(1, { equipe: 'sumiu' }, { isNPC: true }), c)).toBe('inimigos');
        expect(equipeDe({ equipe: 'sumiu', isDummie: true }, c)).toBe('inimigos');
        expect(relacaoEntre(c, fp(1, { equipe: 'sumiu' }), { equipe: 'sumiu', isDummie: true })).toBe('hostil');
    });
    it('removerRelacoesDaEquipe / sanitizarRelacoes após apagar equipe não deixam órfãs', () => {
        const rel = { 'a|b': 'hostil', 'b|c': 'aliada', 'a|c': 'neutra' };
        expect(removerRelacoesDaEquipe(rel, 'b')).toEqual({ 'a|c': 'neutra' });
        const eqs = sanitizarEquipes([{ nome: 'A', id: 'a' }, { nome: 'C', id: 'c' }]);
        expect(sanitizarRelacoes(rel, eqs)).toEqual({ 'a|c': 'neutra' });
    });
    it('chave desordenada na entrada é normalizada', () => {
        const eqs = sanitizarEquipes([{ nome: 'A', id: 'a' }, { nome: 'B', id: 'b' }]);
        expect(sanitizarRelacoes({ 'b|a': 'hostil' }, eqs)).toEqual({ 'a|b': 'hostil' });
    });
});

describe('lado oculto: feed e rótulo (lacunas)', () => {
    const cen = { equipes: [eq('a'), eq('b')] };
    it('mover com lado oculto => anunciar=false; visível => anunciar=true', () => {
        expect(moverParaEquipe(cen, fp(1, { equipe: 'a', ladoOculto: true }), 'b')).toMatchObject({ mudou: true, anunciar: false, de: 'a', para: 'b' });
        expect(moverParaEquipe(cen, fp(1, { equipe: 'a' }), 'b').anunciar).toBe(true);
        expect(moverParaEquipe(cen, fp(1, { equipe: 'a' }), 'a').mudou).toBe(false);
    });
    it('rótulo para jogador não vaza a equipe real quando oculto; Mestre vê (oculto)', () => {
        const f = fp(1, { equipe: 'b', ladoOculto: true });
        const r = rotuloDoLado(cen, f, { isMestre: false });
        expect(r).toBe(ROTULO_LADO_OCULTO);
        expect(r).not.toContain('B');
        expect(rotuloDoLado(cen, f, { isMestre: true })).toContain('(oculto)');
    });
    it('textoMudancaDeLado', () => {
        expect(textoMudancaDeLado(cen, 'X', 'a', 'a')).toBe('');
        expect(textoMudancaDeLado(cen, 'X', 'a', 'b')).toBe('🔀 X mudou de lado: A → B');
    });
    it('mecânica usa a equipe real mesmo oculto', () => {
        const c = { equipes: [eq('a'), eq('b')], relacoes: { 'a|b': 'hostil' } };
        expect(ehInimigo(c, fp(1, { equipe: 'a' }), fp(1, { equipe: 'b', ladoOculto: true }))).toBe(true);
    });
});

describe('estado do combate (lacunas)', () => {
    it('encerrar em cena sem combate não quebra nem altera outras cenas', () => {
        const cen = { combates: { outra: { ativo: true, rodada: 4, iniciadoEm: 1 } }, turnoAtualIndex: 3 };
        const r = encerrarCombateNoCenario(cen, 'inexistente');
        expect(r.combates.outra.rodada).toBe(4);
        expect(combateAtivo(r, 'inexistente')).toBe(false);
        expect(() => encerrarCombateNoCenario({}, 'x')).not.toThrow();
        expect(() => encerrarCombateNoCenario(null, 'x')).not.toThrow();
        expect(() => encerrarCombateNoCenario(undefined)).not.toThrow();
    });
    it('ordem de 1 combatente: toda passagem (0 -> 0) sobe a rodada', () => {
        let c = iniciarCombateNoCenario({}, 'c1', 1);
        for (let i = 2; i <= 4; i++) {
            c = avancarRodadaSeVoltou(c, 'c1', 0, 0, 1);
            expect(getRodada(c, 'c1')).toBe(i);
        }
    });
    it('ordem de 3: só sobe ao ir de 2 para 0', () => {
        let c = iniciarCombateNoCenario({}, 'c1', 1);
        c = avancarRodadaSeVoltou(c, 'c1', 0, 1, 3);
        c = avancarRodadaSeVoltou(c, 'c1', 1, 2, 3);
        expect(getRodada(c, 'c1')).toBe(1);
        c = avancarRodadaSeVoltou(c, 'c1', 2, 0, 3);
        expect(getRodada(c, 'c1')).toBe(2);
    });
    it('rodada 0 sem combate; cena default como fallback', () => {
        expect(getRodada({}, 'x')).toBe(0);
        const c = iniciarCombateNoCenario({}, undefined, 5);
        expect(combateAtivo(c, 'default')).toBe(true);
        expect(combateAtivo(c)).toBe(true);
    });
});

describe('alvoNoFiltro: regressão sem configuração (lacunas)', () => {
    const jogador = comoCombatente(fp(1), false);
    const outroJogador = comoCombatente(fp(1), false);
    const dummie = comoCombatente({ nome: 'D' }, true);
    const npc = comoCombatente(fp(1, {}, { isNPC: true }), false);
    for (const cen of [undefined, null, {}, { equipes: [], relacoes: {} }]) {
        it(`cenário ${JSON.stringify(cen)}: inimigos = dummie/NPC; aliados = jogadores`, () => {
            expect(alvoNoFiltro(cen, jogador, dummie, 'inimigos')).toBe(true);
            expect(alvoNoFiltro(cen, jogador, npc, 'inimigos')).toBe(true);
            expect(alvoNoFiltro(cen, jogador, outroJogador, 'inimigos')).toBe(false);
            expect(alvoNoFiltro(cen, jogador, jogador, 'inimigos')).toBe(false);
            expect(alvoNoFiltro(cen, jogador, outroJogador, 'aliados')).toBe(true);
            expect(alvoNoFiltro(cen, jogador, jogador, 'aliados')).toBe(true);
            expect(alvoNoFiltro(cen, jogador, dummie, 'aliados')).toBe(false);
            expect(alvoNoFiltro(cen, jogador, dummie, 'todos')).toBe(true);
            expect(alvoNoFiltro(cen, jogador, dummie, undefined)).toBe(true);
        });
    }
    it('dummie cru sem flag NÃO é dummie; com comoCombatente(true) é inimigo', () => {
        expect(alvoNoFiltro({}, jogador, { nome: 'D' }, 'inimigos')).toBe(false);
        expect(alvoNoFiltro({}, null, comoCombatente({ nome: 'D' }, true), 'inimigos')).toBe(true);
    });
    it('neutros não entram em inimigos nem aliados, mas entram em todos', () => {
        const neutro = comoCombatente(fp(1, { equipe: 'neutros' }), false);
        expect(alvoNoFiltro({}, jogador, neutro, 'inimigos')).toBe(false);
        expect(alvoNoFiltro({}, jogador, neutro, 'aliados')).toBe(false);
        expect(alvoNoFiltro({}, jogador, neutro, 'todos')).toBe(true);
    });
});

describe('Adaptação com 3+ equipes (lacunas)', () => {
    const cen = {
        equipes: [eq('a'), eq('b'), eq('c'), eq('d')],
        relacoes: { 'a|b': 'hostil', 'a|c': 'hostil', 'a|d': 'hostil', 'b|c': 'hostil', 'b|d': 'hostil', 'c|d': 'hostil' },
        combates: { cena: { ativo: true, rodada: 1 } },
    };
    const P = fp(10, { equipe: 'a', adaptacaoLigada: true });
    const B = fp(1e3, { equipe: 'b' });
    const C = fp(1e7, { equipe: 'c' });
    const D = fp(1e5, { equipe: 'd' });
    const ordem = [P, B, C, D].map((f, i) => ({ id: 'ABCD'[i], nome: 'ABCD'[i], isDummie: false, ficha: f }));
    const personagens = { A: P, B, C, D };
    const ctx = (c, extra = {}) => ({ personagens, cenario: c, meuNome: 'A', minhaFicha: P, ...extra });
    it('todos contra todos: escolhe o mais forte entre todos os hostis', () => {
        expect(poderDoOponenteMaisForte(ordem, 'A', ctx(cen)).nome).toBe('C');
    });
    it('se o mais forte vira aliado/neutro, passa ao próximo hostil mais forte', () => {
        expect(poderDoOponenteMaisForte(ordem, 'A', ctx({ ...cen, relacoes: { ...cen.relacoes, 'a|c': 'aliada' } })).nome).toBe('D');
        expect(poderDoOponenteMaisForte(ordem, 'A', ctx({ ...cen, relacoes: { ...cen.relacoes, 'a|c': 'neutra' } })).nome).toBe('D');
    });
    it('sem relações hostis para o portador = null', () => {
        expect(poderDoOponenteMaisForte(ordem, 'A', ctx({ equipes: cen.equipes, relacoes: {} }))).toBeNull();
    });
    it('contexto: sem combate ativo na cena = null; ativo = oponente; adaptação desligada = null', () => {
        expect(montarContextoAdaptacao(P, 'A', ordem, ctx(cen, { cenaIdCombate: 'cena' })).oponente.nome).toBe('C');
        expect(montarContextoAdaptacao(P, 'A', ordem, ctx(cen, { cenaIdCombate: 'outra' }))).toBeNull();
        expect(montarContextoAdaptacao(fp(10, { equipe: 'a' }), 'A', ordem, ctx(cen))).toBeNull();
    });
    it('é relativo ao portador: B como portador também enxerga C', () => {
        expect(poderDoOponenteMaisForte(ordem, 'B', ctx(cen)).nome).toBe('C');
    });
});
