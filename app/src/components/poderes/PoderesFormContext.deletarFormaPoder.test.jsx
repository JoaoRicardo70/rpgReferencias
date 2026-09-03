import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { getMaximo } from '../../core/attributes';

// ---------------------------------------------------------------------------
// QA — PoderesFormContext.jsx > deletarFormaPoder(poderId, formaId): mesmo bugfix
// de rescala proporcional de vitais aplicado aos outros 4 call-sites (ver
// core/vitals.rescalarVitais.test.js). Caso especial: apagar a sub-Forma
// ATUALMENTE ATIVA de um Poder (p.formaAtivaId === formaId) desativa
// automaticamente essa Forma (formaAtivaId -> null) — se a Forma tinha efeitos que
// expandiam algum vital, o máximo encolhe no mesmo golpe em que ela é apagada, e
// ".atual" precisa ser rescalado JUNTO com a deleção, não depois.
//
// Mesmo padrão de harness (Provider real + componente-probe) de
// PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        efeitosTemp: [],
        setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [],
        setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null,
        setPoderEditandoId: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = usePoderesForm();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('PoderesFormContext — deletarFormaPoder(): apagar uma sub-Forma SEM efeito em vitais nunca drena ".atual"', () => {
    it('apagar uma sub-Forma cujos efeitos não tocam vitais mantém ".atual" fracionário intacto', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5 },
            poderes: [{
                id: 1, nome: 'Bankai', categoria: 'forma', ativa: true, formaAtivaId: 'sf1', efeitos: [],
                formas: [{ id: 'sf1', nome: 'Sub-Forma Cosmética', efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.deletarFormaPoder(1, 'sf1'); });

        expect(ficha.poderes[0].formas.length).toBe(0);
        expect(ficha.poderes[0].formaAtivaId).toBeNull();
        expect(ficha.vida.atual).toBe(79.5);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
});

describe('PoderesFormContext — deletarFormaPoder(): apagar a sub-Forma ATIVA com efeito em mFormas encolhe o máximo e rescala ".atual" no mesmo golpe', () => {
    it('apagar a sub-Forma atualmente ativa (com efeito mformas) encolhe o máximo de vida e rescala ".atual" proporcionalmente, sem deixar acima do novo teto', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 },
            poderes: [{
                id: 1, nome: 'Bankai', categoria: 'forma', ativa: true, formaAtivaId: 'sf1', efeitos: [],
                formas: [{ id: 'sf1', nome: 'Sub-Forma Poderosa', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.deletarFormaPoder(1, 'sf1'); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(maxDepois).toBeLessThan(maxAntes);
        expect(ficha.poderes[0].formas.length).toBe(0);
        expect(ficha.poderes[0].formaAtivaId).toBeNull();
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDepois);
    });

    it('apagar uma sub-Forma que NÃO é a ativa (formaAtivaId aponta pra OUTRA) não mexe no máximo nem em formaAtivaId', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 },
            poderes: [{
                id: 1, nome: 'Bankai', categoria: 'forma', ativa: true, formaAtivaId: 'sf1', efeitos: [],
                formas: [
                    { id: 'sf1', nome: 'Ativa', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] },
                    { id: 'sf2', nome: 'Não usada', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 5 }] },
                ],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.deletarFormaPoder(1, 'sf2'); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(ficha.poderes[0].formaAtivaId).toBe('sf1'); // continua apontando pra sf1
        expect(maxDepois).toBe(maxAntes); // sf1 continua ativa -> máximo inalterado
        expect(ficha.poderes[0].formas.find(f => f.id === 'sf2')).toBeUndefined();
    });
});

describe('PoderesFormContext — deletarFormaPoder(): robustez', () => {
    it('poderId inexistente é um no-op completo, sem lançar', () => {
        const ficha = { vida: { base: 100, atual: 50 }, poderes: [{ id: 1, nome: 'X', categoria: 'forma', formas: [] }] };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => { act(() => { probe.deletarFormaPoder(999, 'sfX'); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
    });

    it('formaId inexistente num Poder existente é um no-op (filter não remove nada, sem lançar)', () => {
        const ficha = {
            vida: { base: 100, atual: 50 },
            poderes: [{ id: 1, nome: 'X', categoria: 'forma', formaAtivaId: null, formas: [{ id: 'sf1', nome: 'Real' }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => { act(() => { probe.deletarFormaPoder(1, 'sfInexistente'); }); }).not.toThrow();
        expect(ficha.poderes[0].formas.length).toBe(1);
        expect(ficha.vida.atual).toBe(50);
    });

    it('Poder sem "formas" nenhuma (undefined) não lança', () => {
        const ficha = { vida: { base: 100, atual: 50 }, poderes: [{ id: 1, nome: 'X', categoria: 'forma' }] };
        montarStore({ minhaFicha: ficha });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => { act(() => { probe.deletarFormaPoder(1, 'sfX'); }); }).not.toThrow();
    });
});
