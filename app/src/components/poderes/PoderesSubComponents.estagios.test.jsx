import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesFormEditor, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — UI de Estágios em PoderesSubComponents.jsx: bloco do editor (checkbox + campos) e o card
// da lista (EstagioControle + valores escalados em "Mecânica"). Mesmo harness de
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
        setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

const CFG = { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [] };
function poderEstagiado(extra = {}) {
    return {
        id: 1, nome: 'Portões Internos', categoria: 'habilidade', ativa: false, estagioAtual: 3, estagios: { ...CFG },
        efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 10 }], efeitosPassivos: [], ...extra,
    };
}

describe('PoderesFormEditor (UI) — bloco de Estágios', () => {
    it('começa só com o checkbox, sem os campos de configuração', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
        expect(screen.getByText(/Esta técnica tem Estágios/)).toBeTruthy();
        expect(screen.queryByText(/Crescimento por estágio/)).toBeNull();
        expect(screen.queryByText(/Último estágio/)).toBeNull();
    });

    it('marcar o checkbox revela nome, último estágio, crescimento, fadiga e nomes', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
        fireEvent.click(screen.getByRole('checkbox', { name: /Esta técnica tem Estágios/ }));
        expect(screen.getByText('Nome do estágio')).toBeTruthy();
        expect(screen.getByText(/Último estágio/)).toBeTruthy();
        expect(screen.getByText(/Crescimento por estágio/)).toBeTruthy();
        expect(screen.getByText(/Fadiga por estágio/)).toBeTruthy();
        expect(screen.getByText(/Nome de cada estágio/)).toBeTruthy();
    });

    it('desmarcar de novo esconde os campos', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
        const cb = screen.getByRole('checkbox', { name: /Esta técnica tem Estágios/ });
        fireEvent.click(cb);
        fireEvent.click(cb);
        expect(screen.queryByText(/Crescimento por estágio/)).toBeNull();
    });

    it('a prévia reflete os números digitados (crescimento 50 => 3º estágio x2)', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
        fireEvent.click(screen.getByRole('checkbox', { name: /Esta técnica tem Estágios/ }));
        const input = screen.getByText(/Crescimento por estágio/).closest('label').querySelector('input');
        fireEvent.change(input, { target: { value: '50' } });
        expect(screen.getByText(/3º: efeitos x2,/)).toBeTruthy();
    });

    it('máximo 0 na prévia mostra "sem limite"', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);
        fireEvent.click(screen.getByRole('checkbox', { name: /Esta técnica tem Estágios/ }));
        const input = screen.getByText(/Último estágio/).closest('label').querySelector('input');
        fireEvent.change(input, { target: { value: '0' } });
        expect(screen.getByText(/sem limite/)).toBeTruthy();
    });
});

describe('PoderesLista (UI) — card com Estágios', () => {
    function renderLista(poder) {
        montarStore({ minhaFicha: { poderes: [poder] } });
        return render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
    }

    it('mostra o EstagioControle do poder estagiado', () => {
        renderLista(poderEstagiado());
        expect(screen.getByText(/3º Portão \/ 10/)).toBeTruthy();
    });

    it('"Mecânica" mostra o valor escalado pelo estágio atual (10 x 3 = 30)', () => {
        renderLista(poderEstagiado());
        expect(screen.getByText(/\[FORCA\] BASE: \+30/)).toBeTruthy();
    });

    it('no 1º estágio "Mecânica" mostra o valor original', () => {
        renderLista(poderEstagiado({ estagioAtual: 1 }));
        expect(screen.getByText(/\[FORCA\] BASE: \+10/)).toBeTruthy();
    });

    it('poder SEM Estágios não mostra o seletor', () => {
        renderLista(poderEstagiado({ estagios: undefined, estagioAtual: undefined }));
        expect(screen.queryByText(/Portão/)).toBeNull();
        expect(screen.queryByLabelText('Ir direto para o estágio')).toBeNull();
    });

    it('clicar em "+" no card sobe o estágio do poder', () => {
        const p = poderEstagiado();
        renderLista(p);
        fireEvent.click(screen.getByRole('button', { name: /Subir para o estágio 4/ }));
        expect(p.estagioAtual).toBe(4);
    });
});
