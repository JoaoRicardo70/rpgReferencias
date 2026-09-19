import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => ({ __path: path })),
    push: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    set: vi.fn(() => Promise.resolve()),
    onValue: vi.fn(() => () => {}),
    onChildAdded: vi.fn(() => () => {}),
    limitToLast: vi.fn(n => n),
    query: vi.fn(r => r),
    serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
}));
vi.mock('../services/firebase-config', () => ({ db: { fake: true } }));

import { push, update, set } from 'firebase/database';
import {
    enviarMensagemChat, criarChatRemoto, marcarChatComoLido, sairDoChatRemoto,
} from '../services/chat-sync';

describe('chat-sync', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('enviarMensagemChat', () => {
        it('envia {autor,texto,ts} no caminho correto', async () => {
            const r = await enviarMensagemChat('mesa1', 'party', 'Ana', '  oi   mundo ');
            expect(r).toBe(true);
            expect(push).toHaveBeenCalledTimes(1);
            const [refArg, payload] = push.mock.calls[0];
            expect(refArg.__path).toBe('mesas/mesa1/chatsMensagens/party');
            expect(payload).toEqual({ autor: 'Ana', texto: 'oi mundo', ts: { '.sv': 'timestamp' } });
        });

        it.each(['a.b', 'a#b', 'a$b', 'a[b', 'a]b', 'a/b'])('rejeita autor inseguro %s', async (nome) => {
            expect(await enviarMensagemChat('mesa1', 'party', nome, 'oi')).toBe(false);
            expect(push).not.toHaveBeenCalled();
        });

        it.each(['m.1', 'm/1', 'm#', 'm$'])('rejeita mesa insegura %s', async (m) => {
            expect(await enviarMensagemChat(m, 'party', 'Ana', 'oi')).toBe(false);
            expect(push).not.toHaveBeenCalled();
        });

        it('rejeita chatId inseguro', async () => {
            expect(await enviarMensagemChat('mesa1', 'a/b', 'Ana', 'oi')).toBe(false);
            expect(push).not.toHaveBeenCalled();
        });

        it.each(['', '   ', '\n\t', null, undefined, 42])('rejeita texto vazio/invalido %j', async (t) => {
            expect(await enviarMensagemChat('mesa1', 'party', 'Ana', t)).toBe(false);
            expect(push).not.toHaveBeenCalled();
        });

        it('rejeita segmentos vazios ou nao-string', async () => {
            expect(await enviarMensagemChat('', 'party', 'Ana', 'oi')).toBe(false);
            expect(await enviarMensagemChat('mesa1', 'party', undefined, 'oi')).toBe(false);
            expect(push).not.toHaveBeenCalled();
        });

        it('trunca texto em 500 caracteres', async () => {
            await enviarMensagemChat('mesa1', 'party', 'Ana', 'x'.repeat(900));
            expect(push.mock.calls[0][1].texto).toHaveLength(500);
        });

        it('retorna false quando o push falha', async () => {
            push.mockReturnValueOnce(Promise.reject(new Error('offline')));
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(await enviarMensagemChat('mesa1', 'party', 'Ana', 'oi')).toBe(false);
            warn.mockRestore();
        });
    });

    describe('criarChatRemoto', () => {
        const chat = { id: 'dm__A__B', tipo: 'privado', nome: '', membros: ['A', 'B'], criadoPor: 'A', criadoEm: 5 };

        it('faz um unico update multi-path com chatsMembros/{membro}/{chatId}', async () => {
            expect(await criarChatRemoto('mesa1', chat)).toBe(true);
            expect(update).toHaveBeenCalledTimes(1);
            const updates = update.mock.calls[0][1];
            expect(Object.keys(updates).sort()).toEqual([
                'mesas/mesa1/chatsMembros/A/dm__A__B',
                'mesas/mesa1/chatsMembros/B/dm__A__B',
            ]);
            expect(updates['mesas/mesa1/chatsMembros/A/dm__A__B']).toMatchObject({ tipo: 'privado', membros: ['A', 'B'], criadoPor: 'A' });
        });

        it("recusa o id 'party'", async () => {
            expect(await criarChatRemoto('mesa1', { ...chat, id: 'party' })).toBe(false);
            expect(update).not.toHaveBeenCalled();
        });

        it('recusa membro, id ou mesa inseguros e chat nulo', async () => {
            expect(await criarChatRemoto('mesa1', { ...chat, membros: ['A', 'B/x'] })).toBe(false);
            expect(await criarChatRemoto('mesa1', { ...chat, id: 'a.b' })).toBe(false);
            expect(await criarChatRemoto('m.1', chat)).toBe(false);
            expect(await criarChatRemoto('mesa1', null)).toBe(false);
            expect(update).not.toHaveBeenCalled();
        });

        it('retorna false quando update falha', async () => {
            update.mockReturnValueOnce(Promise.reject(new Error('x')));
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(await criarChatRemoto('mesa1', chat)).toBe(false);
            warn.mockRestore();
        });
    });

    describe('marcarChatComoLido', () => {
        it('grava o timestamp em chatsLidos/{nome}/{chatId}', async () => {
            expect(await marcarChatComoLido('mesa1', 'Ana', 'party', 123)).toBe(true);
            expect(set.mock.calls[0][0].__path).toBe('mesas/mesa1/chatsLidos/Ana/party');
            expect(set.mock.calls[0][1]).toBe(123);
        });

        it('usa Date.now por padrao', async () => {
            await marcarChatComoLido('mesa1', 'Ana', 'party');
            expect(typeof set.mock.calls[0][1]).toBe('number');
        });

        it('rejeita nomes inseguros', async () => {
            expect(await marcarChatComoLido('mesa1', 'A.na', 'party')).toBe(false);
            expect(set).not.toHaveBeenCalled();
        });
    });

    describe('sairDoChatRemoto', () => {
        it('grava null em chatsMembros/{nome}/{chatId}', async () => {
            expect(await sairDoChatRemoto('mesa1', 'Ana', 'grp__x')).toBe(true);
            expect(set.mock.calls[0][0].__path).toBe('mesas/mesa1/chatsMembros/Ana/grp__x');
            expect(set.mock.calls[0][1]).toBeNull();
        });

        it('rejeita chatId inseguro', async () => {
            expect(await sairDoChatRemoto('mesa1', 'Ana', 'a/b')).toBe(false);
            expect(set).not.toHaveBeenCalled();
        });

        it('retorna false quando set falha', async () => {
            set.mockReturnValueOnce(Promise.reject(new Error('x')));
            expect(await sairDoChatRemoto('mesa1', 'Ana', 'grp__x')).toBe(false);
        });
    });
});
