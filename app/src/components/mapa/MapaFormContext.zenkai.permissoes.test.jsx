import React from 'react';
import { render, cleanup, act, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { novaTelemetriaZenkai } from '../../core/zenkai';

// Permissoes: jogador (ou Modo Jogador, isMestre=false) nao encerra combate, nao abre o dialogo nem decide o Zenkai.
vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve(true)), zerarIniciativaGlobal: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}
const TELE = { ...novaTelemetriaZenkai(), vidaMax: 100000, danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 };
let probe;
function Harness() { probe = useMapaForm(); return null; }

function estado() {
    const minhaFicha = {
        iniciativa: 10, posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: 1, regeneracao: 0 },
        poderes: [], inventario: [], passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, zenkaiLigado: true, zenkai: { ...TELE } },
    };
    return {
        minhaFicha, meuNome: 'Heroi', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)), feedCombate: [], isMestre: false, mesaCriador: '',
        dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa', setAcoesOrdemTurnoMapa: vi.fn(),
        cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 2, iniciadoEm: 1 } }, lista: { default: { nome: 'Cena' } }, turnoAtualIndex: 0 },
    };
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Zenkai: so o Mestre decide (jogador / Modo Jogador)', () => {
    it('encerrarCombate como jogador: sem dialogo, sem aplicar, telemetria intacta, nada gravado', () => {
        const s = estado(); mockUseStore(s);
        render(<MapaFormProvider><Harness /></MapaFormProvider>);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByTestId('aprovacao-item-Heroi')).toBeNull();
        expect(s.minhaFicha.ganhosPermanentes).toBeUndefined();
        expect(s.minhaFicha.combate.zenkai).toEqual(TELE);
        expect(firebaseSync.salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
    });
    it('Modo Jogador do Mestre (isMestre=false) idem; ao voltar a Mestre o dialogo aparece', () => {
        const s = estado(); mockUseStore(s);
        render(<MapaFormProvider><Harness /></MapaFormProvider>);
        act(() => { probe.encerrarCombate(); });
        expect(screen.queryByTestId('aprovacao-item-Heroi')).toBeNull();
        cleanup();
        s.isMestre = true; mockUseStore(s);
        render(<MapaFormProvider><Harness /></MapaFormProvider>);
        act(() => { probe.encerrarCombate(); });
        expect(screen.getByTestId('aprovacao-item-Heroi')).toBeTruthy();
    });
});
