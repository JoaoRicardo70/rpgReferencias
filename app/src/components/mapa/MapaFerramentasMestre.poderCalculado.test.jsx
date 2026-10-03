import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider } from './MapaFormContext';
import { MapaMestreGeradorDummies } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarDummie } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - Gerador de Entidades do Mapa: input #dummiePoder grava poderCalculado no dummie.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

function montar(isMestre = true) {
    const minhaFicha = { nome: 'F', iniciativa: 0, posicao: { x: 0, y: 0, z: 0, cenaId: 'default' }, vida: { atual: 100 } };
    const state = {
        minhaFicha, meuNome: 'Mestre', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } } },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    return render(<MapaFormProvider><MapaMestreGeradorDummies /></MapaFormProvider>);
}

function injetar(poderTxt) {
    const { container } = montar();
    if (poderTxt !== undefined) fireEvent.change(container.querySelector('#dummiePoder'), { target: { value: poderTxt } });
    fireEvent.click(screen.getByText('+ Injetar na Cena'));
    return salvarDummie.mock.calls[0][1];
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('MapaMestreGeradorDummies - Poder Calculado', () => {
    it('o campo #dummiePoder existe e comeca vazio', () => {
        const { container } = montar();
        const input = container.querySelector('#dummiePoder');
        expect(input).not.toBeNull();
        expect(input.value).toBe('');
    });
    it('jogador (nao Mestre) nao ve o gerador', () => {
        const { container } = montar(false);
        expect(container.querySelector('#dummiePoder')).toBeNull();
    });
    it('poder digitado vira poderCalculado no dummie salvo', () => {
        expect(injetar('2500').poderCalculado).toBe(2500);
    });
    it('poder decimal e preservado', () => {
        expect(injetar('0.75').poderCalculado).toBe(0.75);
    });
    it('poder 0 e gravado', () => {
        expect(injetar('0').poderCalculado).toBe(0);
    });
    it('poder negativo e limitado a 0', () => {
        expect(injetar('-10').poderCalculado).toBe(0);
    });
    it('campo vazio nao grava poderCalculado', () => {
        const payload = injetar();
        expect('poderCalculado' in payload).toBe(false);
        expect(payload.nome).toBe('Boneco');
    });
});
