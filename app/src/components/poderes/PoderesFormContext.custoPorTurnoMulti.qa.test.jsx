import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10 })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

const F = FATOR_EXIBICAO_VITAIS;
let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const vital = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual });

function montar() {
    mockState = {
        minhaFicha: { poderes: [], vida: vital(100 * F), mana: vital(100 * F), aura: vital(100 * F), chakra: vital(100 * F), corpo: vital(100 * F), combate: {} },
        meuNome: 'Heroi', isMestre: false,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(), dummies: {}, personagens: {}, feedCombate: [], alvoSelecionado: null, abaAtiva: 'mapa', setAbaAtiva: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const criar = async (campos) => {
    act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); campos(); });
    await act(async () => { probe.salvarNovoPoder(); });
};

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('editor - custo por turno em varias energias', () => {
    it('um custo grava objeto', async () => {
        montar();
        await criar(() => probe.setCustoTurnoPoder({ modo: 'percMax', valor: '10', energia: 'corpo' }));
        expect(mockState.minhaFicha.poderes[0].custoPorTurno).toEqual({ modo: 'percMax', valor: 10, energia: 'corpo' });
    });
    it('principal + extra grava lista', async () => {
        montar();
        await criar(() => {
            probe.setCustoTurnoPoder({ modo: 'percMax', valor: '10', energia: 'corpo' });
            probe.setCustoTurnoExtrasPoder([{ modo: 'percMax', valor: '10', energia: 'aura' }]);
        });
        expect(mockState.minhaFicha.poderes[0].custoPorTurno).toEqual([
            { modo: 'percMax', valor: 10, energia: 'corpo' }, { modo: 'percMax', valor: 10, energia: 'aura' },
        ]);
        expect(window.alert).not.toHaveBeenCalled();
    });
    it('custo invalido (% > 100) nao grava e alerta', async () => {
        montar();
        await criar(() => probe.setCustoTurnoPoder({ modo: 'percMax', valor: '150', energia: 'mana' }));
        expect(mockState.minhaFicha.poderes).toHaveLength(0);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/inválido/);
        expect(window.alert.mock.calls[0][0]).toMatch(/Corrija o custo por turno/);
    });
    it('extra invalido (negativo) tambem bloqueia, mesmo com principal valido', async () => {
        montar();
        await criar(() => {
            probe.setCustoTurnoPoder({ modo: 'fixo', valor: '5', energia: 'mana' });
            probe.setCustoTurnoExtrasPoder([{ modo: 'fixo', valor: '-3', energia: 'aura' }]);
        });
        expect(mockState.minhaFicha.poderes).toHaveLength(0);
        expect(window.alert).toHaveBeenCalledTimes(1);
    });
    it('extra vazio (sem valor) e ignorado sem alerta', async () => {
        montar();
        await criar(() => {
            probe.setCustoTurnoPoder({ modo: 'fixo', valor: '5', energia: 'mana' });
            probe.setCustoTurnoExtrasPoder([{ modo: 'fixo', valor: '', energia: 'aura' }]);
        });
        expect(window.alert).not.toHaveBeenCalled();
        expect(mockState.minhaFicha.poderes[0].custoPorTurno).toEqual({ modo: 'fixo', valor: 5, energia: 'mana' });
    });
});
