import React from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AbaDominios from './AbaDominios';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — AbaDominios.jsx > Evolução em Massa (checkboxes + "Selecionar Todos" +
// select de nível-alvo + botão "APLICAR A N SELECIONADOS").
//
// Padrão de mock de useStore igual ao usado em AtaquePanel.test.jsx /
// RelicarioPanel.toggleEquiparById.test.jsx: useStore.mockImplementation(selector)
// e updateFicha(callback) que aplica o callback direto no objeto minhaFicha real
// (mutação em memória, sem Immer de verdade — suficiente pois o componente só faz
// atribuições/deletes simples dentro do callback).
//
// Fixture usada em quase todos os testes (criarFicha()):
//   dominios (formato PLANO, único namespace compartilhado por TODAS as abas -- ver
//   correção crítica em AbaDominios.jsx: `f.dominios[item] = { nivel, categoria }`) = {
//     'Aura Pura'          -> { nivel: 1, categoria: 'aura' }
//     'Projeção de Aura'   -> { nivel: 2, categoria: 'aura' }
//     'Reforço de Aura'    -> { nivel: 3, categoria: 'aura' }
//     'Vida'               -> { nivel: 1, categoria: 'astral' }
//     'Artes Marciais (Combate Corpo-a-Corpo)' -> { nivel: 1, categoria: 'marciais' }
//     'Reforço Físico'                         -> { nivel: 1, categoria: 'marciais' }
//   }
//   (nenhum item com categoria "cura" -> 0 itens nessa aba)
//
// Cada item acima é reconhecido na sua respectiva aba por NOME (bate em
// flatPredefs[chave], ver PREDEFINICOES em AbaDominios.jsx), então o campo
// `categoria` gravado é meramente informativo pra esses itens de Lore (não afeta
// o filtro `itensFiltrados`, que só recorre a `dados.categoria === chave` para
// itens CUSTOM fora da Lore -- não é o caso de nenhum item desta fixture).
//
// Isso dá: "aura" com 3 itens (>1 -> barra aparece), "astral" com 1 item (barra
// NÃO aparece), "cura" com 0 itens (barra NÃO aparece) e "marciais" com
// exatamente 2 itens (limite mínimo pra barra aparecer).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(() => Promise.resolve()),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { dominios: {} },
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

function criarFicha() {
    return {
        dominios: {
            'Aura Pura': { nivel: 1, categoria: 'aura' },
            'Projeção de Aura': { nivel: 2, categoria: 'aura' },
            'Reforço de Aura': { nivel: 3, categoria: 'aura' },
            'Vida': { nivel: 1, categoria: 'astral' },
            'Artes Marciais (Combate Corpo-a-Corpo)': { nivel: 1, categoria: 'marciais' },
            'Reforço Físico': { nivel: 1, categoria: 'marciais' },
        },
    };
}

// heading -> container ".def-box" daquela categoria
function getSection(tituloRegex) {
    const heading = screen.getByText(tituloRegex);
    return heading.closest('.def-box');
}

// nome do domínio (ex: "Aura Pura") -> div que contém o checkbox + select individuais
function getItemRow(section, nome) {
    const strong = within(section).getByText(nome.toUpperCase());
    return strong.closest('div');
}

// barra "Selecionar Todos" / select de nível-alvo / botão "APLICAR"
function getToolbar(section) {
    const label = within(section).getByText(/Selecionar Todos/i);
    return label.closest('div');
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe('AbaDominios — Evolução em Massa: aplicar apenas aos itens marcados', () => {
    it('marca 2 de 3 itens de "aura", aplica um nível-alvo e altera SOMENTE os marcados', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const section = getSection(/Artes de Aura/i);
        const rowPura = getItemRow(section, 'Aura Pura');
        const rowProjecao = getItemRow(section, 'Projeção de Aura');

        fireEvent.click(within(rowPura).getByRole('checkbox'));
        fireEvent.click(within(rowProjecao).getByRole('checkbox'));

        const toolbar = getToolbar(section);
        fireEvent.change(within(toolbar).getByRole('combobox'), { target: { value: '5' } });
        fireEvent.click(within(toolbar).getByRole('button', { name: /APLICAR/i }));

        expect(ficha.dominios['Aura Pura']).toEqual({ nivel: 5, categoria: 'aura' });
        expect(ficha.dominios['Projeção de Aura']).toEqual({ nivel: 5, categoria: 'aura' });
        // não marcado -> permanece com o nível original
        expect(ficha.dominios['Reforço de Aura']).toEqual({ nivel: 3, categoria: 'aura' });
    });
});

describe('AbaDominios — Evolução em Massa: "Selecionar Todos"', () => {
    it('marca via checkbox mestre e aplica o nível-alvo a TODOS os itens visíveis da categoria', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const section = getSection(/Artes de Aura/i);
        const toolbar = getToolbar(section);

        fireEvent.click(within(toolbar).getByRole('checkbox')); // Selecionar Todos
        fireEvent.change(within(toolbar).getByRole('combobox'), { target: { value: '2' } });
        fireEvent.click(within(toolbar).getByRole('button', { name: /APLICAR/i }));

        expect(ficha.dominios['Aura Pura']).toEqual({ nivel: 2, categoria: 'aura' });
        expect(ficha.dominios['Projeção de Aura']).toEqual({ nivel: 2, categoria: 'aura' });
        expect(ficha.dominios['Reforço de Aura']).toEqual({ nivel: 2, categoria: 'aura' });
    });
});

describe('AbaDominios — Evolução em Massa: nível-alvo 0 ("❌ Apagar")', () => {
    it('aplicado em massa REMOVE (delete) os itens marcados, não apenas zera o campo', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const section = getSection(/Artes de Aura/i);
        const rowPura = getItemRow(section, 'Aura Pura');
        const rowProjecao = getItemRow(section, 'Projeção de Aura');

        fireEvent.click(within(rowPura).getByRole('checkbox'));
        fireEvent.click(within(rowProjecao).getByRole('checkbox'));

        const toolbar = getToolbar(section);
        fireEvent.change(within(toolbar).getByRole('combobox'), { target: { value: '0' } });
        fireEvent.click(within(toolbar).getByRole('button', { name: /APLICAR/i }));

        expect(ficha.dominios).not.toHaveProperty('Aura Pura');
        expect(ficha.dominios).not.toHaveProperty('Projeção de Aura');
        // item não marcado permanece intacto
        expect(ficha.dominios['Reforço de Aura']).toEqual({ nivel: 3, categoria: 'aura' });
    });
});

describe('AbaDominios — regressão: select individual de UM item', () => {
    it('continua funcionando isoladamente, sem afetar os demais itens da categoria', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const section = getSection(/Artes de Aura/i);
        const rowPura = getItemRow(section, 'Aura Pura');

        fireEvent.change(within(rowPura).getByRole('combobox'), { target: { value: '4' } });

        expect(ficha.dominios['Aura Pura']).toEqual({ nivel: 4, categoria: 'aura' });
        expect(ficha.dominios['Projeção de Aura']).toEqual({ nivel: 2, categoria: 'aura' });
        expect(ficha.dominios['Reforço de Aura']).toEqual({ nivel: 3, categoria: 'aura' });
    });

    it('setar o nível de um item para 0 pelo select individual apaga o item E limpa a marcação em massa dele (limparMarcado)', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const section = getSection(/Artes de Aura/i);
        const rowPura = getItemRow(section, 'Aura Pura');
        const rowProjecao = getItemRow(section, 'Projeção de Aura');

        // marca os dois pela evolução em massa
        fireEvent.click(within(rowPura).getByRole('checkbox'));
        fireEvent.click(within(rowProjecao).getByRole('checkbox'));

        let toolbar = getToolbar(section);
        let botaoAplicar = within(toolbar).getByRole('button', { name: /APLICAR/i });
        expect(botaoAplicar.textContent).toContain('APLICAR A 2 SELECIONADOS');

        // apaga "Aura Pura" diretamente pelo select individual do item (nível 0)
        fireEvent.change(within(rowPura).getByRole('combobox'), { target: { value: '0' } });

        expect(ficha.dominios).not.toHaveProperty('Aura Pura');
        // "Projeção de Aura" não foi tocado por essa ação
        expect(ficha.dominios['Projeção de Aura']).toEqual({ nivel: 2, categoria: 'aura' });

        // a marcação em massa de "Aura Pura" foi limpa -> só sobra 1 selecionado
        toolbar = getToolbar(section); // re-obtém pois o DOM foi re-renderizado
        botaoAplicar = within(toolbar).getByRole('button', { name: /APLICAR/i });
        expect(botaoAplicar.textContent).toContain('APLICAR A 1 SELECIONADO');
        expect(botaoAplicar.textContent).not.toContain('SELECIONADOS');
    });
});

describe('AbaDominios — barra de aplicação em massa só aparece com mais de 1 item', () => {
    it('NÃO aparece para uma categoria sem nenhum item ("cura")', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const curaSection = getSection(/Atributos de Cura/i);
        expect(within(curaSection).queryByText(/Selecionar Todos/i)).toBeNull();
    });

    it('NÃO aparece para uma categoria com exatamente 1 item ("astral" -> só "Vida")', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const astralSection = getSection(/Artes Astrais/i);
        expect(within(astralSection).queryByText(/Selecionar Todos/i)).toBeNull();
    });

    it('APARECE para uma categoria com exatamente 2 itens ("marciais")', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const marciaisSection = getSection(/Artes Marciais \(Taijutsu\)/i);
        expect(within(marciaisSection).queryByText(/Selecionar Todos/i)).not.toBeNull();
    });

    it('APARECE para uma categoria com 3 itens ("aura") — controle positivo', () => {
        const ficha = criarFicha();
        montarStore({ minhaFicha: ficha });
        render(<AbaDominios />);

        const auraSection = getSection(/Artes de Aura/i);
        expect(within(auraSection).queryByText(/Selecionar Todos/i)).not.toBeNull();
    });
});
