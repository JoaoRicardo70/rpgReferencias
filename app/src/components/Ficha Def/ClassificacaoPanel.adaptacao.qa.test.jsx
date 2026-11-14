import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

// QA — bloco "🧬 Adaptação (por diferença de Poder)" da página Marcadores & Adaptação.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

function montar(ficha) {
    const state = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), isMestre: true };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
    return state;
}
const irParaMarcadores = () => fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acumulativo' } });
const interruptor = () => screen.getByLabelText('Ligar Adaptação');
const estado = () => document.querySelector('.adaptacao-estado');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('ClassificacaoPanel — interruptor da Adaptação', () => {
    it('é um checkbox rotulado e começa DESLIGADO em ficha sem o campo (inclusive sem combate)', () => {
        montar({});
        expect(() => render(<ClassificacaoPanel />)).not.toThrow(); irParaMarcadores();
        expect(interruptor().type).toBe('checkbox'); expect(interruptor().checked).toBe(false);
        expect(estado().textContent).toMatch(/Desligada/);
    });
    it('campos legados do mUnico Crescente são ignorados (continua desligada)', () => {
        montar({ combate: { municoAuto: true, municoTurnos: 4, municoPorTurno: 5 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(interruptor().checked).toBe(false);
        expect(screen.getByText('×1')).toBeTruthy();
    });
    it('só === true conta como ligada', () => {
        montar({ combate: { adaptacaoLigada: 'true' } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(interruptor().checked).toBe(false);
    });
    it('clicar liga: grava booleano em combate.adaptacaoLigada e cria combate se preciso', () => {
        const ficha = {};
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(interruptor());
        expect(ficha.combate.adaptacaoLigada).toBe(true);
    });
    it('clicar com ela ligada desliga: grava false (não apaga a chave) e preserva os acumulados', () => {
        const ficha = { combate: { adaptacaoLigada: true, adaptacaoTurnos: 3 } };
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(interruptor());
        expect(ficha.combate.adaptacaoLigada).toBe(false); expect(ficha.combate.adaptacaoTurnos).toBe(3);
    });
});

describe('ClassificacaoPanel — estado, fator e prévia do permanente', () => {
    it('ligada: informa a fração (padrão 50%) e o reset', () => {
        montar({ combate: { adaptacaoLigada: true } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        const t = estado().textContent;
        expect(t).toMatch(/^Ligada/); expect(t).toContain('50%'); expect(t).toMatch(/fim da luta ou no descanso/);
    });
    it('fração 0 avisa que nada é ganho', () => {
        montar({ combate: { adaptacaoLigada: true, adaptacaoFracao: 0 } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(estado().textContent).toMatch(/fração está em 0%/);
    });
    it('mostra fator ×1,3125, nº de turnos, último turno com o oponente e a média que ficará permanente (15%)', () => {
        montar({ combate: { adaptacaoLigada: true, adaptacaoFator: 1.3125, adaptacaoSoma: 30, adaptacaoTurnos: 2, adaptacaoUltimo: { gain: 25, diferenca: 50, oponenteNome: 'Rival', poderOponente: 150, poderPortador: 100 } } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(screen.getByText('×1,3125')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
        expect(screen.getByText(/Rival/)).toBeTruthy();
        expect(screen.getByText(/Ficará permanente: \+15%/)).toBeTruthy();
    });
    it('turno repetido (portador supera): mostra o ganho mantido e "(mantido: você supera o oponente)"', () => {
        montar({ combate: { adaptacaoLigada: true, adaptacaoFator: 1.5, adaptacaoSoma: 20, adaptacaoTurnos: 2, adaptacaoUltimo: { gain: 10, diferenca: -20, oponenteNome: 'Rival', poderOponente: 100, poderPortador: 125, repetido: true } } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        const t = screen.getByText(/Último turno:/).textContent;
        expect(t).toMatch(/Último turno: \+10%/);
        expect(t).toContain('(mantido: você supera o oponente)');
        expect(t).toContain('não mais forte');
    });
    it('turno normal ou sem ganho NÃO mostra "(mantido...)"', () => {
        montar({ combate: { adaptacaoLigada: true, adaptacaoFator: 1.1, adaptacaoSoma: 10, adaptacaoTurnos: 1, adaptacaoUltimo: { gain: 10, diferenca: 20, oponenteNome: 'Rival', repetido: false } } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(screen.getByText(/Último turno:/).textContent).not.toContain('mantido');
        cleanup();
        montar({ combate: { adaptacaoLigada: true, adaptacaoTurnos: 1, adaptacaoUltimo: { gain: 0, diferenca: -5, oponenteNome: 'Rival', repetido: false } } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        const t = screen.getByText(/Último turno:/).textContent;
        expect(t).toContain('sem ganho');
        expect(t).not.toContain('mantido');
    });
    it('Zerar (sem converter) zera fator e acumuladores e NÃO mexe em ganhosPermanentes', () => {
        const ficha = { ganhosPermanentes: { poderCalculado: 0.1 }, combate: { adaptacaoLigada: true, adaptacaoFator: 1.5, adaptacaoSoma: 30, adaptacaoTurnos: 2 } };
        montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(screen.getByText(/Zerar \(sem converter\)/));
        expect(ficha.combate.adaptacaoFator).toBe(1); expect(ficha.combate.adaptacaoTurnos).toBe(0); expect(ficha.combate.adaptacaoSoma).toBe(0);
        expect(ficha.ganhosPermanentes.poderCalculado).toBe(0.1);
        expect(ficha.combate.adaptacaoLigada).toBe(true);
    });
});
