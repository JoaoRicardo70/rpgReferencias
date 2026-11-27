import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto, salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — MapaMestreDanoRapido: novo input "Domínio" (override 0-10 do Mestre, ver
// core/dominios.js > getFracaoResistenciaElemental), incluindo o gate visual
// (disabled sem Elemento selecionado) e a limpeza conjunta ao limpar o Elemento.
//
// Mesmo padrão de mock/harness de MapaFerramentasMestre.danoRapido.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function baseState(overrides = {}) {
    const minhaFicha = { nome: 'Ficha', iniciativa: 0, posicao: { x: 0, y: 0, z: 0, cenaId: 'default' }, vida: { atual: 100 } };
    return {
        minhaFicha,
        meuNome: 'Mestre',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre',
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } } },
        ...overrides,
    };
}

// O input de Domínio não tem um rótulo <label htmlFor> associável por testing-library — busca pelo
// placeholder "auto" (ver MapaFerramentasMestre.jsx).
function getInputDominio() {
    return screen.getByPlaceholderText('auto');
}

describe('MapaMestreDanoRapido — aplicar dano com override de Domínio preenchido', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    it('selecionar alvo (outro jogador), Elemento e Domínio, e aplicar dano encaminha o override pra aplicarElementoNivelDireto', () => {
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 80 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const [selectAlvo, selectElemento] = screen.getAllByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: 'Vilao' } });
        fireEvent.change(selectElemento, { target: { value: 'Fogo' } });
        fireEvent.change(getInputDominio(), { target: { value: '9' } });

        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(aplicarElementoDireto).toHaveBeenCalledWith('Vilao', 'Fogo');
        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', '9');
    });

    it('override "0" explícito é encaminhado como "0" (string), não convertido pra vazio/omitido', () => {
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 80 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const [selectAlvo, selectElemento] = screen.getAllByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: 'Vilao' } });
        fireEvent.change(selectElemento, { target: { value: 'Fogo' } });
        fireEvent.change(getInputDominio(), { target: { value: '0' } });

        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', '0');
    });

    it('sem preencher Domínio (Elemento marcado, mas Domínio vazio/"auto"), aplica dano com override null (usa o Domínio real do alvo)', () => {
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 80 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const [selectAlvo, selectElemento] = screen.getAllByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: 'Vilao' } });
        fireEvent.change(selectElemento, { target: { value: 'Fogo' } });

        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', null);
    });

    it('sem Elemento nenhum selecionado, aplica dano sem override (null), mesmo que o Domínio estivesse desabilitado', () => {
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 80 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const [selectAlvo] = screen.getAllByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: 'Vilao' } });

        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(aplicarElementoDireto).toHaveBeenCalledWith('Vilao', null);
        expect(aplicarElementoNivelDireto).toHaveBeenCalledWith('Vilao', null);
    });

});
