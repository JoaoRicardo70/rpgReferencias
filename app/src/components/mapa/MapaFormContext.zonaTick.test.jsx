import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed } from '../../services/firebase-sync';

// Regressão: o tick da Zona (dispararEfeitoDaZona, via avancarTurno) usava só posicao.cenaId pra
// decidir a cena do dummie — mas dummies guardam a cena em d.cenaId. Também não pode quebrar com
// dummie sem posicao. Mesmo harness de MapaFormContext.combateAutoTurno.test.jsx.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
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

function estado(dummies, overrides = {}) {
    const minhaFicha = { nome: 'Mestre', iniciativa: 0, vida: { atual: 100 } };
    return {
        minhaFicha,
        meuNome: 'Mestre',
        personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre',
        dummies,
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: {
            ativa: 'cena_x',
            lista: { cena_x: { nome: 'Cena X', escala: 1.5 } },
            turnoAtualIndex: 0,
            zonas: [{ id: 'z1', nome: 'Fogo', cenaId: 'cena_x', conjurador: 'Conj', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }],
        },
        ...overrides,
    };
}

const conjuradores = () => ({
    a: { nome: 'A', iniciativa: 20, cenaId: 'cena_x', hpAtual: 10 },
    conj: { nome: 'Conj', iniciativa: 10, cenaId: 'cena_x', hpAtual: 10 },
});

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

describe('MapaFormContext - tick da zona em avancarTurno (dispararEfeitoDaZona)', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('dummie com d.cenaId = cena da zona (posicao sem cenaId) dentro do raio leva dano', () => {
        const dummies = {
            ...conjuradores(),
            alvo: { nome: 'Alvo', iniciativa: 0, cenaId: 'cena_x', hpAtual: 100, posicao: { x: 5, y: 6, z: 0 } },
        };
        montar(estado(dummies));
        act(() => { probe.avancarTurno(); }); // index 0 (A) -> 1 (Conj), conjurador da zona

        const chamadasAlvo = salvarDummie.mock.calls.filter(c => c[0] === 'alvo');
        expect(chamadasAlvo).toHaveLength(1);
        expect(chamadasAlvo[0][1].hpAtual).toBe(60);
        expect(enviarParaFeed.mock.calls.some(c => String(c[0].texto).includes('Alvo'))).toBe(true);
    });

    it('dummie de OUTRA cena (d.cenaId diferente) dentro do raio não leva dano', () => {
        const dummies = {
            ...conjuradores(),
            alvo: { nome: 'Alvo', iniciativa: 0, cenaId: 'outra', hpAtual: 100, posicao: { x: 5, y: 5, z: 0 } },
        };
        montar(estado(dummies));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo')).toHaveLength(0);
    });

    it('dummie fora do raio não leva dano', () => {
        const dummies = {
            ...conjuradores(),
            alvo: { nome: 'Alvo', iniciativa: 0, cenaId: 'cena_x', hpAtual: 100, posicao: { x: 20, y: 20, z: 0 } },
        };
        montar(estado(dummies));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo')).toHaveLength(0);
    });

    it('dummie SEM posicao não derruba avancarTurno e não leva dano', () => {
        const dummies = {
            ...conjuradores(),
            semPos: { nome: 'SemPos', iniciativa: 0, cenaId: 'cena_x', hpAtual: 100 },
        };
        montar(estado(dummies));
        expect(() => { act(() => { probe.avancarTurno(); }); }).not.toThrow();
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'semPos')).toHaveLength(0);
    });

    it('hpAtual nunca fica negativo', () => {
        const dummies = {
            ...conjuradores(),
            alvo: { nome: 'Alvo', iniciativa: 0, cenaId: 'cena_x', hpAtual: 5, posicao: { x: 5, y: 5, z: 0 } },
        };
        montar(estado(dummies));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(0);
    });
});

describe('MapaMestreDanoRapido - alternar modo RP entre renders (ordem dos hooks)', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    const arvore = () => <MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>;
    const base = (modoRP) => estado({}, { cenario: { ativa: 'default', lista: { default: { nome: 'C', escala: 1.5 } }, modoRP } });

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
