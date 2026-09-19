import { describe, it, expect } from 'vitest';
import {
    idChatPrivado, montarChatPrivado, montarChatGrupo, limparTextoMensagem, contarNaoLidas,
    ordenarChats, chatsDoIndice, caminhosDeCriacao, nomeDoChat, alternarPresencaNaTaverna, chatPartyPadrao
} from '../core/chats';

describe('chats — lógica pura', () => {
    it('o id privado não depende de quem abre a conversa', () => {
        expect(idChatPrivado('Natsu', 'Lucy')).toBe(idChatPrivado('Lucy', 'Natsu'));
    });
    it('não cria conversa privada consigo mesmo nem com nome vazio', () => {
        expect(montarChatPrivado('Natsu', 'Natsu')).toBeNull();
        expect(montarChatPrivado('Natsu', '')).toBeNull();
    });
    it('sanitiza nomes com caracteres proibidos no Firebase', () => {
        const c = montarChatPrivado('Na.tsu', 'Lu/cy');
        expect(c.membros).toEqual(['Na_tsu', 'Lu_cy']);
        expect(c.id).not.toMatch(/[.#$[\]/]/);
    });
    it('grupo exige nome e ao menos mais uma pessoa; remove duplicados', () => {
        expect(montarChatGrupo('A', '', ['B'])).toBeNull();
        expect(montarChatGrupo('A', 'Time', [])).toBeNull();
        expect(montarChatGrupo('A', 'Time', ['A'])).toBeNull();
        const g = montarChatGrupo('A', '  Time   Alfa ', ['B', 'B', 'C'], 1, 'x');
        expect(g.nome).toBe('Time Alfa');
        expect(g.membros).toEqual(['A', 'B', 'C']);
        expect(g.tipo).toBe('grupo');
    });
    it('limpa e limita o texto da mensagem', () => {
        expect(limparTextoMensagem('  oi   mundo ')).toBe('oi mundo');
        expect(limparTextoMensagem('a'.repeat(900))).toHaveLength(500);
        expect(limparTextoMensagem(null)).toBe('');
    });
    it('conta só mensagens alheias posteriores à última leitura', () => {
        const ms = [{ autor: 'B', ts: 5 }, { autor: 'A', ts: 20 }, { autor: 'B', ts: 30 }];
        expect(contarNaoLidas(ms, 10, 'A')).toBe(1);
        expect(contarNaoLidas(ms, 0, 'A')).toBe(2);
        expect(contarNaoLidas(undefined, 0, 'A')).toBe(0);
    });
    it('party fica sempre no topo e o resto por atividade recente', () => {
        const chats = [{ id: 'a', tipo: 'grupo', criadoEm: 1 }, chatPartyPadrao(), { id: 'b', tipo: 'privado', criadoEm: 2 }];
        expect(ordenarChats(chats, { a: 50 }).map(c => c.id)).toEqual(['party', 'a', 'b']);
    });
    it('lê o índice ignorando entradas inválidas', () => {
        const lista = chatsDoIndice({ x: { tipo: 'grupo', nome: 'G', membros: ['A', 'B'] }, y: 'lixo', z: { tipo: 'party' } });
        expect(lista).toHaveLength(1);
        expect(lista[0].id).toBe('x');
        expect(chatsDoIndice(null)).toEqual([]);
    });
    it('cria uma cópia do cadastro para cada membro', () => {
        const g = montarChatGrupo('A', 'G', ['B'], 1, 'x');
        const u = caminhosDeCriacao(g);
        expect(Object.keys(u)).toEqual([`chatsMembros/A/${g.id}`, `chatsMembros/B/${g.id}`]);
    });
    it('nome do chat privado mostra a outra pessoa', () => {
        expect(nomeDoChat(montarChatPrivado('A', 'B'), 'A')).toBe('B');
        expect(nomeDoChat(chatPartyPadrao(), 'A')).toBe('Party');
    });
    it('alterna presença sem mutar o cenário original', () => {
        const c = { modoRP: true, tavernaAtivos: ['B'] };
        const entrou = alternarPresencaNaTaverna(c, 'A');
        expect(entrou.tavernaAtivos).toEqual(['B', 'A']);
        expect(c.tavernaAtivos).toEqual(['B']);
        expect(alternarPresencaNaTaverna(entrou, 'A').tavernaAtivos).toEqual(['B']);
        expect(alternarPresencaNaTaverna(undefined, 'A').tavernaAtivos).toEqual(['A']);
    });
});

import { descreverErroChat } from '../core/chats';
describe('descreverErroChat', () => {
    it('explica permission_denied, rede e erro genérico', () => {
        expect(descreverErroChat({ codigo: 'PERMISSION_DENIED', operacao: 'enviar mensagem' })).toMatch(/regras do Firebase/);
        expect(descreverErroChat({ codigo: 'network-error' })).toMatch(/Sem conexão/);
        expect(descreverErroChat({ codigo: 'xyz', operacao: 'criar conversa' })).toBe('Falha ao criar conversa: xyz');
        expect(descreverErroChat(null)).toMatch(/Não foi possível enviar/);
    });
});
