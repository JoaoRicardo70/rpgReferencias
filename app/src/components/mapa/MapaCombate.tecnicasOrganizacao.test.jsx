import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - Organizacao da lista de Tecnicas no Mapa: busca, recolher/expandir tudo, faixa
// "Ligadas agora", contador de ativas na pasta, grade de chips e pastas FECHADAS por padrao
// quando o Grimorio tem mais de 12 tecnicas (MAPA_TECNICAS_MUITAS).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [], inventario: [] },
        meuNome: 'Heroi', isMestre: true, personagens: {},
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-mapa', feedCombate: [], alvoSelecionado: null, dummies: {},
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(), itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(), efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn(),
        elemEditandoId: null, setElemEditandoId: vi.fn(),
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        pastasFechadasMapaTecnicas: {},
        setPastasFechadasMapaTecnicas: vi.fn((mapa) => { mockState.pastasFechadasMapaTecnicas = mapa; }),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

const poder = (id, nome, extra = {}) => ({ id, nome, categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {}, ...extra });
// n tecnicas divididas em duas pastas: "Fogo" (primeiras metade+) e "Gelo" (resto)
function gerar(n, extraPorIndice = () => ({})) {
    return Array.from({ length: n }, (_, i) => poder(`p${i}`, `Tec ${i}`, { pasta: i < Math.ceil(n / 2) ? 'Fogo' : 'Gelo', ...extraPorIndice(i) }));
}
const renderizar = () => render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
const chips = (container) => [...container.querySelectorAll('.mapa-tecnica-chip')];
const botaoPasta = (container, nome) => [...container.querySelectorAll('button')].find(b => b.textContent.includes(`📁 ${nome}`));

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaTecnicasRapidas - estrutura', () => {
    it('mostra a caixa de busca (aria-label "Buscar técnica") e os botoes Recolher/Expandir tudo', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { getByLabelText, getByText } = renderizar();
        expect(getByLabelText('Buscar técnica')).toBeTruthy();
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
        expect(getByText('▼ Expandir tudo')).toBeTruthy();
    });

    it('chips ficam dentro de uma .mapa-tecnicas-grade (com e sem pasta)', () => {
        montarStore({ minhaFicha: { poderes: [poder('a', 'Sem Pasta Tec'), ...gerar(2)] } });
        const { container } = renderizar();
        expect(container.querySelectorAll('.mapa-tecnicas-grade').length).toBeGreaterThanOrEqual(2);
        chips(container).forEach(c => expect(c.closest('.mapa-tecnicas-grade')).not.toBeNull());
    });

    it('lista vazia: sem busca nem botoes (so a dica)', () => {
        montarStore({ minhaFicha: { poderes: [] } });
        const { queryByLabelText, queryByText } = renderizar();
        expect(queryByLabelText('Buscar técnica')).toBeNull();
        expect(queryByText('▶ Recolher tudo')).toBeNull();
    });
});

describe('MapaTecnicasRapidas - busca', () => {
    const lista = [
        poder('1', 'Bola de Fogo', { pasta: 'Elementais' }),
        poder('2', 'Raio de Gelo', { pasta: 'Elementais' }),
        poder('3', 'Cura Menor', { pasta: 'Suporte' }),
        poder('4', 'Sem Pasta Alguma'),
    ];

    it('filtra por nome (sem diferenciar maiusculas) e mostra so os chips que casam', () => {
        montarStore({ minhaFicha: { poderes: lista } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'bOlA' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Bola de Fogo']);
    });

    it('filtra tambem pelo nome da pasta', () => {
        montarStore({ minhaFicha: { poderes: lista } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'suporte' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Cura Menor']);
    });

    it('espacos nas pontas sao ignorados; so espacos equivale a sem filtro', () => {
        montarStore({ minhaFicha: { poderes: lista } });
        const { container, getByLabelText, queryByText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: '  gelo  ' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Raio de Gelo']);
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: '   ' } });
        expect(chips(container)).toHaveLength(4);
        expect(queryByText(/Nenhuma técnica com esse nome/)).toBeNull();
    });

    it('sem resultados mostra "Nenhuma técnica com esse nome." e nenhum chip', () => {
        montarStore({ minhaFicha: { poderes: lista } });
        const { container, getByLabelText, getByText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'zzzz' } });
        expect(getByText('Nenhuma técnica com esse nome.')).toBeTruthy();
        expect(chips(container)).toHaveLength(0);
    });

    it('caracteres especiais de regex nao quebram a busca (texto literal)', () => {
        montarStore({ minhaFicha: { poderes: lista } });
        const { container, getByLabelText } = renderizar();
        expect(() => fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: '.*[(' } })).not.toThrow();
        expect(chips(container)).toHaveLength(0);
    });

    it('busca com acento/Unicode (nome "Técnica Ágil")', () => {
        montarStore({ minhaFicha: { poderes: [poder('u', 'Técnica Ágil 🔥')] } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'ágil' } });
        expect(chips(container)).toHaveLength(1);
    });

    it('poder sem nome nem pasta (undefined) nao quebra a busca', () => {
        montarStore({ minhaFicha: { poderes: [poder('x', undefined), poder('y', 'Alvo')] } });
        const { container, getByLabelText } = renderizar();
        expect(() => fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'alvo' } })).not.toThrow();
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Alvo']);
    });

    it('durante a busca as pastas ficam ABERTAS mesmo que estejam marcadas como fechadas', () => {
        montarStore({
            minhaFicha: { poderes: lista },
            pastasFechadasMapaTecnicas: { 'habilidade::Elementais': true, 'habilidade::Suporte': true },
        });
        const { container, getByLabelText } = renderizar();
        expect(chips(container)).toHaveLength(1); // so a "Sem Pasta Alguma" (as outras pastas estao fechadas)
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'cura' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Cura Menor']);
    });

    it('com mais de 12 tecnicas (pastas fechadas por padrao), buscar abre as pastas com resultado', () => {
        montarStore({ minhaFicha: { poderes: gerar(14) } });
        const { container, getByLabelText } = renderizar();
        expect(chips(container)).toHaveLength(0);
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'Tec 13' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Tec 13']);
    });

    it('buscar nao grava nada no store de pastas (nao polui a preferencia salva)', () => {
        const st = montarStore({ minhaFicha: { poderes: lista } });
        const { getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'fogo' } });
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
    });

    it('tecnica ligada que nao casa com a busca continua na faixa "Ligadas agora"', () => {
        montarStore({ minhaFicha: { poderes: [poder('a', 'Ligada X', { ativa: true }), poder('b', 'Outra')] } });
        const { container, getByLabelText, getByText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'outra' } });
        expect(getByText('★ Ligadas agora (1)')).toBeTruthy();
        expect(container.querySelector('.mapa-tecnicas-ativas').textContent).toContain('Ligada X');
    });
});

describe('MapaTecnicasRapidas - faixa "Ligadas agora" e contador na pasta', () => {
    it('sem tecnicas ativas nao mostra a faixa', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { container, queryByText } = renderizar();
        expect(container.querySelector('.mapa-tecnicas-ativas')).toBeNull();
        expect(queryByText(/Ligadas agora/)).toBeNull();
    });

    it('mostra "★ Ligadas agora (n)" com os chips das ativas', () => {
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 || i === 4 })) } });
        const { container, getByText } = renderizar();
        expect(getByText('★ Ligadas agora (2)')).toBeTruthy();
        const faixa = container.querySelector('.mapa-tecnicas-ativas');
        expect([...faixa.querySelectorAll('.mapa-tecnica-chip')].map(c => c.textContent).sort()).toEqual(['★ Tec 1', '★ Tec 4']);
    });

    it('a faixa aparece mesmo com TODAS as pastas fechadas, e clicar no chip dela alterna a tecnica', () => {
        const minhaFicha = { poderes: gerar(14, i => ({ ativa: i === 3 })) };
        montarStore({ minhaFicha });
        const { container } = renderizar();
        const faixa = container.querySelector('.mapa-tecnicas-ativas');
        expect(faixa.querySelectorAll('.mapa-tecnica-chip')).toHaveLength(1);
        act(() => { faixa.querySelector('.mapa-tecnica-chip').click(); });
        expect(minhaFicha.poderes[3].ativa).toBe(false);
    });

    it('cabecalho da pasta mostra "★ n" so quando ha ativas naquela pasta', () => {
        // gerar(6): Fogo = Tec 0..2, Gelo = Tec 3..5; liga 2 em Fogo e 0 em Gelo
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 0 || i === 2 })) } });
        const { container } = renderizar();
        expect(botaoPasta(container, 'Fogo').textContent).toContain('★ 2');
        expect(botaoPasta(container, 'Gelo').textContent).not.toContain('★');
        expect(botaoPasta(container, 'Fogo').querySelector('.mapa-tecnicas-pasta-ligadas')).not.toBeNull();
    });

    it('o contador aparece tambem com a pasta fechada', () => {
        montarStore({ minhaFicha: { poderes: gerar(14, i => ({ ativa: i === 0 })) } });
        const { container } = renderizar();
        expect(botaoPasta(container, 'Fogo').textContent).toContain('★ 1');
        expect(botaoPasta(container, 'Fogo').textContent).toContain('▶');
    });
});

describe('MapaTecnicasRapidas - pastas fechadas por padrao quando ha muitas tecnicas', () => {
    it('exatamente 12 tecnicas: pastas ABERTAS por padrao', () => {
        montarStore({ minhaFicha: { poderes: gerar(12) } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(12);
        expect(botaoPasta(container, 'Fogo').textContent).toContain('▼');
    });

    it('13 tecnicas: pastas FECHADAS por padrao (so os cabecalhos)', () => {
        montarStore({ minhaFicha: { poderes: gerar(13) } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(0);
        expect(botaoPasta(container, 'Fogo').textContent).toContain('▶');
        expect(botaoPasta(container, 'Gelo').textContent).toContain('▶');
    });

    it('a escolha do usuario vence o padrao: com 13, so a pasta marcada como aberta mostra chips', () => {
        montarStore({ minhaFicha: { poderes: gerar(13) }, pastasFechadasMapaTecnicas: { 'habilidade::Fogo': false } });
        const { container } = renderizar();
        const nomes = chips(container).map(c => c.textContent);
        expect(nomes).toHaveLength(7); // Fogo = ceil(13/2) = 7
        expect(botaoPasta(container, 'Fogo').textContent).toContain('▼');
        expect(botaoPasta(container, 'Gelo').textContent).toContain('▶');
    });

    it('a escolha do usuario vence o padrao: com 4 tecnicas, pasta marcada como fechada some os chips', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) }, pastasFechadasMapaTecnicas: { 'habilidade::Fogo': true } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(2); // so Gelo
    });

    it('clicar numa pasta fechada-por-padrao ABRE (grava false no store, mantendo as outras chaves)', () => {
        const st = montarStore({ minhaFicha: { poderes: gerar(14) }, pastasFechadasMapaTecnicas: { 'forma::Outra': true } });
        const { container } = renderizar();
        act(() => { botaoPasta(container, 'Fogo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'forma::Outra': true, 'habilidade::Fogo': false });
    });

    it('clicar numa pasta aberta-por-padrao FECHA (grava true)', () => {
        const st = montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { container } = renderizar();
        act(() => { botaoPasta(container, 'Gelo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'habilidade::Gelo': true });
    });

    it('tecnicas fora de pasta (sem agrupamento) nao somem com muitas tecnicas', () => {
        const poderes = Array.from({ length: 15 }, (_, i) => poder(`s${i}`, `Solta ${i}`));
        montarStore({ minhaFicha: { poderes } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(15);
    });
});

describe('MapaTecnicasRapidas - Recolher tudo / Expandir tudo', () => {
    const poderesMistos = [
        poder('1', 'A1', { pasta: 'Fogo' }),
        poder('2', 'A2', { pasta: 'Fogo' }),
        poder('3', 'F1', { categoria: 'forma', pasta: 'Selos' }),
        poder('4', 'P1', { categoria: 'poder' }),
        poder('5', 'H2', { pasta: '  ' }),
        { id: '6', nome: 'Sem categoria', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} },
    ];

    it('"Recolher tudo" grava true para toda chave categoria::pasta existente (Sem Pasta para vazio/espacos, categoria padrao poder)', () => {
        const st = montarStore({ minhaFicha: { poderes: poderesMistos } });
        const { getByText } = renderizar();
        act(() => { getByText('▶ Recolher tudo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledTimes(1);
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({
            'habilidade::Fogo': true,
            'forma::Selos': true,
            'poder::Sem Pasta': true,
            'habilidade::Sem Pasta': true,
        });
    });

    it('"Expandir tudo" grava false para as mesmas chaves', () => {
        const st = montarStore({ minhaFicha: { poderes: poderesMistos }, pastasFechadasMapaTecnicas: { 'habilidade::Fogo': true } });
        const { getByText } = renderizar();
        act(() => { getByText('▼ Expandir tudo').click(); });
        const arg = st.setPastasFechadasMapaTecnicas.mock.calls[0][0];
        expect(Object.values(arg).every(v => v === false)).toBe(true);
        expect(Object.keys(arg).sort()).toEqual(['forma::Selos', 'habilidade::Fogo', 'habilidade::Sem Pasta', 'poder::Sem Pasta']);
    });

    it('com 14 tecnicas, "Expandir tudo" faz os chips aparecerem apos re-render', () => {
        const st = montarStore({ minhaFicha: { poderes: gerar(14) } });
        const { container, getByText, rerender } = renderizar();
        expect(chips(container)).toHaveLength(0);
        act(() => { getByText('▼ Expandir tudo').click(); });
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(st.pastasFechadasMapaTecnicas).toEqual({ 'habilidade::Fogo': false, 'habilidade::Gelo': false });
        expect(chips(container)).toHaveLength(14);
    });

    it('com 4 tecnicas, "Recolher tudo" esconde os chips apos re-render', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { container, getByText, rerender } = renderizar();
        expect(chips(container)).toHaveLength(4);
        act(() => { getByText('▶ Recolher tudo').click(); });
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(chips(container)).toHaveLength(0);
    });
});
