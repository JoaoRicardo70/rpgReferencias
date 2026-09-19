import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mensagensCb = {};
const desligar = vi.fn();
let meusChatsCb;
let lidosCb;
vi.mock('../services/chat-sync', () => ({
    iniciarListenerMeusChats: vi.fn((m, n, cb) => { meusChatsCb = cb; return desligar; }),
    iniciarListenerLidos: vi.fn((m, n, cb) => { lidosCb = cb; return desligar; }),
    iniciarListenerMensagensChat: vi.fn((m, id, cb) => { mensagensCb[id] = cb; return desligar; }),
    enviarMensagemChat: vi.fn(() => Promise.resolve(true)),
    marcarChatComoLido: vi.fn(() => Promise.resolve(true)),
    criarChatRemoto: vi.fn(() => Promise.resolve(true)),
    sairDoChatRemoto: vi.fn(() => Promise.resolve(true)),
}));

import { useChats } from '../hooks/useChats';
import { criarChatRemoto } from '../services/chat-sync';

describe('useChats', () => {
    beforeEach(() => { vi.clearAllMocks(); Object.keys(mensagensCb).forEach(k => delete mensagensCb[k]); });

    it('sempre tem a Party e conta não lidas de outras pessoas', () => {
        const { result } = renderHook(() => useChats('mesa1', 'A'));
        expect(result.current.chats.map(c => c.id)).toEqual(['party']);
        act(() => { mensagensCb.party({ id: '1', autor: 'B', texto: 'oi', ts: 10 }); });
        expect(result.current.totalNaoLidas).toBe(0); // marcador de leitura ainda não chegou
        act(() => { lidosCb({}); });
        act(() => { mensagensCb.party({ id: '2', autor: 'A', texto: 'eu', ts: 11 }); });
        expect(result.current.naoLidas.party).toBe(1);
        expect(result.current.totalNaoLidas).toBe(1);
        act(() => { result.current.marcarLido('party'); });
        expect(result.current.totalNaoLidas).toBe(0);
    });

    it('ignora mensagem repetida e escuta conversas novas do índice', () => {
        const { result } = renderHook(() => useChats('mesa1', 'A'));
        act(() => { mensagensCb.party({ id: '1', autor: 'B', texto: 'oi', ts: 10 }); });
        act(() => { mensagensCb.party({ id: '1', autor: 'B', texto: 'oi', ts: 10 }); });
        expect(result.current.mensagens.party).toHaveLength(1);
        act(() => { meusChatsCb({ dm__A__B: { tipo: 'privado', membros: ['A', 'B'], criadoEm: 1 } }); });
        expect(result.current.chats.map(c => c.id)).toContain('dm__A__B');
        expect(mensagensCb.dm__A__B).toBeTypeOf('function');
    });

    it('abrirPrivado cria só se ainda não existe e recusa a si mesmo', async () => {
        const { result } = renderHook(() => useChats('mesa1', 'A'));
        let id;
        await act(async () => { id = await result.current.abrirPrivado('B'); });
        expect(id).toBe('dm__A__B');
        expect(criarChatRemoto).toHaveBeenCalledTimes(1);
        await act(async () => { id = await result.current.abrirPrivado('A'); });
        expect(id).toBeNull();
    });

    it('sem mesa ou nome não liga nenhum ouvinte de mensagens', () => {
        renderHook(() => useChats('', 'A'));
        expect(Object.keys(mensagensCb)).toHaveLength(0);
    });
});
