import { describe, it, expect } from 'vitest';
import { nomesComAcessoAoNpc, npcsLiberadosParaJogador, alternarNomeNaLista, jogadoresDaMesa } from './trocaPersonagem';

const npc = (acesso) => ({ isNPC: true, acessoJogadores: acesso });

describe('nomesComAcessoAoNpc', () => {
    it('array', () => expect(nomesComAcessoAoNpc(npc(['Ana', 'Bia']))).toEqual(['Ana', 'Bia']));
    it('objeto indexado do Firebase', () => expect(nomesComAcessoAoNpc(npc({ 0: 'Ana', 1: 'Bia' }))).toEqual(['Ana', 'Bia']));
    it('vazio / ausente / ficha nula', () => {
        expect(nomesComAcessoAoNpc(npc([]))).toEqual([]);
        expect(nomesComAcessoAoNpc(npc({}))).toEqual([]);
        expect(nomesComAcessoAoNpc({ isNPC: true })).toEqual([]);
        expect(nomesComAcessoAoNpc(null)).toEqual([]);
        expect(nomesComAcessoAoNpc(npc('Ana'))).toEqual([]);
    });
    it('ignora itens inválidos', () => {
        expect(nomesComAcessoAoNpc(npc(['Ana', '', null, 5, {}, undefined]))).toEqual(['Ana']);
    });
    it('sanitiza nomes', () => {
        expect(nomesComAcessoAoNpc(npc(['A.b/c']))).toEqual(['A_b_c']);
    });
});

describe('npcsLiberadosParaJogador', () => {
    const personagens = {
        Zumbi: npc(['Ana']),
        Goblin: npc({ 0: 'Ana' }),
        Lobo: npc(['Bia']),
        Ana: { acessoJogadores: ['Ana'] },
        Nulo: null,
    };
    it('lista só os liberados, em ordem alfabética', () => {
        expect(npcsLiberadosParaJogador(personagens, 'Ana').map(p => p.nome)).toEqual(['Goblin', 'Zumbi']);
    });
    it('devolve a ficha junto', () => {
        expect(npcsLiberadosParaJogador(personagens, 'Bia')[0]).toEqual({ nome: 'Lobo', ficha: personagens.Lobo });
    });
    it('não-NPC com acesso é ignorado; nome vazio/ausente => []', () => {
        expect(npcsLiberadosParaJogador(personagens, '')).toEqual([]);
        expect(npcsLiberadosParaJogador(personagens, null)).toEqual([]);
        expect(npcsLiberadosParaJogador(personagens, 'Caio')).toEqual([]);
        expect(npcsLiberadosParaJogador(null, 'Ana')).toEqual([]);
    });
    it('sanitiza o nome do jogador', () => {
        expect(npcsLiberadosParaJogador({ X: npc(['A_b']) }, 'A.b').map(p => p.nome)).toEqual(['X']);
    });
});

describe('alternarNomeNaLista', () => {
    it('adiciona', () => expect(alternarNomeNaLista(['A'], 'B')).toEqual(['A', 'B']));
    it('remove', () => expect(alternarNomeNaLista(['A', 'B'], 'A')).toEqual(['B']));
    it('lista inválida vira nova', () => {
        expect(alternarNomeNaLista(undefined, 'A')).toEqual(['A']);
        expect(alternarNomeNaLista(null, 'A')).toEqual(['A']);
    });
    it('não muta', () => {
        const l = ['A'];
        alternarNomeNaLista(l, 'B');
        expect(l).toEqual(['A']);
    });
});

describe('jogadoresDaMesa', () => {
    it('só jogadores, ordenados, sem inválidos', () => {
        const p = { Zed: {}, Ana: { bio: {} }, Goblin: { isNPC: true }, Pet: { bio: { mesa: 'npc' } }, Nulo: null, Str: 'x' };
        expect(jogadoresDaMesa(p)).toEqual(['Ana', 'Zed']);
    });
    it('vazio / nulo', () => {
        expect(jogadoresDaMesa({})).toEqual([]);
        expect(jogadoresDaMesa(null)).toEqual([]);
    });
});
