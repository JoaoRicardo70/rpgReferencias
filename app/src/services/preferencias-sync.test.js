import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, update } from 'firebase/database';

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    get: vi.fn(),
    update: vi.fn(() => Promise.resolve()),
}));
vi.mock('./firebase-config', () => ({ db: {} }));
vi.mock('../stores/useStore', () => ({
    sanitizarNome: vi.fn((n) => String(n).replace(/[.#$[\]/]/g, '_')),
}));

import { lerPreferenciasDaConta, gravarPreferenciasDaConta } from './preferencias-sync';

beforeEach(() => { vi.clearAllMocks(); update.mockImplementation(() => Promise.resolve()); });

describe('lerPreferenciasDaConta', () => {
    it('lê do caminho sanitizado e filtra chaves/valores inválidos', async () => {
        get.mockResolvedValue({ exists: () => true, val: () => ({ rpg_tema: 'neon', rpg_vol2_amy: '0.5', lixo: 'x', rpg_fonte: 123, rpg_brilho: 'a'.repeat(6001) }) });
        const r = await lerPreferenciasDaConta('Jo.ao');
        expect(get).toHaveBeenCalledWith('usuarios/Jo_ao/preferencias');
        expect(r).toEqual({ rpg_tema: 'neon', rpg_vol2_amy: '0.5' });
    });
    it('devolve {} quando o nó não existe', async () => {
        get.mockResolvedValue({ exists: () => false });
        expect(await lerPreferenciasDaConta('Zed')).toEqual({});
    });
    it('devolve null em erro de leitura', async () => {
        get.mockRejectedValue(new Error('permission_denied'));
        expect(await lerPreferenciasDaConta('Zed')).toBeNull();
    });
    it('devolve null sem nome e não consulta o banco', async () => {
        expect(await lerPreferenciasDaConta('')).toBeNull();
        expect(await lerPreferenciasDaConta(undefined)).toBeNull();
        expect(get).not.toHaveBeenCalled();
    });
});

describe('gravarPreferenciasDaConta', () => {
    it('usa update com as mudadas e null nas removidas', async () => {
        const ok = await gravarPreferenciasDaConta('Zed', { rpg_tema: 'x' }, ['rpg_fonte']);
        expect(ok).toBe(true);
        expect(update).toHaveBeenCalledWith('usuarios/Zed/preferencias', { rpg_tema: 'x', rpg_fonte: null });
    });
    it('ignora chaves inválidas (mudadas e removidas)', async () => {
        await gravarPreferenciasDaConta('Zed', { rpg_tema: 'x', 'a.b': '1', outra: '2' }, ['lixo', 'rpg_vol2_amy']);
        expect(update).toHaveBeenCalledWith('usuarios/Zed/preferencias', { rpg_tema: 'x', rpg_vol2_amy: null });
    });
    it('sem nada válido para gravar devolve true sem chamar update', async () => {
        expect(await gravarPreferenciasDaConta('Zed', { lixo: '1' }, ['outra'])).toBe(true);
        expect(await gravarPreferenciasDaConta('Zed', {})).toBe(true);
        expect(await gravarPreferenciasDaConta('Zed', null, null)).toBe(true);
        expect(update).not.toHaveBeenCalled();
    });
    it('devolve false sem nome e em erro de gravação', async () => {
        expect(await gravarPreferenciasDaConta('', { rpg_tema: 'x' })).toBe(false);
        expect(update).not.toHaveBeenCalled();
        update.mockRejectedValue(new Error('offline'));
        expect(await gravarPreferenciasDaConta('Zed', { rpg_tema: 'x' })).toBe(false);
    });
});
