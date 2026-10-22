import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CombateFichaPanel, { CAPITULOS_COMBATE } from './CombateFichaPanel';
import { FichaAlvoProvider } from './FichaAlvoContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - CombateFichaPanel (pagina 8 da Ficha Definitiva): 4 capitulos (Testes/Acerto/Ataque/Defesa) + Feed ao vivo.
// Store real (Zustand); paineis filhos e Feed mockados.
// ---------------------------------------------------------------------------

vi.mock('../combate/TestesPanel', () => ({ default: () => <div data-testid="painel-testes">TESTES</div> }));
vi.mock('../combate/AcertoPanel', () => ({ default: () => <div data-testid="painel-acerto">ACERTO</div> }));
vi.mock('../combate/AtaquePanel', () => ({ default: () => <div data-testid="painel-ataque">ATAQUE</div> }));
vi.mock('../combate/DefesaPanel', () => ({ default: () => <div data-testid="painel-defesa">DEFESA</div> }));
vi.mock('../feed/FeedCombate', () => ({ default: () => <div data-testid="feed-mock">FEED</div> }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    enviarParaFeed: vi.fn(),
}));

const IDS = ['testes', 'acerto', 'ataque', 'defesa'];
const painelVisivel = () => IDS.filter(id => screen.queryByTestId(`painel-${id}`));
const aba = (nome) => screen.getByRole('tab', { name: new RegExp(nome) });

beforeEach(() => {
    useStore.setState({
        minhaFicha: { vida: { base: 1 } }, meuNome: 'Heroi', personagens: {},
        fichaPaginaPedida: null, combateNaTela: false, abaAtiva: 'aba-Ficha Def',
    });
});
afterEach(() => cleanup());

describe('CombateFichaPanel - estrutura', () => {
    it('exporta 4 capitulos na ordem Testes, Acerto, Ataque, Defesa', () => {
        expect(CAPITULOS_COMBATE.map(c => c.id)).toEqual(IDS);
    });

    it('renderiza as 4 abas de capitulo, o Feed ao vivo e SO o painel do capitulo aberto', () => {
        render(<CombateFichaPanel />);
        expect(screen.getAllByRole('tab')).toHaveLength(4);
        ['Testes', 'Acerto', 'Ataque', 'Defesa'].forEach(n => expect(aba(n)).toBeDefined());
        expect(screen.getByText(/Feed ao vivo/)).toBeDefined();
        expect(screen.getByTestId('feed-mock')).toBeDefined();
        expect(painelVisivel()).toEqual(['acerto']);
    });

    it('abre em "acerto" por padrao, com aria-selected correto', () => {
        render(<CombateFichaPanel />);
        expect(aba('Acerto').getAttribute('aria-selected')).toBe('true');
        expect(aba('Testes').getAttribute('aria-selected')).toBe('false');
        expect(aba('Acerto').className).toContain('ativo');
    });

    it('clicar em cada capitulo mostra o painel certo (e so ele); o Feed continua na tela', () => {
        render(<CombateFichaPanel />);
        IDS.forEach(id => {
            fireEvent.click(screen.getAllByRole('tab').find(t => t.textContent.toLowerCase().includes(id)));
            expect(painelVisivel()).toEqual([id]);
            expect(screen.getByTestId('feed-mock')).toBeDefined();
        });
    });
});

describe('CombateFichaPanel - FOLHEAR', () => {
    const anterior = () => screen.getByText(/⮜ FOLHEAR/);
    const proximo = () => screen.getByText(/FOLHEAR ⮞/);

    it('FOLHEAR ⮞ avanca na ordem e para no ultimo (desabilitado)', () => {
        render(<CombateFichaPanel />);
        fireEvent.click(proximo());
        expect(painelVisivel()).toEqual(['ataque']);
        fireEvent.click(proximo());
        expect(painelVisivel()).toEqual(['defesa']);
        expect(proximo().disabled).toBe(true);
        fireEvent.click(proximo());
        expect(painelVisivel()).toEqual(['defesa']);
    });

    it('⮜ FOLHEAR volta e fica desabilitado no primeiro (Testes)', () => {
        render(<CombateFichaPanel />);
        fireEvent.click(anterior());
        expect(painelVisivel()).toEqual(['testes']);
        expect(anterior().disabled).toBe(true);
        expect(proximo().disabled).toBe(false);
        fireEvent.click(anterior());
        expect(painelVisivel()).toEqual(['testes']);
    });

    it('o titulo acompanha o capitulo', () => {
        render(<CombateFichaPanel />);
        fireEvent.click(proximo());
        expect(document.querySelector('.combate-ficha-titulo').textContent).toContain('Ataque');
    });
});

describe('CombateFichaPanel - pedido de capitulo (fichaPaginaPedida)', () => {
    it.each(IDS)('abre direto no capitulo pedido (%s) e limpa o pedido', (cap) => {
        useStore.setState({ fichaPaginaPedida: { pagina: 8, capitulo: cap } });
        render(<CombateFichaPanel />);
        expect(painelVisivel()).toEqual([cap]);
        expect(useStore.getState().fichaPaginaPedida).toBeNull();
    });

    it('capitulo desconhecido cai no padrao "acerto" e ainda limpa o pedido', () => {
        useStore.setState({ fichaPaginaPedida: { pagina: 8, capitulo: 'xyz' } });
        render(<CombateFichaPanel />);
        expect(painelVisivel()).toEqual(['acerto']);
        expect(useStore.getState().fichaPaginaPedida).toBeNull();
    });

    it('pedido sem capitulo (null) mantem "acerto" e limpa o pedido', () => {
        useStore.setState({ fichaPaginaPedida: { pagina: 8, capitulo: null } });
        render(<CombateFichaPanel />);
        expect(painelVisivel()).toEqual(['acerto']);
        expect(useStore.getState().fichaPaginaPedida).toBeNull();
    });

    it('um pedido que chega com o painel ja aberto troca o capitulo', () => {
        render(<CombateFichaPanel />);
        expect(painelVisivel()).toEqual(['acerto']);
        act(() => { useStore.getState().abrirFichaNaPagina(8, 'defesa'); });
        expect(painelVisivel()).toEqual(['defesa']);
        expect(useStore.getState().fichaPaginaPedida).toBeNull();
    });
});

describe('CombateFichaPanel - flag combateNaTela', () => {
    it('liga ao montar e desliga ao desmontar', () => {
        expect(useStore.getState().combateNaTela).toBe(false);
        const { unmount } = render(<CombateFichaPanel />);
        expect(useStore.getState().combateNaTela).toBe(true);
        unmount();
        expect(useStore.getState().combateNaTela).toBe(false);
    });

    it('enquanto montado, setAbaAtiva("aba-log") e ignorado (o Feed ja esta na tela); depois de desmontar, funciona', () => {
        const { unmount } = render(<CombateFichaPanel />);
        act(() => { useStore.getState().setAbaAtiva('aba-log'); });
        expect(useStore.getState().abaAtiva).toBe('aba-Ficha Def');
        unmount();
        useStore.getState().setAbaAtiva('aba-log');
        expect(useStore.getState().abaAtiva).toBe('aba-log');
    });

    it('a flag tambem liga/desliga quando a ficha ainda nao carregou', () => {
        const { unmount } = render(<FichaAlvoProvider nome="Fantasma"><CombateFichaPanel /></FichaAlvoProvider>);
        expect(useStore.getState().combateNaTela).toBe(true);
        unmount();
        expect(useStore.getState().combateNaTela).toBe(false);
    });
});

describe('CombateFichaPanel - FichaAlvoProvider de personagem ainda nao carregado', () => {
    it('mostra "Abrindo a ficha..." sem renderizar capitulos nem paineis', () => {
        render(<FichaAlvoProvider nome="Fantasma"><CombateFichaPanel /></FichaAlvoProvider>);
        expect(screen.getByText('Abrindo a ficha...')).toBeDefined();
        expect(painelVisivel()).toEqual([]);
        expect(screen.queryAllByRole('tab')).toHaveLength(0);
        expect(screen.queryByTestId('feed-mock')).toBeNull();
    });

    it('quando o personagem chega, o painel aparece', () => {
        render(<FichaAlvoProvider nome="Outro"><CombateFichaPanel /></FichaAlvoProvider>);
        expect(screen.getByText('Abrindo a ficha...')).toBeDefined();
        act(() => { useStore.setState({ personagens: { Outro: { vida: { base: 1 } } } }); });
        expect(screen.queryByText('Abrindo a ficha...')).toBeNull();
        expect(painelVisivel()).toEqual(['acerto']);
    });

    it('com o personagem ja carregado renderiza normalmente', () => {
        useStore.setState({ personagens: { Outro: { vida: { base: 1 } } } });
        render(<FichaAlvoProvider nome="Outro"><CombateFichaPanel /></FichaAlvoProvider>);
        expect(screen.queryByText('Abrindo a ficha...')).toBeNull();
        expect(screen.getAllByRole('tab')).toHaveLength(4);
    });

    it('um pedido pendente e consumido mesmo enquanto a ficha nao carregou', () => {
        useStore.setState({ fichaPaginaPedida: { pagina: 8, capitulo: 'defesa' } });
        render(<FichaAlvoProvider nome="Fantasma"><CombateFichaPanel /></FichaAlvoProvider>);
        expect(useStore.getState().fichaPaginaPedida).toBeNull();
    });
});
