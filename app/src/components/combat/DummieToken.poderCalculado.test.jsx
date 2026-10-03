import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DummieToken from './DummieToken';
import useStore from '../../stores/useStore';
import { salvarDummie } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - Botao ⚡ do DummieToken: edita o Poder Calculado via window.prompt, com parse pt-BR.
// "1.000" = 1000, "1.000,5" = 1000.5, "1.5" = 1.5, vazio remove o campo, cancelar nao faz nada.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(),
    deletarDummie: vi.fn(),
}));

function montarStore(overrides = {}) {
    const mockState = { isMestre: true, alvoSelecionado: 'd1', setAlvoSelecionado: vi.fn(), ...overrides };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

const dummieBase = (extra = {}) => ({ nome: 'Slime', hpAtual: 500000, hpMax: 500000, visibilidadeHp: 'todos', valorDefesa: 10, tipoDefesa: 'evasiva', ...extra });

function editarCom(resposta, dummie = dummieBase()) {
    montarStore();
    window.prompt = vi.fn(() => resposta);
    render(<DummieToken className="token" id="d1" dummie={dummie} />);
    fireEvent.click(screen.getByTitle(/Definir o Poder Calculado/));
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('DummieToken - botao de Poder Calculado', () => {
    it('Mestre com o token selecionado ve o botao ⚡', () => {
        montarStore();
        render(<DummieToken className="token" id="d1" dummie={dummieBase()} />);
        expect(screen.getByTitle(/Definir o Poder Calculado/)).toBeDefined();
    });
    it('jogador (nao Mestre) nao ve o botao', () => {
        montarStore({ isMestre: false });
        render(<DummieToken className="token" id="d1" dummie={dummieBase()} />);
        expect(screen.queryByTitle(/Definir o Poder Calculado/)).toBeNull();
    });
    it('Mestre com o token NAO selecionado nao ve o botao', () => {
        montarStore({ alvoSelecionado: null });
        render(<DummieToken className="token" id="d1" dummie={dummieBase()} />);
        expect(screen.queryByTitle(/Definir o Poder Calculado/)).toBeNull();
    });
    it('mostra o selo de Poder no token quando definido', () => {
        montarStore();
        render(<DummieToken className="token" id="d1" dummie={dummieBase({ poderCalculado: 1500 })} />);
        expect(screen.getByTitle('Poder Calculado (Disputa de Poder)').textContent).toContain((1500).toLocaleString('pt-BR'));
    });
    it('nao mostra o selo sem Poder definido', () => {
        montarStore();
        render(<DummieToken className="token" id="d1" dummie={dummieBase()} />);
        expect(screen.queryByTitle('Poder Calculado (Disputa de Poder)')).toBeNull();
    });
    it('nao mostra o selo quando o HP esta oculto para quem nao e Mestre', () => {
        montarStore({ isMestre: false });
        render(<DummieToken className="token" id="d1" dummie={dummieBase({ poderCalculado: 1500, visibilidadeHp: 'mestre' })} />);
        expect(screen.queryByTitle('Poder Calculado (Disputa de Poder)')).toBeNull();
    });
    it('selo com Poder 0 e exibido (0 e valido)', () => {
        montarStore();
        render(<DummieToken className="token" id="d1" dummie={dummieBase({ poderCalculado: 0 })} />);
        expect(screen.getByTitle('Poder Calculado (Disputa de Poder)').textContent).toContain('0');
    });
});

describe('DummieToken - parse pt-BR do Poder', () => {
    it.each([
        ['1.000', 1000],
        ['1.000.000', 1000000],
        ['1.000,5', 1000.5],
        ['1.000.000,25', 1000000.25],
        ['1,5', 1.5],
        ['1.5', 1.5],
        ['0,75', 0.75],
        ['1234', 1234],
        ['1234.56', 1234.56],
        ['  42  ', 42],
        ['0', 0],
    ])('"%s" grava poderCalculado %s', (entrada, esperado) => {
        editarCom(entrada);
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ nome: 'Slime', poderCalculado: esperado }));
    });

    it('"1.0000" (ponto nao e milhar de 3 digitos) e decimal: 1', () => {
        editarCom('1.0000');
        expect(salvarDummie.mock.calls[0][1].poderCalculado).toBe(1);
    });
    it('"12.34.56" (pontos fora do padrao de milhar) e invalido: alerta e nao salva', () => {
        editarCom('12.34.56');
        expect(window.alert).toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('vazio remove o campo poderCalculado preservando o resto', () => {
        editarCom('', dummieBase({ poderCalculado: 900 }));
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const salvo = salvarDummie.mock.calls[0][1];
        expect('poderCalculado' in salvo).toBe(false);
        expect(salvo.nome).toBe('Slime');
        expect(salvo.hpMax).toBe(500000);
    });
    it('so espacos tambem remove o campo', () => {
        editarCom('   ', dummieBase({ poderCalculado: 900 }));
        expect('poderCalculado' in salvarDummie.mock.calls[0][1]).toBe(false);
    });
    it('cancelar o prompt (null) nao salva nada', () => {
        editarCom(null);
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });
    it.each(['abc', '-5', '-1.000', '1e999', 'Infinity', '1,2,3'])('entrada invalida "%s" alerta e nao salva', (entrada) => {
        editarCom(entrada);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('o prompt vem preenchido com o Poder atual e vazio quando nao ha', () => {
        editarCom(null, dummieBase({ poderCalculado: 750 }));
        expect(window.prompt.mock.calls[0][1]).toBe('750');
        cleanup();
        editarCom(null, dummieBase());
        expect(window.prompt.mock.calls[0][1]).toBe('');
    });
    it('o nome da entidade aparece na mensagem do prompt', () => {
        editarCom(null);
        expect(window.prompt.mock.calls[0][0]).toContain('Slime');
    });
});
