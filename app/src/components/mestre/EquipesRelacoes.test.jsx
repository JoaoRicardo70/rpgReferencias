import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import EquipesRelacoes from './EquipesRelacoes';
import MestreControleTurno from './MestreControleTurno';
import useStore from '../../stores/useStore';

const acoes = {
    salvarEquipes: vi.fn(), salvarRelacoes: vi.fn(), definirEquipeDe: vi.fn(), alternarLadoOculto: vi.fn(),
    iniciarCombate: vi.fn(), encerrarCombate: vi.fn(),
};

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: {}, cenario: {}, personagens: { Kai: { combate: { equipe: 'aliados', ladoOculto: true } } },
        dummies: { d1: { nome: 'Slime', cenaId: 'default' } },
        resumoTurnoMapa: { ordem: [], foraDaOrdem: [{ id: 'Kai', nome: 'Kai', isDummie: false }, { id: 'd1', nome: 'Slime', isDummie: true }], turnoAtualIndex: 0, combateAtivo: false, rodadaAtual: 0 },
        acoesOrdemTurnoMapa: acoes, acaoAvancarTurnoMapa: null, ...extra,
    });
}
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Equipes e Relações/ }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, acoesOrdemTurnoMapa: null, resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 } }); });

describe('EquipesRelacoes', () => {
    it('não aparece para quem não é Mestre', () => {
        preparar({ isMestre: false });
        const { container } = render(<EquipesRelacoes />);
        expect(container.innerHTML).toBe('');
    });

    it('é recolhível e mostra as 3 equipes padrão, sem botão de remover nelas', () => {
        preparar();
        render(<EquipesRelacoes />);
        expect(screen.queryByLabelText('Nome da equipe aliados')).toBeNull();
        abrir();
        expect(screen.getByLabelText('Nome da equipe aliados').value).toBe('Aliados');
        expect(screen.getByLabelText('Nome da equipe inimigos').value).toBe('Inimigos');
        expect(screen.getByLabelText('Nome da equipe neutros').value).toBe('Neutros');
        expect(screen.queryByRole('button', { name: /Remover equipe/ })).toBeNull();
    });

    it('nome vazio no blur NÃO apaga a equipe: volta ao nome anterior e não grava', () => {
        preparar();
        render(<EquipesRelacoes />);
        abrir();
        const campo = screen.getByLabelText('Nome da equipe aliados');
        fireEvent.change(campo, { target: { value: '   ' } });
        fireEvent.blur(campo);
        expect(acoes.salvarEquipes).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Nome da equipe aliados').value).toBe('Aliados');
    });

    it('adicionar equipe grava a lista com a nova equipe', () => {
        preparar();
        render(<EquipesRelacoes />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /Adicionar equipe/ }));
        expect(acoes.salvarEquipes).toHaveBeenCalledTimes(1);
        const lista = acoes.salvarEquipes.mock.calls[0][0];
        expect(lista).toHaveLength(4);
        expect(lista[3].nome).toBe('Nova equipe');
    });

    it('editar o nome só grava ao sair do campo', () => {
        preparar();
        render(<EquipesRelacoes />);
        abrir();
        const campo = screen.getByLabelText('Nome da equipe aliados');
        fireEvent.change(campo, { target: { value: 'Heróis' } });
        expect(acoes.salvarEquipes).not.toHaveBeenCalled();
        fireEvent.blur(campo);
        expect(acoes.salvarEquipes).toHaveBeenCalledTimes(1);
        expect(acoes.salvarEquipes.mock.calls[0][0][0].nome).toBe('Heróis');
    });

    it('remover equipe personalizada pede confirmação', () => {
        const equipes = [
            { id: 'aliados', nome: 'Aliados', cor: '#00ff88', icone: '🛡️' },
            { id: 'inimigos', nome: 'Inimigos', cor: '#ff2d55', icone: '👹' },
            { id: 'neutros', nome: 'Neutros', cor: '#9aa0a6', icone: '⚪' },
            { id: 'culto', nome: 'Culto', cor: '#aa00ff', icone: '🔮' },
        ];
        preparar({ cenario: { equipes } });
        render(<EquipesRelacoes />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'Remover equipe Culto' }));
        expect(acoes.salvarEquipes).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
        expect(acoes.salvarEquipes).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Remover equipe Culto' }));
        fireEvent.click(screen.getByRole('button', { name: /Sim, remover/ }));
        expect(acoes.salvarEquipes.mock.calls[0][0].map(e => e.id)).toEqual(['aliados', 'inimigos', 'neutros']);
    });

    it('matriz de relações: mostra o padrão e grava a mudança', () => {
        preparar();
        render(<EquipesRelacoes />);
        abrir();
        const sel = screen.getByLabelText('Relação entre Aliados e Inimigos');
        expect(sel.value).toBe('hostil');
        fireEvent.change(sel, { target: { value: 'neutra' } });
        expect(acoes.salvarRelacoes).toHaveBeenCalledWith({ 'aliados|inimigos': 'neutra' });
    });

    it('Restaurar padrão pede confirmação e chama salvarEquipes([])', () => {
        preparar();
        render(<EquipesRelacoes />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /Restaurar padrão/ }));
        expect(acoes.salvarEquipes).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Sim, restaurar/ }));
        expect(acoes.salvarEquipes).toHaveBeenCalledWith([]);
    });

    it('lista quem está em qual equipe: troca de equipe e revelar lado', () => {
        preparar();
        render(<EquipesRelacoes />);
        abrir();
        fireEvent.change(screen.getByLabelText('Equipe de Slime'), { target: { value: 'neutros' } });
        expect(acoes.definirEquipeDe).toHaveBeenCalledWith({ id: 'd1', nome: 'Slime', isDummie: true }, 'neutros');
        fireEvent.click(screen.getByRole('button', { name: /Oculto — revelar/ }));
        expect(acoes.alternarLadoOculto).toHaveBeenCalledWith({ id: 'Kai', nome: 'Kai', isDummie: false });
    });

    it('sem as ações do Mapa, os controles ficam desabilitados com aviso', () => {
        preparar({ acoesOrdemTurnoMapa: null });
        render(<EquipesRelacoes />);
        abrir();
        expect(screen.getByRole('note').textContent).toMatch(/Abra o Mapa/);
        expect(screen.getByRole('button', { name: /Adicionar equipe/ }).disabled).toBe(true);
    });
});

describe('MestreControleTurno — estado do combate', () => {
    it('Preparação: mostra Iniciar combate e desabilita Passar turno com dica', () => {
        preparar({ resumoTurnoMapa: { ordem: [{ id: 'Kai', nome: 'Kai', iniciativa: 10, isDummie: false }], turnoAtualIndex: 0, combateAtivo: false, rodadaAtual: 0, combateSemInicio: true }, acaoAvancarTurnoMapa: vi.fn() });
        render(<MestreControleTurno />);
        expect(screen.getByRole('status').textContent).toBe('🕊️ Preparação');
        const passar = screen.getByRole('button', { name: /PASSAR TURNO/ });
        expect(passar.disabled).toBe(true);
        expect(passar.title).toBe('Inicie o combate primeiro');
        expect(screen.getByText(/combate não foi iniciado/)).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: /Iniciar combate/ }));
        expect(acoes.iniciarCombate).toHaveBeenCalled();
    });

    it('Combate ativo: mostra a rodada e Encerrar combate; Passar turno habilitado', () => {
        preparar({ resumoTurnoMapa: { ordem: [{ id: 'Kai', nome: 'Kai', iniciativa: 10, isDummie: false }], turnoAtualIndex: 0, combateAtivo: true, rodadaAtual: 2, combateSemInicio: false }, acaoAvancarTurnoMapa: vi.fn() });
        render(<MestreControleTurno />);
        expect(screen.getByRole('status').textContent).toBe('⚔️ Combate · Rodada 2');
        expect(screen.getByRole('button', { name: /PASSAR TURNO/ }).disabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: /Encerrar combate/ }));
        expect(acoes.encerrarCombate).toHaveBeenCalled();
    });
});
