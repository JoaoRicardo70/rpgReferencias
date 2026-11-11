import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

// QA — interruptor "Crescer sozinho a cada turno" e linha de estado do mUnico Crescente.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

function montar(ficha) {
    const state = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), isMestre: true };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
    return state;
}
const irParaMarcadores = () => fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acumulativo' } });
const interruptor = () => screen.getByLabelText('Crescer sozinho a cada turno');
const estado = () => document.querySelector('.municoauto-estado');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('ClassificacaoPanel — interruptor do mUnico automático', () => {
    it('é um checkbox rotulado e começa DESLIGADO em ficha sem o campo', () => {
        montar({ combate: { municoTurnos: 0, municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(interruptor().type).toBe('checkbox'); expect(interruptor().checked).toBe(false);
    });
    it('ficha sem combate nenhum também renderiza desligado, sem erro', () => {
        montar({});
        expect(() => render(<ClassificacaoPanel />)).not.toThrow(); irParaMarcadores();
        expect(interruptor().checked).toBe(false);
        expect(estado().textContent).toMatch(/Manual/);
    });
    it('ficha com municoAuto true aparece ligada', () => {
        montar({ combate: { municoAuto: true, municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(interruptor().checked).toBe(true);
    });
    it('valores truthy não-booleanos ("true", 1) NÃO contam como ligado (só === true)', () => {
        montar({ combate: { municoAuto: 'true', municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(interruptor().checked).toBe(false);
        cleanup();
        montar({ combate: { municoAuto: 1, municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(interruptor().checked).toBe(false);
    });
    it('clicar liga: grava combate.municoAuto = true (booleano) e chama o salvamento', () => {
        const ficha = { combate: { municoPorTurno: 5 } };
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(interruptor());
        expect(ficha.combate.municoAuto).toBe(true);
    });
    it('clicar de novo desliga: grava false (não apaga a chave) e preserva municoTurnos', () => {
        const ficha = { combate: { municoAuto: true, municoTurnos: 6, municoPorTurno: 5 } };
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(interruptor());
        expect(ficha.combate.municoAuto).toBe(false); expect(ficha.combate.municoTurnos).toBe(6);
    });
    it('cria combate se a ficha não tinha', () => {
        const ficha = {};
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(interruptor());
        expect(ficha.combate.municoAuto).toBe(true);
    });
    it('o botão manual +/- continua funcionando com o automático ligado', () => {
        const ficha = { combate: { municoAuto: true, municoTurnos: 2, municoPorTurno: 5 } };
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(screen.getByText('Turnos de Combate').closest('div').querySelector('button:last-of-type'));
        expect(ficha.combate.municoTurnos).toBe(3);
        fireEvent.click(screen.getByText(/Zerar mUnico/i));
        expect(ficha.combate.municoTurnos).toBe(0);
    });
});

describe('ClassificacaoPanel — texto de estado', () => {
    it('manual: "Manual: os turnos só mudam quando você usa + e -."', () => {
        montar({ combate: { municoAuto: false, municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(estado().textContent).toBe('Manual: os turnos só mudam quando você usa + e -.');
        expect(estado().getAttribute('role')).toBe('status');
    });
    it('automático: informa a taxa, linear, início do turno e o reset (fim da luta/descanso)', () => {
        montar({ combate: { municoAuto: true, municoPorTurno: 7 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        const t = estado().textContent;
        expect(t).toMatch(/^Automático/); expect(t).toContain('+7%'); expect(t).toMatch(/linear/); expect(t).toMatch(/início do seu turno/); expect(t).toMatch(/fim da luta ou no descanso/);
    });
    it('taxa padrão (ausente) usa 5% no texto do automático', () => {
        montar({ combate: { municoAuto: true } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(estado().textContent).toContain('+5%');
    });
    it('automático com taxa 0 avisa que nada cresce', () => {
        montar({ combate: { municoAuto: true, municoPorTurno: 0 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(estado().textContent).toMatch(/taxa por turno está em 0: nada cresce/);
    });
    it('o texto muda ao alternar o interruptor (re-render)', () => {
        const ficha = { combate: { municoAuto: false, municoPorTurno: 5 } };
        montar(ficha);
        const { rerender } = render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(interruptor());
        rerender(<ClassificacaoPanel />);
        expect(estado().textContent).toMatch(/^Automático/);
    });
    it('fórmula exibida preservada: 1 + turnos x taxa/100 (10 x 5% = x1.50)', () => {
        montar({ combate: { municoAuto: true, municoTurnos: 10, municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(screen.getByText('x1.50')).toBeTruthy();
    });
});
