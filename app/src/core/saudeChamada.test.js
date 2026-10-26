import { describe, it, expect } from 'vitest';
import { ESPERA_DISCONNECTED_MS, ESPERA_FALLBACK_DISCAR_MS, avaliarSaudeDaChamada, deveDiscar, ligacoesSemDono } from './saudeChamada';

describe('avaliarSaudeDaChamada', () => {
    it('conectada fica quieta', () => {
        expect(avaliarSaudeDaChamada({ estadoIce: 'connected' })).toBe('ok');
        expect(avaliarSaudeDaChamada({ estadoIce: 'completed' })).toBe('ok');
        expect(avaliarSaudeDaChamada({})).toBe('ok');
    });
    it('failed e closed refazem na hora', () => {
        expect(avaliarSaudeDaChamada({ estadoIce: 'failed' })).toBe('refazer');
        expect(avaliarSaudeDaChamada({ estadoIce: 'closed' })).toBe('refazer');
    });
    it('trilhas encerradas refazem', () => {
        expect(avaliarSaudeDaChamada({ estadoIce: 'connected', todasTrilhasEncerradas: true })).toBe('refazer');
    });
    it('disconnected só refaz depois da espera', () => {
        expect(avaliarSaudeDaChamada({ estadoIce: 'disconnected', ruimHaMs: ESPERA_DISCONNECTED_MS - 1 })).toBe('ok');
        expect(avaliarSaudeDaChamada({ estadoIce: 'disconnected', ruimHaMs: ESPERA_DISCONNECTED_MS })).toBe('refazer');
    });
});

describe('ligacoesSemDono', () => {
    it('devolve só as ligações de quem não está na sala (ignora eu mesmo)', () => {
        expect(ligacoesSemDono(['a', 'b', 'eu'], ['a'], 'eu')).toEqual(['b']);
    });
    it('aceita entradas vazias', () => {
        expect(ligacoesSemDono(null, null, 'x')).toEqual([]);
    });
});

describe('deveDiscar', () => {
    it('o id menor sempre liga', () => {
        expect(deveDiscar({ meuId: 'a', amigoId: 'b' })).toBe(true);
    });
    it('o id maior só liga depois da espera', () => {
        expect(deveDiscar({ meuId: 'b', amigoId: 'a', semConexaoHaMs: ESPERA_FALLBACK_DISCAR_MS - 1 })).toBe(false);
        expect(deveDiscar({ meuId: 'b', amigoId: 'a', semConexaoHaMs: ESPERA_FALLBACK_DISCAR_MS })).toBe(true);
    });
    it('nunca liga para si mesmo ou sem id', () => {
        expect(deveDiscar({ meuId: 'a', amigoId: 'a', semConexaoHaMs: 99999 })).toBe(false);
        expect(deveDiscar({ meuId: '', amigoId: 'a' })).toBe(false);
    });
});
