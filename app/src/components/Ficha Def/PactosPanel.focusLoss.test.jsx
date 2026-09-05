import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PactosPanel from './PactosPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — REGRESSÃO: PactosPanel.jsx > EditorEfeitos definido INSIDE do corpo de
// PactosPanel (bug real encontrado em teste manual) fazia o React desmontar
// e remontar toda a subárvore do editor de buffs a cada tecla digitada,
// derrubando o foco do <input> "Nome do Efeito" e embaralhando a digitação
// (ex: "Bencao do Vento" virava "Bencao Bencao do Ventodo Vento").
//
// Corrigido movendo EditorEfeitos pra escopo de módulo (fora de PactosPanel),
// recebendo addEfeito/removeEfeito por prop, em vez de fechar sobre o state
// do componente pai via closure recriada a cada render.
//
// Este arquivo digita caractere-por-caractere via fireEvent.change (o projeto
// não tem @testing-library/user-event instalado — ver package.json) e afirma
// que o valor final do input é EXATAMENTE a string completa digitada, sem
// duplicação/truncamento/embaralhamento.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 100 }, mana: { base: 100 }, aura: { base: 100 }, chakra: { base: 100 }, corpo: { base: 100 },
        divisores: {}, bio: {}, estetica: {}, labels: {},
        seresSelados: [],
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

// Simula digitação real MANTENDO A MESMA referência de nó do <input> do início
// ao fim (exatamente como uma automação real de teclado ‑ userEvent.type,
// Playwright .type(), digitação humana real ‑ segura o elemento focado UMA vez
// e despacha eventos nele conforme o usuário digita, sem re-consultar o DOM a
// cada tecla). Se o EditorEfeitos remonta a cada tecla (bug original: definido
// DENTRO do corpo de PactosPanel, então uma nova identidade de componente por
// render faz o React desmontar/remontar o <input>), esta referência antiga
// fica ÓRFÃ (removida da árvore conectada ao root do React) e os eventos
// disparados nela deixam de alcançar o listener delegado do React — o estado
// do formulário para de progredir a partir da tecla que causou o primeiro
// remount, exatamente a classe de bug (perda/embaralhamento de digitação) que
// a correção (mover EditorEfeitos pra escopo de módulo) elimina.
function digitar(input, textoCompleto) {
    let acumulado = '';
    for (const char of textoCompleto) {
        acumulado += char;
        fireEvent.change(input, { target: { value: acumulado } });
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});

afterEach(() => {
    cleanup();
});

describe('PactosPanel — EditorEfeitos NÃO perde foco/embaralha digitação (regressão do bug de componente inline)', () => {
    it('digitar "Bencao do Vento" caractere-por-caractere no campo "Nome do Efeito" resulta EXATAMENTE em "Bencao do Vento"', () => {
        const ficha = fichaBase();
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        const input = screen.getAllByPlaceholderText('Nome do Efeito')[0];
        digitar(input, 'Bencao do Vento');

        // Re-consulta o DOM (não a referência antiga que pode ter ficado órfã se
        // o componente remontou) pra afirmar o que o JOGADOR realmente veria na
        // tela ao final da digitação.
        const inputFinal = screen.getAllByPlaceholderText('Nome do Efeito')[0];
        expect(inputFinal.value).toBe('Bencao do Vento');
    });

    it('digitar um nome longo com espaços e acentos permanece intacto (sem duplicação de trechos)', () => {
        const ficha = fichaBase();
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        const input = screen.getAllByPlaceholderText('Nome do Efeito')[1]; // editor de Buffs Passivos
        const texto = 'Proteção Ancestral do Domínio Selado';
        digitar(input, texto);

        const inputFinal = screen.getAllByPlaceholderText('Nome do Efeito')[1];
        expect(inputFinal.value).toBe(texto);
    });

    it('o valor digitado sobrevive e é o que efetivamente é salvo como buff ao clicar em "+"', () => {
        const ficha = fichaBase();
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        const input = screen.getAllByPlaceholderText('Nome do Efeito')[0];
        digitar(input, 'Bencao do Vento');
        fireEvent.change(screen.getAllByPlaceholderText('Valor')[0], { target: { value: '5' } });
        fireEvent.click(screen.getAllByText('+')[0]);

        expect(screen.getByText(/Bencao do Vento:/)).toBeDefined();
        expect(screen.queryByText(/Bencao Bencao do Ventodo Vento/)).toBeNull();
    });

    it('a identidade do nó <input> "Nome do Efeito" é PRESERVADA entre teclas (React reaproveita o mesmo elemento DOM, não remonta a subárvore a cada render)', () => {
        const ficha = fichaBase();
        montarMockUseStore(ficha);
        render(<PactosPanel />);

        const inputAntes = screen.getAllByPlaceholderText('Nome do Efeito')[0];
        fireEvent.change(inputAntes, { target: { value: 'B' } });
        fireEvent.change(inputAntes, { target: { value: 'Be' } });

        const inputDepois = screen.getAllByPlaceholderText('Nome do Efeito')[0];
        expect(inputDepois).toBe(inputAntes);
    });
});
