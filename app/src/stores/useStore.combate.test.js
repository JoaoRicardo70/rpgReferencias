import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { fichaPadrao } from './useStore.js';

// ---------------------------------------------------------------------------
// QA — fichaPadrao.combate e a restauração via carregarDadosFicha (fix do bug
// de amnésia no F5/reload)
//
// Antes desta correção, `ficha.combate` (Fadiga de Combate, mUnico Crescente,
// Fúria, Reator de Adaptação, Leis/Cópias etc.) não existia em `fichaPadrao` e
// não tinha nenhum branch explícito em `carregarDadosFicha` — então o loop
// genérico (que só restaura chaves presentes em `fichaPadrao`) simplesmente
// IGNORAVA a chave `combate` vinda do Firebase, e fadigaTurnos/municoTurnos
// etc. voltavam para 0 (undefined tratado como 0) toda vez que a ficha
// recarregava, inclusive no meio de um combate real.
//
// Mesmo padrão de teste de __tests__/store.statusPool.test.js (que cobre a
// mesma classe de bug para statusPoolAlocado).
// ---------------------------------------------------------------------------

describe('fichaPadrao.combate — defaults', () => {
    it('nasce com os defaults documentados (municoTurnos/fadigaTurnos zerados, taxas em 5%, etc.)', () => {
        expect(fichaPadrao.combate).toEqual({
            municoTurnos: 0, municoPorTurno: 5,
            fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0,
            danoAbsorvido: 0, danoTotalRecebido: 0, letalidadeTotalRecebida: 0,
            conversaoAlvo: 10000, conversaoBonus: 1,
            furiaMax: 0,
            leis: [], copias: [],
        });
    });
});

describe('useStore — minhaFicha.combate (estado inicial e reset)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('uma ficha recém-criada (resetFicha) já nasce com combate preenchido a partir de fichaPadrao.combate', () => {
        expect(useStore.getState().minhaFicha.combate).toEqual(fichaPadrao.combate);
    });

    it('updateFicha muta combate via callback Immer, sem vazar para fichaPadrao (mutação isolada)', () => {
        useStore.getState().updateFicha((f) => { f.combate.fadigaTurnos = 9; });
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(9);
        expect(fichaPadrao.combate.fadigaTurnos).toBe(0);
    });

    it('resetFicha() volta combate ao padrão depois de mutado', () => {
        useStore.getState().updateFicha((f) => { f.combate.fadigaTurnos = 15; f.combate.municoTurnos = 4; });
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(15);

        useStore.getState().resetFicha();
        expect(useStore.getState().minhaFicha.combate).toEqual(fichaPadrao.combate);
    });
});

describe('useStore.carregarDadosFicha — restaura combate salvo no Firebase (fix da amnésia no F5)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('restaura fadigaTurnos/fadigaPorTurno de um payload parcial de combate', () => {
        useStore.getState().carregarDadosFicha({ combate: { fadigaTurnos: 7, fadigaPorTurno: 10 } });
        const combate = useStore.getState().minhaFicha.combate;

        expect(combate.fadigaTurnos).toBe(7);
        expect(combate.fadigaPorTurno).toBe(10);
    });

    it('mescla o payload parcial com fichaPadrao.combate — campos ausentes do payload caem no default, não em undefined', () => {
        useStore.getState().carregarDadosFicha({ combate: { fadigaTurnos: 7 } });
        const combate = useStore.getState().minhaFicha.combate;

        expect(combate.fadigaTurnos).toBe(7);
        expect(combate.fadigaPorTurno).toBe(5); // default de fichaPadrao.combate
        expect(combate.municoTurnos).toBe(0);
        expect(combate.leis).toEqual([]);
        expect(combate.copias).toEqual([]);
    });

    it('restaura municoTurnos/municoPorTurno (mUnico Crescente) junto com fadiga no mesmo payload', () => {
        useStore.getState().carregarDadosFicha({ combate: { fadigaTurnos: 3, fadigaPorTurno: 5, municoTurnos: 12, municoPorTurno: 8 } });
        const combate = useStore.getState().minhaFicha.combate;

        expect(combate.fadigaTurnos).toBe(3);
        expect(combate.municoTurnos).toBe(12);
        expect(combate.municoPorTurno).toBe(8);
    });

    it('um payload SEM a chave combate não apaga um combate já carregado em memória (guardado com `if`, como statusPoolAlocado/ataqueConfig)', () => {
        useStore.getState().carregarDadosFicha({ combate: { fadigaTurnos: 20, municoTurnos: 5 } });
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(20);

        // Um segundo payload (ex.: outro listener do Firebase atualizando um campo qualquer da
        // ficha) que não inclui `combate` não pode zerar o que já estava carregado.
        useStore.getState().carregarDadosFicha({ ascensaoBase: 5 });
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(20);
        expect(useStore.getState().minhaFicha.combate.municoTurnos).toBe(5);
    });

    it('um payload SEM combate em uma ficha recém-resetada mantém os defaults de fichaPadrao.combate (não fica undefined)', () => {
        useStore.getState().carregarDadosFicha({ ascensaoBase: 3 });
        expect(useStore.getState().minhaFicha.combate).toEqual(fichaPadrao.combate);
    });

    it('carregar um novo payload de combate SUBSTITUI o anterior por completo (merge é com fichaPadrao, não com o estado anterior em memória)', () => {
        useStore.getState().carregarDadosFicha({ combate: { fadigaTurnos: 20, municoTurnos: 5 } });
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(20);

        useStore.getState().carregarDadosFicha({ combate: { municoTurnos: 9 } });
        // fadigaTurnos não sobrevive: o merge é Object.assign({}, fichaPadrao.combate, dados.combate)
        // — nunca com o minhaFicha.combate que já estava em memória (mesmo padrão de statusPoolAlocado).
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(useStore.getState().minhaFicha.combate.municoTurnos).toBe(9);
    });

    it('restaura leis/copias (arrays) e danoAbsorvido/danoTotalRecebido/letalidadeTotalRecebida (contadores) do payload', () => {
        useStore.getState().carregarDadosFicha({
            combate: {
                leis: ['Lei da Entropia'],
                copias: [{ id: 'copia1' }],
                danoAbsorvido: 500,
                danoTotalRecebido: 1200,
                letalidadeTotalRecebida: 30,
            },
        });
        const combate = useStore.getState().minhaFicha.combate;

        expect(combate.leis).toEqual(['Lei da Entropia']);
        expect(combate.copias).toEqual([{ id: 'copia1' }]);
        expect(combate.danoAbsorvido).toBe(500);
        expect(combate.danoTotalRecebido).toBe(1200);
        expect(combate.letalidadeTotalRecebida).toBe(30);
    });

    it('combate explicitamente igual a {} no payload ainda restaura (é truthy) e preenche com os defaults de fichaPadrao.combate', () => {
        useStore.getState().updateFicha((f) => { f.combate.fadigaTurnos = 99; });
        useStore.getState().carregarDadosFicha({ combate: {} });

        expect(useStore.getState().minhaFicha.combate).toEqual(fichaPadrao.combate);
    });

    it('a chave "combate" é ignorada pelo loop genérico (não gera sobrescrita duplicada/inconsistente)', () => {
        // Regressão estrutural: garante que 'combate' está na lista de exclusão do loop genérico
        // de carregarDadosFicha — testado indiretamente checando que o merge feito pelo branch
        // explícito (Object.assign com fichaPadrao.combate) não é imediatamente sobrescrito por
        // um segundo Object.assign genérico (que usaria apenas fichaPadrao[ch] sem o numF fixup,
        // podendo produzir um resultado diferente/inconsistente).
        useStore.getState().carregarDadosFicha({ combate: { fadigaTurnos: 42, fadigaPorTurno: 7 } });
        expect(useStore.getState().minhaFicha.combate.fadigaTurnos).toBe(42);
        expect(useStore.getState().minhaFicha.combate.fadigaPorTurno).toBe(7);
    });
});
