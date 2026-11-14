import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AprovacaoGanhosPermanentes from './AprovacaoGanhosPermanentes';
import MestreControleTurno from './MestreControleTurno';
import useStore from '../../stores/useStore';

const itens = [
    { nome: 'Natsu', pendencias: { temPendencia: true, adaptacao: { pct: 15, turnos: 2, soma: 30 }, derivados: { poderCalculado: 0.5, fatorPoder: 1 } } },
    { nome: 'Verg', pendencias: { temPendencia: true, adaptacao: null, derivados: { poderCalculado: 0.2, fatorPoder: 1 } } },
];

afterEach(() => { cleanup(); useStore.setState({ resumoTurnoMapa: null, acoesOrdemTurnoMapa: null, cenario: {} }); });

describe('AprovacaoGanhosPermanentes', () => {
    it('Liberar vem pré-selecionado e mostra os valores', () => {
        render(<AprovacaoGanhosPermanentes itens={itens} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        const natsu = screen.getByTestId('aprovacao-item-Natsu');
        expect(natsu.textContent).toMatch(/Adaptação: média de \+15% em 2 turnos/);
        expect(natsu.textContent).toMatch(/Derivados: \+50% \(derivados\)/);
        expect(natsu.querySelector('input[value="liberar"]').checked).toBe(true);
        expect(natsu.querySelector('input[value="recusar"]').checked).toBe(false);
    });
    it('confirma com as decisões por personagem, "Recusar todos" e "Liberar todos"', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={itens} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.click(screen.getByTestId('aprovacao-item-Verg').querySelector('input[value="recusar"]'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: 'liberar', Verg: 'recusar' });
        fireEvent.click(screen.getByText('Recusar todos'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: 'recusar', Verg: 'recusar' });
        fireEvent.click(screen.getByText('Liberar todos'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: 'liberar', Verg: 'liberar' });
    });
    it('Cancelar chama aoCancelar e não confirma', () => {
        const aoConfirmar = vi.fn(); const aoCancelar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={itens} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} />);
        fireEvent.click(screen.getByText('Cancelar'));
        expect(aoCancelar).toHaveBeenCalledTimes(1);
        expect(aoConfirmar).not.toHaveBeenCalled();
    });
    it('Esc cancela', () => {
        const aoCancelar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={itens} aoConfirmar={() => {}} aoCancelar={aoCancelar} />);
        fireEvent.keyDown(screen.getByRole('dialog').firstChild, { key: 'Escape' });
        expect(aoCancelar).toHaveBeenCalledTimes(1);
    });
    it('foco inicial no diálogo, Tab circula e o foco volta ao desmontar', () => {
        const origem = document.createElement('button'); document.body.appendChild(origem); origem.focus();
        const { unmount } = render(<AprovacaoGanhosPermanentes itens={itens} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        const caixa = screen.getByRole('dialog').firstChild;
        expect(document.activeElement).toBe(caixa);
        const cancelar = screen.getByText('Cancelar');
        cancelar.focus();
        fireEvent.keyDown(cancelar, { key: 'Tab' });
        expect(caixa.contains(document.activeElement)).toBe(true);
        expect(document.activeElement).not.toBe(cancelar);
        fireEvent.keyDown(caixa, { key: 'Tab', shiftKey: true });
        expect(caixa.contains(document.activeElement)).toBe(true);
        unmount();
        expect(document.activeElement).toBe(origem);
        origem.remove();
    });
    it('sem itens não renderiza', () => {
        render(<AprovacaoGanhosPermanentes itens={[]} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('interruptor na aba Mestre (MestreControleTurno)', () => {
    it('aparece marcado por padrão e chama definirAprovarGanhos ao alternar', () => {
        const definirAprovarGanhos = vi.fn();
        useStore.setState({ resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 }, acoesOrdemTurnoMapa: { definirAprovarGanhos }, cenario: {} });
        render(<MestreControleTurno />);
        const caixa = screen.getByLabelText(/Perguntar antes de liberar ganhos permanentes/);
        expect(caixa.checked).toBe(true);
        fireEvent.click(caixa);
        expect(definirAprovarGanhos).toHaveBeenCalledWith(false);
    });
    it('reflete a opção desligada do cenário', () => {
        useStore.setState({ resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 }, acoesOrdemTurnoMapa: { definirAprovarGanhos: vi.fn() }, cenario: { aprovarGanhosPermanentes: false } });
        render(<MestreControleTurno />);
        expect(screen.getByLabelText(/Perguntar antes de liberar ganhos permanentes/).checked).toBe(false);
    });
    it('sem as ações do Mapa (sem Mestre) o interruptor não existe', () => {
        useStore.setState({ resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 }, acoesOrdemTurnoMapa: null, cenario: {} });
        render(<MestreControleTurno />);
        expect(screen.queryByLabelText(/Perguntar antes de liberar ganhos permanentes/)).toBeNull();
    });
});
