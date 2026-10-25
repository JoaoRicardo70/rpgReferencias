import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enviarParaFeed, revelarEntradaFeed, iniciarListenerFeed } from './firebase-sync';
import useStore from '../stores/useStore';
import { update, push, onChildAdded, onChildChanged } from 'firebase/database';

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
    limitToLast: vi.fn(),
    query: vi.fn((r) => r),
}));
vi.mock('./firebase-config', () => ({ db: {} }));
vi.mock('../stores/useStore', () => ({
    default: { getState: vi.fn() },
    sanitizarNome: vi.fn((n) => n),
}));

const estado = (isMestre) => useStore.getState.mockReturnValue({ mesaId: 'mesa1', isMestre });

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    estado(true);
});

describe('enviarParaFeed - privado', () => {
    it('Mestre com padrão ligado grava privado: true', () => {
        enviarParaFeed({ tipo: 'skill', nome: 'X' });
        expect(push).toHaveBeenCalledWith('mesas/mesa1/feed_combate', { tipo: 'skill', nome: 'X', privado: true });
    });
    it('ataques (acerto/dano) do Mestre continuam públicos por padrão, pro alvo poder reagir', () => {
        enviarParaFeed({ tipo: 'dano', nome: 'X' });
        expect(push.mock.calls[0][1]).not.toHaveProperty('privado');
        enviarParaFeed({ tipo: 'acerto', nome: 'X' });
        expect(push.mock.calls[1][1]).not.toHaveProperty('privado');
    });
    it('jogador não grava privado', () => {
        estado(false);
        enviarParaFeed({ tipo: 'dano' });
        expect(push.mock.calls[0][1]).toEqual({ tipo: 'dano' });
        expect(push.mock.calls[0][1]).not.toHaveProperty('privado');
    });
    it('tipo sistema não é privado', () => {
        enviarParaFeed({ tipo: 'sistema', texto: 'x' });
        expect(push.mock.calls[0][1]).not.toHaveProperty('privado');
    });
    it('padrão desligado não grava privado', () => {
        localStorage.setItem('rpg_dados_mestre_privados', '0');
        enviarParaFeed({ tipo: 'dano' });
        expect(push.mock.calls[0][1]).not.toHaveProperty('privado');
    });
    it('privado explícito é respeitado', () => {
        enviarParaFeed({ tipo: 'dano', privado: false });
        expect(push.mock.calls[0][1].privado).toBe(false);
        estado(false);
        enviarParaFeed({ tipo: 'dano', privado: true });
        expect(push.mock.calls[1][1].privado).toBe(true);
    });
    it('sem mesaId não envia', () => {
        useStore.getState.mockReturnValue({ mesaId: '', isMestre: true });
        enviarParaFeed({ tipo: 'dano' });
        expect(push).not.toHaveBeenCalled();
    });
    it('não muta o objeto original', () => {
        const d = { tipo: 'dano' };
        enviarParaFeed(d);
        expect(d).toEqual({ tipo: 'dano' });
    });
});

describe('revelarEntradaFeed', () => {
    it('faz update com privado:false e devolve true', async () => {
        await expect(revelarEntradaFeed('k1')).resolves.toBe(true);
        expect(update).toHaveBeenCalledWith('mesas/mesa1/feed_combate/k1', { privado: false });
    });
    it('devolve false se o update falhar', async () => {
        update.mockImplementationOnce(() => Promise.reject(new Error('x')));
        await expect(revelarEntradaFeed('k1')).resolves.toBe(false);
    });
    it('chave vazia ou sem mesa => false sem update', async () => {
        await expect(revelarEntradaFeed('')).resolves.toBe(false);
        await expect(revelarEntradaFeed(undefined)).resolves.toBe(false);
        useStore.getState.mockReturnValue({ mesaId: '' });
        await expect(revelarEntradaFeed('k')).resolves.toBe(false);
        expect(update).not.toHaveBeenCalled();
    });
});

describe('iniciarListenerFeed', () => {
    it('injeta _chave nas novas e chama o 2º callback em onChildChanged', () => {
        const cancelaA = vi.fn(), cancelaC = vi.fn();
        onChildAdded.mockReturnValue(cancelaA);
        onChildChanged.mockReturnValue(cancelaC);
        const cb = vi.fn(), alt = vi.fn();
        const cancelar = iniciarListenerFeed(cb, alt);
        onChildAdded.mock.calls[0][1]({ key: 'k1', val: () => ({ tipo: 'dano' }) });
        expect(cb).toHaveBeenCalledWith({ tipo: 'dano', _chave: 'k1' });
        onChildChanged.mock.calls[0][1]({ key: 'k1', val: () => ({ tipo: 'dano', privado: false }) });
        expect(alt).toHaveBeenCalledWith({ tipo: 'dano', privado: false, _chave: 'k1' });
        cancelar();
        expect(cancelaA).toHaveBeenCalled();
        expect(cancelaC).toHaveBeenCalled();
    });
    it('sem 2º callback não registra onChildChanged', () => {
        onChildAdded.mockReturnValue(vi.fn());
        iniciarListenerFeed(vi.fn());
        expect(onChildChanged).not.toHaveBeenCalled();
    });
    it('snapshot vazio é ignorado', () => {
        onChildAdded.mockReturnValue(vi.fn());
        const cb = vi.fn();
        iniciarListenerFeed(cb);
        onChildAdded.mock.calls[0][1]({ key: 'k', val: () => null });
        expect(cb).not.toHaveBeenCalled();
    });
    it('sem mesa devolve cancelador inócuo', () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        const c = iniciarListenerFeed(vi.fn());
        expect(() => c()).not.toThrow();
        expect(onChildAdded).not.toHaveBeenCalled();
    });
});
