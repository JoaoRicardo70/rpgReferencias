import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaMestreGavetaTokens } from './MapaFerramentasMestre';
import { useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, salvarCenarioCompleto, salvarCamposPersonagem } from '../../services/firebase-sync';
import { criarPersonagemNaMesa } from '../../services/midia-sync';
import { FAMILIA_SEM_CLA } from '../../core/gavetaNpc';

// ---------------------------------------------------------------------------
// QA - Gaveta de Tokens (MapaMestreGavetaTokens + GavetaNpcLinha memoizada).
// useMapaForm e mockado para controlar isMestre/isModoRP/mestreVendoRP/jogadores/dummies/cenaRenderId.
// ---------------------------------------------------------------------------

vi.mock('./MapaFormContext', () => ({ useMapaForm: vi.fn() }));
vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../services/midia-sync', () => ({ criarPersonagemNaMesa: vi.fn(() => Promise.resolve(true)) }));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

const npc = (extra = {}) => ({ isNPC: true, bio: {}, poderes: [], inventario: [], passivas: [], combate: {}, dominios: {}, ...extra });
const mesaPadrao = () => ({
    Goblin: npc({ bio: { afiliacao: 'Tribo Verde' } }),
    Orc: npc({ bio: { afiliacao: 'Tribo Verde' } }),
    Lobo: npc(),
    Heroi: { bio: { mesa: 'jogador' }, poderes: [] },
});

function configurar(ctx = {}, cenario = { ativa: 'cena_x', lista: {}, tokensOcultos: ['antigo'] }) {
    mockUseStore({ divisorPoderMesa: 1, cenario });
    useMapaForm.mockReturnValue({
        isMestre: true, isModoRP: false, mestreVendoRP: false,
        jogadores: mesaPadrao(), dummies: {}, cenaRenderId: 'cena_x',
        ...ctx,
    });
}

const abrirFamilia = (nome) => fireEvent.click(screen.getByText(nome, { exact: false }).closest('button'));
const botoesCombate = () => screen.queryAllByText('+ cópia');
const campoQtd = () => document.querySelector('input[type="number"]');
const checkInvisivel = () => document.querySelector('input[type="checkbox"]');
const salvos = () => salvarDummie.mock.calls.map(c => ({ id: c[0], dummie: c[1] }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Gaveta de Tokens - visibilidade', () => {
    it('o Mestre ve a Gaveta', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        expect(screen.getByText('📦 Gaveta de Tokens')).toBeDefined();
    });
    it('quem nao e Mestre nao ve nada', () => {
        configurar({ isMestre: false });
        const { container } = render(<MapaMestreGavetaTokens />);
        expect(container.innerHTML).toBe('');
    });
    it('Mestre em modo RP sem estar vendo o RP nao ve a Gaveta', () => {
        configurar({ isModoRP: true, mestreVendoRP: false });
        const { container } = render(<MapaMestreGavetaTokens />);
        expect(container.innerHTML).toBe('');
    });
    it('Mestre em modo RP vendo o RP ve a Gaveta', () => {
        configurar({ isModoRP: true, mestreVendoRP: true });
        render(<MapaMestreGavetaTokens />);
        expect(screen.getByText('📦 Gaveta de Tokens')).toBeDefined();
    });
    it('sem o provider do Mapa mostra o aviso e nao quebra', () => {
        useMapaForm.mockReturnValue(null);
        mockUseStore({ divisorPoderMesa: 1 });
        render(<MapaMestreGavetaTokens />);
        expect(screen.getByText('Mapa provider não encontrado')).toBeDefined();
    });
});

describe('Gaveta de Tokens - lista de NPCs por familia', () => {
    it('lista cada familia com o contador de NPCs e ignora jogadores', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        const topoTribo = screen.getByText('Tribo Verde', { exact: false }).closest('button');
        expect(topoTribo.textContent).toContain('2');
        const topoSemCla = screen.getByText(FAMILIA_SEM_CLA, { exact: false }).closest('button');
        expect(topoSemCla.textContent).toContain('1');
        expect(screen.queryByText('Heroi')).toBeNull();
    });
    it('familias comecam recolhidas: nenhum NPC nem botao de combate aparece', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        expect(screen.queryByText('Goblin')).toBeNull();
        expect(botoesCombate()).toHaveLength(0);
        expect(screen.getByText('Tribo Verde', { exact: false }).textContent).toContain('📁');
    });
    it('clicar na familia expande e mostra seus NPCs em ordem alfabetica', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        abrirFamilia('Tribo Verde');
        expect(screen.getByText('Goblin')).toBeDefined();
        expect(screen.getByText('Orc')).toBeDefined();
        expect(screen.queryByText('Lobo')).toBeNull();
        expect(botoesCombate()).toHaveLength(2);
        expect(screen.getByText('Tribo Verde', { exact: false }).textContent).toContain('📂');
    });
    it('clicar de novo recolhe a familia', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        abrirFamilia('Tribo Verde');
        abrirFamilia('Tribo Verde');
        expect(screen.queryByText('Goblin')).toBeNull();
    });
    it('abrir uma familia nao abre as outras', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        abrirFamilia('Tribo Verde');
        expect(screen.queryByText('Lobo')).toBeNull();
    });
    it('um termo de busca expande as familias que tem resultado', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(screen.getByPlaceholderText('🔍 Buscar NPC...'), { target: { value: 'gob' } });
        expect(screen.getByText('Goblin')).toBeDefined();
        expect(screen.queryByText('Orc')).toBeNull();
        expect(screen.queryByText(FAMILIA_SEM_CLA, { exact: false })).toBeNull();
    });
    it('a busca ignora maiusculas e minusculas', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(screen.getByPlaceholderText('🔍 Buscar NPC...'), { target: { value: 'LOBO' } });
        expect(screen.getByText('Lobo')).toBeDefined();
    });
    it('apagar a busca volta ao estado recolhido', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        const busca = screen.getByPlaceholderText('🔍 Buscar NPC...');
        fireEvent.change(busca, { target: { value: 'gob' } });
        fireEvent.change(busca, { target: { value: '' } });
        expect(screen.queryByText('Goblin')).toBeNull();
    });
    it('mostra quantos tokens do NPC ja estao NESTA cena', () => {
        configurar({
            dummies: {
                a: { nome: 'Goblin #1', fichaOrigem: 'Goblin', cenaId: 'cena_x' },
                b: { nome: 'Goblin (2)', fichaOrigem: 'Goblin', cenaId: 'cena_x' },
                c: { nome: 'Goblin (3)', fichaOrigem: 'Goblin', cenaId: 'outra' },
            },
        });
        render(<MapaMestreGavetaTokens />);
        abrirFamilia('Tribo Verde');
        expect(screen.getByText('Goblin').closest('.gaveta-npc').textContent).toContain('2 na cena');
        expect(screen.getByText('Orc').closest('.gaveta-npc').textContent).not.toContain('na cena');
    });
});

describe('Gaveta de Tokens - estado vazio', () => {
    it('sem NPCs na mesa mostra a mensagem de vazio', () => {
        configurar({ jogadores: { Heroi: { bio: { mesa: 'jogador' } } } });
        render(<MapaMestreGavetaTokens />);
        expect(screen.getByText(/Nenhum NPC na mesa/)).toBeDefined();
    });
    it('jogadores undefined tambem cai no vazio sem quebrar', () => {
        configurar({ jogadores: undefined });
        render(<MapaMestreGavetaTokens />);
        expect(screen.getByText(/Nenhum NPC na mesa/)).toBeDefined();
    });
    it('busca sem resultado mostra "Nenhum NPC com esse nome."', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(screen.getByPlaceholderText('🔍 Buscar NPC...'), { target: { value: 'xyz' } });
        expect(screen.getByText('Nenhum NPC com esse nome.')).toBeDefined();
    });
});

describe('Gaveta de Tokens - Colocar e + cópia (sem dummie)', () => {
    const linha = (nome) => { abrirFamilia(nome === 'Lobo' ? FAMILIA_SEM_CLA : 'Tribo Verde'); return screen.getByText(nome).closest('.gaveta-npc'); };

    it('"Colocar" põe a PRÓPRIA ficha na cena (posição na cena renderizada) e não cria dummie', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(linha('Goblin').querySelector('.gaveta-npc-principal'));
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem.mock.calls[0][0]).toBe('Goblin');
        expect(salvarCamposPersonagem.mock.calls[0][1]['posicoes/cena_x']).toMatchObject({ cenaId: 'cena_x' });
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('"+ cópia" cria uma ficha NOVA (Goblin (2)) igual à original e a posiciona, sem dummie', async () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(linha('Goblin').querySelector('.gaveta-npc-copia'));
        await waitFor(() => expect(criarPersonagemNaMesa).toHaveBeenCalledTimes(1));
        const [nome, ficha] = criarPersonagemNaMesa.mock.calls[0];
        expect(nome).toBe('Goblin (2)');
        expect(ficha.isNPC).toBe(true);
        expect(ficha.bio.afiliacao).toBe('Tribo Verde');
        expect(Object.keys(ficha.posicoes)).toEqual(['cena_x']);
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('quantidade 3 cria Goblin (2), #3 e #4, em casas distintas', async () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(campoQtd(), { target: { value: '3' } });
        fireEvent.click(linha('Goblin').querySelector('.gaveta-npc-copia'));
        await waitFor(() => expect(criarPersonagemNaMesa).toHaveBeenCalledTimes(3));
        expect(criarPersonagemNaMesa.mock.calls.map(c => c[0])).toEqual(['Goblin (2)', 'Goblin (3)', 'Goblin (4)']);
        const casas = criarPersonagemNaMesa.mock.calls.map(c => JSON.stringify(c[1].posicao));
        expect(new Set(casas).size).toBe(3);
    });
    it('se a ficha nova não puder ser criada (já existe), não posiciona nada', async () => {
        configurar();
        criarPersonagemNaMesa.mockResolvedValueOnce(false);
        window.alert = vi.fn();
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(linha('Goblin').querySelector('.gaveta-npc-copia'));
        await waitFor(() => expect(criarPersonagemNaMesa).toHaveBeenCalledTimes(1));
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        await waitFor(() => expect(window.alert).toHaveBeenCalled());
    });
});
