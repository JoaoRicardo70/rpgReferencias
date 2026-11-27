import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';

vi.mock('../../stores/useStore', () => ({ default: vi.fn(), sanitizarNome: (n) => String(n || '').replace(/[.#$[\]/]/g, '_') }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve(true)), zerarIniciativaGlobal: vi.fn(),
}));

let storeState; let probe;
function Harness() { probe = useMapaForm(); return null; }
const RACAS = [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' }, { id: 'namek', nome: 'Namekuseijin', icone: '🟢', apelidos: [], herdaDe: '' }];
function montar(isMestre) {
    const minhaFicha = { bio: { raca: '', racaId: '' }, poderes: [], inventario: [], passivas: [], combate: {}, posicao: { x: 0, y: 0, z: 0 } };
    storeState = {
        minhaFicha, meuNome: 'Heroi', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)), feedCombate: [], isMestre, mesaCriador: '',
        alvoSelecionado: null, abaAtiva: 'mapa', setAcoesOrdemTurnoMapa: vi.fn(),
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena' } }, racas: RACAS, turnoAtualIndex: 0 },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
    return storeState;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MapaFormContext - salvarRacas / definirRacaDoPersonagem', () => {
    it('salvarRacas: jogador (ou Modo Jogador) nao grava', () => {
        montar(false);
        let r; act(() => { r = probe.salvarRacas([{ nome: 'Elfo' }]); });
        expect(r).toBeNull();
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('salvarRacas: Mestre grava saneado; lista vazia apaga o catalogo', () => {
        montar(true);
        let r; act(() => { r = probe.salvarRacas([{ nome: '  Elfo  ' }, { nome: '' }, null]); });
        expect(r).toHaveLength(1);
        expect(firebaseSync.salvarCenarioCompleto.mock.calls[0][0].racas).toEqual([expect.objectContaining({ id: 'elfo', nome: 'Elfo' })]);
        act(() => { probe.salvarRacas([]); });
        expect(firebaseSync.salvarCenarioCompleto.mock.calls[1][0].racas).toBeUndefined();
    });
});
