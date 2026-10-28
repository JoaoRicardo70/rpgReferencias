import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';

// Chega no menu da regiao "Noxus" pelo caminho real: sistema solar -> Terra 0 -> globo -> Runeterra -> Noxus,
// avancando os setTimeout de iniciarViagem com fake timers.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(),
}));

let mockCtx = null;
vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => mockCtx,
    urlSeguraParaCss: (u) => (u ? `url("${u}")` : ''),
}));

function mockUseStore(state) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
}

const LISTA = {
    a: { nome: 'Arena', reino: 'Noxus' },
    b: { nome: '[Noxus] Barracas' },
    c: { nome: 'Cofre Secreto', reino: 'Noxus', restrita: true, acessoNomes: ['Outro'] },
    d: { nome: 'Dividida', reino: 'Noxus', restrita: true, acessoNomes: ['Ana'] },
    e: { nome: 'Em Demacia', reino: 'Demacia' },
};

function montar({ isMestre, meuNome = 'Ana', lista = LISTA, ativa = 'default' }) {
    mockUseStore({ cenario: { ativa, lista }, meuNome, mesaId: 'mesa1' });
    mockCtx = {
        isMestre, souCriador: isMestre, jogadores: { Ana: {}, Bia: {} },
        setCenaVisualizadaId: vi.fn(), definirAcessoCena: vi.fn(),
    };
    return render(<MapaMundi><div /></MapaMundi>);
}

function avancar(ms = 1600) { act(() => { vi.advanceTimersByTime(ms); }); }

function irAteMenuNoxus(container) {
    fireEvent.click(container.querySelector('.astro-terra0'));
    avancar();
    fireEvent.click(screen.getByText(/ENTRAR EM RUNETERRA/));
    avancar();
    fireEvent.click(screen.getAllByText('Noxus')[0]);
    avancar();
}

describe('MapaMundi - Cenas por regiao (menu da regiao)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        localStorage.clear();
        salvarCenarioCompleto.mockResolvedValue(true);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('jogador comum ve so Cenas da regiao liberadas pra ele e nao ve CRIAR NOVO MAPA', () => {
        const { container } = montar({ isMestre: false });
        irAteMenuNoxus(container);
        expect(screen.getByText('Arena', { exact: false })).toBeDefined();
        expect(screen.getByText('Barracas', { exact: false })).toBeDefined();
        expect(screen.getByText('Dividida', { exact: false })).toBeDefined();
        expect(screen.queryByText('Cofre Secreto', { exact: false })).toBeNull();
        expect(screen.queryByText('Em Demacia', { exact: false })).toBeNull();
        expect(screen.queryByText(/CRIAR NOVO MAPA/)).toBeNull();
        expect(container.querySelector('.cena-acesso')).toBeNull();
    });

    it('jogador sem nenhuma Cena liberada ve a mensagem de vazio', () => {
        const { container } = montar({ isMestre: false, meuNome: 'Zeca', lista: { c: LISTA.c } });
        irAteMenuNoxus(container);
        expect(screen.getByText('Nenhuma Cena liberada para você nesta região.')).toBeDefined();
    });

    it('jogador clicando numa Cena chama setCenaVisualizadaId(id) e nao grava no Firebase', () => {
        const { container } = montar({ isMestre: false });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByText('Arena', { exact: false }));
        expect(mockCtx.setCenaVisualizadaId).toHaveBeenCalledWith('a');
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Mestre ve todas as Cenas da regiao (restritas com cadeado), botao CRIAR e controles de acesso', () => {
        const { container } = montar({ isMestre: true, meuNome: 'GM' });
        irAteMenuNoxus(container);
        expect(screen.getByText('Cofre Secreto', { exact: false }).textContent).toContain('🔒');
        expect(screen.queryByText('Em Demacia', { exact: false })).toBeNull();
        expect(screen.getByText(/CRIAR NOVO MAPA/)).toBeDefined();
        expect(container.querySelectorAll('.cena-acesso').length).toBe(4);
    });

    it('Mestre clicando numa Cena chama setCenaVisualizadaId(id)', () => {
        const { container } = montar({ isMestre: true, meuNome: 'GM' });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByText('Cofre Secreto', { exact: false }));
        expect(mockCtx.setCenaVisualizadaId).toHaveBeenCalledWith('c');
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Mestre cria Cena: salvarCenarioCompleto recebe lista com a nova Cena (reino Noxus) sem alterar ativa', () => {
        const { container } = montar({ isMestre: true, meuNome: 'GM', ativa: 'a' });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByText(/CRIAR NOVO MAPA/));
        fireEvent.change(screen.getByPlaceholderText('Nome do mapa...'), { target: { value: '  Praça  ' } });
        fireEvent.click(screen.getByText(/CONFIRMAR/));
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.ativa).toBe('a');
        const novas = Object.entries(salvo.lista).filter(([id]) => !(id in LISTA));
        expect(novas).toHaveLength(1);
        expect(novas[0][0]).toMatch(/^cena_\d+$/);
        expect(novas[0][1]).toMatchObject({ nome: 'Praça', reino: 'Noxus', criadoPor: 'GM' });
        expect(Object.keys(salvo.lista)).toEqual(expect.arrayContaining(Object.keys(LISTA)));
    });

    it('Mestre: nome vazio nao cria Cena', () => {
        const { container } = montar({ isMestre: true, meuNome: 'GM' });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByText(/CRIAR NOVO MAPA/));
        fireEvent.change(screen.getByPlaceholderText('Nome do mapa...'), { target: { value: '   ' } });
        fireEvent.keyDown(screen.getByPlaceholderText('Nome do mapa...'), { key: 'Enter' });
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Mestre: falha ao salvar (resolve false) mostra alerta', async () => {
        salvarCenarioCompleto.mockResolvedValue(false);
        const { container } = montar({ isMestre: true, meuNome: 'GM' });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByText(/CRIAR NOVO MAPA/));
        fireEvent.change(screen.getByPlaceholderText('Nome do mapa...'), { target: { value: 'X' } });
        fireEvent.keyDown(screen.getByPlaceholderText('Nome do mapa...'), { key: 'Enter' });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Não foi possível salvar esta Cena'));
    });

    it('Mestre: CenaAcesso chama definirAcessoCena(id, nomes)', () => {
        const { container } = montar({ isMestre: true, meuNome: 'GM', lista: { a: LISTA.a } });
        irAteMenuNoxus(container);
        fireEvent.click(container.querySelector('.cena-acesso-botao'));
        fireEvent.click(screen.getByLabelText('Todos os jogadores'));
        expect(mockCtx.definirAcessoCena).toHaveBeenCalledWith('a', []);
    });

    it('Mestre: migra Atlas antigo do localStorage para o Firebase ao abrir a regiao', async () => {
        localStorage.setItem('rpg_atlas_mundi', JSON.stringify({ Noxus: [{ id: 'mapa_1', nome: 'Velho', img: '' }] }));
        const { container } = montar({ isMestre: true, meuNome: 'GM', lista: {} });
        irAteMenuNoxus(container);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        expect(salvarCenarioCompleto.mock.calls[0][0].lista.mapa_1).toMatchObject({ nome: 'Velho', reino: 'Noxus' });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(localStorage.getItem('rpg_atlas_migrado_mesa1')).toBe('1');
    });

    it('jogador comum NAO dispara a migracao do Atlas antigo', () => {
        localStorage.setItem('rpg_atlas_mundi', JSON.stringify({ Noxus: [{ id: 'mapa_1', nome: 'Velho' }] }));
        const { container } = montar({ isMestre: false, lista: {} });
        irAteMenuNoxus(container);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});
