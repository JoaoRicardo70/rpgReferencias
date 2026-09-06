import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesFormEditor, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFirebaseImediato, uploadImagem } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — 🥋 Maestria em Formas, agora vivendo direto em ficha.poderes[] (categoria='forma'),
// wireada por PoderesFormContext.jsx/PoderesSubComponents.jsx (ver core/fadiga.test.js para a
// matemática do desconto de Fadiga em si — este arquivo só cobre o CRUD/UI da Maestria).
//
// Mesmo padrão de mock de useStore de PoderesPanel.test.jsx, mas usando o Provider real (não
// mockando o Context) + um Harness (probe) pra manipular estado local diretamente quando
// necessário — mesmo padrão de MapaFormContext.descansarDanoRapido.test.jsx.
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

afterEach(() => {
    cleanup();
});

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Bloco 1 — salvarNovoPoder(): a Maestria só é gravada quando abaAtual === 'forma'
// ---------------------------------------------------------------------------
describe('PoderesFormContext — salvarNovoPoder(): Maestria só é salva na aba "forma"', () => {
    it('criar um poder novo com a aba "🎭 Formas" ativa e Maestria preenchida salva categoria=forma e maestria correta', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Bankai Selado');
            probe.setDescricaoPoder('Uma forma mística.');
            probe.setMaestriaPoder(80);
        });

        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        const novo = mockState.minhaFicha.poderes[0];
        expect(novo.nome).toBe('Bankai Selado');
        expect(novo.categoria).toBe('forma');
        expect(novo.maestria).toBe(80);
    });

    // 🎓 Habilidades TAMBÉM ganharam Maestria própria (pedido do usuário: "algumas Habilidades
    // podem requerer certo nível de Maestria afim de não gerar gasto/Fadiga") — diferente da
    // Maestria de FORMA (sustentar uma transformação ativa), aqui é "o quanto o personagem já
    // domina ESTA Habilidade específica" comparado contra maestriaRequerida (ver
    // core/fadiga.js > calcularGanhoFadigaMaestriaInsuficiente). fadigaPorUso continua exclusivo
    // de Forma; Pasta, por outro lado, deixou de ser exclusiva de Forma (pedido do usuário pra
    // organizar Habilidades/Poderes em pastas também, ver pastasExistentes/renomearPastaForma).
    it('criar um poder novo na aba "🗡️ Habilidades" grava maestria/maestriaRequerida/pasta (mas NÃO fadigaPorUso, exclusivo de Forma)', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('habilidade');
            probe.setNomePoder('Golpe Rápido');
            probe.setDescricaoPoder('Um golpe físico.');
            probe.setMaestriaPoder(80);
            probe.setMaestriaRequeridaPoder(50);
            probe.setPastaPoder('Combos Físicos');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        const novo = mockState.minhaFicha.poderes[0];
        expect(novo.categoria).toBe('habilidade');
        expect(novo.maestria).toBe(80);
        expect(novo.maestriaRequerida).toBe(50);
        expect('fadigaPorUso' in novo).toBe(false);
        expect(novo.pasta).toBe('Combos Físicos');
    });

    it('criar um poder novo na aba "✨ Poderes" também NÃO grava maestria', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('poder');
            probe.setNomePoder('Rajada de Energia');
            probe.setDescricaoPoder('Um poder ofensivo.');
            probe.setMaestriaPoder(55);
        });

        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect(novo.categoria).toBe('poder');
        expect('maestria' in novo).toBe(false);
    });

    it('Maestria digitada fora do intervalo [0,100] é clampada no momento de salvar (150 -> 100, -20 -> 0)', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Forma A');
            probe.setDescricaoPoder('desc');
            probe.setMaestriaPoder(150);
        });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0].maestria).toBe(100);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Forma B');
            probe.setDescricaoPoder('desc');
            probe.setMaestriaPoder(-20);
        });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[1].maestria).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Bloco 2 — editarPoder(): pré-preenchimento de maestriaPoder ao abrir edição
// ---------------------------------------------------------------------------
describe('PoderesFormContext — editarPoder(): pré-preenchimento da Maestria', () => {
    it('editar uma Forma existente com maestria=0 pré-preenche maestriaPoder com 0', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'F0', categoria: 'forma', ativa: false, maestria: 0, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(1); });

        expect(probe.maestriaPoder).toBe(0);
        expect(probe.abaAtual).toBe('forma');
    });

    it('editar uma Forma existente com maestria=65 pré-preenche maestriaPoder com esse valor', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 2, nome: 'F65', categoria: 'forma', ativa: false, maestria: 65, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(2); });

        expect(probe.maestriaPoder).toBe(65);
    });

    it('editar uma Forma legada SEM o campo maestria (undefined) pré-preenche maestriaPoder com 0 (fallback)', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 3, nome: 'FLegada', categoria: 'forma', ativa: false, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(3); });

        expect(probe.maestriaPoder).toBe(0);
    });

    it('cancelarEdicaoPoder() reseta maestriaPoder de volta pra 0', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 4, nome: 'F80', categoria: 'forma', ativa: false, maestria: 80, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(4); });
        expect(probe.maestriaPoder).toBe(80);

        act(() => { probe.cancelarEdicaoPoder(); });
        expect(probe.maestriaPoder).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Bloco 3 — trocar categoria durante a edição e salvar: deleta p.maestria (categorias sem
// nenhum uso de Maestria) ou a REINTERPRETA (Habilidade, que agora também tem a sua própria)
// ---------------------------------------------------------------------------
describe('PoderesFormContext — salvarNovoPoder() no caminho de EDIÇÃO: trocar a categoria pra longe de "forma" apaga p.maestria', () => {
    it('editar uma Forma com maestria definida, trocar a categoria pra "poder" (sem nenhum uso de Maestria) e salvar remove p.maestria do poder existente, sem lançar', async () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 5, nome: 'Forma X', descricao: 'Uma forma armada.', categoria: 'forma', ativa: false, maestria: 70, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(5); });
        expect(probe.maestriaPoder).toBe(70);
        expect(mockState.minhaFicha.poderes[0].maestria).toBe(70);

        // Simula a troca de categoria durante a edição diretamente pelo contexto (a UI de
        // navegação por abas cancela a edição ao trocar de aba — ver PoderesNavegacaoLivro — então
        // este é um teste de caixa-branca da lógica defensiva de salvarNovoPoder em si, cobrindo o
        // branch "else delete ficha.poderes[ix].maestria" pedido no code review). "poder" não usa
        // Maestria nenhuma (diferente de "habilidade", que agora tem a sua própria — ver o teste
        // seguinte), então continua batendo nesse branch de delete.
        act(() => { probe.setAbaAtual('poder'); });

        expect(() => { act(() => { probe.salvarNovoPoder(); }); }).not.toThrow();
        // precisa esperar o salvarFirebaseImediato().then(...) resolver
        await act(async () => { await Promise.resolve(); });

        const editado = mockState.minhaFicha.poderes.find(p => p.id === 5);
        expect(editado.categoria).toBe('poder');
        expect('maestria' in editado).toBe(false);
    });

    it('editar uma Forma com maestria definida, trocar a categoria pra "habilidade" REINTERPRETA maestria (não apaga) e adiciona maestriaRequerida', async () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 6, nome: 'Forma Y', descricao: 'Outra forma.', categoria: 'forma', ativa: false, maestria: 70, fadigaPorUso: 20, pasta: 'X', efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(6); });
        act(() => { probe.setAbaAtual('habilidade'); probe.setMaestriaRequeridaPoder(40); });

        await act(async () => { probe.salvarNovoPoder(); });
        await act(async () => { await Promise.resolve(); });

        const editado = mockState.minhaFicha.poderes.find(p => p.id === 6);
        expect(editado.categoria).toBe('habilidade');
        expect(editado.maestria).toBe(70); // carregado da Forma, agora reinterpretado como Maestria da Habilidade
        expect(editado.maestriaRequerida).toBe(40);
        // fadigaPorUso continua exclusivo de Forma — precisa ser removido ao trocar de categoria.
        expect('fadigaPorUso' in editado).toBe(false);
        // Pasta NÃO é mais exclusiva de Forma — continua no poder mesmo depois de virar Habilidade.
        expect(editado.pasta).toBe('X');
    });
});

// ---------------------------------------------------------------------------
// Bloco 4 — UI: o input de Maestria aparece nas abas "forma" E "habilidade" (cada uma com o seu
// próprio conjunto de campos — Formas: Maestria + Fadiga por Uso; Habilidades: Maestria +
// Maestria Requerida), NUNCA na aba "poder". Pasta aparece em TODAS as abas (não é mais exclusiva
// de Forma).
// ---------------------------------------------------------------------------
describe('PoderesFormEditor (UI) — os campos de Maestria aparecem nas abas "forma" e "habilidade", nunca em "poder"', () => {
    it('aba "🗡️ Habilidades" (padrão) mostra Maestria E Maestria Requerida, mas NÃO Fadiga por Uso (exclusivo de Forma); Pasta continua visível', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        expect(screen.getByText(/🎓 Maestria \(%\)/)).toBeDefined();
        expect(screen.getByText(/Maestria Requerida/i)).toBeDefined();
        expect(screen.queryByText(/Fadiga por Uso/i)).toBeNull();
        expect(screen.getByText(/Pasta \(Opc\.\)/i)).toBeDefined();
    });

    it('digitar 150 no campo de Maestria Requerida (aba Habilidades) clampa visualmente pra 100, e -20 clampa pra 0', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        const getInput = () => screen.getByText(/Maestria Requerida/i).closest('div').querySelector('input');

        fireEvent.change(getInput(), { target: { value: '150' } });
        expect(getInput().value).toBe('100');

        fireEvent.change(getInput(), { target: { value: '-20' } });
        expect(getInput().value).toBe('0');
    });

    it('clicar na aba "🎭 Formas" faz o campo de Maestria aparecer', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/Maestria \(%\)/i)).toBeDefined();
    });

    it('clicar na aba "✨ Poderes" NÃO mostra o campo de Maestria', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('✨ Poderes'));

        expect(screen.queryByText(/Maestria/i)).toBeNull();
    });

    it('digitar 150 no campo de Maestria clampa visualmente para 100, e -20 clampa para 0 (onChange controlado)', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));
        // Vários inputs numéricos começam em "0" (Qtd Dados, Custo, Área...) — escopa a busca ao
        // <div> que contém especificamente o label "Maestria (%)".
        const getMaestriaInput = () => screen.getByText(/Maestria \(%\)/i).closest('div').querySelector('input');

        fireEvent.change(getMaestriaInput(), { target: { value: '150' } });
        expect(getMaestriaInput().value).toBe('100');

        fireEvent.change(getMaestriaInput(), { target: { value: '-20' } });
        expect(getMaestriaInput().value).toBe('0');
    });
});

// ---------------------------------------------------------------------------
// Bloco 5 — UI: badge somente-leitura "🥋 X% MAESTRIA" na lista de Poderes
// ---------------------------------------------------------------------------
describe('PoderesLista (UI) — badge "🥋 X% MAESTRIA" só aparece pra Forma (case-insensitive) com maestria > 0', () => {
    it('exibe o badge para um poder categoria="forma" com maestria=42', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Forma Dourada', categoria: 'forma', ativa: true, maestria: 42, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/42% MAESTRIA/)).toBeDefined();
    });

    it('reconhece categoria em caixa mista ("Forma") pro badge', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Forma Mista', categoria: 'Forma', ativa: true, maestria: 33, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/33% MAESTRIA/)).toBeDefined();
    });

    it('NÃO exibe o badge quando maestria=0', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Forma Crua', categoria: 'forma', ativa: true, maestria: 0, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.queryByText(/MAESTRIA/)).toBeNull();
    });

    it('NÃO exibe o badge quando maestria está ausente (legado/undefined)', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Forma Legada', categoria: 'forma', ativa: true, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.queryByText(/MAESTRIA/)).toBeNull();
    });

    it('NÃO exibe o badge pra uma categoria que não é Forma, mesmo com um campo maestria residual/legado > 0', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Habilidade X', categoria: 'habilidade', ativa: true, maestria: 90, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        // Item categoria "habilidade" só aparece listado na aba "habilidade" (aba padrão já é essa).

        expect(screen.getByText('Habilidade X')).toBeDefined();
        expect(screen.queryByText(/MAESTRIA/)).toBeNull();
    });
});
