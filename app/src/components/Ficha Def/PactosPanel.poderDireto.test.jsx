import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PactosPanel from './PactosPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA (gap) — o novo grupo de opção "⚡ POTÊNCIA DO SCOUTER" (atributo
// 'poder_direto') foi adicionado ao seletor de atributo de buffs de PactosPanel.jsx
// (constante local ATRIBUTOS_PACTOS), espelhando ATRIBUTOS_PODERES de
// PoderesSubComponents.jsx. PactosPanel.crud.test.jsx já cobre o CRUD completo de
// Pactos, mas nenhum teste garantia especificamente que esta opção aparece no
// <select> renderido nem que escolhê-la persiste atributo:'poder_direto' no buff
// salvo em ficha.seresSelados — exatamente o dado que getPoderDiretoMultiplier
// (core/poder.js) precisa pra funcionar.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 100 },
        mana: { base: 100 },
        aura: { base: 100 },
        chakra: { base: 100 },
        corpo: { base: 100 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
        ...overrides,
    };
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
});

afterEach(() => {
    cleanup();
});

describe('PactosPanel — grupo "⚡ POTÊNCIA DO SCOUTER" (atributo poder_direto) no seletor de Buffs', () => {
    it('a optgroup "⚡ POTÊNCIA DO SCOUTER" com a option poder_direto aparece nos DOIS seletores de atributo (Buff Ativo e Buff Passivo)', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        // <optgroup label="..."> não renderiza o label como texto filho (é um atributo),
        // então getByText não enxerga a optgroup — buscamos pelo atributo "label" no DOM.
        const optgroups = document.querySelectorAll('optgroup[label="⚡ POTÊNCIA DO SCOUTER"]');
        // Um optgroup pra Buffs Ativos e outro pra Buffs Passivos (EditorEfeitos é renderizado 2x).
        expect(optgroups.length).toBe(2);

        const options = screen.getAllByText('PODER DIRETO');
        expect(options.length).toBe(2);
        options.forEach(opt => {
            expect(opt.tagName).toBe('OPTION');
            expect(opt.value).toBe('poder_direto');
            expect(opt.closest('optgroup').getAttribute('label')).toBe('⚡ POTÊNCIA DO SCOUTER');
        });
    });

    it('selecionar "PODER DIRETO" no atributo do Buff Ativo e salvar persiste atributo: "poder_direto" no efeito criado em ficha.seresSelados', () => {
        const ficha = fichaBase({ seresSelados: [] });
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        fireEvent.change(screen.getByPlaceholderText('Ex: Kurama, Sukuna, Sylphie'), { target: { value: 'Sylphie' } });

        // Primeiro select de atributo é o do editor de Buffs Ativos.
        const selectsAtributo = document.querySelectorAll('select');
        // Ordem no DOM: [atributo-ativo, propriedade-ativo, atributo-passivo, propriedade-passivo, classe]
        // -- localizamos com segurança pelo optgroup em vez de depender só do índice.
        const selectAtivo = Array.from(selectsAtributo).find(sel => Array.from(sel.querySelectorAll('option')).some(o => o.value === 'poder_direto'));
        expect(selectAtivo).toBeDefined();

        fireEvent.change(selectAtivo, { target: { value: 'poder_direto' } });
        fireEvent.change(screen.getAllByPlaceholderText('Nome do Efeito')[0], { target: { value: 'Potencia do Pacto' } });
        fireEvent.change(screen.getAllByPlaceholderText('Valor')[0], { target: { value: '2.0' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        fireEvent.click(screen.getByText('+ FORJAR PACTO'));

        expect(ficha.seresSelados.length).toBe(1);
        expect(ficha.seresSelados[0].efeitos).toHaveLength(1);
        expect(ficha.seresSelados[0].efeitos[0]).toMatchObject({
            nome: 'Potencia do Pacto',
            atributo: 'poder_direto',
            propriedade: 'base',
            valor: '2.0',
        });
    });
});
