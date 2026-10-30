import React from 'react';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CombosPanel from './CombosPanel';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso } from '../../services/firebase-sync';
import { normalizarCombo, exportarCombos } from '../../core/combos';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(),
    salvarFirebaseImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn()
}));

let state; let minha; let outro;
const acoes = () => ({ padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 2, extra: 0 } });
const base = (combos = []) => ({ combos, followUps: [], acoes: acoes(), poderes: [], ataquesElementais: [], inventario: [], combate: {} });
const comboDoOutro = normalizarCombo({ id: 'o1', nome: 'Golpe do Outro', iniciador: { nome: 'Abre', acao: 'padrao' }, passos: [{ nome: 'Fecha', acao: 'bonus' }] });
const comboMeu = normalizarCombo({ id: 'm1', nome: 'Meu Combo', iniciador: { nome: 'Soco', acao: 'padrao' }, passos: [{ nome: 'Chute', acao: 'bonus' }] });

function montar({ alvo = 'Outro', outroCombos = [comboDoOutro], meusCombos = [comboMeu] } = {}) {
    minha = base(meusCombos);
    outro = base(outroCombos);
    state = {
        minhaFicha: minha, meuNome: 'Heroi', personagens: { Outro: outro },
        updateFicha: vi.fn((cb) => cb(minha)),
        updateFichaAlvo: vi.fn((nome, cb) => cb(state.personagens[nome])),
        adicionarAviso: vi.fn()
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    const ui = alvo === null ? <CombosPanel /> : <FichaAlvoProvider nome={alvo}><CombosPanel /></FichaAlvoProvider>;
    return render(ui);
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CombosPanel dentro de FichaAlvoProvider', () => {
    it('mostra os Combos do personagem alvo e não os meus', () => {
        montar();
        expect(screen.getByText('Golpe do Outro')).toBeTruthy();
        expect(screen.queryByText('Meu Combo')).toBeNull();
    });

    it('criar um Combo grava na ficha do alvo e salva o alvo', () => {
        montar({ outroCombos: [] });
        fireEvent.click(screen.getByRole('button', { name: /Novo Combo/ }));
        fireEvent.change(screen.getByLabelText('Nome do Combo'), { target: { value: 'Novo' } });
        const nomes = screen.getAllByLabelText('Nome do golpe');
        fireEvent.change(nomes[0], { target: { value: 'A' } });
        fireEvent.change(nomes[1], { target: { value: 'B' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar Combo/ }));
        expect(state.updateFichaAlvo).toHaveBeenCalledWith('Outro', expect.any(Function));
        expect(outro.combos).toHaveLength(1);
        expect(outro.combos[0].nome).toBe('Novo');
        expect(minha.combos).toEqual([comboMeu]);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('excluir um Combo remove só da ficha do alvo', () => {
        montar();
        const lista = screen.getByRole('region', { name: 'Meus Combos' });
        fireEvent.click(within(lista).getByRole('button', { name: /Excluir o Combo Golpe do Outro/ }));
        expect(outro.combos).toEqual([]);
        expect(minha.combos).toEqual([comboMeu]);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('excluir recusado no confirm não grava nem salva', () => {
        montar();
        window.confirm.mockReturnValue(false);
        const lista = screen.getByRole('region', { name: 'Meus Combos' });
        fireEvent.click(within(lista).getByRole('button', { name: /Excluir o Combo Golpe do Outro/ }));
        expect(outro.combos).toHaveLength(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });

    it('importar grava na ficha do alvo', () => {
        montar({ outroCombos: [] });
        const pacote = JSON.stringify(exportarCombos({ combos: [comboMeu], followUps: [] }));
        fireEvent.change(screen.getByLabelText('Texto dos Combos (JSON)'), { target: { value: pacote } });
        fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
        expect(outro.combos).toHaveLength(1);
        expect(outro.combos[0].nome).toBe('Meu Combo');
        expect(minha.combos).toEqual([comboMeu]);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('iniciar um Combo gasta a Ação do alvo, não a minha', () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /Iniciar Golpe do Outro/ }));
        expect(outro.acoes.padrao.atual).toBe(1);
        expect(minha.acoes.padrao.atual).toBe(2);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
    });

    it('alvo sem Combos mostra o vazio', () => {
        montar({ outroCombos: [] });
        expect(screen.getByText(/É opcional/)).toBeTruthy();
    });

    it('Provider mirando o próprio jogador usa minhaFicha e salvarFichaSilencioso', () => {
        montar({ alvo: 'Heroi' });
        expect(screen.getByText('Meu Combo')).toBeTruthy();
        const lista = screen.getByRole('region', { name: 'Meus Combos' });
        fireEvent.click(within(lista).getByRole('button', { name: /Excluir o Combo Meu Combo/ }));
        expect(minha.combos).toEqual([]);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });
});

describe('CombosPanel sem Provider', () => {
    it('continua usando minhaFicha e salvarFichaSilencioso', () => {
        montar({ alvo: null });
        expect(screen.getByText('Meu Combo')).toBeTruthy();
        expect(screen.queryByText('Golpe do Outro')).toBeNull();
        const lista = screen.getByRole('region', { name: 'Meus Combos' });
        fireEvent.click(within(lista).getByRole('button', { name: /Excluir o Combo Meu Combo/ }));
        expect(state.updateFicha).toHaveBeenCalled();
        expect(state.updateFichaAlvo).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
        expect(outro.combos).toHaveLength(1);
    });
});
