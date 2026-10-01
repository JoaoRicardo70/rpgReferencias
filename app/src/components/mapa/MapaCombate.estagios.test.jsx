import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Estágios nas Técnicas Rápidas do Mapa: chips de técnicas com Estágios ganham o
// EstagioControle compacto (− / +) ao lado do botão de liga/desliga. Harness de
// MapaCombate.ataqueArmaETecnicas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(minhaFicha) {
    mockState = {
        minhaFicha, meuNome: 'Heroi', isMestre: true, personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
        pastasFechadasMapaTecnicas: {},
        setPastasFechadasMapaTecnicas: vi.fn(),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
}

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

const CFG = { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [] };
const base = { vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} };

describe('MapaTecnicasRapidas — chips de técnicas com Estágios', () => {
    it('chip de técnica estagiada mostra o controle compacto (−, estágio atual, +) e sem o campo "ir direto"', () => {
        const ficha = { poderes: [{ id: 'p1', nome: 'Portões', categoria: 'habilidade', ativa: false, estagios: { ...CFG }, estagioAtual: 2, ...base }] };
        montarStore(ficha);
        const { getByText, getByRole, queryByLabelText, container } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

        expect(getByText('☆ Portões')).toBeTruthy();
        expect(getByText(/2º Portão \/ 10/)).toBeTruthy();
        expect(getByRole('button', { name: /Subir para o estágio 3/ })).toBeTruthy();
        expect(getByRole('button', { name: /Descer para o estágio 1/ })).toBeTruthy();
        expect(queryByLabelText('Ir direto para o estágio')).toBeNull();
        expect(container.querySelector('.mapa-tecnica-estagio .estagio-controle.compacto')).toBeTruthy();
    });

    it('chip de técnica comum NÃO ganha o controle de estágio', () => {
        montarStore({ poderes: [{ id: 'p1', nome: 'Bola de Fogo', categoria: 'habilidade', ativa: false, ...base }] });
        const { queryByRole, container } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(queryByRole('button', { name: /estágio/i })).toBeNull();
        expect(container.querySelector('.mapa-tecnica-estagio')).toBeNull();
    });

    it('clicar em "+" sobe o estágio da técnica (mudarEstagioPoder) sem ligá-la', () => {
        const poder = { id: 'p1', nome: 'Portões', categoria: 'habilidade', ativa: false, estagios: { ...CFG }, estagioAtual: 1, ...base };
        montarStore({ poderes: [poder] });
        const { getByRole } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

        act(() => { fireEvent.click(getByRole('button', { name: /Subir para o estágio 2/ })); });

        expect(poder.estagioAtual).toBe(2);
        expect(poder.ativa).toBe(false);
    });

    it('"−" fica desabilitado no 1º estágio e "+" no último', () => {
        const a = { id: 'a', nome: 'Primeira', categoria: 'habilidade', ativa: false, estagios: { ...CFG }, estagioAtual: 1, ...base };
        montarStore({ poderes: [a] });
        const r1 = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(r1.getByRole('button', { name: /Descer/ }).disabled).toBe(true);
        r1.unmount();

        const b = { id: 'b', nome: 'Ultima', categoria: 'habilidade', ativa: false, estagios: { ...CFG, maximo: 3 }, estagioAtual: 3, ...base };
        montarStore({ poderes: [b] });
        const r2 = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(r2.getByRole('button', { name: /Subir/ }).disabled).toBe(true);
    });

    it('clicar no botão principal da técnica estagiada continua alternando ativa/inativa', () => {
        const poder = { id: 'p1', nome: 'Portões', categoria: 'habilidade', ativa: false, estagios: { ...CFG }, estagioAtual: 2, ...base };
        montarStore({ poderes: [poder] });
        const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        act(() => { getByText('☆ Portões').click(); });
        expect(poder.ativa).toBe(true);
    });
});
