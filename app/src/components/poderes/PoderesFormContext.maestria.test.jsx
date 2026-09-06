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

    // 🎓 Poderes ganharam a MESMA Maestria de Habilidades (pedido do usuário: paridade entre as
    // 3 categorias — Formas/Habilidades/Poderes) — mesma conta de maestria/maestriaRequerida,
    // sem fadigaPorUso (exclusivo de Forma).
    it('criar um poder novo na aba "✨ Poderes" grava maestria/maestriaRequerida/pasta, igual Habilidades (mas NÃO fadigaPorUso)', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('poder');
            probe.setNomePoder('Rajada de Energia');
            probe.setDescricaoPoder('Um poder ofensivo.');
            probe.setMaestriaPoder(55);
            probe.setMaestriaRequeridaPoder(30);
            probe.setPastaPoder('Ofensivos');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect(novo.categoria).toBe('poder');
        expect(novo.maestria).toBe(55);
        expect(novo.maestriaRequerida).toBe(30);
        expect('fadigaPorUso' in novo).toBe(false);
        expect(novo.pasta).toBe('Ofensivos');
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
// Bloco 3 — trocar categoria durante a edição e salvar: as 3 categorias reais (Forma/Habilidade/
// Poder) TODAS usam Maestria hoje, então trocar entre elas REINTERPRETA p.maestria (nunca apaga);
// só uma categoria desconhecida/legada (fora das 3) cai no branch defensivo de delete.
// ---------------------------------------------------------------------------
describe('PoderesFormContext — salvarNovoPoder() no caminho de EDIÇÃO: trocar de categoria reinterpreta Maestria (Forma/Habilidade/Poder), só uma categoria desconhecida apaga', () => {
    it('editar uma Forma com maestria definida, trocar a categoria pra "poder" REINTERPRETA maestria (não apaga) e adiciona maestriaRequerida — Poder tem a mesma Maestria de Habilidade', async () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 5, nome: 'Forma X', descricao: 'Uma forma armada.', categoria: 'forma', ativa: false, maestria: 70, fadigaPorUso: 20, pasta: 'X', efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(5); });
        expect(probe.maestriaPoder).toBe(70);
        expect(mockState.minhaFicha.poderes[0].maestria).toBe(70);

        act(() => { probe.setAbaAtual('poder'); probe.setMaestriaRequeridaPoder(35); });

        expect(() => { act(() => { probe.salvarNovoPoder(); }); }).not.toThrow();
        // precisa esperar o salvarFirebaseImediato().then(...) resolver
        await act(async () => { await Promise.resolve(); });

        const editado = mockState.minhaFicha.poderes.find(p => p.id === 5);
        expect(editado.categoria).toBe('poder');
        expect(editado.maestria).toBe(70); // carregado da Forma, agora reinterpretado como Maestria do Poder
        expect(editado.maestriaRequerida).toBe(35);
        // fadigaPorUso continua exclusivo de Forma — precisa ser removido ao trocar de categoria.
        expect('fadigaPorUso' in editado).toBe(false);
        // Pasta NÃO é mais exclusiva de Forma — continua no poder mesmo depois de virar Poder.
        expect(editado.pasta).toBe('X');
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

    // -------------------------------------------------------------------------
    // QA — o branch defensivo "else delete maestria/maestriaRequerida/fadigaPorUso" só é
    // alcançável hoje por uma categoria FORA das 3 reais (dado legado/corrompido, já que a UI
    // normal (PoderesNavegacaoLivro) só oferece forma/habilidade/poder) — teste de caixa-branca
    // confirmando que esse branch de segurança continua funcionando sem lançar.
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // QA — direção INVERSA da já coberta acima (Forma -> Poder/Habilidade): editar um Poder
    // existente (que já tem maestria/maestriaRequerida) e trocar a categoria pra "forma". Forma
    // não usa maestriaRequerida (deve ser removida) e precisa ganhar fadigaPorUso (campo que
    // Poder nunca teve) — confirma que a reinterpretação de `maestria` é simétrica nos dois
    // sentidos, não só Forma -> Poder.
    // -------------------------------------------------------------------------
    it('editar um Poder existente com maestria/maestriaRequerida definidas, trocar a categoria pra "forma" REINTERPRETA maestria, REMOVE maestriaRequerida e ADICIONA fadigaPorUso', async () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 8, nome: 'Rajada Base', descricao: 'Um poder ofensivo.', categoria: 'poder', ativa: false, maestria: 60, maestriaRequerida: 45, pasta: 'Ofensivos', efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(8); });
        expect(probe.maestriaPoder).toBe(60);
        expect(probe.maestriaRequeridaPoder).toBe(45);
        // fadigaPorUsoPoder é pré-preenchido com o padrão 15 quando o Poder original não tinha o campo.
        expect(probe.fadigaPorUsoPoder).toBe(15);

        act(() => { probe.setAbaAtual('forma'); });

        await act(async () => { probe.salvarNovoPoder(); });
        await act(async () => { await Promise.resolve(); });

        const editado = mockState.minhaFicha.poderes.find(p => p.id === 8);
        expect(editado.categoria).toBe('forma');
        expect(editado.maestria).toBe(60); // carregado do Poder, agora reinterpretado como Maestria da Forma
        expect('maestriaRequerida' in editado).toBe(false); // Forma não usa esse campo
        expect(editado.fadigaPorUso).toBe(15); // campo novo que Poder nunca teve, adicionado ao virar Forma
        expect(editado.pasta).toBe('Ofensivos'); // Pasta não é exclusiva de nenhuma categoria
    });

    it('trocar pra uma categoria desconhecida/legada (fora de forma/habilidade/poder) apaga maestria/maestriaRequerida/fadigaPorUso, sem lançar', async () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 7, nome: 'Forma Z', descricao: 'desc', categoria: 'forma', ativa: false, maestria: 70, fadigaPorUso: 20, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(7); });
        // Categoria fora das 3 abas reais — só alcançável via chamada direta ao contexto (a UI
        // normal nunca oferece isso), simulando dado legado/corrompido.
        act(() => { probe.setAbaAtual('legado'); });

        expect(() => { act(() => { probe.salvarNovoPoder(); }); }).not.toThrow();
        await act(async () => { await Promise.resolve(); });

        const editado = mockState.minhaFicha.poderes.find(p => p.id === 7);
        expect(editado.categoria).toBe('legado');
        expect('maestria' in editado).toBe(false);
        expect('maestriaRequerida' in editado).toBe(false);
        expect('fadigaPorUso' in editado).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Bloco 4 — UI: o input de Maestria aparece nas 3 abas (Formas/Habilidades/Poderes), cada uma
// com o seu próprio conjunto de campos — Formas: Maestria + Fadiga por Uso; Habilidades e
// Poderes: Maestria + Maestria Requerida (idêntico entre os dois — Poderes ganharam a mesma
// Maestria de Habilidades). Pasta aparece em TODAS as abas (não é mais exclusiva de Forma).
// ---------------------------------------------------------------------------
describe('PoderesFormEditor (UI) — os campos de Maestria aparecem nas 3 abas, cada uma com seu conjunto (Forma: +Fadiga por Uso; Habilidade/Poder: +Maestria Requerida)', () => {
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

    it('clicar na aba "✨ Poderes" mostra Maestria E Maestria Requerida, mas NÃO Fadiga por Uso (exclusivo de Forma) — igual Habilidades', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('✨ Poderes'));

        expect(screen.getByText(/🎓 Maestria \(%\)/)).toBeDefined();
        expect(screen.getByText(/Maestria Requerida/i)).toBeDefined();
        expect(screen.queryByText(/Fadiga por Uso/i)).toBeNull();
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

// ---------------------------------------------------------------------------
// Bloco 5b — UI: bloco "🎓 Maestria: X%/Y% requerida" na Central de Disparo (dentro de
// "PREPARAR AÇÃO"), pra categoria "poder" — os testes de Bloco 5 acima só cobrem o badge "🥋
// MAESTRIA" (exclusivo de Forma); este bloco é o OUTRO "Maestria" (habilidade/poder), que até
// agora só era coberto indiretamente na lógica pura de dispararAtaque, nunca no texto renderizado.
// ---------------------------------------------------------------------------
describe('PoderesLista (UI) — bloco "🎓 Maestria: X%/Y% requerida" na Central de Disparo, pra categoria "poder"', () => {
    function prepararEAbrirDisparo(nome) {
        fireEvent.click(screen.getByText('✨ Poderes'));
        fireEvent.click(screen.getByText('⚔️ PREPARAR AÇÃO'));
    }

    it('Poder com maestria ABAIXO da maestriaRequerida mostra "abaixo do requisito" em laranja', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 20, nome: 'Rajada Fraca', categoria: 'poder', ativa: false, maestria: 20, maestriaRequerida: 80, custoPercentual: 0, dadosQtd: 1, dadosFaces: 6, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        prepararEAbrirDisparo();

        expect(screen.getByText(/🎓 Maestria: 20% \/ 80% requerida/)).toBeDefined();
        expect(screen.getByText(/abaixo do requisito, gera Fadiga extra ao usar/)).toBeDefined();
    });

    it('Poder com maestria IGUAL ou ACIMA da maestriaRequerida mostra "dominada, sem Fadiga extra"', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 21, nome: 'Rajada Dominada', categoria: 'poder', ativa: false, maestria: 90, maestriaRequerida: 80, custoPercentual: 0, dadosQtd: 1, dadosFaces: 6, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        prepararEAbrirDisparo();

        expect(screen.getByText(/🎓 Maestria: 90% \/ 80% requerida/)).toBeDefined();
        expect(screen.getByText(/dominada, sem Fadiga extra/)).toBeDefined();
    });

    it('Poder com maestriaRequerida=0 (sem requisito) NÃO mostra o bloco de Maestria na Central de Disparo', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 22, nome: 'Poder Livre', categoria: 'poder', ativa: false, maestria: 10, maestriaRequerida: 0, custoPercentual: 0, dadosQtd: 1, dadosFaces: 6, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        prepararEAbrirDisparo();

        expect(screen.queryByText(/🎓 Maestria:/)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Bloco 6 — togglePoder(): ligar/desligar um Poder é completamente alheio aos campos de Maestria
// (maestria/maestriaRequerida) — o "Escudo Anti-Drenagem" só mexe em ativa + nas barras vitais
// proporcionais, nunca deveria resetar ou alterar a Maestria configurada no Poder/Habilidade.
// ---------------------------------------------------------------------------
describe('PoderesFormContext — togglePoder(): alternar ativa/inativa não afeta os campos de Maestria', () => {
    it('togglePoder em um Poder com maestria/maestriaRequerida definidas alterna só o campo "ativa", preservando ambos os campos intactos', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 9, nome: 'Rajada Estável', categoria: 'poder', ativa: false, maestria: 55, maestriaRequerida: 30, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.togglePoder(9); });

        const poder = mockState.minhaFicha.poderes.find(p => p.id === 9);
        expect(poder.ativa).toBe(true);
        expect(poder.maestria).toBe(55);
        expect(poder.maestriaRequerida).toBe(30);
    });

    it('togglePoder duas vezes seguidas (ligar e desligar) devolve ativa ao estado original, sem tocar na Maestria', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 10, nome: 'Golpe Estudado', categoria: 'habilidade', ativa: false, maestria: 70, maestriaRequerida: 90, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.togglePoder(10); });
        act(() => { probe.togglePoder(10); });

        const poder = mockState.minhaFicha.poderes.find(p => p.id === 10);
        expect(poder.ativa).toBe(false);
        expect(poder.maestria).toBe(70);
        expect(poder.maestriaRequerida).toBe(90);
    });

    it('togglePoder chama salvarFichaSilencioso (não Firebase imediato), sem lançar mesmo sem atributos/vitais na ficha', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 11, nome: 'Poder Cru', categoria: 'poder', ativa: false, maestria: 20, maestriaRequerida: 10, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => { act(() => { probe.togglePoder(11); }); }).not.toThrow();
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFirebaseImediato).not.toHaveBeenCalled();

        const poder = mockState.minhaFicha.poderes.find(p => p.id === 11);
        expect(poder.maestria).toBe(20);
        expect(poder.maestriaRequerida).toBe(10);
    });
});
