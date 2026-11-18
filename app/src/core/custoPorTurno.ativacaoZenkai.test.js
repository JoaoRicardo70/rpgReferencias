import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./zenkaiMedicao.js', async (orig) => {
    const real = await orig();
    return { ...real, registrarGastoDeEnergia: vi.fn(() => true) };
});

import useStore from '../stores/useStore';
import { registrarGastoDeEnergia } from './zenkaiMedicao.js';
import { dispararEventoNaFicha } from './gatilhosAplicar';
import { FATOR_EXIBICAO_VITAIS } from './vitals';

const energia = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
const montar = (iniciativa, cobrar = true) => ({
    vida: { atual: 1e9 }, iniciativa, inventario: [], passivas: [], contadores: [], mana: energia(50000), bio: {},
    poderes: [
        { id: 'g', nome: 'Gat', ativa: true, gatilhos: [{ id: 'l', nome: 'Liga', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ligarPoder', poderId: 'h' }] }] },
        { id: 'h', nome: 'Alvo', ativa: false, efeitos: [], efeitosPassivos: [], custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' }, ...(cobrar ? { cobrarAoAtivar: true } : {}) },
    ],
});

beforeEach(() => { registrarGastoDeEnergia.mockClear(); useStore.setState({ cenario: { ativa: 'default' } }); });

describe('M2b registro no Zenkai', () => {
    it('iniciativa > 0 registra o gasto de ativacao', () => {
        dispararEventoNaFicha(montar(10), { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(registrarGastoDeEnergia).toHaveBeenCalledTimes(1);
        expect(registrarGastoDeEnergia.mock.calls[0][1]).toEqual({ drenos: [{ key: 'mana', valor: 5 * FATOR_EXIBICAO_VITAIS }] });
    });
    it('iniciativa 0 nao registra', () => {
        dispararEventoNaFicha(montar(0), { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(registrarGastoDeEnergia).not.toHaveBeenCalled();
    });
    it('sem cobrarAoAtivar nao registra', () => {
        dispararEventoNaFicha(montar(10, false), { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(registrarGastoDeEnergia).not.toHaveBeenCalled();
    });
    it('falha ao ligar (sem energia) nao registra', () => {
        const f = montar(10); f.mana.atual = 0;
        dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(registrarGastoDeEnergia).not.toHaveBeenCalled();
    });
});
