import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarDummie, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';

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
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
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
        // 🔥 hpAtual bruto (500.000) numa escala realista pós-correção de aplicarDanoRapido —
        // dummies também gravam hpAtual na escala BRUTA (FATOR_EXIBICAO_VITAIS = 1000x a exibida),
        // então um hpAtual pequeno como o antigo "30" clamparia pra 0 com qualquer dano digitado
        // e perderia o sentido de "dano parcial" que este teste quer exercitar.
        mockUseStore(baseState({ dummies: { goblin: { nome: 'Goblin', cenaId: 'default', hpAtual: 500000 } } }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        // Duas <select>: alvo (primeira) e elemento do dano (segunda) — pega a de alvo por índice.
        const select = screen.getAllByRole('combobox')[0];
        fireEvent.change(select, { target: { value: 'goblin' } });

        const inputDano = screen.getByDisplayValue('10'); // valor padrão do input de dano
        fireEvent.change(inputDano, { target: { value: '12' } });

        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const [idChamado, dadosChamados] = salvarDummie.mock.calls[0];
        expect(idChamado).toBe('goblin');
        // 12 (dano exibido, digitado no input) * FATOR_EXIBICAO_VITAIS (1000) = 12.000 bruto
        // subtraídos de 500.000 -> 488.000.
        expect(dadosChamados.hpAtual).toBe(488000); // 500000 - 12*1000
    });

    it('selecionar OUTRO jogador (não-Mestre) chama aplicarDanoDireto (escrita cross-player), nunca salvarFichaSilencioso local', () => {
        // 🔥 vida.atual bruto numa escala realista (500.000) — o antigo "80" clamparia pra 0 com
        // qualquer dano digitado depois da correção de escala de aplicarDanoRapido.
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 500000 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        // Duas <select>: alvo (primeira) e elemento do dano (segunda) — pega a de alvo por índice.
        const select = screen.getAllByRole('combobox')[0];
        fireEvent.change(select, { target: { value: 'Vilao' } });
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        // Vilao não tem `dominios`, então sem elemento marcado o dano passa integral: 10 (padrão,
        // exibido) * FATOR_EXIBICAO_VITAIS (1000) = 10.000 bruto subtraídos de 500.000 -> 490.000.
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 490000); // 500000 - 10*1000 (padrão)
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        // Sem elemento selecionado (padrão "Físico/Nenhum") -> limpa o campo (null), nunca deixa
        // undefined/sem chamar (ver aplicarElementoDireto em firebase-sync.js).
        expect(aplicarElementoDireto).toHaveBeenCalledWith('Vilao', null);
    });

    it('selecionar um Elemento no dropdown e aplicar dano em OUTRO jogador chama aplicarElementoDireto com o elemento marcado', () => {
        // Mesma escala realista de vida.atual do teste acima.
        mockUseStore(baseState({
            personagens: { Vilao: { posicao: { x: 1, y: 1, z: 0, cenaId: 'default' }, vida: { atual: 500000 } } },
        }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);

        const [selectAlvo, selectElemento] = screen.getAllByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: 'Vilao' } });
        fireEvent.change(selectElemento, { target: { value: 'Fogo' } });
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));

        // Vilao não tem `dominios` -> getNivelDominio(Vilao, 'Fogo') = 0 -> sem redução mesmo com
        // elemento marcado -> mesma conta do teste acima: 500000 - 10*1000 = 490000.
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 490000);
        expect(aplicarElementoDireto).toHaveBeenCalledWith('Vilao', 'Fogo');
    });
});
