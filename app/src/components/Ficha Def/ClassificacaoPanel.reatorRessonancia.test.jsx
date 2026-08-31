import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regressão: PaginaReator ("Reator de Ressonância", Capítulo 4) chamava
// getMaximo(minhaFicha, k) sem que o arquivo NUNCA importasse getMaximo de
// core/attributes.js. Isso derrubava a renderização INTEIRA do app com
// `ReferenceError: getMaximo is not defined` assim que o jogador abria esse
// capítulo — React não tem error boundary aqui, então o crash em render()
// desmontava toda a árvore. Encontrado via auditoria `eslint --rule no-undef`
// no projeto inteiro. Corrigido importando getMaximo de '../../core/attributes.js'.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

function montarMockUseStore(ficha, extra = {}) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        isMestre: true,
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function irParaReatorDeRessonancia() {
    const seletor = screen.getByRole('combobox');
    fireEvent.change(seletor, { target: { value: 'elemental' } });
}

describe('ClassificacaoPanel — Reator de Ressonância não lança ReferenceError ao abrir', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('abrir o capítulo "Reator de Ressonância" não lança erro e mostra a soma de Mana+Aura+Chakra', () => {
        const ficha = { mana: { base: 100 }, aura: { base: 200 }, chakra: { base: 300 }, poderes: [] };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        expect(() => irParaReatorDeRessonancia()).not.toThrow();

        // getMaximo(ficha, k) com apenas `base` definido (sem buffs/formas) retorna o próprio base.
        expect(screen.getByText('+600')).toBeTruthy();
    });

    it('usa ficha[k].atual em vez do máximo quando `atual` está definido (ramo getAtual)', () => {
        const ficha = {
            mana: { base: 100, atual: 50 }, aura: { base: 200, atual: 150 }, chakra: { base: 300, atual: 300 },
            poderes: [],
        };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);
        irParaReatorDeRessonancia();

        expect(screen.getByText('+500')).toBeTruthy();
    });

    it('ficha sem os campos mana/aura/chakra definidos não lança erro (soma cai pra 0)', () => {
        const ficha = { poderes: [] };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        expect(() => irParaReatorDeRessonancia()).not.toThrow();
        expect(screen.getByText('+0')).toBeTruthy();
    });
});
