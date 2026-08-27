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
        it('restaura ficha.statusPool salvo (sobrevive ao F5, presente em fichaPadrao) quando ja migrado (statusPoolUnidadeV2)', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 4200, statusPoolUnidadeV2: true });
            expect(useStore.getState().minhaFicha.statusPool).toBe(4200);
        });

        it('carrega statusPool explicitamente igual a 0 (nao confunde com "ausente")', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 999; });
            useStore.getState().carregarDadosFicha({ statusPool: 0, statusPoolUnidadeV2: true });
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });

        it('carregarDadosFicha({}) nao mexe em statusPool quando ausente nos dados (generico so age se dados[chave] !== undefined)', () => {
            useStore.getState().updateFicha(f => { f.statusPool = 777; f.statusPoolUnidadeV2 = true; });
            useStore.getState().carregarDadosFicha({});
            expect(useStore.getState().minhaFicha.statusPool).toBe(777);
        });

        it('defaults statusPool to 0 em fichas novas (sem carregarDadosFicha explicito)', () => {
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });

        it('resetFicha() volta statusPool para o padrao (0) mesmo apos carregar um valor do Firebase', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 555, statusPoolUnidadeV2: true });
            expect(useStore.getState().minhaFicha.statusPool).toBe(555);

            useStore.getState().resetFicha();
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        });
    });

    // 🔥 Migração de unidade: statusPool nasceu numa versão anterior denominado em base bruta
    // (ex.: 2 pontos de Prestígio virando statusPool=16000) antes de virar "pontos" (os mesmos
    // 2 pontos deveriam virar statusPool=16). Fichas salvas sem a flag statusPoolUnidadeV2 têm
    // que ser convertidas (/1000, ajustado pelo divisor de status) exatamente uma vez.
    describe('migração de unidade do statusPool (statusPoolUnidadeV2)', () => {
        it('converte um statusPool antigo (base bruta) para a escala nova (pontos) na primeira carga sem a flag', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 16000 });
            expect(useStore.getState().minhaFicha.statusPool).toBe(16);
            expect(useStore.getState().minhaFicha.statusPoolUnidadeV2).toBe(true);
        });

        it('leva o divisor de status em conta na conversão', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 16000, divisores: { status: 2 } });
            // poolAntigo(16000) * divStatus(2) / 1000 = 32
            expect(useStore.getState().minhaFicha.statusPool).toBe(32);
        });

        it('não reconverte um statusPool que já passou pela migração (statusPoolUnidadeV2: true)', () => {
            useStore.getState().carregarDadosFicha({ statusPool: 16, statusPoolUnidadeV2: true });
            expect(useStore.getState().minhaFicha.statusPool).toBe(16);
        });

        it('não reconverte um statusPool já na escala nova mesmo sem a flag, se statusPoolGasto já existir (nasceu no mesmo commit da correção de unidade)', () => {
            // Ficha salva DEPOIS da correção de unidade mas ANTES desta migração existir: já tem
            // statusPoolGasto (nem que seja 0), mas ainda não tem statusPoolUnidadeV2. Precisa
            // preservar o valor como está (16), não dividir por 1000 de novo (o que destruiria
            // pontos já corretos, reduzindo-os a 0).
            useStore.getState().carregarDadosFicha({ statusPool: 16, statusPoolGasto: 4 });
            expect(useStore.getState().minhaFicha.statusPool).toBe(16);
            expect(useStore.getState().minhaFicha.statusPoolGasto).toBe(4);
            expect(useStore.getState().minhaFicha.statusPoolUnidadeV2).toBe(true);
        });

        it('statusPool ausente/zero não gera conversão nem erro, só marca a flag', () => {
            useStore.getState().carregarDadosFicha({});
            expect(useStore.getState().minhaFicha.statusPool).toBe(0);
            expect(useStore.getState().minhaFicha.statusPoolUnidadeV2).toBe(true);
        });

        it('fichas novas (fichaPadrao) já nascem com statusPoolUnidadeV2: true', () => {
            expect(fichaPadrao.statusPoolUnidadeV2).toBe(true);
        });
    });
});
