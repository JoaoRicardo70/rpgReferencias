import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import MestreControleTurno from './MestreControleTurno';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — MestreControleTurno.jsx: mostra a ordem de iniciativa publicada pelo
// Mapa (resumoTurnoMapa) e passa o turno chamando a mesma função registrada
// pelo MapaFormProvider (acaoAvancarTurnoMapa), sem trocar de aba. Usa o
// store REAL (via useStore.setState/getState), reaproveitando os selectors
// reais do componente.
// ---------------------------------------------------------------------------

function resetStore() {
    useStore.setState({
        resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 },
        acaoAvancarTurnoMapa: null,
    });
}

describe('MestreControleTurno — Controle de Turnos na aba Mestre', () => {
    beforeEach(() => {
        resetStore();
    });

    afterEach(() => {
        cleanup();
        resetStore();
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Estado vazio (nenhum combate na cena exibida do Mapa)
    // -----------------------------------------------------------------------
    it('mostra a mensagem de estado vazio quando resumoTurnoMapa.ordem está vazia', () => {
        render(<MestreControleTurno />);

        expect(screen.getByText(/Nenhum combate na cena exibida do Mapa/i)).toBeDefined();
        expect(screen.queryByText(/Vez de:/i)).toBeNull();
    });

    it('botão "PASSAR TURNO" fica desabilitado quando não há ordem de iniciativa', () => {
        render(<MestreControleTurno />);

        const botao = screen.getByRole('button', { name: /PASSAR TURNO/i });
        expect(botao.disabled).toBe(true);
    });

    it('botão "PASSAR TURNO" fica desabilitado quando há ordem, mas acaoAvancarTurnoMapa ainda não foi registrada (ex.: Mapa não montado)', () => {
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 10, isDummie: false }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: null,
        });
        render(<MestreControleTurno />);

        const botao = screen.getByRole('button', { name: /PASSAR TURNO/i });
        expect(botao.disabled).toBe(true);
    });

    it('clicar no link do estado vazio chama setAbaAtiva("aba-mapa")', () => {
        const setAbaAtivaSpy = vi.fn();
        useStore.setState({ setAbaAtiva: setAbaAtivaSpy });
        render(<MestreControleTurno />);

        fireEvent.click(screen.getByRole('button', { name: /^Mapa$/i }));

        expect(setAbaAtivaSpy).toHaveBeenCalledWith('aba-mapa');
    });

    // -----------------------------------------------------------------------
    // Happy path: combate em andamento
    // -----------------------------------------------------------------------
    it('mostra "Vez de" (o ator no índice atual) e "Próximo" (o seguinte, com wraparound) com base em resumoTurnoMapa', () => {
        useStore.setState({
            resumoTurnoMapa: {
                ordem: [
                    { id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false },
                    { id: 'b', nome: 'Goblin', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 0,
            },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        const { container } = render(<MestreControleTurno />);

        expect(container.querySelector('.mestre-turno-davez').textContent).toBe('Heroi');
        expect(screen.getByText(/Próximo: Goblin/i)).toBeDefined();
    });

    it('wraparound: quando turnoAtualIndex aponta pro último da ordem, "Próximo" volta pro primeiro', () => {
        useStore.setState({
            resumoTurnoMapa: {
                ordem: [
                    { id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false },
                    { id: 'b', nome: 'Goblin', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 1,
            },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        const { container } = render(<MestreControleTurno />);

        expect(container.querySelector('.mestre-turno-davez').textContent).toBe('Goblin');
        expect(screen.getByText(/Próximo: Heroi/i)).toBeDefined();
    });

    it('renderiza um chip por combatente da ordem, incluindo a iniciativa', () => {
        useStore.setState({
            resumoTurnoMapa: {
                ordem: [
                    { id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false },
                    { id: 'b', nome: 'Goblin', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 0,
            },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        render(<MestreControleTurno />);

        expect(screen.getByText('(20)')).toBeDefined();
        expect(screen.getByText('(10)')).toBeDefined();
    });

    it('clicar em "PASSAR TURNO" chama a função registrada (acaoAvancarTurnoMapa) quando há combate', () => {
        const avancar = vi.fn();
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: avancar,
        });
        render(<MestreControleTurno />);

        fireEvent.click(screen.getByRole('button', { name: /PASSAR TURNO/i }));

        expect(avancar).toHaveBeenCalledTimes(1);
    });

    it('botão "PASSAR TURNO" fica habilitado quando há ordem e a função está registrada', () => {
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        render(<MestreControleTurno />);

        expect(screen.getByRole('button', { name: /PASSAR TURNO/i }).disabled).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Reatividade: componente reflete mudanças subsequentes no store (ex.:
    // MapaFormProvider publicando um novo resumo/ação depois de montado)
    // -----------------------------------------------------------------------
    it('reage a uma atualização posterior do store: estado vazio -> combate registrado depois', () => {
        const { container } = render(<MestreControleTurno />);
        expect(screen.getByText(/Nenhum combate na cena exibida do Mapa/i)).toBeDefined();

        act(() => {
            useStore.setState({
                resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false }], turnoAtualIndex: 0 },
                acaoAvancarTurnoMapa: vi.fn(),
            });
        });

        expect(screen.queryByText(/Nenhum combate na cena exibida do Mapa/i)).toBeNull();
        expect(container.querySelector('.mestre-turno-davez').textContent).toBe('Heroi');
    });

    it('não lança quando um dummie não tem "nome" definido (defensivo contra dados incompletos)', () => {
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'd1', iniciativa: 5, isDummie: true }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: vi.fn(),
        });

        expect(() => render(<MestreControleTurno />)).not.toThrow();
    });
});
