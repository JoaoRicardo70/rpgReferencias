import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaMestreGavetaTokens } from './MapaFerramentasMestre';
import { useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, salvarCenarioCompleto } from '../../services/firebase-sync';
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
}));

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
const botoesCombate = () => screen.queryAllByText('⚔️ Ao combate');
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
                b: { nome: 'Goblin #2', fichaOrigem: 'Goblin', cenaId: 'cena_x' },
                c: { nome: 'Goblin #3', fichaOrigem: 'Goblin', cenaId: 'outra' },
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

describe('Gaveta de Tokens - "Ao combate"', () => {
    const colocar = (nome) => {
        abrirFamilia(nome === 'Lobo' ? FAMILIA_SEM_CLA : 'Tribo Verde');
        fireEvent.click(screen.getByText(nome).closest('.gaveta-npc').querySelector('button'));
    };

    it('com quantidade 1 chama salvarDummie uma vez, com cena e casa livre', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        colocar('Goblin');
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const [{ id, dummie }] = salvos();
        expect(id).toBe('dummie_1700000000000_0');
        expect(dummie.nome).toBe('Goblin #1');
        expect(dummie.fichaOrigem).toBe('Goblin');
        expect(dummie.cenaId).toBe('cena_x');
        expect(dummie.posicao).toEqual({ x: 0, y: 0 });
        expect(dummie.visibilidadeHp).toBe('todos');
    });
    it('quantidade 3 chama salvarDummie 3 vezes com ids, numeros e casas distintas', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(campoQtd(), { target: { value: '3' } });
        colocar('Goblin');
        const s = salvos();
        expect(s).toHaveLength(3);
        expect(s.map(x => x.id)).toEqual(['dummie_1700000000000_0', 'dummie_1700000000000_1', 'dummie_1700000000000_2']);
        expect(s.map(x => x.dummie.nome)).toEqual(['Goblin #1', 'Goblin #2', 'Goblin #3']);
        expect(s.map(x => x.dummie.posicao)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    });
    it.each([
        ['15', 10],
        ['10', 10],
        ['0', 1],
        ['-4', 1],
        ['', 1],
        ['abc', 1],
        ['2.9', 2],
    ])('quantidade digitada %j vira %i chamadas (limite 1..10)', (digitado, esperado) => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(campoQtd(), { target: { value: digitado } });
        colocar('Goblin');
        expect(salvarDummie).toHaveBeenCalledTimes(esperado);
    });
    it('evita casas ocupadas por entidades da cena e por personagens, ignorando outras cenas', () => {
        configurar({
            dummies: {
                a: { nome: 'X #1', fichaOrigem: 'X', cenaId: 'cena_x', posicao: { x: 0, y: 0 } },
                b: { nome: 'Y #1', fichaOrigem: 'Y', cenaId: 'outra', posicao: { x: 1, y: 0 } },
            },
            jogadores: { ...mesaPadrao(), Heroi: { bio: { mesa: 'jogador' }, posicoes: { cena_x: { x: 2, y: 0 } } } },
        });
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(campoQtd(), { target: { value: '2' } });
        colocar('Goblin');
        expect(salvos().map(x => x.dummie.posicao)).toEqual([{ x: 1, y: 0 }, { x: 3, y: 0 }]);
    });
    it('a numeracao continua do maior "#n" ja usado por aquela ficha, mesmo com buracos', () => {
        configurar({
            dummies: {
                a: { nome: 'Goblin #1', fichaOrigem: 'Goblin', cenaId: 'cena_x', posicao: { x: 5, y: 5 } },
                b: { nome: 'Goblin #7', fichaOrigem: 'Goblin', cenaId: 'outra', posicao: { x: 6, y: 6 } },
                c: { nome: 'Orc #99', fichaOrigem: 'Orc', cenaId: 'cena_x', posicao: { x: 7, y: 7 } },
                d: { nome: 'Goblin #50', cenaId: 'cena_x', posicao: { x: 8, y: 8 } },
            },
        });
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(campoQtd(), { target: { value: '2' } });
        colocar('Goblin');
        expect(salvos().map(x => x.dummie.nome)).toEqual(['Goblin #8', 'Goblin #9']);
    });
    it('dummies com fichaOrigem mas sem "#n" no nome contam como 0 e a numeracao comeca em 1', () => {
        configurar({ dummies: { a: { nome: 'Goblin', fichaOrigem: 'Goblin', cenaId: 'cena_x' } } });
        render(<MapaMestreGavetaTokens />);
        colocar('Goblin');
        expect(salvos()[0].dummie.nome).toBe('Goblin #1');
    });
    it('a numeracao de um NPC nao e afetada pelos tokens de outro', () => {
        configurar({ dummies: { c: { nome: 'Orc #4', fichaOrigem: 'Orc', cenaId: 'cena_x' } } });
        render(<MapaMestreGavetaTokens />);
        colocar('Goblin');
        expect(salvos()[0].dummie.nome).toBe('Goblin #1');
    });
    it('"HP Oculto" grava visibilidadeHp "mestre" nos tokens', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.change(document.querySelector('select'), { target: { value: 'mestre' } });
        colocar('Goblin');
        expect(salvos()[0].dummie.visibilidadeHp).toBe('mestre');
    });
    it('usa a cena renderizada (cenaRenderId) no token', () => {
        configurar({ cenaRenderId: 'taverna' });
        render(<MapaMestreGavetaTokens />);
        colocar('Goblin');
        expect(salvos()[0].dummie.cenaId).toBe('taverna');
    });
    it('colocar um NPC nao chama salvarCenarioCompleto com o checkbox desmarcado', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        expect(checkInvisivel().checked).toBe(false);
        colocar('Goblin');
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('com "Token invisível" marcado chama salvarCenarioCompleto com os ids novos em tokensOcultos', () => {
        const cenario = { ativa: 'cena_x', lista: { cena_x: { nome: 'X' } }, tokensOcultos: ['antigo'] };
        configurar({}, cenario);
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(checkInvisivel());
        fireEvent.change(campoQtd(), { target: { value: '2' } });
        colocar('Goblin');
        expect(salvarDummie).toHaveBeenCalledTimes(2);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const enviado = salvarCenarioCompleto.mock.calls[0][0];
        expect(enviado.tokensOcultos).toEqual(['antigo', 'dummie_1700000000000_0', 'dummie_1700000000000_1']);
        expect(enviado.ativa).toBe('cena_x');
        expect(enviado.lista).toEqual({ cena_x: { nome: 'X' } });
    });
    it('o cenario do store nao e mutado ao ocultar tokens', () => {
        const cenario = { ativa: 'cena_x', tokensOcultos: ['antigo'] };
        configurar({}, cenario);
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(checkInvisivel());
        colocar('Goblin');
        expect(cenario.tokensOcultos).toEqual(['antigo']);
    });
    it('funciona com invisivel marcado quando o cenario ainda nao tem tokensOcultos', () => {
        configurar({}, { ativa: 'cena_x' });
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(checkInvisivel());
        colocar('Goblin');
        expect(salvarCenarioCompleto.mock.calls[0][0].tokensOcultos).toEqual(['dummie_1700000000000_0']);
    });
    it('desmarcar o checkbox de novo volta a nao ocultar', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        fireEvent.click(checkInvisivel());
        fireEvent.click(checkInvisivel());
        colocar('Goblin');
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('o token nasce com Vida cheia (hpMax = hpAtual, fallback 100 x 1000 sem Vida na ficha)', () => {
        configurar();
        render(<MapaMestreGavetaTokens />);
        colocar('Goblin');
        const d = salvos()[0].dummie;
        expect(d.hpAtual).toBe(100000);
        expect(d.hpMax).toBe(d.hpAtual);
    });
});
