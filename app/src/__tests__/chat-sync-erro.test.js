import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => ({ __path: path })),
    push: vi.fn(), update: vi.fn(), set: vi.fn(),
    onValue: vi.fn(), onChildAdded: vi.fn(), limitToLast: vi.fn(n => n), query: vi.fn(r => r),
    serverTimestamp: vi.fn(() => ({})),
}));
vi.mock('../services/firebase-config', () => ({ db: { fake: true } }));

import { push } from 'firebase/database';
import { enviarMensagemChat, ultimoErroChat } from '../services/chat-sync';

describe('chat-sync ultimoErroChat', () => {
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

    it('push rejeitado com PERMISSION_DENIED registra o erro', async () => {
        push.mockReturnValueOnce(Promise.reject({ code: 'PERMISSION_DENIED' }));
        expect(await enviarMensagemChat('mesa1', 'party', 'Ana', 'oi')).toBe(false);
        expect(ultimoErroChat()).toEqual({ codigo: 'PERMISSION_DENIED', operacao: 'enviar mensagem' });
    });
    it('usa message quando nao ha code', async () => {
        push.mockReturnValueOnce(Promise.reject(new Error('boom')));
        await enviarMensagemChat('mesa1', 'party', 'Ana', 'oi');
        expect(ultimoErroChat().codigo).toBe('boom');
    });
    it('rejeicao sem detalhes vira desconhecido', async () => {
        push.mockReturnValueOnce(Promise.reject(undefined));
        await enviarMensagemChat('mesa1', 'party', 'Ana', 'oi');
        expect(ultimoErroChat().codigo).toBe('desconhecido');
    });
});
