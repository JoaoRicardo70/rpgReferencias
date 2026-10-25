import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    ehRolagem, deveSerPrivada, entradaVisivel,
    lerDadosMestrePrivados, gravarDadosMestrePrivados, assinarDadosMestre,
} from './dadosMestre';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('ehRolagem', () => {
    it('true para tipos de rolagem', () => {
        expect(ehRolagem({ tipo: 'dano' })).toBe(true);
        expect(ehRolagem({ tipo: 'narracao' })).toBe(true);
    });
    it('false para sistema, sem tipo e valores inválidos', () => {
        expect(ehRolagem({ tipo: 'sistema' })).toBe(false);
        expect(ehRolagem({})).toBe(false);
        expect(ehRolagem({ tipo: '' })).toBe(false);
        expect(ehRolagem(null)).toBe(false);
        expect(ehRolagem(undefined)).toBe(false);
        expect(ehRolagem('dano')).toBe(false);
        expect(ehRolagem(5)).toBe(false);
    });
});

describe('deveSerPrivada', () => {
    const rol = { tipo: 'skill' };
    it('Mestre com padrão ligado: rolagem privada', () => {
        expect(deveSerPrivada(rol, { ehMestre: true, privadosPorPadrao: true })).toBe(true);
    });
    it('defaults: privadosPorPadrao true, ehMestre false', () => {
        expect(deveSerPrivada(rol, { ehMestre: true })).toBe(true);
        expect(deveSerPrivada(rol)).toBe(false);
        expect(deveSerPrivada(rol, {})).toBe(false);
    });
    it('jogador nunca privado por padrão', () => {
        expect(deveSerPrivada(rol, { ehMestre: false, privadosPorPadrao: true })).toBe(false);
    });
    it('Mestre com padrão desligado: público', () => {
        expect(deveSerPrivada(rol, { ehMestre: true, privadosPorPadrao: false })).toBe(false);
    });
    it('sistema nunca privado por padrão', () => {
        expect(deveSerPrivada({ tipo: 'sistema' }, { ehMestre: true, privadosPorPadrao: true })).toBe(false);
    });
    it('privado explícito vence', () => {
        expect(deveSerPrivada({ tipo: 'dano', privado: false }, { ehMestre: true, privadosPorPadrao: true })).toBe(false);
        expect(deveSerPrivada({ tipo: 'sistema', privado: true }, { ehMestre: false, privadosPorPadrao: false })).toBe(true);
    });
    it('privado não booleano é ignorado', () => {
        expect(deveSerPrivada({ tipo: 'skill', privado: 'sim' }, { ehMestre: true })).toBe(true);
    });
    it('entrada inválida => false', () => {
        expect(deveSerPrivada(null, { ehMestre: true })).toBe(false);
        expect(deveSerPrivada(undefined)).toBe(false);
        expect(deveSerPrivada('x', { ehMestre: true })).toBe(false);
    });
});

describe('entradaVisivel', () => {
    it('pública visível a todos', () => {
        expect(entradaVisivel({ tipo: 'dano' }, false)).toBe(true);
        expect(entradaVisivel({ tipo: 'dano', privado: false }, false)).toBe(true);
    });
    it('privada só para Mestre', () => {
        expect(entradaVisivel({ privado: true }, false)).toBe(false);
        expect(entradaVisivel({ privado: true }, undefined)).toBe(false);
        expect(entradaVisivel({ privado: true }, true)).toBe(true);
    });
    it('inválida => false', () => {
        expect(entradaVisivel(null, true)).toBe(false);
        expect(entradaVisivel('x', true)).toBe(false);
    });
});

describe('ler/gravar/assinar', () => {
    it('padrão é true sem valor salvo', () => {
        expect(lerDadosMestrePrivados()).toBe(true);
    });
    it('grava e lê false/true', () => {
        gravarDadosMestrePrivados(false);
        expect(localStorage.getItem('rpg_dados_mestre_privados')).toBe('0');
        expect(lerDadosMestrePrivados()).toBe(false);
        gravarDadosMestrePrivados(true);
        expect(localStorage.getItem('rpg_dados_mestre_privados')).toBe('1');
        expect(lerDadosMestrePrivados()).toBe(true);
    });
    it('dispara evento ao gravar e o cancelamento funciona', () => {
        const cb = vi.fn();
        const cancelar = assinarDadosMestre(cb);
        gravarDadosMestrePrivados(false);
        expect(cb).toHaveBeenCalledTimes(1);
        cancelar();
        gravarDadosMestrePrivados(true);
        expect(cb).toHaveBeenCalledTimes(1);
    });
    it('localStorage lançando: ler devolve true, gravar não lança e ainda dispara evento', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
        expect(lerDadosMestrePrivados()).toBe(true);
        const cb = vi.fn();
        const cancelar = assinarDadosMestre(cb);
        expect(() => gravarDadosMestrePrivados(false)).not.toThrow();
        expect(cb).toHaveBeenCalledTimes(1);
        cancelar();
    });
});
