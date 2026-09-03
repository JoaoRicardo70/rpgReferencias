import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaFormProvider, useFichaForm } from './FichaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';
import { getMaximo } from '../../core/attributes.js';

// ---------------------------------------------------------------------------
// QA — FichaFormContext.jsx > toggleSerSelado(id) e ativarFormaSer(serId, formaId):
// mesmo bugfix de rescala proporcional de vitais (capturarMaximosAtuais/
// rescalarVitaisProporcional, ver core/vitals.rescalarVitais.test.js) aplicado ao
// toggle de ativação de um "Ser Selado" (Entidade Selada) e à ativação/desativação
// de uma Forma/Modo aninhado dele — nunca drenar ".atual" de um vital cujo máximo
// não mudou, e rescalar proporcionalmente quando muda de fato.
//
// Mesmo padrão de harness (Provider real + componente-probe) de
// ArsenalFormContext.toggleEquiparItem.test.jsx / PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { seresSelados: [] },
        personagens: {},
        meuNome: 'Heroi',
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useFichaForm();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('FichaFormContext — toggleSerSelado(): ativar/desativar um Ser SEM efeito em vitais nunca drena ".atual"', () => {
    it('ativar um Ser cujos efeitos não tocam vitais mantém ".atual" fracionário intacto', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5 },
            seresSelados: [{ id: 1, nome: 'Espírito Cosmético', ativo: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.toggleSerSelado(1); });

        expect(ficha.seresSelados[0].ativo).toBe(true);
        expect(ficha.vida.atual).toBe(79.5);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('desativar de volta também não altera ".atual" quando o Ser não afeta vitais', () => {
        const ficha = {
            vida: { base: 100, atual: 42 },
            seresSelados: [{ id: 1, nome: 'Espírito', ativo: true, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.toggleSerSelado(1); });

        expect(ficha.seresSelados[0].ativo).toBe(false);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('FichaFormContext — toggleSerSelado(): Ser com efeito em mFormas rescala ".atual" proporcionalmente', () => {
    it('ativar um Ser Selado com efeito mformas expande o máximo de vida, e cresce ".atual" preservando a fração (50%)', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 }, // 50% de 100
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.toggleSerSelado(1); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual / maxDepois).toBeCloseTo(0.5, 6);
    });

    it('desativar esse mesmo Ser depois encolhe ".atual" de volta proporcionalmente, sem deixar acima do novo máximo', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.toggleSerSelado(1); }); // ativa -> máximo cresce
        const maxAtivo = getMaximo(ficha, 'vida');
        const atualAtivo = ficha.vida.atual;

        act(() => { probe.toggleSerSelado(1); }); // desativa -> máximo volta ao original
        const maxInativo = getMaximo(ficha, 'vida');

        expect(ficha.vida.atual).toBeLessThanOrEqual(maxInativo);
        expect(ficha.vida.atual / maxInativo).toBeCloseTo(atualAtivo / maxAtivo, 6);
    });
});

describe('FichaFormContext — toggleSerSelado(): robustez', () => {
    it('id inexistente é um no-op completo, sem lançar', () => {
        const ficha = { vida: { base: 100, atual: 50 }, seresSelados: [{ id: 1, nome: 'X', ativo: false, efeitos: [] }] };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.toggleSerSelado(999); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
    });

    it('ficha sem seresSelados nenhum não lança (guarda explícita `if (!f.seresSelados) return;`)', () => {
        montarStore({ minhaFicha: { vida: { base: 100, atual: 50 } } });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.toggleSerSelado(1); }); }).not.toThrow();
    });
});

describe('FichaFormContext — ativarFormaSer(serId, formaId): ativar/desativar uma Forma/Modo do Ser rescala ".atual" proporcionalmente', () => {
    it('ativar uma Forma/Modo do Ser com efeito em mFormas expande o máximo, e cresce ".atual" preservando a fração', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            seresSelados: [{
                id: 1, nome: 'Bijuu', ativo: true, formaAtivaId: null, efeitos: [],
                formas: [{ id: 'modo1', nome: 'Modo Furioso', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.ativarFormaSer(1, 'modo1'); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(ficha.seresSelados[0].formaAtivaId).toBe('modo1');
        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual / maxDepois).toBeCloseTo(0.5, 6);
    });

    it('ativar a MESMA Forma de novo (toggle) desativa (formaAtivaId volta a null) e encolhe ".atual" de volta proporcionalmente', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            seresSelados: [{
                id: 1, nome: 'Bijuu', ativo: true, formaAtivaId: null, efeitos: [],
                formas: [{ id: 'modo1', nome: 'Modo Furioso', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.ativarFormaSer(1, 'modo1'); }); // ativa
        const maxAtivo = getMaximo(ficha, 'vida');
        const atualAtivo = ficha.vida.atual;

        act(() => { probe.ativarFormaSer(1, 'modo1'); }); // desativa (toggle)
        const maxInativo = getMaximo(ficha, 'vida');

        expect(ficha.seresSelados[0].formaAtivaId).toBeNull();
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxInativo);
        expect(ficha.vida.atual / maxInativo).toBeCloseTo(atualAtivo / maxAtivo, 6);
    });

    it('ativar uma Forma num Ser ainda INATIVO (ativo=false) também ativa o Ser junto (s.ativo=true) e rescala considerando os dois efeitos combinados', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 },
            seresSelados: [{
                id: 1, nome: 'Bijuu', ativo: false, formaAtivaId: null, efeitos: [],
                formas: [{ id: 'modo1', nome: 'Modo Furioso', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.ativarFormaSer(1, 'modo1'); });

        expect(ficha.seresSelados[0].ativo).toBe(true);
        expect(ficha.seresSelados[0].formaAtivaId).toBe('modo1');
        // Máximo agora reflete o efeito da Forma (que só se aplica com o Ser ativo).
        expect(getMaximo(ficha, 'vida')).toBeGreaterThan(100);
        expect(ficha.vida.atual).toBeLessThanOrEqual(getMaximo(ficha, 'vida'));
    });

    it('id de Ser inexistente é um no-op completo, sem lançar', () => {
        const ficha = { vida: { base: 100, atual: 50 }, seresSelados: [] };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.ativarFormaSer(999, 'modoX'); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
    });
});
