import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DummieToken from './DummieToken';
import useStore from '../../stores/useStore';
import { salvarDummie } from '../../services/firebase-sync';

// QA - Botao 🛡️ do DummieToken: recalcula a CA pela ficha de origem, ou pede o valor ao Mestre via prompt.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarDummie: vi.fn(), deletarDummie: vi.fn() }));
vi.mock('../../core/engine.js', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularCA: vi.fn((f, tipo) => (tipo === 'evasiva' ? f.__ev : f.__res)) };
});

function montarStore(overrides = {}) {
    const mockState = { isMestre: true, alvoSelecionado: 'd1', setAlvoSelecionado: vi.fn(), personagens: {}, ...overrides };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    useStore.getState = () => mockState;
    return mockState;
}
const dummieBase = (extra = {}) => ({ nome: 'Slime', hpAtual: 500000, hpMax: 500000, visibilidadeHp: 'todos', valorDefesa: 10, tipoDefesa: 'evasiva', ...extra });
const botao = () => screen.getByTitle(/Atualizar a CA/);
const renderizar = (dummie) => render(<DummieToken className="token" id="d1" dummie={dummie} />);

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.prompt = vi.fn(); });
afterEach(() => cleanup());

describe('DummieToken - botao escudo visibilidade', () => {
    it('Mestre com token alvo ve o botao', () => { montarStore(); renderizar(dummieBase()); expect(botao().textContent).toContain('🛡️'); });
    it('jogador nao ve', () => { montarStore({ isMestre: false }); renderizar(dummieBase()); expect(screen.queryByTitle(/Atualizar a CA/)).toBeNull(); });
    it('Mestre sem token selecionado nao ve', () => { montarStore({ alvoSelecionado: null }); renderizar(dummieBase()); expect(screen.queryByTitle(/Atualizar a CA/)).toBeNull(); });
});

describe('DummieToken - escudo com ficha de origem', () => {
    it('salva a defesa recalculada (maior CA) sem usar prompt', () => {
        montarStore({ personagens: { Slime: { __ev: 20, __res: 44 } } });
        renderizar(dummieBase({ fichaOrigem: 'Slime' }));
        fireEvent.click(botao());
        expect(window.prompt).not.toHaveBeenCalled();
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ nome: 'Slime', fichaOrigem: 'Slime', tipoDefesa: 'resistencia', valorDefesa: 44, hpMax: 500000 }));
    });
    it('evasiva maior grava evasiva', () => {
        montarStore({ personagens: { Slime: { __ev: 50, __res: 14 } } });
        renderizar(dummieBase({ fichaOrigem: 'Slime', tipoDefesa: 'resistencia' }));
        fireEvent.click(botao());
        expect(salvarDummie.mock.calls[0][1]).toMatchObject({ tipoDefesa: 'evasiva', valorDefesa: 50 });
    });
    it('prompt sem ficha avisa o motivo correto', () => {
        montarStore({ personagens: {} });
        renderizar(dummieBase({ fichaOrigem: 'Sumiu' }));
        fireEvent.click(botao());
        expect(window.prompt.mock.calls[0][0]).toContain('A ficha de origem não existe mais');
    });
    it('ficha de origem apagada cai no prompt manual', () => {
        montarStore({ personagens: {} });
        window.prompt = vi.fn(() => '33');
        renderizar(dummieBase({ fichaOrigem: 'Sumiu' }));
        fireEvent.click(botao());
        expect(window.prompt).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ valorDefesa: 33 }));
    });
    it('personagens indefinido nao quebra', () => {
        montarStore({ personagens: undefined });
        window.prompt = vi.fn(() => null);
        renderizar(dummieBase({ fichaOrigem: 'Slime' }));
        expect(() => fireEvent.click(botao())).not.toThrow();
        expect(salvarDummie).not.toHaveBeenCalled();
    });
});

describe('DummieToken - escudo sem ficha de origem (prompt)', () => {
    const clicar = (resposta, dummie = dummieBase()) => {
        montarStore();
        window.prompt = vi.fn(() => resposta);
        renderizar(dummie);
        fireEvent.click(botao());
    };
    it('prompt mostra nome e CA atual, preenchido com valorDefesa', () => {
        clicar(null);
        expect(window.prompt.mock.calls[0][0]).toContain('Slime');
        expect(window.prompt.mock.calls[0][0]).toContain('10');
        expect(window.prompt.mock.calls[0][1]).toBe('10');
    });
    it('prompt sem fichaOrigem diz que a entidade nao tem ficha de origem', () => {
        clicar(null);
        expect(window.prompt.mock.calls[0][0]).toContain('Esta entidade não tem ficha de origem');
    });
    it('valor valido salva mantendo o tipoDefesa', () => {
        clicar('27', dummieBase({ tipoDefesa: 'resistencia' }));
        expect(salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ valorDefesa: 27, tipoDefesa: 'resistencia', nome: 'Slime' }));
    });
    it('virgula decimal e arredondada', () => {
        clicar('12,6');
        expect(salvarDummie.mock.calls[0][1].valorDefesa).toBe(13);
    });
    it('cancelar nao salva nem alerta', () => {
        clicar(null);
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });
    it.each(['', 'abc', '-3', '100001', '1e3', '0x10', '1.000,5'])('invalido "%s" alerta e nao salva', (r) => {
        clicar(r);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('clicar no botao nao propaga para o token (nao troca o alvo)', () => {
        const st = montarStore();
        window.prompt = vi.fn(() => null);
        renderizar(dummieBase());
        fireEvent.click(botao());
        expect(st.setAlvoSelecionado).not.toHaveBeenCalled();
    });
});
