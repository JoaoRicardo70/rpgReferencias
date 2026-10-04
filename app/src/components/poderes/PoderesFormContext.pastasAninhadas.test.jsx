import React from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Pastas aninhadas ("Taijutsu/Portões") no Grimório: salvar com pasta normalizada,
// renomearPastaForma levando subpastas, pastasExistentes com pastas-mãe e a árvore de PoderesLista.
// Mesmo padrão de mock/harness de PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        efeitosTemp: [],
        setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [],
        setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null,
        setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = usePoderesForm();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

const base = (id, nome, pasta, categoria = 'forma', extra = {}) => ({ id, nome, categoria, ativa: false, pasta, efeitos: [], efeitosPassivos: [], ...extra });

describe('salvarNovoPoder — pasta aninhada é normalizada', () => {
    it.each([
        ['Taijutsu/Portões', 'Taijutsu/Portões'],
        ['  Taijutsu / Portões  ', 'Taijutsu/Portões'],
        ['Taijutsu//Portões/', 'Taijutsu/Portões'],
        ['/Taijutsu', 'Taijutsu'],
        [' / ', ''],
        ['', ''],
    ])('criar com pasta %j grava %j', async (digitada, esperada) => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => {
            probe.setAbaAtual('habilidade');
            probe.setNomePoder('Golpe');
            probe.setDescricaoPoder('d');
            probe.setPastaPoder(digitada);
        });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].pasta).toBe(esperada);
    });

    it('funciona nas três categorias', async () => {
        for (const cat of ['forma', 'habilidade', 'poder']) {
            montarStore();
            const { unmount } = render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
            act(() => {
                probe.setAbaAtual(cat);
                probe.setNomePoder(`N-${cat}`);
                probe.setDescricaoPoder('d');
                probe.setPastaPoder(' A / B ');
            });
            await act(async () => { probe.salvarNovoPoder(); });
            expect(mockState.minhaFicha.poderes[0].pasta).toBe('A/B');
            unmount();
        }
    });

    it('editar um poder existente também normaliza a pasta', async () => {
        const poder = { id: 7, nome: 'Velho', categoria: 'habilidade', ativa: false, pasta: 'X', descricao: 'd', efeitos: [], efeitosPassivos: [] };
        montarStore({ minhaFicha: { poderes: [poder] }, poderEditandoId: 7 });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => {
            probe.setAbaAtual('habilidade');
            probe.setNomePoder('Velho');
            probe.setDescricaoPoder('d');
            probe.setPastaPoder(' Taijutsu / Portões / ');
        });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].pasta).toBe('Taijutsu/Portões');
    });
});

describe('pastasExistentes — inclui pastas-mãe', () => {
    it('"A/B" traz "A" e "A/B", ordenadas e sem duplicar', () => {
        montarStore({ minhaFicha: { poderes: [base(1, 'a', 'Taijutsu/Portões'), base(2, 'b', 'Taijutsu'), base(3, 'c', 'Água'), base(4, 'd', '')] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(probe.pastasExistentes).toEqual(['Água', 'Taijutsu', 'Taijutsu/Portões']);
    });
    it('sem pastas => []', () => {
        montarStore({ minhaFicha: { poderes: [base(1, 'a', '')] } });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(probe.pastasExistentes).toEqual([]);
    });
});

describe('renomearPastaForma — pastas aninhadas', () => {
    const fichaAninhada = () => ({
        poderes: [
            base(1, 'F1', 'Portões'),
            base(2, 'F2', 'Portões/Extra'),
            base(3, 'F3', 'Portões/Extra/Fundo'),
            base(4, 'F4', 'Portões2'),
            base(5, 'F5', 'Outra/Portões'),
            base(6, 'F6', ''),
        ],
    });

    it('mover "Portões" para "Taijutsu/Portões" leva todas as subpastas junto', () => {
        montarStore({ minhaFicha: fichaAninhada() });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.renomearPastaForma('Portões', 'Taijutsu/Portões'); });
        const p = mockState.minhaFicha.poderes.map(x => x.pasta);
        expect(p).toEqual(['Taijutsu/Portões', 'Taijutsu/Portões/Extra', 'Taijutsu/Portões/Extra/Fundo', 'Portões2', 'Outra/Portões', '']);
    });

    it('renomear subpasta pelo caminho completo não afeta a mãe nem irmãs', () => {
        montarStore({ minhaFicha: fichaAninhada() });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.renomearPastaForma('Portões/Extra', 'Portões/Bonus'); });
        expect(mockState.minhaFicha.poderes.map(x => x.pasta)).toEqual(['Portões', 'Portões/Bonus', 'Portões/Bonus/Fundo', 'Portões2', 'Outra/Portões', '']);
    });

    it('novo vazio remove a pasta: itens soltos e subpastas sobem', () => {
        montarStore({ minhaFicha: fichaAninhada() });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.renomearPastaForma('Portões', ''); });
        expect(mockState.minhaFicha.poderes.map(x => x.pasta)).toEqual(['', 'Extra', 'Extra/Fundo', 'Portões2', 'Outra/Portões', '']);
    });

    it('novo com espaços/barras duplas é normalizado', () => {
        montarStore({ minhaFicha: fichaAninhada() });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.renomearPastaForma('Portões', ' Taijutsu // Portões / '); });
        expect(mockState.minhaFicha.poderes[1].pasta).toBe('Taijutsu/Portões/Extra');
    });

    it('escopado por categoria: só move na categoria pedida', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    base(1, 'H1', 'Combos/Sub', 'habilidade'),
                    base(2, 'F1', 'Combos/Sub', 'forma'),
                    base(3, 'P1', 'Combos', 'poder'),
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.renomearPastaForma('Combos', 'Golpes/Combos', 'habilidade'); });
        expect(mockState.minhaFicha.poderes.map(x => x.pasta)).toEqual(['Golpes/Combos/Sub', 'Combos/Sub', 'Combos']);
    });

    it('sem categoria renomeia em todas', () => {
        montarStore({
            minhaFicha: { poderes: [base(1, 'H1', 'C/S', 'habilidade'), base(2, 'F1', 'C', 'forma'), base(3, 'P1', 'C/S/T', 'poder')] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        act(() => { probe.renomearPastaForma('C', 'Z'); });
        expect(mockState.minhaFicha.poderes.map(x => x.pasta)).toEqual(['Z/S', 'Z', 'Z/S/T']);
    });

    it('pasta inexistente não altera nada e não lança', () => {
        montarStore({ minhaFicha: fichaAninhada() });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        const antes = JSON.stringify(mockState.minhaFicha.poderes);
        expect(() => act(() => { probe.renomearPastaForma('Nada', 'X'); })).not.toThrow();
        expect(JSON.stringify(mockState.minhaFicha.poderes)).toBe(antes);
    });
});

describe('PoderesLista (UI) — árvore de pastas', () => {
    const fichaArvore = () => ({
        poderes: [
            base(1, 'RaizTai', 'Taijutsu'),
            base(2, 'PortaoUm', 'Taijutsu/Portões'),
            base(3, 'PortaoDois', 'Taijutsu/Portões'),
            base(4, 'Fundo', 'Taijutsu/Portões/Extra'),
            base(5, 'Ninjutsu1', 'Ninjutsu'),
            base(6, 'Solta', ''),
        ],
    });
    const abrir = () => {
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        fireEvent.click(screen.getByText('🎭 Formas'));
    };
    const botaoPasta = (container, nome) => [...container.querySelectorAll('button')].find(b => b.textContent.includes(`📁 ${nome}`));

    it('renderiza pastas aninhadas com classes pasta-no / pasta-no--sub', () => {
        montarStore({ minhaFicha: fichaArvore() });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        fireEvent.click(screen.getByText('🎭 Formas'));
        const topo = document.querySelectorAll('.pasta-no:not(.pasta-no--sub)');
        const subs = document.querySelectorAll('.pasta-no--sub');
        // Topo: Ninjutsu, Taijutsu, Sem Pasta. Subs: Portões, Extra.
        expect(topo).toHaveLength(3);
        expect(subs).toHaveLength(2);
        // Portões está DENTRO de Taijutsu
        const tai = [...topo].find(n => n.textContent.includes('📁 Taijutsu'));
        expect(tai.querySelectorAll('.pasta-no--sub')).toHaveLength(2);
        expect(within(tai).getByText('PortaoUm')).toBeDefined();
    });

    it('ordem alfabética e "Sem Pasta" por último', () => {
        montarStore({ minhaFicha: fichaArvore() });
        abrir();
        const nomes = [...document.querySelectorAll('.pasta-no:not(.pasta-no--sub)')].map(n => n.querySelector('button').textContent);
        expect(nomes[0]).toContain('Ninjutsu');
        expect(nomes[1]).toContain('Taijutsu');
        expect(nomes[2]).toContain('Sem Pasta');
    });

    it('contadores (n) incluem subpastas', () => {
        montarStore({ minhaFicha: fichaArvore() });
        abrir();
        const c = document.body;
        expect(botaoPasta(c, 'Taijutsu').textContent).toContain('(4)');
        expect(botaoPasta(c, 'Portões').textContent).toContain('(3)');
        expect(botaoPasta(c, 'Extra').textContent).toContain('(1)');
        expect(botaoPasta(c, 'Ninjutsu').textContent).toContain('(1)');
        expect(botaoPasta(c, 'Sem Pasta').textContent).toContain('(1)');
    });

    it('subpasta mostra só o rótulo (último nível), não o caminho', () => {
        montarStore({ minhaFicha: fichaArvore() });
        abrir();
        expect(botaoPasta(document.body, 'Taijutsu/Portões')).toBeUndefined();
        expect(botaoPasta(document.body, 'Portões')).toBeDefined();
    });

    it('recolher a pasta-mãe esconde itens e subpastas; reabrir devolve', () => {
        montarStore({ minhaFicha: fichaArvore() });
        abrir();
        fireEvent.click(botaoPasta(document.body, 'Taijutsu'));
        expect(screen.queryByText('RaizTai')).toBeNull();
        expect(screen.queryByText('PortaoUm')).toBeNull();
        expect(botaoPasta(document.body, 'Portões')).toBeUndefined();
        expect(screen.queryByText('Fundo')).toBeNull();
        // Outras pastas continuam
        expect(screen.getByText('Ninjutsu1')).toBeDefined();
        fireEvent.click(botaoPasta(document.body, 'Taijutsu'));
        expect(screen.getByText('PortaoUm')).toBeDefined();
        expect(screen.getByText('Fundo')).toBeDefined();
    });

    it('recolher só a subpasta esconde só os itens dela (e netas), mantendo a mãe', () => {
        montarStore({ minhaFicha: fichaArvore() });
        abrir();
        fireEvent.click(botaoPasta(document.body, 'Portões'));
        expect(screen.queryByText('PortaoUm')).toBeNull();
        expect(screen.queryByText('Fundo')).toBeNull();
        expect(screen.getByText('RaizTai')).toBeDefined();
    });

    it('✎ Renomear/Remover passa o caminho COMPLETO ao prompt e a renomearPastaForma', () => {
        const ficha = fichaArvore();
        montarStore({ minhaFicha: ficha });
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Taijutsu/Gates');
        abrir();
        const subNo = [...document.querySelectorAll('.pasta-no--sub')].find(n => n.querySelector('button').textContent.includes('Portões'));
        fireEvent.click(within(subNo).getAllByText('✎ Renomear/Remover')[0]);
        expect(promptSpy.mock.calls[0][0]).toContain('"Taijutsu/Portões"');
        expect(promptSpy.mock.calls[0][1]).toBe('Taijutsu/Portões');
        expect(ficha.poderes.map(p => p.pasta)).toEqual(['Taijutsu', 'Taijutsu/Gates', 'Taijutsu/Gates', 'Taijutsu/Gates/Extra', 'Ninjutsu', '']);
        promptSpy.mockRestore();
    });

    it('renomear a pasta-mãe pelo botão renomeia todos os caminhos filhos', () => {
        const ficha = fichaArvore();
        montarStore({ minhaFicha: ficha });
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Artes/Taijutsu');
        abrir();
        const tai = [...document.querySelectorAll('.pasta-no:not(.pasta-no--sub)')].find(n => n.querySelector('button').textContent.includes('Taijutsu'));
        fireEvent.click(tai.querySelector('div > button:nth-of-type(2)'));
        expect(ficha.poderes.map(p => p.pasta)).toEqual(['Artes/Taijutsu', 'Artes/Taijutsu/Portões', 'Artes/Taijutsu/Portões', 'Artes/Taijutsu/Portões/Extra', 'Ninjutsu', '']);
        promptSpy.mockRestore();
    });

    it('"Sem Pasta" não tem botão Renomear/Remover', () => {
        montarStore({ minhaFicha: { poderes: [base(1, 'Solta', ''), base(2, 'Dentro', 'A')] } });
        abrir();
        const sem = [...document.querySelectorAll('.pasta-no')].find(n => n.querySelector('button').textContent.includes('Sem Pasta'));
        expect(within(sem).queryByText('✎ Renomear/Remover')).toBeNull();
    });

    it('habilidades sem nenhuma pasta continuam em lista simples (sem .pasta-no)', () => {
        montarStore({ minhaFicha: { poderes: [base(1, 'Hab', '', 'habilidade')] } });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        expect(screen.getByText('Hab')).toBeDefined();
        expect(document.querySelectorAll('.pasta-no')).toHaveLength(0);
    });

    it('habilidade com pasta aninhada ativa o modo agrupado', () => {
        montarStore({ minhaFicha: { poderes: [base(1, 'Hab', 'A/B', 'habilidade')] } });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        expect(document.querySelectorAll('.pasta-no--sub')).toHaveLength(1);
    });

    it('pasta com barra solta ("A//B/ ") renderiza igual a "A/B"', () => {
        montarStore({ minhaFicha: { poderes: [base(1, 'X', ' A // B / ')] } });
        abrir();
        expect(document.querySelectorAll('.pasta-no--sub')).toHaveLength(1);
        expect(botaoPasta(document.body, 'B')).toBeDefined();
    });
});
