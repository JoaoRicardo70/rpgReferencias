import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// Regressão: o tick da Zona (dispararEfeitoDaZona, via avancarTurno) usava só posicao.cenaId pra
// decidir a cena do alvo. Também não pode quebrar com
// alvo sem posicao. Mesmo harness de MapaFormContext.combateAutoTurno.test.jsx.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
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

function estado(overrides = {}) {
    const minhaFicha = { nome: 'Mestre', iniciativa: 0, vida: { atual: 100 } };
    return {
        minhaFicha,
        meuNome: 'Mestre',
        personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre',
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: {
            ativa: 'cena_x',
            combates: { cena_x: { ativo: true, rodada: 1 } },
            lista: { cena_x: { nome: 'Cena X', escala: 1.5 } },
            turnoAtualIndex: 0,
            zonas: [{ id: 'z1', nome: 'Fogo', cenaId: 'cena_x', conjurador: 'Conj', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }],
        },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

describe('MapaMestreDanoRapido - alternar modo RP entre renders (ordem dos hooks)', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    const arvore = () => <MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>;
    const base = (modoRP) => estado({ cenario: { ativa: 'default', lista: { default: { nome: 'C', escala: 1.5 } }, modoRP } });

    it('painel visível -> oculto (modoRP liga) -> visível sem lançar', () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockUseStore(base(false));
        const { container, rerender } = render(arvore());
        expect(screen.getByText('⚔️ Dano Rápido')).toBeDefined();

        mockUseStore(base(true));
        expect(() => rerender(arvore())).not.toThrow();
        expect(container.textContent).toBe('');

        mockUseStore(base(false));
        expect(() => rerender(arvore())).not.toThrow();
        expect(screen.getByText('⚔️ Dano Rápido')).toBeDefined();
        expect(erro.mock.calls.flat().join(' ')).not.toMatch(/hooks/i);
        erro.mockRestore();
    });

    it('começa oculto (modoRP) e aparece depois sem lançar', () => {
        mockUseStore(base(true));
        const { container, rerender } = render(arvore());
        expect(container.textContent).toBe('');
        mockUseStore(base(false));
        expect(() => rerender(arvore())).not.toThrow();
        expect(screen.getByText('⚔️ Dano Rápido')).toBeDefined();
    });

    it('sem provider (ctx nulo) mostra o fallback sem lançar', () => {
        mockUseStore(base(false));
        expect(() => render(<MapaMestreDanoRapido />)).not.toThrow();
    });
});
