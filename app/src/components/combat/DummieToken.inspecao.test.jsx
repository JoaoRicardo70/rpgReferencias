import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DummieToken from './DummieToken';
import useStore from '../../stores/useStore';

// QA - DummieToken: badge de Poder so para o Mestre e clique que tambem inspeciona o token.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(),
    deletarDummie: vi.fn(),
}));

let mock;
function montarStore(overrides = {}) {
    mock = {
        isMestre: false, alvoSelecionado: null, setAlvoSelecionado: vi.fn(),
        entidadeInspecionada: null, setEntidadeInspecionada: vi.fn(), ...overrides,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mock) : mock));
}
const dummie = (extra = {}) => ({ nome: 'Slime', hpAtual: 500000, hpMax: 500000, visibilidadeHp: 'todos', valorDefesa: 10, tipoDefesa: 'evasiva', ...extra });
const poderBadge = () => screen.queryByTitle('Poder Calculado (Disputa de Poder)');
const token = (container) => container.firstChild;

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('DummieToken - badge de Poder', () => {
    it('Mestre ve o badge', () => {
        montarStore({ isMestre: true });
        render(<DummieToken className="token" id="d1" dummie={dummie({ poderCalculado: 1500 })} />);
        expect(poderBadge()).not.toBeNull();
    });
    it('jogador nao ve o badge, mesmo com poderCalculado definido', () => {
        montarStore({ isMestre: false });
        render(<DummieToken className="token" id="d1" dummie={dummie({ poderCalculado: 1500 })} />);
        expect(poderBadge()).toBeNull();
        expect(document.body.textContent).not.toContain('1.500');
    });
    it('Mestre sem poderCalculado nao ve badge', () => {
        montarStore({ isMestre: true });
        render(<DummieToken className="token" id="d1" dummie={dummie()} />);
        expect(poderBadge()).toBeNull();
    });
});

describe('DummieToken - clique inspeciona', () => {
    it('clicar abre a inspecao do token e seleciona como alvo', () => {
        montarStore();
        const { container } = render(<DummieToken className="token" id="d1" dummie={dummie()} />);
        fireEvent.click(token(container));
        expect(mock.setEntidadeInspecionada).toHaveBeenCalledWith({ tipo: 'dummie', id: 'd1' });
        expect(mock.setAlvoSelecionado).toHaveBeenCalledWith('d1');
    });
    it('clicar no token ja inspecionado fecha a inspecao', () => {
        montarStore({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' }, alvoSelecionado: 'd1' });
        const { container } = render(<DummieToken className="token" id="d1" dummie={dummie()} />);
        fireEvent.click(token(container));
        expect(mock.setEntidadeInspecionada).toHaveBeenCalledWith(null);
        expect(mock.setAlvoSelecionado).toHaveBeenCalledWith(null);
    });
    it('inspecionado de outro tipo com mesmo id nao conta (jogador "d1")', () => {
        montarStore({ entidadeInspecionada: { tipo: 'jogador', id: 'd1' } });
        const { container } = render(<DummieToken className="token" id="d1" dummie={dummie()} />);
        expect(token(container).className).not.toContain('token-inspecionado');
        fireEvent.click(token(container));
        expect(mock.setEntidadeInspecionada).toHaveBeenCalledWith({ tipo: 'dummie', id: 'd1' });
    });
    it('classe token-inspecionado so quando este token esta inspecionado, preservando className', () => {
        montarStore({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' } });
        const { container } = render(<DummieToken className="token" id="d1" dummie={dummie()} />);
        expect(token(container).className).toBe('token token-inspecionado');
        cleanup();
        montarStore({ entidadeInspecionada: { tipo: 'dummie', id: 'outro' } });
        const r2 = render(<DummieToken className="token" id="d1" dummie={dummie()} />);
        expect(token(r2.container).className).toBe('token');
    });
    it('sem className e inspecionado: so a classe de inspecao; sem className e nao inspecionado: sem atributo class', () => {
        montarStore({ entidadeInspecionada: { tipo: 'dummie', id: 'd1' } });
        const r1 = render(<DummieToken id="d1" dummie={dummie()} />);
        expect(token(r1.container).className).toBe('token-inspecionado');
        cleanup();
        montarStore();
        const r2 = render(<DummieToken id="d1" dummie={dummie()} />);
        expect(token(r2.container).hasAttribute('class')).toBe(false);
    });
    it('dummie nulo nao renderiza nada e nao quebra', () => {
        montarStore();
        const { container } = render(<DummieToken className="token" id="d1" dummie={null} />);
        expect(container.firstChild).toBeNull();
    });
    it('clicar no botao do Mestre nao dispara a inspecao (stopPropagation dos controles)', () => {
        montarStore({ isMestre: true, alvoSelecionado: 'd1' });
        render(<DummieToken className="token" id="d1" dummie={dummie({ poderCalculado: 10 })} />);
        window.prompt = vi.fn(() => null);
        fireEvent.click(screen.getByTitle(/Definir o Poder Calculado/));
        expect(mock.setEntidadeInspecionada).not.toHaveBeenCalled();
    });
});
