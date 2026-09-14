import React from 'react';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import { MestreInjetorEntidades } from './MestreSubComponents';
import useStore from '../../stores/useStore';
import { salvarDummie } from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

// ---------------------------------------------------------------------------
// QA — reformulação de exibição de Vida/Mana/Aura/Chakra/Corpo (divisão por
// FATOR_EXIBICAO_VITAIS = 1000, só na camada de UI): round-trip de criação de
// dummie pelo Mestre, o ponto de maior risco desta mudança porque é o único
// lugar onde um valor "já na escala de exibição" (digitado ou pré-preenchido
// a partir de jogadoresComStats.hpMax) precisa ser multiplicado de volta por
// FATOR_EXIBICAO_VITAIS antes de virar hpMax/hpAtual BRUTO salvo no Firebase
// (MestreFormContext.jsx > injetarDummie).
//
// Segue o mesmo padrão de mock/harness de MestreFormContext.toggleCoMestre.test.jsx
// (mocka só o `default` de stores/useStore, preservando sanitizarNome real) e o
// padrão de mock de contexto por importOriginal usado em
// MestreSubComponents.coMestreButton.test.jsx.
//
// core/poder.js > calcularFatorMultiplicadorForca é mockado para retornar
// sempre 1 -- este teste não é sobre o sistema de Prestígio/Ascensão, e
// travar o fator em 1 torna o hpMax exposto por jogadoresComStats igual ao
// valor bruto de ficha.vida.atual dividido por FATOR_EXIBICAO_VITAIS, sem
// nenhum multiplicador extra a calcular manualmente no teste.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});

vi.mock('../../core/poder', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, calcularFatorMultiplicadorForca: vi.fn(() => 1) };
});

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/firebase-config', () => ({
    db: { __isMock: true },
}));

vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    apagarFicha: vi.fn(),
}));

function statBase(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 };
}

// Ficha mínima cujo Vida BRUTO (ficha.vida.base) é controlado diretamente --
// com todos os multiplicadores travados em 1.0 (ver statBase) e
// calcularFatorMultiplicadorForca mockado em 1, getMaximo(ficha,'vida')
// resolve exatamente para `vidaBase`, sem nenhuma conta de Prestígio/Formas
// no meio a esconder o número.
function fichaComVida(vidaBase, vidaAtual = vidaBase) {
    return {
        bio: { classe: 'guerreiro' },
        vida: { ...statBase(vidaBase), atual: vidaAtual },
        mana: { ...statBase(100), atual: 80 },
        aura: { ...statBase(100), atual: 80 },
        chakra: { ...statBase(100), atual: 80 },
        corpo: { ...statBase(100), atual: 80 },
        forca: statBase(10), destreza: statBase(10), inteligencia: statBase(10),
        sabedoria: statBase(10), energiaEsp: statBase(10), carisma: statBase(10),
        stamina: statBase(10), constituicao: statBase(10),
    };
}

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        personagens: {},
        isMestre: true,
        meuNome: 'Mestre',
        userLogado: 'Mestre',
        mesaId: 'MESA-X',
        mesaCriador: 'Mestre',
        mesaMestres: {},
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    // core/attributes.js > getEfeitosDeClasse acessa useStore.getState() diretamente (fora de
    // componente React, estilo Zustand puro) -- o hook mockado como vi.fn() simples perde esse
    // método estático, então precisa ser reanexado aqui a cada chamada de montarStore().
    useStore.getState = vi.fn(() => mockState);
    return mockState;
}

let probe;
function Harness() {
    probe = useMestreForm();
    return null;
}

function montar({ comInjetor = false } = {}) {
    render(
        <MestreFormProvider>
            <Harness />
            {comInjetor && <MestreInjetorEntidades />}
        </MestreFormProvider>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});
afterEach(() => { cleanup(); });

describe('MestreFormContext — injetarDummie(): multiplica "HP Base" de volta por FATOR_EXIBICAO_VITAIS ao salvar', () => {
    it('digitar "100" em dHp (com dVit=0) salva um dummie com hpMax/hpAtual = 100.000 (100 × 1000), não 100', async () => {
        montarStore();
        montar();

        await act(async () => {
            probe.setDHp('100');
            probe.setDVit(0);
        });
        await act(async () => { probe.injetarDummie(); });

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const [, payload] = salvarDummie.mock.calls[0];
        expect(payload.hpMax).toBe(100000);
        expect(payload.hpAtual).toBe(100000);
    });

    it('dVit (zeros extra) continua multiplicando ANTES do fator de exibição: dHp="5", dVit=2 -> 5 × 100 × 1000 = 500.000', async () => {
        montarStore();
        montar();

        await act(async () => {
            probe.setDHp('5');
            probe.setDVit(2);
        });
        await act(async () => { probe.injetarDummie(); });

        const [, payload] = salvarDummie.mock.calls[0];
        expect(payload.hpMax).toBe(500000);
        expect(payload.hpAtual).toBe(500000);
    });
});

describe('MestreSubComponents — MestreInjetorEntidades.handleSelecionarEntidade: usa hpMax JÁ na escala de exibição, sem dividir de novo', () => {
    it('selecionar um jogador com jogadoresComStats.hpMax = 34.000 preenche dHp com 34.000 (não re-divide, não usa o valor bruto pré-divisão)', async () => {
        montarStore({ personagens: { 'Jogador1': fichaComVida(34000000) } });
        montar({ comInjetor: true });

        // Confere a pré-condição: jogadoresComStats já expõe o hpMax na escala de EXIBIÇÃO.
        expect(probe.jogadoresComStats[0].hpMax).toBe(34000000 / FATOR_EXIBICAO_VITAIS);
        expect(probe.jogadoresComStats[0].hpMax).toBe(34000);

        // O primeiro <select> é "Carregar Ficha Salva" -- os demais (Defesa Alvo, Visibilidade
        // HP) vêm depois no DOM.
        const select = screen.getAllByRole('combobox')[0];
        await act(async () => { fireEvent.change(select, { target: { value: 'Jogador1' } }); });

        expect(probe.dHp).toBe(34000);
        expect(probe.dVit).toBe(0);
    });
});

describe('MestreFormContext + MestreSubComponents — round-trip completo (jogador -> clonar como dummie -> hpMax bruto reproduzido sem drift)', () => {
    it('raw vida.atual = 34.000.000 -> hpMax exibido = 34.000 -> clonar via "HP Base" grava dummie com hpMax/hpAtual = 34.000.000 de volta', async () => {
        montarStore({ personagens: { 'Jogador1': fichaComVida(34000000, 34000000) } });
        montar({ comInjetor: true });

        const select = screen.getAllByRole('combobox')[0];
        await act(async () => { fireEvent.change(select, { target: { value: 'Jogador1' } }); });

        // dHp já foi preenchido com o valor DISPLAY (34.000) pelo handleSelecionarEntidade --
        // injetarDummie deve multiplicar por FATOR_EXIBICAO_VITAIS de volta, reproduzindo
        // exatamente o valor bruto original, sem nenhum drift de arredondamento.
        await act(async () => { probe.injetarDummie(); });

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const [, payload] = salvarDummie.mock.calls[0];
        expect(payload.hpMax).toBe(34000000);
        expect(payload.hpAtual).toBe(34000000);
    });
});
