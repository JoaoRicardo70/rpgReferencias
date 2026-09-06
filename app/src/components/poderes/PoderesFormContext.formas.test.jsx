import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesFormEditor, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFirebaseImediato, uploadImagem } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — 😮‍💨 Fadiga por Uso (forma.fadigaPorUso) e 🗂️ Pasta (p.pasta), introduzidos junto com o
// limiar dinâmico de Maestria (ver core/fadiga.test.js para a matemática) — este arquivo cobre só
// o CRUD/UI deles em PoderesFormContext.jsx/PoderesSubComponents.jsx, incluindo
// renomearPastaForma(). Mesmo padrão de mock/harness de PoderesFormContext.maestria.test.jsx.
//
// Fadiga por Uso continua exclusiva de Forma. Pasta, por outro lado, deixou de ser exclusiva de
// Forma (pedido do usuário: organizar Habilidades e Poderes em pastas também, não só Formas) —
// os testes abaixo refletem essa mudança; a aba Forma continua sendo a ÚNICA que agrupa por pasta
// INCONDICIONALMENTE (preserva o "📁 Sem Pasta" pra quem nunca usou pastas lá), enquanto
// Habilidades/Poderes só agrupam se algum item da aba já tiver uma pasta atribuída.
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
// Bloco 1 — salvarNovoPoder(): fadigaPorUso e pasta só são gravados na aba "forma"
// ---------------------------------------------------------------------------
describe('PoderesFormContext — salvarNovoPoder(): fadigaPorUso é exclusivo de "forma"; pasta é salva em qualquer aba', () => {
    it('criar uma Forma nova com fadigaPorUso e pasta preenchidos salva os dois campos corretamente', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Bankai Selado');
            probe.setDescricaoPoder('Uma forma mística.');
            probe.setFadigaPorUsoPoder(30);
            probe.setPastaPoder('Transformações');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect(novo.fadigaPorUso).toBe(30);
        expect(novo.pasta).toBe('Transformações');
    });

    it('criar uma Forma nova SEM tocar em fadigaPorUso salva o padrão de 15 (valor inicial do estado)', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Forma Padrão');
            probe.setDescricaoPoder('desc');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes[0].fadigaPorUso).toBe(15);
        expect(mockState.minhaFicha.poderes[0].pasta).toBe('');
    });

    it('pasta com espaços em branco nas pontas é gravada já com .trim() aplicado', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Forma Espaçada');
            probe.setDescricaoPoder('desc');
            probe.setPastaPoder('  Bankais  ');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes[0].pasta).toBe('Bankais');
    });

    it('fadigaPorUso negativo é clampado para 0 no momento de salvar', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('forma');
            probe.setNomePoder('Forma Negativa');
            probe.setDescricaoPoder('desc');
            probe.setFadigaPorUsoPoder(-40);
        });

        await act(async () => { probe.salvarNovoPoder(); });

        expect(mockState.minhaFicha.poderes[0].fadigaPorUso).toBe(0);
    });

    it('criar um poder novo na aba "🗡️ Habilidades" NÃO grava fadigaPorUso (exclusivo de Forma), mas GRAVA pasta normalmente', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('habilidade');
            probe.setNomePoder('Golpe Rápido');
            probe.setDescricaoPoder('Um golpe físico.');
            probe.setFadigaPorUsoPoder(30);
            probe.setPastaPoder('Bankais');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect('fadigaPorUso' in novo).toBe(false);
        expect(novo.pasta).toBe('Bankais');
    });

    it('criar um poder novo na aba "✨ Poderes" também NÃO grava fadigaPorUso, mas GRAVA pasta normalmente', async () => {
        montarStore();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => {
            probe.setAbaAtual('poder');
            probe.setNomePoder('Rajada de Energia');
            probe.setDescricaoPoder('desc');
            probe.setFadigaPorUsoPoder(25);
            probe.setPastaPoder('X');
        });

        await act(async () => { probe.salvarNovoPoder(); });

        const novo = mockState.minhaFicha.poderes[0];
        expect('fadigaPorUso' in novo).toBe(false);
        expect(novo.pasta).toBe('X');
    });
});

// ---------------------------------------------------------------------------
// Bloco 2 — editarPoder(): pré-preenchimento de fadigaPorUsoPoder/pastaPoder
// ---------------------------------------------------------------------------
describe('PoderesFormContext — editarPoder(): pré-preenchimento de Fadiga por Uso e Pasta', () => {
    it('editar uma Forma existente com fadigaPorUso=30 e pasta="Bankais" pré-preenche os dois campos', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, fadigaPorUso: 30, pasta: 'Bankais', efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(1); });

        expect(probe.fadigaPorUsoPoder).toBe(30);
        expect(probe.pastaPoder).toBe('Bankais');
    });

    it('editar uma Forma legada SEM fadigaPorUso nem pasta (undefined) pré-preenche fadigaPorUsoPoder com o padrão 15 e pastaPoder com string vazia', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 2, nome: 'FLegada', categoria: 'forma', ativa: false, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(2); });

        expect(probe.fadigaPorUsoPoder).toBe(15);
        expect(probe.pastaPoder).toBe('');
    });

    it('editar uma Forma com fadigaPorUso=0 (explicitamente zero) pré-preenche fadigaPorUsoPoder com 0, não com o padrão 15 (distingue "0" de "ausente")', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 3, nome: 'F0', categoria: 'forma', ativa: false, fadigaPorUso: 0, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(3); });

        expect(probe.fadigaPorUsoPoder).toBe(0);
    });

    it('cancelarEdicaoPoder() reseta fadigaPorUsoPoder de volta pro padrão 15 e pastaPoder para string vazia', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 4, nome: 'F4', categoria: 'forma', ativa: false, fadigaPorUso: 45, pasta: 'X', efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(4); });
        expect(probe.fadigaPorUsoPoder).toBe(45);
        expect(probe.pastaPoder).toBe('X');

        act(() => { probe.cancelarEdicaoPoder(); });
        expect(probe.fadigaPorUsoPoder).toBe(15);
        expect(probe.pastaPoder).toBe('');
    });
});

// ---------------------------------------------------------------------------
// Bloco 3 — trocar categoria durante a edição e salvar: deleta fadigaPorUso (exclusivo de Forma),
// mas PRESERVA a pasta (não é mais exclusiva de nenhuma categoria)
// ---------------------------------------------------------------------------
describe('PoderesFormContext — salvarNovoPoder() no caminho de EDIÇÃO: trocar a categoria pra longe de "forma" apaga fadigaPorUso, mas preserva a pasta', () => {
    it('editar uma Forma com fadigaPorUso/pasta definidos, trocar a categoria e salvar remove fadigaPorUso mas MANTÉM a pasta no poder existente, sem lançar', async () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 5, nome: 'Forma X', descricao: 'desc', categoria: 'forma', ativa: false, fadigaPorUso: 20, pasta: 'Bankais', efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.editarPoder(5); });
        expect(probe.fadigaPorUsoPoder).toBe(20);
        expect(probe.pastaPoder).toBe('Bankais');

        act(() => { probe.setAbaAtual('poder'); });

        expect(() => { act(() => { probe.salvarNovoPoder(); }); }).not.toThrow();
        await act(async () => { await Promise.resolve(); });

        const editado = mockState.minhaFicha.poderes.find(p => p.id === 5);
        expect(editado.categoria).toBe('poder');
        expect('fadigaPorUso' in editado).toBe(false);
        expect(editado.pasta).toBe('Bankais');
    });
});

// ---------------------------------------------------------------------------
// Bloco 4 — renomearPastaForma(pastaAntiga, pastaNova)
// ---------------------------------------------------------------------------
describe('PoderesFormContext — renomearPastaForma(): renomeia/remove uma pasta em lote', () => {
    it('renomeia TODAS as Formas que compartilham a pasta antiga para o novo nome', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'F2', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                    { id: 3, nome: 'F3', categoria: 'forma', ativa: false, pasta: 'Outra Pasta' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', 'Bankais Definitivos'); });

        const [f1, f2, f3] = mockState.minhaFicha.poderes;
        expect(f1.pasta).toBe('Bankais Definitivos');
        expect(f2.pasta).toBe('Bankais Definitivos');
        // Forma em outra pasta permanece intocada.
        expect(f3.pasta).toBe('Outra Pasta');
    });

    it('renomear para string vazia limpa a pasta (Forma passa a não ter pasta nenhuma / cai em "Sem Pasta" na UI)', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', ''); });

        expect(mockState.minhaFicha.poderes[0].pasta).toBe('');
    });

    it('renomear para uma string só com espaços também limpa a pasta (aplica .trim())', () => {
        montarStore({
            minhaFicha: {
                poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' }],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', '   '); });

        expect(mockState.minhaFicha.poderes[0].pasta).toBe('');
    });

    it('Formas em OUTRAS pastas não são tocadas', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'F2', categoria: 'forma', ativa: false, pasta: 'Selados' },
                    { id: 3, nome: 'F3', categoria: 'forma', ativa: false }, // sem pasta nenhuma
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', 'Novo Nome'); });

        const [, f2, f3] = mockState.minhaFicha.poderes;
        expect(f2.pasta).toBe('Selados');
        expect(f3.pasta).toBeUndefined();
    });

    it('renomeia poderes de QUALQUER categoria (habilidade/poder/forma) que compartilhem a pasta — Pasta não é mais exclusiva de Forma', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'H1', categoria: 'habilidade', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'P1', categoria: 'poder', ativa: false, pasta: 'Bankais' },
                    { id: 3, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', 'Novo Nome'); });

        const [h1, p1, f1] = mockState.minhaFicha.poderes;
        expect(h1.pasta).toBe('Novo Nome');
        expect(p1.pasta).toBe('Novo Nome');
        expect(f1.pasta).toBe('Novo Nome');
    });

    it('não lança quando ficha.poderes está ausente/vazio', () => {
        montarStore({ minhaFicha: {} });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => { act(() => { probe.renomearPastaForma('Bankais', 'Nova'); }); }).not.toThrow();

        montarStore({ minhaFicha: { poderes: [] } });
        cleanup();
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        expect(() => { act(() => { probe.renomearPastaForma('Bankais', 'Nova'); }); }).not.toThrow();
    });

    it('renomear uma pasta que não existe em nenhuma Forma não afeta nada e não lança', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' }] },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => { act(() => { probe.renomearPastaForma('Pasta Inexistente', 'Nova'); }); }).not.toThrow();
        expect(mockState.minhaFicha.poderes[0].pasta).toBe('Bankais');
    });

    // -------------------------------------------------------------------------
    // QA — 3º parâmetro `categoria`: escopa a operação a uma única categoria (a UI sempre passa
    // `abaAtual`, ver renomearOuRemoverPasta em PoderesSubComponents.jsx). Cobre gaps: categoria
    // que não bate com NENHUM poder (typo/categoria vazia de itens), case-insensitividade do match
    // quando escopado, e o rename "no-op" pro mesmo nome.
    // -------------------------------------------------------------------------
    it('chamar com uma `categoria` que não corresponde a NENHUM poder (typo) não renomeia nada e não lança', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'H1', categoria: 'habilidade', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => {
            act(() => { probe.renomearPastaForma('Bankais', 'Novo Nome', 'categoriaQueNaoExiste'); });
        }).not.toThrow();

        const [h1, f1] = mockState.minhaFicha.poderes;
        expect(h1.pasta).toBe('Bankais');
        expect(f1.pasta).toBe('Bankais');
    });

    it('chamar com uma `categoria` cujo valor tem ZERO poderes na ficha (ex: "poder" quando só existem habilidade/forma) não renomeia nada', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'H1', categoria: 'habilidade', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', 'Novo Nome', 'poder'); });

        const [h1, f1] = mockState.minhaFicha.poderes;
        expect(h1.pasta).toBe('Bankais');
        expect(f1.pasta).toBe('Bankais');
    });

    it('o match de `categoria` é case-insensitive: escopar para "HABILIDADE" (maiúsculo) ainda encontra um poder salvo com categoria "habilidade" (minúsculo)', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'H1', categoria: 'habilidade', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', 'Novo Nome', 'HABILIDADE'); });

        const [h1, f1] = mockState.minhaFicha.poderes;
        expect(h1.pasta).toBe('Novo Nome');
        // A Forma na mesma pasta não é afetada, já que o escopo foi só "habilidade".
        expect(f1.pasta).toBe('Bankais');
    });

    it('o match também funciona no sentido inverso: p.categoria salvo em CAIXA MISTA ("Habilidade") ainda bate com um `categoria` minúsculo passado pela UI', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'H1', categoria: 'Habilidade', ativa: false, pasta: 'Bankais' },
                    { id: 2, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' },
                ],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        act(() => { probe.renomearPastaForma('Bankais', 'Novo Nome', 'habilidade'); });

        const [h1, f1] = mockState.minhaFicha.poderes;
        expect(h1.pasta).toBe('Novo Nome');
        expect(f1.pasta).toBe('Bankais');
    });

    it('renomear uma pasta para o MESMO nome que ela já tem (no-op) não lança e mantém a pasta idêntica', () => {
        montarStore({
            minhaFicha: {
                poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais' }],
            },
        });
        render(<PoderesFormProvider><Harness /></PoderesFormProvider>);

        expect(() => {
            act(() => { probe.renomearPastaForma('Bankais', 'Bankais'); });
        }).not.toThrow();

        expect(mockState.minhaFicha.poderes[0].pasta).toBe('Bankais');
    });
});

// ---------------------------------------------------------------------------
// Bloco 5 — UI: campo "😮‍💨 Fadiga por Uso" só aparece na aba "forma"; "🗂️ Pasta" aparece em
// TODAS as abas (deixou de ser exclusiva de Forma)
// ---------------------------------------------------------------------------
describe('PoderesFormEditor (UI) — "😮‍💨 Fadiga por Uso" é exclusivo de "forma"; "🗂️ Pasta" aparece em qualquer aba', () => {
    it('aba "🗡️ Habilidades" (padrão) NÃO mostra Fadiga por Uso, mas MOSTRA o campo Pasta', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        expect(screen.queryByText(/Fadiga por Uso/i)).toBeNull();
        expect(screen.getByText(/Pasta \(Opc\.\)/i)).toBeDefined();
    });

    it('clicar na aba "🎭 Formas" faz os dois campos aparecerem', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/Fadiga por Uso/i)).toBeDefined();
        expect(screen.getByText(/Pasta \(Opc\.\)/i)).toBeDefined();
    });

    it('clicar na aba "✨ Poderes" NÃO mostra Fadiga por Uso, mas MOSTRA o campo Pasta', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('✨ Poderes'));

        expect(screen.queryByText(/Fadiga por Uso/i)).toBeNull();
        expect(screen.getByText(/Pasta \(Opc\.\)/i)).toBeDefined();
    });

    it('digitar -40 no campo de Fadiga por Uso clampa visualmente para 0 (onChange controlado)', () => {
        montarStore();
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesFormEditor /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));
        const getInput = () => screen.getByText(/Fadiga por Uso/i).closest('div').querySelector('input');

        fireEvent.change(getInput(), { target: { value: '-40' } });
        expect(getInput().value).toBe('0');
    });
});

// ---------------------------------------------------------------------------
// Bloco 6 — UI: badge "😮‍💨 X FADIGA/USO" (exclusivo de Forma) e agrupamento por pasta na
// PoderesLista — Formas sempre agrupam (mesmo sem nenhuma pasta usada, preserva o bucket "Sem
// Pasta" de sempre); Habilidades/Poderes só agrupam se algum item da aba já tiver pasta.
// ---------------------------------------------------------------------------
describe('PoderesLista (UI) — badge de Fadiga por Uso (exclusivo de Forma) e agrupamento por pasta', () => {
    it('exibe o badge "😮‍💨 X FADIGA/USO" para uma Forma com fadigaPorUso definido', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Forma X', categoria: 'forma', ativa: true, fadigaPorUso: 25, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/25 FADIGA\/USO/)).toBeDefined();
    });

    it('exibe o badge com o padrão 15 quando fadigaPorUso está ausente (legado)', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Forma Legada', categoria: 'forma', ativa: true, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/15 FADIGA\/USO/)).toBeDefined();
    });

    it('NÃO exibe o badge de Fadiga/Uso para uma categoria que não é Forma', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'Habilidade X', categoria: 'habilidade', ativa: true, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        expect(screen.getByText('Habilidade X')).toBeDefined();
        expect(screen.queryByText(/FADIGA\/USO/)).toBeNull();
    });

    it('agrupa Formas por pasta em ordem alfabética, com "Sem Pasta" sempre por último', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'Zeta', categoria: 'forma', ativa: false, pasta: 'Zulu', efeitos: [], efeitosPassivos: [] },
                    { id: 2, nome: 'Alfa', categoria: 'forma', ativa: false, pasta: 'Alpha', efeitos: [], efeitosPassivos: [] },
                    { id: 3, nome: 'SemPasta', categoria: 'forma', ativa: false, efeitos: [], efeitosPassivos: [] },
                ],
            },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        const cabecalhos = screen.getAllByText(/📁/).map(el => el.closest('button').textContent);
        expect(cabecalhos.length).toBe(3);
        expect(cabecalhos[0]).toContain('Alpha');
        expect(cabecalhos[1]).toContain('Zulu');
        expect(cabecalhos[2]).toContain('Sem Pasta');
    });

    it('habilidades continuam em lista simples (sem cabeçalhos 📁) enquanto NENHUMA delas tiver pasta atribuída', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'Habilidade A', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [] },
                    { id: 2, nome: 'Habilidade B', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [] },
                ],
            },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        // Aba padrão já é "habilidade" — nenhuma tem pasta, então nenhum cabeçalho deve aparecer.
        expect(screen.queryByText(/📁/)).toBeNull();
        expect(screen.getByText('Habilidade A')).toBeDefined();
        expect(screen.getByText('Habilidade B')).toBeDefined();
    });

    it('habilidades passam a ser agrupadas por pasta assim que alguma delas tiver uma pasta atribuída (Pasta deixou de ser exclusiva de Forma)', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'Habilidade A', categoria: 'habilidade', ativa: false, pasta: 'X', efeitos: [], efeitosPassivos: [] },
                    { id: 2, nome: 'Habilidade B', categoria: 'habilidade', ativa: false, pasta: 'Y', efeitos: [], efeitosPassivos: [] },
                ],
            },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        const cabecalhos = screen.getAllByText(/📁/).map(el => el.closest('button').textContent);
        expect(cabecalhos.some(t => t.includes('X'))).toBe(true);
        expect(cabecalhos.some(t => t.includes('Y'))).toBe(true);
        expect(screen.getByText('Habilidade A')).toBeDefined();
        expect(screen.getByText('Habilidade B')).toBeDefined();
    });

    it('clicar em "✎ Renomear/Remover" chama renomearPastaForma com o nome da pasta clicada e o valor digitado no prompt', () => {
        const ficha = { poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais', efeitos: [], efeitosPassivos: [] }] };
        montarStore({ minhaFicha: ficha });
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Bankais V2');

        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        fireEvent.click(screen.getByText('🎭 Formas'));

        fireEvent.click(screen.getByText('✎ Renomear/Remover'));

        expect(promptSpy).toHaveBeenCalled();
        expect(mockState.updateFicha).toHaveBeenCalled();
        expect(ficha.poderes[0].pasta).toBe('Bankais V2');

        promptSpy.mockRestore();
    });

    // -------------------------------------------------------------------------
    // QA (code-review) — renomear pela UI é escopado à categoria (aba) atual: uma Habilidade e
    // uma Forma reusando o mesmo nome de pasta NÃO devem se afetar quando o usuário renomeia a
    // partir de uma aba específica. Também confere que o texto do prompt reflete a categoria
    // certa (não fica preso em "Formas" quando renomeado a partir de Habilidades/Poderes).
    // -------------------------------------------------------------------------
    it('renomear pela UI na aba Habilidades só afeta Habilidades — uma Forma com a MESMA pasta fica intocada', () => {
        const ficha = {
            poderes: [
                { id: 1, nome: 'Golpe Rápido', categoria: 'habilidade', ativa: false, pasta: 'Combos', efeitos: [], efeitosPassivos: [] },
                { id: 2, nome: 'Forma X', categoria: 'forma', ativa: false, pasta: 'Combos', efeitos: [], efeitosPassivos: [] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Combos V2');

        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        fireEvent.click(screen.getByText('🗡️ Habilidades'));

        fireEvent.click(screen.getByText('✎ Renomear/Remover'));

        // O texto do prompt fala em "Habilidades", não em "Formas" (aba errada).
        expect(promptSpy.mock.calls[0][0]).toContain('as Habilidades');
        expect(promptSpy.mock.calls[0][0]).not.toContain('Formas');

        expect(ficha.poderes[0].pasta).toBe('Combos V2'); // Habilidade renomeada
        expect(ficha.poderes[1].pasta).toBe('Combos'); // Forma com o mesmo nome, intocada

        promptSpy.mockRestore();
    });

    it('cancelar o prompt (retorno null) NÃO chama renomearPastaForma/updateFicha', () => {
        const ficha = { poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, pasta: 'Bankais', efeitos: [], efeitosPassivos: [] }] };
        montarStore({ minhaFicha: ficha });
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
        fireEvent.click(screen.getByText('🎭 Formas'));

        fireEvent.click(screen.getByText('✎ Renomear/Remover'));

        expect(promptSpy).toHaveBeenCalled();
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        expect(ficha.poderes[0].pasta).toBe('Bankais');

        promptSpy.mockRestore();
    });

    it('bucket "Sem Pasta" NÃO exibe o botão "✎ Renomear/Remover" (não é uma pasta de verdade)', () => {
        montarStore({
            minhaFicha: { poderes: [{ id: 1, nome: 'F1', categoria: 'forma', ativa: false, efeitos: [], efeitosPassivos: [] }] },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        fireEvent.click(screen.getByText('🎭 Formas'));

        expect(screen.getByText(/Sem Pasta/)).toBeDefined();
        expect(screen.queryByText('✎ Renomear/Remover')).toBeNull();
    });

    // -------------------------------------------------------------------------
    // QA — namespacing do collapse-state (`${abaAtual}::${nome}`, era só `nome` antes): uma pasta
    // "Combos" na aba Habilidades e uma pasta "Combos" na aba Formas (mesmo nome, categorias
    // diferentes) devem ter estado de recolhido/expandido TOTALMENTE independente. Sem o fix, as
    // duas compartilhariam a mesma chave "Combos" em `pastasFechadas` e recolher uma recolheria a
    // outra também.
    // -------------------------------------------------------------------------
    it('recolher a pasta "Combos" na aba Habilidades NÃO recolhe a pasta "Combos" (mesmo nome) na aba Formas', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 1, nome: 'Golpe Rápido', categoria: 'habilidade', ativa: false, pasta: 'Combos', efeitos: [], efeitosPassivos: [] },
                    { id: 2, nome: 'Bankai', categoria: 'forma', ativa: false, pasta: 'Combos', efeitos: [], efeitosPassivos: [] },
                ],
            },
        });
        render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);

        // Aba padrão já é Habilidades — a pasta "Combos" começa expandida.
        expect(screen.getByText('Golpe Rápido')).toBeDefined();

        // Recolhe "Combos" na aba Habilidades.
        fireEvent.click(screen.getByText(/📁 Combos/));
        expect(screen.queryByText('Golpe Rápido')).toBeNull();

        // Muda para a aba Formas — a pasta "Combos" de lá deve continuar EXPANDIDA, pois o estado
        // de collapse agora é namespaced por aba ("habilidade::Combos" != "forma::Combos").
        fireEvent.click(screen.getByText('🎭 Formas'));
        expect(screen.getByText('Bankai')).toBeDefined();

        // Voltando pra Habilidades, "Combos" continua recolhida (o toggle de lá não foi afetado).
        fireEvent.click(screen.getByText('🗡️ Habilidades'));
        expect(screen.queryByText('Golpe Rápido')).toBeNull();
    });
});
