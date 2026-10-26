import { describe, it, expect, beforeEach } from 'vitest';
import {
    ehChaveDePreferencia, diferencaDePreferencias, coletarPreferencias, limparPreferenciasRemotas, assinaturaDePreferencias, aplicarPreferenciasRemotas, TAMANHO_MAX_VALOR
} from './preferencias';

beforeEach(() => localStorage.clear());

describe('ehChaveDePreferencia', () => {
    it('aceita chaves conhecidas e o prefixo de volume por jogador', () => {
        ['rpg_tema', 'rpg_atalhos', 'rpg_config', 'rpg_sala_party_junto', 'rpg_vol2_Ana', 'rpg_vol2_Ana_Maria'].forEach(k => expect(ehChaveDePreferencia(k)).toBe(true));
    });
    it('recusa o resto (fichas, mesa, posições, caracteres perigosos)', () => {
        ['rpgNome', 'rpgFicha_Ana', 'rpg_mesaId', 'rpg_orbe_pos', 'rpg_vol2_', 'rpg_vol2_a/b', 'rpg_vol2_a.b', '', null, 5].forEach(k => expect(ehChaveDePreferencia(k)).toBe(false));
    });
});

describe('coletarPreferencias', () => {
    it('pega só as preferências do localStorage', () => {
        localStorage.setItem('rpg_tema', 'neon');
        localStorage.setItem('rpg_vol2_Bob', '1.5');
        localStorage.setItem('rpgNome', 'Ana');
        localStorage.setItem('rpg_mesaId', 'X');
        expect(coletarPreferencias()).toEqual({ rpg_tema: 'neon', rpg_vol2_Bob: '1.5' });
    });
    it('ignora valor gigante', () => {
        localStorage.setItem('rpg_config', 'x'.repeat(TAMANHO_MAX_VALOR + 1));
        expect(coletarPreferencias()).toEqual({});
    });
});

describe('limparPreferenciasRemotas', () => {
    it('descarta chaves desconhecidas, valores não-texto e lixo', () => {
        expect(limparPreferenciasRemotas({ rpg_tema: 'a', rpgNome: 'x', rpg_config: 3, rpg_atalhos: '{}' })).toEqual({ rpg_tema: 'a', rpg_atalhos: '{}' });
        expect(limparPreferenciasRemotas(null)).toEqual({});
        expect(limparPreferenciasRemotas('x')).toEqual({});
    });
});

describe('assinaturaDePreferencias', () => {
    it('não depende da ordem das chaves e muda quando um valor muda', () => {
        expect(assinaturaDePreferencias({ a: '1', b: '2' })).toBe(assinaturaDePreferencias({ b: '2', a: '1' }));
        expect(assinaturaDePreferencias({ a: '1' })).not.toBe(assinaturaDePreferencias({ a: '2' }));
    });
});

describe('aplicarPreferenciasRemotas', () => {
    it('grava o que a conta tem e é diferente, e devolve quantas mudaram', () => {
        localStorage.setItem('rpg_tema', 'velho');
        localStorage.setItem('rpg_volume', '50');
        const n = aplicarPreferenciasRemotas({ rpg_tema: 'novo', rpg_volume: '50', rpg_atalhos: '{"a":1}' });
        expect(n).toBe(2);
        expect(localStorage.getItem('rpg_tema')).toBe('novo');
        expect(localStorage.getItem('rpg_atalhos')).toBe('{"a":1}');
    });
    it('mantém o que só existe no aparelho e não grava chave estranha da conta', () => {
        localStorage.setItem('rpg_sfx', 'true');
        expect(aplicarPreferenciasRemotas({ rpgNome: 'hack' })).toBe(0);
        expect(localStorage.getItem('rpg_sfx')).toBe('true');
        expect(localStorage.getItem('rpgNome')).toBeNull();
    });
});

describe('diferencaDePreferencias', () => {
    it('separa o que mudou/é novo do que foi apagado', () => {
        expect(diferencaDePreferencias({ a: '1', b: '2', c: '3' }, { a: '1', b: '9', d: '4' })).toEqual({ mudadas: { b: '9', d: '4' }, removidas: ['c'] });
    });
    it('sem diferença devolve vazio e aceita entradas nulas', () => {
        expect(diferencaDePreferencias({ a: '1' }, { a: '1' })).toEqual({ mudadas: {}, removidas: [] });
        expect(diferencaDePreferencias(null, { a: '1' })).toEqual({ mudadas: { a: '1' }, removidas: [] });
    });
});
