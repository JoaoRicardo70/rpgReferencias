import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarDummie, aplicarDanoDireto, aplicarFadigaDireta, salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';

// ==========================================================================
// NOTA DE ESCOPO:
// `MapaFerramentasMestre.jsx` só importa `useMapaForm` (MapaFormContext.jsx) e
// `salvarDummie` (firebase-sync) — não importa nada de 3D (ver a mesma nota em
// MapaFormContext.apenasCriador.test.jsx), então é seguro montar
// `MapaMestreDanoRapido` dentro de um `MapaFormProvider` REAL.
// ==========================================================================

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function baseState(overrides = {}) {
    const minhaFicha = { nome: 'Ficha', iniciativa: 0, posicao: { x: 0, y: 0, z: 0, cenaId: 'default' }, vida: { atual: 100 } };
    return {
        minhaFicha,
        meuNome: 'Mestre',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } } },
        ...overrides,
    };
}

describe('MapaMestreDanoRapido — visibilidade e gate isMestre', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    it('renderiza NADA para um jogador comum (isMestre=false)', () => {
        mockUseStore(baseState({ isMestre: false }));
        const { container } = render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
        expect(container.textContent).toBe('');
    });

    it('renderiza o painel "⚔️ Dano Rápido" para o Mestre', () => {
        mockUseStore(baseState());
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
        expect(screen.getByText('⚔️ Dano Rápido')).toBeDefined();
    });
});

describe('MapaMestreDanoRapido — lista de alvos filtrada por cena', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    it('lista jogadores E dummies presentes na cena atual, prefixados com 🧑/🤖', () => {
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' } } },
            dummies: { goblin: { nome: 'Goblin', cenaId: 'default', hpAtual: 30 } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        expect(screen.getByText('🧑 Mestre')).toBeDefined(); // o próprio Mestre também está na cena (minhaFicha)
        expect(screen.getByText('🧑 Vilao')).toBeDefined();
        expect(screen.getByText('🤖 Goblin')).toBeDefined();
    });

    it('EXCLUI jogadores/dummies de OUTRAS cenas (mesmo filtro que MapaIniciativaTracker.todasEntidades)', () => {
        mockUseStore(baseState({
            personagens: { ForaDaCena: { posicao: { x: 1, y: 1, z: 0, cenaId: 'outra-cena' } } },
            dummies: { orcOutraCena: { nome: 'Orc', cenaId: 'outra-cena', hpAtual: 10 } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        expect(screen.queryByText(/ForaDaCena/)).toBeNull();
        expect(screen.queryByText(/Orc/)).toBeNull();
    });

    it('mensagem "Nenhum jogador ou entidade nesta cena" quando não há ninguém (nem o Mestre) na cena visualizada', () => {
        mockUseStore(baseState({ minhaFicha: { nome: 'Ficha' } })); // sem posição -> não conta como "na cena"
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
        expect(screen.getByText(/Nenhum jogador ou entidade nesta cena/)).toBeDefined();
    });
});

describe('MapaMestreDanoRapido — aplicar dano', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(() => cleanup());

    it('botão "Aplicar Dano" fica desabilitado (inerte) enquanto nenhum alvo é selecionado — um clique real de navegador não dispara nada', () => {
        mockUseStore(baseState({ dummies: { goblin: { nome: 'Goblin', cenaId: 'default', hpAtual: 30 } } }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const botao = screen.getByText('💥 Aplicar Dano');
        expect(botao.disabled).toBe(true);

        // jsdom (igual a um navegador real) não dispara o handler onClick de um <button disabled>.
        fireEvent.click(botao);
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('selecionar um dummie e clicar "Aplicar Dano" chama aplicarDanoRapido -> salvarDummie com hpAtual reduzido pelo valor do input', () => {
        mockUseStore(baseState({ dummies: { goblin: { nome: 'Goblin', cenaId: 'default', hpAtual: 30 } } }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'goblin' } });

        const inputDano = screen.getByDisplayValue('10'); // valor padrão do input de dano
        fireEvent.change(inputDano, { target: { value: '12' } });

        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const [idChamado, dadosChamados] = salvarDummie.mock.calls[0];
        expect(idChamado).toBe('goblin');
        expect(dadosChamados.hpAtual).toBe(18); // 30 - 12
    });

    it('selecionar OUTRO jogador (não-Mestre) chama aplicarDanoDireto (escrita cross-player), nunca salvarFichaSilencioso local', () => {
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 80 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'Vilao' } });
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 70); // 80 - 10 (padrão)
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
});
