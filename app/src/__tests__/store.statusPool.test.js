import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { fichaPadrao } from '../stores/useStore.js';

// ---------------------------------------------------------------------------
// QA — Pool de pontos de Status em useStore.js (3ª iteração de design)
//
// Campos envolvidos (todos em fichaPadrao):
// - statusPool (number): pontos do pool ainda não distribuídos.
// - statusPoolGasto (number): total histórico já distribuído (bookkeeping global,
//   nunca diminui sozinho — só via devolverPontoStatus em Marcados.jsx).
// - statusPoolAlocado (object attrKey -> BASE BRUTA, não pontos!): quanto cada
//   atributo específico recebeu do pool — tratado FORA do loop genérico de
//   carregarDadosFicha (como `divisores`/`ataqueConfig`), sempre remontado via
//   Object.assign({}, fichaPadrao.statusPoolAlocado, dados.statusPoolAlocado)
//   incondicionalmente (sem guarda `if (dados.statusPoolAlocado)`), a cada chamada.
// - statusPoolUnidadeV2 (boolean): flag de migração de unidade de statusPool
//   (base bruta -> pontos), de uma versão anterior.
// - statusPrestigioAplicado (number): ÚLTIMO valor de Prestígio de Status
//   realmente aplicado ao pool — o que o campo "STATUS" edita diretamente agora
//   em Marcados.jsx/TabelaPrestigio.jsx (substituiu um valor antigo DERIVADO de
//   (statusPool+statusPoolGasto)/8). Semeado com esse valor derivado só quando
//   ausente do payload carregado (migração de fichas antigas que não tinham o
//   campo ainda).
// ---------------------------------------------------------------------------

describe('fichaPadrao — campos do pool de Status', () => {
    it('statusPool / statusPoolGasto / statusPrestigioAplicado default to 0 (números simples)', () => {
        expect(fichaPadrao.statusPool).toBe(0);
        expect(fichaPadrao.statusPoolGasto).toBe(0);
        expect(fichaPadrao.statusPrestigioAplicado).toBe(0);
        expect(typeof fichaPadrao.statusPool).toBe('number');
        expect(typeof fichaPadrao.statusPoolGasto).toBe('number');
        expect(typeof fichaPadrao.statusPrestigioAplicado).toBe('number');
    });

    it('statusPoolUnidadeV2 nasce true (fichas novas já migradas)', () => {
        expect(fichaPadrao.statusPoolUnidadeV2).toBe(true);
    });

    it('statusPoolAlocado default é um objeto vazio', () => {
        expect(fichaPadrao.statusPoolAlocado).toEqual({});
        expect(typeof fichaPadrao.statusPoolAlocado).toBe('object');
        expect(Array.isArray(fichaPadrao.statusPoolAlocado)).toBe(false);
    });
});

describe('useStore — statusPool/statusPoolGasto/statusPrestigioAplicado (reset e mutação básica)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('resetFicha volta todos os campos do pool ao padrão após serem mutados', () => {
        useStore.getState().updateFicha(f => {
            f.statusPool = 12345;
            f.statusPoolGasto = 999;
            f.statusPrestigioAplicado = 42;
            f.statusPoolAlocado = { forca: 5000 };
        });
        expect(useStore.getState().minhaFicha.statusPool).toBe(12345);

        useStore.getState().resetFicha();
        const f = useStore.getState().minhaFicha;
        expect(f.statusPool).toBe(0);
        expect(f.statusPoolGasto).toBe(0);
        expect(f.statusPrestigioAplicado).toBe(0);
        expect(f.statusPoolAlocado).toEqual({});
    });

    it('updateFicha muta os campos do pool via callback Immer, sem vazar para fichaPadrao', () => {
        useStore.getState().updateFicha(f => { f.statusPool = 500; f.statusPrestigioAplicado = 62; });
        expect(useStore.getState().minhaFicha.statusPool).toBe(500);
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(62);
        expect(fichaPadrao.statusPool).toBe(0);
        expect(fichaPadrao.statusPrestigioAplicado).toBe(0);
    });
});

describe('useStore.carregarDadosFicha — restaura statusPool/statusPoolGasto/statusPrestigioAplicado (ficha já migrada)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('restaura statusPool e statusPoolGasto salvos quando statusPoolUnidadeV2 já é true', () => {
        useStore.getState().carregarDadosFicha({ statusPool: 30, statusPoolGasto: 12, statusPoolUnidadeV2: true, statusPrestigioAplicado: 5 });
        const f = useStore.getState().minhaFicha;
        expect(f.statusPool).toBe(30);
        expect(f.statusPoolGasto).toBe(12);
        expect(f.statusPrestigioAplicado).toBe(5);
    });

    it('carrega statusPool/statusPrestigioAplicado explicitamente iguais a 0 (não confunde com "ausente")', () => {
        useStore.getState().updateFicha(f => { f.statusPool = 999; f.statusPrestigioAplicado = 999; });
        useStore.getState().carregarDadosFicha({ statusPool: 0, statusPoolGasto: 0, statusPoolUnidadeV2: true, statusPrestigioAplicado: 0 });
        expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(0);
    });

    it('carregarDadosFicha({}) não mexe em statusPool/statusPoolGasto quando ausentes (loop genérico só age se dados[chave] !== undefined)', () => {
        useStore.getState().updateFicha(f => { f.statusPool = 777; f.statusPoolGasto = 111; f.statusPoolUnidadeV2 = true; f.statusPrestigioAplicado = 33; });
        useStore.getState().carregarDadosFicha({ statusPrestigioAplicado: 33 }); // evita reseed do statusPrestigioAplicado neste teste
        expect(useStore.getState().minhaFicha.statusPool).toBe(777);
        expect(useStore.getState().minhaFicha.statusPoolGasto).toBe(111);
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(33);
    });

    it('resetFicha() volta statusPool/statusPrestigioAplicado ao padrão mesmo após carregar valores do Firebase', () => {
        useStore.getState().carregarDadosFicha({ statusPool: 555, statusPoolGasto: 55, statusPoolUnidadeV2: true, statusPrestigioAplicado: 20 });
        expect(useStore.getState().minhaFicha.statusPool).toBe(555);

        useStore.getState().resetFicha();
        expect(useStore.getState().minhaFicha.statusPool).toBe(0);
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(0);
    });
});

describe('useStore.carregarDadosFicha — statusPoolAlocado (fora do loop genérico)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('restaura statusPoolAlocado salvo (mapa attrKey -> BASE BRUTA)', () => {
        useStore.getState().carregarDadosFicha({ statusPoolAlocado: { forca: 20000, destreza: 15000 } });
        expect(useStore.getState().minhaFicha.statusPoolAlocado).toEqual({ forca: 20000, destreza: 15000 });
    });

    it('carregar um novo statusPoolAlocado SUBSTITUI o anterior por completo (merge é com fichaPadrao, não com o estado anterior)', () => {
        useStore.getState().carregarDadosFicha({ statusPoolAlocado: { forca: 20000, destreza: 15000 } });
        expect(useStore.getState().minhaFicha.statusPoolAlocado).toEqual({ forca: 20000, destreza: 15000 });

        useStore.getState().carregarDadosFicha({ statusPoolAlocado: { forca: 5000 } });
        // destreza não sobrevive: o merge é Object.assign({}, fichaPadrao.statusPoolAlocado(={}), dados.statusPoolAlocado)
        // — nunca com o minhaFicha.statusPoolAlocado que já estava em memória.
        expect(useStore.getState().minhaFicha.statusPoolAlocado).toEqual({ forca: 5000 });
    });

    it('carregarDadosFicha({}) (statusPoolAlocado ausente do payload) NÃO mexe em statusPoolAlocado — guardado com `if` como os campos-irmãos (divisores/ataqueConfig/avatar), pra um payload parcial nunca apagar alocações já carregadas', () => {
        useStore.getState().updateFicha(f => { f.statusPoolAlocado = { forca: 20000 }; });
        expect(useStore.getState().minhaFicha.statusPoolAlocado).toEqual({ forca: 20000 });

        useStore.getState().carregarDadosFicha({});
        expect(useStore.getState().minhaFicha.statusPoolAlocado).toEqual({ forca: 20000 });
    });

    it('statusPoolAlocado nunca fica undefined mesmo sem nenhuma alocação prévia', () => {
        useStore.getState().carregarDadosFicha({ statusPool: 10 });
        expect(useStore.getState().minhaFicha.statusPoolAlocado).toEqual({});
    });
});

// 🔥 Migração de unidade: statusPool nasceu numa versão anterior denominado em base bruta
// (ex.: 2 pontos de Prestígio virando statusPool=16000) antes de virar "pontos" (os mesmos
// 2 pontos deveriam virar statusPool=16). Fichas salvas sem a flag statusPoolUnidadeV2 têm
// que ser convertidas (/1000, ajustado pelo divisor de status) exatamente uma vez. Lógica
// inalterada nesta sessão — mantida para não regredir.
describe('migração de unidade do statusPool (statusPoolUnidadeV2)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('converte um statusPool antigo (base bruta) para a escala nova (pontos) na primeira carga sem a flag e sem statusPoolGasto', () => {
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

    it('não reconverte um statusPool já na escala nova mesmo sem a flag, SE statusPoolGasto já existir (nasceu no mesmo commit da correção de unidade)', () => {
        // Ficha salva DEPOIS da correção de unidade mas ANTES da flag statusPoolUnidadeV2 existir:
        // já tem statusPoolGasto (nem que seja 0), mas ainda não tem a flag. Precisa preservar o
        // valor como está (16), não dividir por 1000 de novo (destruiria pontos já corretos).
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

// 🔥 SEED ÚNICO de statusPrestigioAplicado: campo novo que o input "STATUS" edita diretamente
// (Marcados.jsx/TabelaPrestigio.jsx). Antes dele o campo mostrava um valor DERIVADO de
// floor((statusPool+statusPoolGasto)/8). Para não quebrar a leitura de fichas antigas que já
// tinham pool/gasto acumulado antes deste campo existir, o valor derivado é semeado só quando
// `dados.statusPrestigioAplicado` está ausente do payload carregado — depois disso o campo
// passa a ser autoritativo (editado direto pelo jogador/Mestre, nunca mais recalculado a
// partir de pool/gasto).
describe('seed de statusPrestigioAplicado (campo novo, migração de leitura)', () => {
    beforeEach(() => {
        useStore.getState().resetFicha();
    });

    it('semeia com floor((statusPool+statusPoolGasto)/8) quando ausente do payload (ficha já migrada)', () => {
        useStore.getState().carregarDadosFicha({ statusPool: 40, statusPoolGasto: 40, statusPoolUnidadeV2: true });
        // floor((40+40)/8) = 10
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(10);
    });

    it('semeia usando o statusPool JÁ MIGRADO (pós-conversão de unidade), não o valor bruto do payload antigo', () => {
        // Payload de uma ficha bem antiga: statusPool na escala velha (base bruta), sem
        // statusPoolGasto, sem a flag, sem statusPrestigioAplicado — três migrações em cascata
        // precisam rodar na ordem certa (unidade primeiro, depois o seed usando o resultado).
        useStore.getState().carregarDadosFicha({ statusPool: 16000 });
        // statusPool migrado: floor(16000*1/1000) = 16. statusPoolGasto ausente -> permanece 0
        // (fichaPadrao). seed: floor((16+0)/8) = 2.
        expect(useStore.getState().minhaFicha.statusPool).toBe(16);
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(2);
    });

    it('NÃO recalcula quando statusPrestigioAplicado já está presente no payload, mesmo que divirja do valor derivado de pool/gasto', () => {
        useStore.getState().carregarDadosFicha({ statusPool: 999, statusPoolGasto: 999, statusPoolUnidadeV2: true, statusPrestigioAplicado: 5 });
        // Se recalculasse, seria floor((999+999)/8) = 249 — preserva 5 (o jogador pode ter
        // editado o campo manualmente depois da migração original).
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(5);
    });

    it('preserva statusPrestigioAplicado explicitamente igual a 0 (não confunde "0 explícito" com "ausente")', () => {
        useStore.getState().updateFicha(f => { f.statusPrestigioAplicado = 77; });
        useStore.getState().carregarDadosFicha({ statusPool: 80, statusPoolGasto: 0, statusPoolUnidadeV2: true, statusPrestigioAplicado: 0 });
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(0);
    });

    it('defaults statusPrestigioAplicado para 0 em fichas novas (sem carregarDadosFicha explícito)', () => {
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(0);
    });

    it('statusPool/statusPoolGasto ausentes (ficha nova via Firebase vazio) semeiam statusPrestigioAplicado com 0', () => {
        useStore.getState().carregarDadosFicha({});
        expect(useStore.getState().minhaFicha.statusPrestigioAplicado).toBe(0);
    });
});
