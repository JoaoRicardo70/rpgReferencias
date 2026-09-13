import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Marcados.jsx > QuadranteCategoria ("A Hierarquia de Domínios", página 3
// da Ficha): evolução em massa de domínios — checkbox "Selecionar Todos",
// select de nível-alvo e botão "APLICAR A N SELECIONADOS", além da regressão
// do handleRemove que também limpa o item do Set de marcados.
//
// QuadranteCategoria/DominiosPanel não são exportados — mesmo padrão de
// Marcados.pagina6.test.jsx / Marcados.forca.test.jsx: monta o MarcadosPanel
// inteiro, mock de useStore (updateFicha chama o callback direto na ficha,
// mutando o objeto real de teste) e navega até a página 3 clicando "Próxima".
//
// Usamos a categoria "cura" (Atributos de Cura e Suporte) com nomes de
// domínio que NÃO existem em PREDEFINIDOS_LORE, pra cair sempre no ramo
// `dados.categoria === catKey` do filtro (sem depender de encontrarCategoria-
// PorLore) e não ser uma categoria elemental (sem o bloco extra de
// Resistência/Redução de Dano, que só aparece pra 'elementos_*').
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function criarStat(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 };
}

function fichaComDominios(dominios = {}) {
    const ficha = {
        ascensaoBase: 1,
        vida: criarStat(100000000),
        mana: criarStat(1000000000),
        aura: criarStat(1000000000),
        chakra: criarStat(1000000000),
        corpo: criarStat(1000000000),
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        poderes: [],
        inventario: [],
        seresSelados: [],
        ataquesElementais: [],
        dominios,
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = criarStat(1000000); });
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Página 1 -> 3 = Hierarquia de Domínios (ver Marcados.jsx, paginaAtual === 3).
function irParaPaginaDominios() {
    fireEvent.click(screen.getByText('Próxima ⮞'));
    fireEvent.click(screen.getByText('Próxima ⮞'));
}

function getQuadranteCura() {
    const heading = screen.getByText('Atributos de Cura e Suporte');
    return heading.closest('div');
}

function checkboxItem(container, nome) {
    return within(container).getByRole('checkbox', { name: nome });
}

// Sobe do checkbox de um item até o <div> que também contém o botão "✖"
// (checkbox -> <label> -> linha flex -> container do item).
function itemContainerFor(container, nome) {
    const checkbox = checkboxItem(container, nome);
    const linhaFlex = checkbox.closest('label').parentElement;
    return linhaFlex.parentElement;
}

function selectNivelFor(container, nome) {
    const itemDiv = itemContainerFor(container, nome);
    const combos = within(itemDiv).getAllByRole('combobox');
    return combos[combos.length - 1]; // o select de "mover categoria" (se existir) vem antes do de nível
}

function massBarFor(container) {
    const checkboxTodos = within(container).getByRole('checkbox', { name: /Selecionar Todos/i });
    return checkboxTodos.closest('div');
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
});

afterEach(() => {
    cleanup();
});

describe('MarcadosPanel — Hierarquia de Domínios: evolução em massa (QuadranteCategoria)', () => {
    it('a barra de aplicação em massa NÃO aparece com 0 ou 1 item, e APARECE com 2+', () => {
        montarMockUseStore(fichaComDominios({}));
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        let container = getQuadranteCura();
        expect(within(container).queryByRole('checkbox', { name: /Selecionar Todos/i })).toBeNull();
        expect(within(container).getByText('Vazio...')).toBeDefined();
        cleanup();

        montarMockUseStore(fichaComDominios({ 'Cura Teste A': { nivel: 3, categoria: 'cura' } }));
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        container = getQuadranteCura();
        expect(within(container).queryByRole('checkbox', { name: /Selecionar Todos/i })).toBeNull();
        expect(checkboxItem(container, 'Cura Teste A')).toBeDefined();
        cleanup();

        montarMockUseStore(fichaComDominios({
            'Cura Teste A': { nivel: 3, categoria: 'cura' },
            'Cura Teste B': { nivel: 2, categoria: 'cura' },
        }));
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        container = getQuadranteCura();
        expect(within(container).getByRole('checkbox', { name: /Selecionar Todos/i })).toBeDefined();
    });

    it('aplica o nível-alvo escolhido SÓ aos itens marcados, mantendo os demais com o nível original', () => {
        const dominios = {
            'Cura Teste A': { nivel: 2, categoria: 'cura' },
            'Cura Teste B': { nivel: 3, categoria: 'cura' },
            'Cura Teste C': { nivel: 4, categoria: 'cura' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        const container = getQuadranteCura();

        fireEvent.click(checkboxItem(container, 'Cura Teste A'));
        fireEvent.click(checkboxItem(container, 'Cura Teste B'));

        const massBar = massBarFor(container);
        const selectAlvo = within(massBar).getByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: '8' } });

        const botaoAplicar = within(massBar).getByRole('button', { name: /APLICAR A 2 SELECIONADO/i });
        fireEvent.click(botaoAplicar);

        expect(ficha.dominios['Cura Teste A'].nivel).toBe(8);
        expect(ficha.dominios['Cura Teste B'].nivel).toBe(8);
        expect(ficha.dominios['Cura Teste C'].nivel).toBe(4); // não marcado, inalterado

        // seleção é limpa após aplicar
        expect(within(massBar).getByRole('button', { name: /APLICAR A 0 SELECIONADO/i }).disabled).toBe(true);
        expect(checkboxItem(container, 'Cura Teste A').checked).toBe(false);
        expect(checkboxItem(container, 'Cura Teste B').checked).toBe(false);
    });

    it('"Selecionar Todos" marca e aplica o nível-alvo a TODOS os itens visíveis do quadrante', () => {
        const dominios = {
            'Cura Teste A': { nivel: 1, categoria: 'cura' },
            'Cura Teste B': { nivel: 1, categoria: 'cura' },
            'Cura Teste C': { nivel: 1, categoria: 'cura' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        const container = getQuadranteCura();

        const checkboxTodos = within(container).getByRole('checkbox', { name: /Selecionar Todos/i });
        fireEvent.click(checkboxTodos);

        expect(checkboxItem(container, 'Cura Teste A').checked).toBe(true);
        expect(checkboxItem(container, 'Cura Teste B').checked).toBe(true);
        expect(checkboxItem(container, 'Cura Teste C').checked).toBe(true);

        const massBar = massBarFor(container);
        const selectAlvo = within(massBar).getByRole('combobox');
        fireEvent.change(selectAlvo, { target: { value: '9' } });
        fireEvent.click(within(massBar).getByRole('button', { name: /APLICAR A 3 SELECIONADO/i }));

        expect(ficha.dominios['Cura Teste A'].nivel).toBe(9);
        expect(ficha.dominios['Cura Teste B'].nivel).toBe(9);
        expect(ficha.dominios['Cura Teste C'].nivel).toBe(9);
    });

    it('remover um item marcado (botão "✖") não quebra a UI e atualiza a contagem de selecionados restante', () => {
        const dominios = {
            'Cura Teste A': { nivel: 2, categoria: 'cura' },
            'Cura Teste B': { nivel: 3, categoria: 'cura' },
            'Cura Teste C': { nivel: 4, categoria: 'cura' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        let container = getQuadranteCura();

        fireEvent.click(checkboxItem(container, 'Cura Teste A'));
        fireEvent.click(checkboxItem(container, 'Cura Teste B'));

        let massBar = massBarFor(container);
        expect(within(massBar).getByRole('button', { name: /APLICAR A 2 SELECIONADO/i })).toBeDefined();

        const botaoRemover = within(itemContainerFor(container, 'Cura Teste A')).getByRole('button', { name: '✖' });
        fireEvent.click(botaoRemover);

        expect(window.confirm).toHaveBeenCalled();
        expect(ficha.dominios['Cura Teste A']).toBeUndefined();

        container = getQuadranteCura();
        expect(within(container).queryByText('Cura Teste A')).toBeNull();

        // restam 2 itens (B, C) -> a barra em massa continua visível, e só B (que não foi
        // removido) segue marcado -> "APLICAR A 1 SELECIONADO", sem lixo do item apagado.
        massBar = massBarFor(container);
        expect(within(massBar).getByRole('button', { name: /APLICAR A 1 SELECIONADO/i })).toBeDefined();
        expect(checkboxItem(container, 'Cura Teste B').checked).toBe(true);
        expect(checkboxItem(container, 'Cura Teste C').checked).toBe(false);
    });

    it('o select individual de nível de um item continua funcionando isoladamente, sem ser afetado pela seleção em massa', () => {
        const dominios = {
            'Cura Teste A': { nivel: 2, categoria: 'cura' },
            'Cura Teste B': { nivel: 3, categoria: 'cura' },
        };
        const ficha = fichaComDominios(dominios);
        montarMockUseStore(ficha);
        render(<MarcadosPanel />);
        irParaPaginaDominios();
        const container = getQuadranteCura();

        // marca só B, mas altera o nível de A pelo select individual do próprio item
        fireEvent.click(checkboxItem(container, 'Cura Teste B'));

        const selectA = selectNivelFor(container, 'Cura Teste A');
        fireEvent.change(selectA, { target: { value: '6' } });

        expect(ficha.dominios['Cura Teste A'].nivel).toBe(6);
        expect(ficha.dominios['Cura Teste B'].nivel).toBe(3); // o select individual de A não mexeu em B

        // a seleção em massa não foi afetada pelo select individual
        expect(checkboxItem(container, 'Cura Teste B').checked).toBe(true);
        expect(checkboxItem(container, 'Cura Teste A').checked).toBe(false);
    });
});
