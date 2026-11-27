import { describe, it, expect } from 'vitest';
import {
    EQUIPES_PADRAO, getEquipes, getRelacoes, equipeDe, relacaoEntreEquipes, relacaoEntre, ehAliado, ehInimigo, ehNeutro,
    chaveRelacao, ladoVisivelParaMim, ladoEstaOculto, rotuloDoLado, inimigosDe, aliadosDe, sanitizarEquipes, sanitizarRelacoes,
    definirRelacao, removerRelacoesDaEquipe, moverParaEquipe, patchEquipe, patchLadoOculto, textoMudancaDeLado, gerarIdEquipe,
    comoCombatente, alvoNoFiltro, LIMITE_EQUIPES, ROTULO_LADO_OCULTO,
} from './lados.js';

const jogador = (extra = {}) => ({ combate: { ...extra } });
const npc = (extra = {}) => ({ isNPC: true, combate: { ...extra } });
const inimigo = (extra = {}) => npc(extra);
const D = (d) => comoCombatente(d);

describe('padrão virtual (sem equipes no cenário)', () => {
    it('getEquipes devolve aliados/inimigos/neutros', () => {
        expect(getEquipes(undefined).map(e => e.id)).toEqual(['aliados', 'inimigos', 'neutros']);
        expect(getEquipes({ equipes: [] })).toBe(EQUIPES_PADRAO);
    });
    it('jogador = aliados; NPC = inimigos', () => {
        expect(equipeDe(jogador())).toBe('aliados');
        expect(equipeDe(npc())).toBe('inimigos');
        expect(equipeDe(D(inimigo()))).toBe('inimigos');
        expect(equipeDe({ nome: 'x', ficha: npc() })).toBe('inimigos');
        expect(equipeDe({ id: 'd1', ficha: inimigo() })).toBe('inimigos');
    });
    it('aliados x inimigos = hostil; mesma equipe = aliada; neutros = neutra', () => {
        const c = {};
        expect(relacaoEntre(c, jogador(), D(inimigo()))).toBe('hostil');
        expect(relacaoEntre(c, jogador(), jogador())).toBe('aliada');
        expect(relacaoEntre(c, D(inimigo()), D(inimigo()))).toBe('aliada');
        expect(relacaoEntre(c, jogador({ equipe: 'neutros' }), D(inimigo()))).toBe('neutra');
        expect(relacaoEntre(c, jogador({ equipe: 'neutros' }), jogador())).toBe('neutra');
        expect(relacaoEntre(undefined, jogador(), npc())).toBe('hostil');
    });
    it('ehAliado / ehInimigo / ehNeutro', () => {
        expect(ehAliado({}, jogador(), jogador())).toBe(true);
        expect(ehInimigo({}, jogador(), npc())).toBe(true);
        expect(ehNeutro({}, jogador(), jogador({ equipe: 'neutros' }))).toBe(true);
    });
});

describe('equipes e relações customizadas', () => {
    const cenario = {
        equipes: [
            { id: 'a', nome: 'A', cor: '#fff', icone: '🅰️' },
            { id: 'b', nome: 'B', cor: '#000', icone: '🅱️' },
            { id: 'c', nome: 'C', cor: '#123456', icone: 'C' },
        ],
        relacoes: { 'a|b': 'hostil', 'b|c': 'aliada' },
    };
    it('equipe gravada vale; sem relação definida = neutra; relação gravada vale nos dois sentidos', () => {
        expect(equipeDe(jogador({ equipe: 'b' }), cenario)).toBe('b');
        expect(relacaoEntreEquipes(cenario, 'a', 'b')).toBe('hostil');
        expect(relacaoEntreEquipes(cenario, 'b', 'a')).toBe('hostil');
        expect(relacaoEntreEquipes(cenario, 'c', 'b')).toBe('aliada');
        expect(relacaoEntreEquipes(cenario, 'a', 'c')).toBe('neutra');
        expect(relacaoEntreEquipes(cenario, 'a', 'a')).toBe('aliada');
    });
    it('equipe apagada do cenário cai no padrão automático', () => {
        expect(equipeDe(jogador({ equipe: 'sumiu' }), cenario)).toBe('aliados');
        expect(equipeDe(D(inimigo({ equipe: 'sumiu' })), cenario)).toBe('inimigos');
        expect(equipeDe(jogador({ equipe: 'sumiu' }))).toBe('sumiu');
    });
    it('a equipe é lida de combate.equipe da ficha', () => {
        expect(equipeDe(D(inimigo({ equipe: 'a' })), cenario)).toBe('a');
        expect(equipeDe(jogador({ equipe: 'c' }), cenario)).toBe('c');
        expect(equipeDe({ equipe: 'a' })).toBe('aliados'); // o campo solto na raiz da ficha não vale
    });
    it('todos contra todos: três lados hostis entre si', () => {
        const c = { equipes: cenario.equipes, relacoes: { 'a|b': 'hostil', 'a|c': 'hostil', 'b|c': 'hostil' } };
        const lista = ['a', 'b', 'c'].map(e => jogador({ equipe: e }));
        expect(inimigosDe(c, lista[0], lista)).toHaveLength(2);
        expect(aliadosDe(c, lista[0], lista)).toHaveLength(0);
    });
    it('inimigosDe/aliadosDe excluem o próprio portador', () => {
        const eu = { id: 'Eu', nome: 'Eu', ficha: jogador() };
        const outro = { id: 'Ou', nome: 'Ou', ficha: jogador() };
        const d1 = { id: 'd1', nome: 'D', ficha: inimigo() };
        expect(aliadosDe({}, eu, [eu, outro, d1]).map(x => x.id)).toEqual(['Ou']);
        expect(inimigosDe({}, eu, [eu, outro, d1]).map(x => x.id)).toEqual(['d1']);
    });
    it('chaveRelacao é alfabética', () => {
        expect(chaveRelacao('z', 'a')).toBe('a|z');
        expect(chaveRelacao('a', 'z')).toBe('a|z');
        expect(getRelacoes(null)).toEqual({});
    });
});

describe('lado oculto', () => {
    it('Mestre sempre vê; jogador só vê se não oculto', () => {
        const f = jogador({ ladoOculto: true });
        expect(ladoEstaOculto(f)).toBe(true);
        expect(ladoVisivelParaMim(f, { isMestre: true })).toBe(true);
        expect(ladoVisivelParaMim(f, { isMestre: false })).toBe(false);
        expect(ladoVisivelParaMim(jogador(), { isMestre: false })).toBe(true);
        expect(ladoEstaOculto(D(inimigo({ ladoOculto: true })))).toBe(true);
    });
    it('a mecânica usa a equipe real mesmo oculto', () => {
        expect(relacaoEntre({}, jogador(), npc({ ladoOculto: true }))).toBe('hostil');
    });
    it('rotuloDoLado', () => {
        expect(rotuloDoLado({}, jogador(), { isMestre: false })).toBe('🛡️ Aliados');
        expect(rotuloDoLado({}, npc({ ladoOculto: true }), { isMestre: false })).toBe(ROTULO_LADO_OCULTO);
        expect(rotuloDoLado({}, npc({ ladoOculto: true }), { isMestre: true })).toBe('👹 Inimigos (oculto)');
    });
});

describe('validação e saneamento', () => {
    it('sanitizarEquipes: nome ≤ 40, cor hex, id slug único, máximo 12', () => {
        const r = sanitizarEquipes([
            { nome: 'x'.repeat(60), cor: 'vermelho', icone: '🔥' },
            { id: 'Meu Time!', nome: 'Time', cor: '#ABC' },
            { id: 'meu-time', nome: 'Time 2', cor: '#12345678' },
            { nome: '   ' },
            null,
        ]);
        expect(r).toHaveLength(3);
        expect(r[0].nome).toHaveLength(40);
        expect(r[0].cor).toBe('#00e5ff');
        expect(r[1]).toMatchObject({ id: 'meu-time', cor: '#ABC' });
        expect(r[2].id).not.toBe('meu-time');
        expect(new Set(r.map(e => e.id)).size).toBe(3);
        const muitas = sanitizarEquipes(Array.from({ length: 20 }, (_, i) => ({ nome: `E${i}` })));
        expect(muitas).toHaveLength(LIMITE_EQUIPES);
        expect(sanitizarEquipes('lixo')).toEqual([]);
    });
    it('sanitizarRelacoes: só ids existentes, valores válidos, chave normalizada', () => {
        const eq = [{ id: 'a' }, { id: 'b' }];
        expect(sanitizarRelacoes({ 'b|a': 'hostil', 'a|z': 'hostil', 'a|b|c': 'hostil', 'a|a': 'hostil', 'x': 'hostil' }, eq)).toEqual({ 'a|b': 'hostil' });
        expect(sanitizarRelacoes({ 'a|b': 'amigos' }, eq)).toEqual({});
        expect(sanitizarRelacoes(null, eq)).toEqual({});
    });
    it('definirRelacao e removerRelacoesDaEquipe são imutáveis', () => {
        const base = { 'a|b': 'hostil' };
        const nova = definirRelacao(base, 'c', 'a', 'aliada');
        expect(nova).toEqual({ 'a|b': 'hostil', 'a|c': 'aliada' });
        expect(base).toEqual({ 'a|b': 'hostil' });
        expect(definirRelacao(base, 'a', 'a', 'hostil')).toEqual(base);
        expect(definirRelacao(base, 'a', 'b', 'xx')).toEqual(base);
        expect(removerRelacoesDaEquipe(nova, 'a')).toEqual({});
    });
    it('gerarIdEquipe evita colisão', () => {
        expect(gerarIdEquipe('Time Azul', ['time-azul'])).toBe('time-azul-2');
        expect(gerarIdEquipe('', [])).toBe('equipe');
    });
});

describe('patches de mudança de lado', () => {
    it('patchEquipe / patchLadoOculto', () => {
        expect(patchEquipe('x')).toEqual({ 'combate/equipe': 'x' });
        expect(patchLadoOculto(true)).toEqual({ 'combate/ladoOculto': true });
        expect(patchLadoOculto(false)).toEqual({ 'combate/ladoOculto': false });
    });
    it('moverParaEquipe: equipe inexistente = null; anunciar depende do oculto', () => {
        expect(moverParaEquipe({}, jogador(), 'nao-existe')).toBeNull();
        const m = moverParaEquipe({}, jogador(), 'inimigos');
        expect(m).toMatchObject({ patch: { 'combate/equipe': 'inimigos' }, de: 'aliados', para: 'inimigos', mudou: true, anunciar: true });
        expect(moverParaEquipe({}, jogador({ ladoOculto: true }), 'inimigos').anunciar).toBe(false);
        expect(moverParaEquipe({}, jogador(), 'aliados').mudou).toBe(false);
        expect(moverParaEquipe({}, D(inimigo()), 'neutros').patch).toEqual({ 'combate/equipe': 'neutros' });
    });
    it('textoMudancaDeLado', () => {
        expect(textoMudancaDeLado({}, 'Zed', 'aliados', 'inimigos')).toBe('🔀 Zed mudou de lado: Aliados → Inimigos');
        expect(textoMudancaDeLado({}, 'Zed', 'a', 'a')).toBe('');
    });
});

describe('alvoNoFiltro (zonas / golpes em área)', () => {
    it('padrão: inimigos = NPC, aliados = jogadores, todos = tudo', () => {
        const eu = comoCombatente(jogador());
        expect(alvoNoFiltro({}, eu, D(inimigo()), 'inimigos')).toBe(true);
        expect(alvoNoFiltro({}, eu, comoCombatente(jogador()), 'inimigos')).toBe(false);
        expect(alvoNoFiltro({}, eu, comoCombatente(jogador()), 'aliados')).toBe(true);
        expect(alvoNoFiltro({}, eu, D(inimigo()), 'aliados')).toBe(false);
        expect(alvoNoFiltro({}, eu, D(inimigo()), 'todos')).toBe(true);
    });
    it('conjurador não achado conta como jogador', () => {
        expect(alvoNoFiltro({}, null, D(inimigo()), 'inimigos')).toBe(true);
        expect(alvoNoFiltro({}, null, comoCombatente(jogador()), 'aliados')).toBe(true);
    });
    it('é relativo ao conjurador: um NPC conjurando vê o jogador como inimigo', () => {
        expect(alvoNoFiltro({}, D(inimigo()), comoCombatente(jogador()), 'inimigos')).toBe(true);
    });
});
