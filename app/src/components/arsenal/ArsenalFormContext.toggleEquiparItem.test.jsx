import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArsenalFormProvider, useArsenalForm } from './ArsenalFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { getMaximo } from '../../core/attributes';

// ---------------------------------------------------------------------------
// QA — ArsenalFormContext.jsx > toggleEquiparItem(id): novo bugfix de rescala
// proporcional de vitais (capturarMaximosAtuais/rescalarVitaisProporcional, ver
// core/vitals.rescalarVitais.test.js pra matemática detalhada). Equipar/desequipar
// QUALQUER item do inventário (incluindo o efeito colateral de auto-desequipar um
// item do MESMO tipo ao equipar uma nova arma/armadura) nunca deve drenar/inflar
// ".atual" de um vital cujo máximo NÃO mudou, e deve rescalar proporcionalmente
// quando o máximo muda de fato (item com efeito em mFormas/mGeral/etc).
//
// Mesmo padrão de harness (Provider real + componente-probe) de
// PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { inventario: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        itemEditandoId: null,
        setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [],
        setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [],
        setEfeitosTempPassivosArsenal: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useArsenalForm();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('ArsenalFormContext — toggleEquiparItem(): equipar/desequipar um item SEM efeito em vitais nunca drena ".atual"', () => {
    it('equipar um item cujos efeitos não tocam vida/mana/etc mantém ".atual" fracionário intacto (regressão do bug de Math.floor)', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5 },
            inventario: [{ id: 1, nome: 'Anel Cosmético', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });

        expect(ficha.inventario[0].equipado).toBe(true);
        expect(ficha.vida.atual).toBe(79.5);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('desequipar de volta também não altera ".atual" quando o item não afeta vitais', () => {
        const ficha = {
            vida: { base: 100, atual: 42 },
            inventario: [{ id: 1, nome: 'Anel', tipo: 'acessorio', equipado: true, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });

        expect(ficha.inventario[0].equipado).toBe(false);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('ArsenalFormContext — toggleEquiparItem(): item com efeito em mFormas rescala ".atual" proporcionalmente', () => {
    it('equipar uma armadura com efeito mformas=2 dobra o máximo de vida, e dobra ".atual" preservando a fração (50%)', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 }, // 50% de 100
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.toggleEquiparItem(1); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual / maxDepois).toBeCloseTo(0.5, 6);
    });

    it('desequipar essa mesma armadura depois encolhe ".atual" de volta proporcionalmente, sem deixar acima do novo máximo', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); }); // equipa -> máximo dobra, atual dobra
        const maxEquipado = getMaximo(ficha, 'vida');
        const atualEquipado = ficha.vida.atual;

        act(() => { probe.toggleEquiparItem(1); }); // desequipa -> máximo volta ao original
        const maxDesequipado = getMaximo(ficha, 'vida');

        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDesequipado);
        expect(ficha.vida.atual / maxDesequipado).toBeCloseTo(atualEquipado / maxEquipado, 6);
    });
});

describe('ArsenalFormContext — toggleEquiparItem(): auto-desequipar item do MESMO tipo (arma/armadura) também rescala corretamente', () => {
    it('equipar uma NOVA arma desequipa automaticamente a arma anterior do mesmo tipo, e a rescala reflete o efeito COMBINADO (perde o efeito da antiga, ganha o da nova)', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 },
            inventario: [
                { id: 1, nome: 'Espada Velha', tipo: 'arma', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }, // máximo atual = 200
                { id: 2, nome: 'Espada Nova', tipo: 'arma', equipado: false, efeitos: [] }, // sem efeito nenhum
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        // Antes de equipar a nova: máximo=200 (efeito da Espada Velha), atual=100 (50%).
        expect(getMaximo(ficha, 'vida')).toBe(200);

        act(() => { probe.toggleEquiparItem(2); }); // equipa a Espada Nova -> desequipa a Velha automaticamente

        expect(ficha.inventario[0].equipado).toBe(false); // Espada Velha desequipada
        expect(ficha.inventario[1].equipado).toBe(true); // Espada Nova equipada
        // Máximo volta a 100 (perdeu o efeito da Espada Velha, a Nova não tem efeito nenhum).
        const maxDepois = getMaximo(ficha, 'vida');
        expect(maxDepois).toBe(100);
        // atual=100 (100%) foi rescalado pra caber no novo máximo (100) -> permanece 100, sem
        // "vazar" nem ficar acima do teto.
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDepois);
    });

    it('itens de tipos DIFERENTES (arma vs armadura) nunca se auto-desequipam entre si', () => {
        const ficha = {
            vida: { base: 100, atual: 100 },
            inventario: [
                { id: 1, nome: 'Espada', tipo: 'arma', equipado: true, efeitos: [] },
                { id: 2, nome: 'Armadura', tipo: 'armadura', equipado: false, efeitos: [] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(2); });

        expect(ficha.inventario[0].equipado).toBe(true); // Espada continua equipada
        expect(ficha.inventario[1].equipado).toBe(true); // Armadura agora também equipada
    });
});

describe('ArsenalFormContext — toggleEquiparItem(): robustez', () => {
    it('id inexistente é um no-op completo, sem lançar e sem chamar salvarFichaSilencioso indevidamente', () => {
        const ficha = { vida: { base: 100, atual: 50 }, inventario: [{ id: 1, nome: 'X', tipo: 'arma', equipado: false, efeitos: [] }] };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        expect(() => { act(() => { probe.toggleEquiparItem(999); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
        expect(ficha.inventario[0].equipado).toBe(false);
    });

    it('ficha sem inventario nenhum não lança', () => {
        montarStore({ minhaFicha: {} });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        expect(() => { act(() => { probe.toggleEquiparItem(1); }); }).not.toThrow();
    });

    it('desequipar um item com formaAtivaId/configAtivaId ativos limpa os dois campos junto com a rescala', () => {
        const ficha = {
            vida: { base: 100, atual: 200, mFormas: 2 },
            inventario: [{
                id: 1, nome: 'Arma com Formas', tipo: 'arma', equipado: true,
                formaAtivaId: 'f1', configAtivaId: 'c1',
                efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 1 }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });

        expect(ficha.inventario[0].equipado).toBe(false);
        expect(ficha.inventario[0].formaAtivaId).toBeNull();
        expect(ficha.inventario[0].configAtivaId).toBeNull();
    });
});
