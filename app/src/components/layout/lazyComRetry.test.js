import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importarComRetry } from './lazyComRetry';

const CHAVE = 'rpgChunkRecarregou';
let reload;
const original = window.location;

beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
});
afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    vi.restoreAllMocks();
});

const esperar = (ms = 15) => new Promise(r => setTimeout(r, ms));

describe('importarComRetry', () => {
    it('sucesso de primeira: nao tenta de novo', async () => {
        const imp = vi.fn().mockResolvedValue('ok');
        await expect(importarComRetry(imp, 2, 0)).resolves.toBe('ok');
        expect(imp).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });
    it('falha e depois resolve: tenta de novo e resolve sem recarregar', async () => {
        const imp = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('ok');
        await expect(importarComRetry(imp, 2, 0)).resolves.toBe('ok');
        expect(imp).toHaveBeenCalledTimes(2);
        expect(reload).not.toHaveBeenCalled();
    });
    it('resolve na ultima tentativa (3a chamada)', async () => {
        const imp = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValueOnce('ok');
        await expect(importarComRetry(imp, 2, 0)).resolves.toBe('ok');
        expect(imp).toHaveBeenCalledTimes(3);
    });
    it('esgotadas as tentativas: recarrega uma vez, grava a trava e a promessa fica pendente', async () => {
        const imp = vi.fn().mockRejectedValue(new Error('chunk'));
        const p = importarComRetry(imp, 2, 0);
        const marcador = Symbol('pendente');
        const r = await Promise.race([p, esperar(50).then(() => marcador)]);
        expect(r).toBe(marcador);
        expect(imp).toHaveBeenCalledTimes(3);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem(CHAVE)).toBe('1');
    });
    it('trava ja gravada: nao recarrega e lanca o erro original', async () => {
        sessionStorage.setItem(CHAVE, '1');
        const erro = new Error('chunk sumiu');
        await expect(importarComRetry(() => Promise.reject(erro), 1, 0)).rejects.toBe(erro);
        expect(reload).not.toHaveBeenCalled();
    });
    it('segunda falha seguida (mesma sessao) lanca', async () => {
        const imp = () => Promise.reject(new Error('x'));
        importarComRetry(imp, 0, 0);
        await esperar();
        expect(reload).toHaveBeenCalledTimes(1);
        await expect(importarComRetry(imp, 0, 0)).rejects.toThrow('x');
        expect(reload).toHaveBeenCalledTimes(1);
    });
    it('sem tentativas (0) e sem trava: recarrega direto', async () => {
        importarComRetry(() => Promise.reject(new Error('x')), 0, 0);
        await esperar();
        expect(reload).toHaveBeenCalledTimes(1);
    });
    it('sessionStorage indisponivel: ainda tenta recarregar', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
        importarComRetry(() => Promise.reject(new Error('x')), 0, 0);
        await esperar();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
