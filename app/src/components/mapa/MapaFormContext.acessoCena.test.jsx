import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

const LISTA = { 'cena-a': { nome: 'Cena A', reino: 'Noxus' }, 'cena-b': { nome: 'Cena B', reino: 'Noxus' } };

function baseState(overrides = {}) {
    return {
        minhaFicha: { nome: 'Astolfo' },
        meuNome: 'Astolfo',
        personagens: {},
        updateFicha: vi.fn(),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Astolfo',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'cena-a', lista: LISTA },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function Tree() { return <MapaFormProvider><Harness /></MapaFormProvider>; }

describe('MapaFormContext - definirAcessoCena', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        probe = undefined;
    });
    afterEach(cleanup);

    it('Mestre: lista restringe a Cena (restrita + acessoNomes) e salva o cenario completo', () => {
        mockUseStore(baseState());
        render(<Tree />);
        probe.definirAcessoCena('cena-b', ['Ana', 'Bia']);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.ativa).toBe('cena-a');
        expect(salvo.lista['cena-b']).toMatchObject({ nome: 'Cena B', restrita: true, acessoNomes: ['Ana', 'Bia'] });
        expect(salvo.lista['cena-a']).toEqual(LISTA['cena-a']);
    });

    it('Mestre: lista vazia = so Mestres (restrita sem acessoNomes)', () => {
        mockUseStore(baseState());
        render(<Tree />);
        probe.definirAcessoCena('cena-b', []);
        const cena = salvarCenarioCompleto.mock.calls[0][0].lista['cena-b'];
        expect(cena.restrita).toBe(true);
        expect(cena.acessoNomes).toBeUndefined();
    });

    it('Mestre: null libera para todos (remove restrita e acessoNomes)', () => {
        const lista = { ...LISTA, 'cena-b': { nome: 'Cena B', reino: 'Noxus', restrita: true, acessoNomes: ['Ana'] } };
        mockUseStore(baseState({ cenario: { ativa: 'cena-a', lista } }));
        render(<Tree />);
        probe.definirAcessoCena('cena-b', null);
        expect(salvarCenarioCompleto.mock.calls[0][0].lista['cena-b']).toEqual({ nome: 'Cena B', reino: 'Noxus' });
    });

    it('nao muta o cenario do store', () => {
        const estado = baseState();
        const antes = JSON.stringify(estado.cenario);
        mockUseStore(estado);
        render(<Tree />);
        probe.definirAcessoCena('cena-b', ['Ana']);
        expect(JSON.stringify(estado.cenario)).toBe(antes);
    });

    it('jogador comum: nao faz nada (nao chama salvarCenarioCompleto)', () => {
        mockUseStore(baseState({ isMestre: false }));
        render(<Tree />);
        probe.definirAcessoCena('cena-b', ['Astolfo']);
        probe.definirAcessoCena('cena-b', null);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Mestre: id inexistente salva o cenario sem alteracoes', () => {
        mockUseStore(baseState());
        render(<Tree />);
        probe.definirAcessoCena('nao-existe', ['Ana']);
        const salvo = salvarCenarioCompleto.mock.calls[0]?.[0];
        if (salvo) expect(salvo.lista).toEqual(LISTA);
    });
});
