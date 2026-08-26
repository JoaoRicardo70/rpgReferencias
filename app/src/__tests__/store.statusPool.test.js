import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { fichaPadrao } from '../stores/useStore.js';

// ---------------------------------------------------------------------------
// QA — ficha.statusPool (pool de pontos de Status não distribuídos)
//
// Novo campo escalar simples (número, default 0) adicionado a fichaPadrao para
// suportar o novo fluxo "Status vira um POOL" em Marcados.jsx/TabelaPrestigio.jsx:
// ganhar Prestígio na categoria "status" credita a diferença de pontos aqui em vez
// de igualar os 8 atributos físicos (Força, Destreza, Inteligência, Sabedoria,
// Energia Espiritual, Carisma, Stamina, Constituição), preservando builds
// diferenciadas.
//
// Precisa sobreviver ao F5: como statusPool é um número (não array/objeto), ele
// cai automaticamente no branch `else { state.minhaFicha[ch] = dados[ch]; }` do
// loop genérico de carregarDadosFicha — a chave só precisa estar presente em
// fichaPadrao e NÃO precisa (nem deve) ser adicionada à lista de exclusões do
// loop genérico (essa lista é só para chaves com tratamento especial: objetos
// com merge profundo, arrays, migrações, etc).
// ---------------------------------------------------------------------------

describe('fichaPadrao.statusPool', () => {
    it('defaults to 0', () => {
        expect(fichaPadrao.statusPool).toBe(0);
    });

    it('is a plain number, not nested in an object', () => {
        expect(typeof fichaPadrao.statusPool).toBe('number');
    });
});

describe('useStore — statusPool', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    describe('resetFicha', () => {
        it('resets statusPool back to 0 after it was mutated', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 12345; });
            expect(useStore.getState().minhaFicha.statusPool).toBe(12345);

            useStore.getState().resetFicha();
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });
    });

    describe('updateFicha', () => {
        it('mutates statusPool via immer callback', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 500; });
            expect(useStore.getState().minhaFicha.statusPool).toBe(500);
        });

        it('does not leak between resetFicha calls (no shared reference with fichaPadrao)', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 999; });
            expect(fichaPadrao.statusPool).toBe(0);
        });
    });

    describe('carregarDadosFicha', () => {
        it('restaura ficha.statusPool salvo (sobrevive ao F5, presente em fichaPadrao)', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 4200 });
            expect(useStore.getState().minhaFicha.statusPool).toBe(4200);
        });

        it('carrega statusPool explicitamente igual a 0 (nao confunde com "ausente")', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 999; });
            useStore.getState().carregarDadosFicha({ statusPool: 0 });
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });

        it('carregarDadosFicha({}) nao mexe em statusPool quando ausente nos dados (generico so age se dados[chave] !== undefined)', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 777; });
            useStore.getState().carregarDadosFicha({});
            expect(useStore.getState().minhaFicha.statusPool).toBe(777);
        });

        it('defaults statusPool to 0 em fichas novas (sem carregarDadosFicha explicito)', () => {
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });

        it('resetFicha() volta statusPool para o padrao (0) mesmo apos carregar um valor do Firebase', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 555 });
            expect(useStore.getState().minhaFicha.statusPool).toBe(555);

            useStore.getState().resetFicha();
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });
    });
});
