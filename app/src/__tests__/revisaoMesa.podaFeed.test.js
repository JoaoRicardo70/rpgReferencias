import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enviarParaFeed } from '../services/firebase-sync';
import useStore from '../stores/useStore';
import { get, update, push, endBefore, limitToLast } from 'firebase/database';

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    onChildChanged: vi.fn(),
    onDisconnect: vi.fn(() => ({ remove: () => Promise.resolve() })),
    limitToLast: vi.fn((n) => ({ limitToLast: n })),
    orderByKey: vi.fn(() => ({ orderByKey: true })),
    endBefore: vi.fn((k) => ({ endBefore: k })),
    query: vi.fn((r, ...c) => ({ r, c })),
}));
vi.mock('../services/firebase-config', () => ({ db: {} }));
vi.mock('../stores/useStore', () => ({
    default: { getState: vi.fn() },
    sanitizarNome: vi.fn((n) => n),
}));

const snap = (obj) => ({ exists: () => obj !== null && Object.keys(obj).length > 0, val: () => obj });
const chaves = (de, ate) => { const o = {}; for (let i = de; i <= ate; i++) o[`k${String(i).padStart(6, '0')}`] = { i }; return o; };
const enviar = (n) => { for (let i = 0; i < n; i++) enviarParaFeed({ tipo: 'sistema', texto: String(i) }); };
const esperar = () => new Promise(r => setTimeout(r, 20));

beforeEach(async () => {
    vi.clearAllMocks();
    useStore.getState.mockReturnValue({ mesaId: 'mesa1', isMestre: false });
    // zera o contador interno do modulo para multiplo de 60 (cada teste envia exatamente multiplos de 60)
    get.mockResolvedValue(snap(null));
});

describe('poda do feed no Firebase', () => {
    it('so poda a cada 60 envios (59 nao dispara)', async () => {
        enviar(59);
        await esperar();
        expect(get).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledTimes(59);
        enviar(1);
        await esperar();
        expect(get).toHaveBeenCalledTimes(1);
        expect(limitToLast).toHaveBeenCalledWith(1500);
        // zera o contador para os proximos: ja voltou a 0
    });
    it('com 1500 recentes apaga SO as chaves anteriores ao marco, sem tocar nas 1500 ultimas', async () => {
        const recentes = chaves(1000, 2499);
        const antigas = chaves(900, 999);
        get.mockResolvedValueOnce(snap(recentes)).mockResolvedValueOnce(snap(antigas));
        enviar(60);
        await esperar();
        expect(endBefore).toHaveBeenCalledWith('k001000');
        expect(update).toHaveBeenCalledTimes(1);
        const payload = update.mock.calls[0][1];
        expect(Object.keys(payload).sort()).toEqual(Object.keys(antigas).sort());
        Object.values(payload).forEach(v => expect(v).toBeNull());
        Object.keys(recentes).forEach(k => expect(payload).not.toHaveProperty(k));
    });
    it('menos de 1500 entradas: nada a apagar', async () => {
        get.mockResolvedValueOnce(snap(chaves(1, 1499)));
        enviar(60);
        await esperar();
        expect(get).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
    });
    it('idempotente: sem chaves antigas, rodar de novo nao apaga nada', async () => {
        const recentes = chaves(1000, 2499);
        get.mockResolvedValue(snap(recentes));
        // 1a rodada: antigas = recentes (mock devolve o mesmo) -> para testar idempotencia usamos sequencia explicita
        get.mockReset();
        get.mockResolvedValueOnce(snap(recentes)).mockResolvedValueOnce(snap(chaves(1, 3)))
            .mockResolvedValueOnce(snap(recentes)).mockResolvedValueOnce(snap(null));
        enviar(60);
        await esperar();
        expect(update).toHaveBeenCalledTimes(1);
        enviar(60);
        await esperar();
        expect(update).toHaveBeenCalledTimes(1);
    });
    it('falha do Firebase na poda nao quebra o envio', async () => {
        get.mockRejectedValue(new Error('offline'));
        expect(() => enviar(60)).not.toThrow();
        await esperar();
        expect(update).not.toHaveBeenCalled();
    });
    it('lote limitado a 100 chaves antigas por rodada', async () => {
        enviar(0);
        get.mockResolvedValueOnce(snap(chaves(1000, 2499))).mockResolvedValueOnce(snap(chaves(1, 100)));
        enviar(60);
        await esperar();
        expect(Object.keys(update.mock.calls[0][1])).toHaveLength(100);
    });
});
