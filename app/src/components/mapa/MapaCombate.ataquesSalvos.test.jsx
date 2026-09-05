import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtaquesSalvos } from './MapaCombate';
import { AtaqueFormProvider, useAtaqueForm } from '../combate/AtaqueFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — MapaAtaquesSalvos (MapaCombate.jsx): acesso rápido, direto do Mapa, aos "Ataques
// Salvos" (ficha.ataqueConfig.formulasSalvas) sem precisar sair pra aba Ataque. Reusa
// rolarDanoCustomizado do PRÓPRIO AtaqueFormContext (mesma função/mesmo cálculo que a aba
// Ataque usa) — aqui só se testa que o componente lista as fórmulas certas e clica no botão
// certo; a matemática de dano em si já é coberta por
// AtaqueFormContext.rolarDanoCustomizado.escalaComprimida.test.jsx e outros testes do
// AtaqueFormContext.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 0, letalidade: 0, rolagem: '' })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [], inventario: [] },
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(),
        abaAtiva: 'aba-mapa',
        feedCombate: [],
        alvoSelecionado: null,
        dummies: {},
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaAtaquesSalvos — acesso rápido aos Ataques Salvos direto do Mapa', () => {
    it('mostra uma dica quando a ficha não tem nenhuma fórmula salva ainda', () => {
        montarStore({ minhaFicha: { poderes: [], inventario: [], ataqueConfig: {} } });
        const { getByText, queryAllByRole } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>);

        expect(getByText(/Nenhum ataque salvo ainda/i)).toBeTruthy();
        expect(queryAllByRole('button').length).toBe(0);
    });

    it('lista um botão por fórmula salva, com o nome dela', () => {
        montarStore({
            minhaFicha: {
                poderes: [], inventario: [],
                ataqueConfig: {
                    formulasSalvas: [
                        { id: 1, nome: 'Soco Básico', formula: '2d6x1000', letalidade: 0, energiaTipo: 'nenhum', energiaCusto: 0 },
                        { id: 2, nome: 'Rajada de Mana', formula: '5d10x61000', letalidade: 2, energiaTipo: 'mana', energiaCusto: 10 },
                    ],
                },
            },
        });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>);

        expect(getByText('▶ Soco Básico')).toBeTruthy();
        expect(getByText('▶ Rajada de Mana')).toBeTruthy();
    });

    it('clicar num ataque salvo chama rolarDanoCustomizado com a fórmula/letalidade/energia salvas (mesmo cálculo da aba Ataque)', () => {
        const minhaFicha = {
            poderes: [], inventario: [], passivas: [], ataquesElementais: [],
            mana: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 1000000 },
            combate: {}, hierarquia: {},
            ataqueConfig: {
                formulasSalvas: [
                    { id: 1, nome: 'Rajada de Mana', formula: '5d10x61000', letalidade: 2, energiaTipo: 'mana', energiaCusto: 10 },
                ],
            },
        };
        montarStore({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>);

        act(() => { getByText('▶ Rajada de Mana').click(); });

        // A fórmula salva realmente rolou e debitou o custo de energia dela (10% de Mana) —
        // prova que o botão está mesmo chamando rolarDanoCustomizado(f.formula, f.letalidade,
        // f.energiaTipo, f.energiaCusto), não um no-op.
        expect(minhaFicha.mana.atual).toBe(900000);
    });

    it('mostra o nome do alvo (dummieAlvo) quando um alvo já está selecionado no Mapa (alvoSelecionado global)', () => {
        montarStore({ alvoSelecionado: 'goblin1', dummies: { goblin1: { nome: 'Goblin Feroz', hpAtual: 10 } } });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>);

        expect(getByText(/Goblin Feroz/)).toBeTruthy();
    });

    it('mostra "Nenhum alvo selecionado" quando alvoSelecionado está vazio', () => {
        montarStore({ alvoSelecionado: null });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>);

        expect(getByText(/Nenhum alvo selecionado/)).toBeTruthy();
    });

    it('não lança e renderiza null se usado FORA de um AtaqueFormProvider (defensivo)', () => {
        montarStore();
        expect(() => render(<MapaAtaquesSalvos />)).not.toThrow();
    });

    // -------------------------------------------------------------------------
    // QA (gap) — `minhaFicha.ataqueConfig` inteiro ausente (não só `formulasSalvas` faltando
    // dentro de um `ataqueConfig` já existente) — encadeamento opcional
    // (`minhaFicha?.ataqueConfig?.formulasSalvas`) precisa segurar os DOIS níveis, não só o de
    // dentro.
    // -------------------------------------------------------------------------
    it('não lança e mostra a dica de "nenhum ataque salvo" quando `ataqueConfig` está totalmente ausente na ficha (não só `formulasSalvas`)', () => {
        montarStore({ minhaFicha: { poderes: [], inventario: [] } }); // sem a chave ataqueConfig
        let getByText;
        expect(() => {
            ({ getByText } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>));
        }).not.toThrow();

        expect(getByText(/Nenhum ataque salvo ainda/i)).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // QA (gap) — rolar um Ataque Salvo do Mapa sem NENHUM alvo selecionado (`alvoSelecionado`
    // null e `dummies` vazio) precisa continuar funcionando normalmente (ataques sem área não
    // exigem alvo, mesmo comportamento já existente de rolarDanoCustomizado) — não deve lançar
    // nem silenciosamente deixar de rolar/debitar energia.
    // -------------------------------------------------------------------------
    it('clicar num ataque salvo SEM nenhum alvo selecionado ainda rola normalmente (não exige alvo) e não lança', () => {
        const minhaFicha = {
            poderes: [], inventario: [], passivas: [], ataquesElementais: [],
            mana: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 1000000 },
            combate: {}, hierarquia: {},
            ataqueConfig: {
                formulasSalvas: [
                    { id: 1, nome: 'Rajada de Mana', formula: '5d10x61000', letalidade: 2, energiaTipo: 'mana', energiaCusto: 10 },
                ],
            },
        };
        montarStore({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)), alvoSelecionado: null, dummies: {} });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaquesSalvos /></AtaqueFormProvider>);

        expect(() => { act(() => { getByText('▶ Rajada de Mana').click(); }); }).not.toThrow();

        // Rolou e debitou o custo de energia normalmente, sem alvo nenhum selecionado.
        expect(minhaFicha.mana.atual).toBe(900000);
    });
});

// ---------------------------------------------------------------------------
// QA — Regressão: rolar um Ataque Salvo direto do Mapa NÃO deve arrancar o jogador pra aba
// do Log (setAbaAtiva('aba-log')) — o resultado já aparece ao vivo na Moldura de combate do
// próprio Mapa (MapaHologramaAcao), então forçar a troca de aba seria uma navegação
// indesejada. Testado direto no AtaqueFormContext (rolarDanoCustomizado), já que é a MESMA
// função reusada pelo MapaAtaquesSalvos.
// ---------------------------------------------------------------------------
describe('AtaqueFormContext — rolarDanoCustomizado não força troca de aba quando já se está no Mapa', () => {
    let probe;
    function Harness() {
        probe = useAtaqueForm();
        return null;
    }

    it('NÃO chama setAbaAtiva quando abaAtiva já é "aba-mapa"', () => {
        const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], mana: {}, vida: { base: 1000000, atual: 1000000 }, combate: {}, hierarquia: {} };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)), abaAtiva: 'aba-mapa' });
        render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);

        act(() => { probe.rolarDanoCustomizado('10', 0, 'nenhum', 0); });

        expect(mockState.setAbaAtiva).not.toHaveBeenCalled();
    });

    it('CONTINUA chamando setAbaAtiva("aba-log") quando rolado a partir de outra aba (ex: aba-ataque), comportamento original preservado', () => {
        const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], mana: {}, vida: { base: 1000000, atual: 1000000 }, combate: {}, hierarquia: {} };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)), abaAtiva: 'aba-ataque' });
        render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);

        act(() => { probe.rolarDanoCustomizado('10', 0, 'nenhum', 0); });

        expect(mockState.setAbaAtiva).toHaveBeenCalledWith('aba-log');
    });
});
