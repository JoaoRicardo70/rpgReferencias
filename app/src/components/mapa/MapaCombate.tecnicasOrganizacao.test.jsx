import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - Organizacao da lista de Tecnicas no Mapa: busca, UM botao recolher/expandir tudo, botao
// "★ Só ligadas (n)" (filtro, sem a antiga faixa duplicada), contador de ativas na pasta, grade de
// chips e pastas FECHADAS por padrao quando o Grimorio tem mais de 12 tecnicas (MAPA_TECNICAS_MUITAS).
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
    it('mostra a caixa de busca (aria-label "Buscar técnica"), "★ Só ligadas (n)" e UM botao Recolher tudo (pastas abertas)', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { getByLabelText, getByText, queryByText } = renderizar();
        expect(getByLabelText('Buscar técnica')).toBeTruthy();
        expect(getByText('★ Só ligadas (0)')).toBeTruthy();
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
        // o botao e UM so: nao existem os dois ao mesmo tempo
        expect(queryByText('▼ Expandir tudo')).toBeNull();
    });

    it('com todas as pastas fechadas (14 tecnicas) o MESMO botao vira "▼ Expandir tudo"', () => {
        montarStore({ minhaFicha: { poderes: gerar(14) } });
        const { getByText, queryByText } = renderizar();
        expect(getByText('▼ Expandir tudo')).toBeTruthy();
        expect(queryByText('▶ Recolher tudo')).toBeNull();
    });

    it('com pelo menos UMA pasta aberta o botao continua "Recolher tudo"', () => {
        montarStore({ minhaFicha: { poderes: gerar(14) }, pastasFechadasMapaTecnicas: { 'habilidade::Fogo': false } });
        const { getByText } = renderizar();
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
    });

    it('nao existe mais o botao separado "Expandir tudo" junto de "Recolher tudo" nem a faixa "Ligadas agora"', () => {
        montarStore({ minhaFicha: { poderes: gerar(4, i => ({ ativa: i === 0 })) } });
        const { container, queryByText } = renderizar();
        expect(queryByText(/Ligadas agora/)).toBeNull();
        expect(container.querySelector('.mapa-tecnicas-ativas')).toBeNull();
        const textos = [...container.querySelectorAll('button')].map(b => b.textContent);
        expect(textos.filter(t => /Recolher tudo|Expandir tudo/.test(t))).toHaveLength(1);
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
        expect(queryByText(/Só ligadas/)).toBeNull();
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

    it('tecnica ligada que nao casa com a busca NAO aparece (nao ha mais faixa duplicada)', () => {
        montarStore({ minhaFicha: { poderes: [poder('a', 'Ligada X', { ativa: true }), poder('b', 'Outra')] } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'outra' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Outra']);
        expect(container.textContent).not.toContain('Ligada X');
    });

    it('busca + "Só ligadas" combinam (E): so ligadas que tambem casam com o texto', () => {
        montarStore({ minhaFicha: { poderes: [
            poder('a', 'Fogo Ligado', { ativa: true }), poder('b', 'Gelo Ligado', { ativa: true }), poder('c', 'Fogo Apagado'),
        ] } });
        const { container, getByLabelText, getByText } = renderizar();
        fireEvent.click(getByText(/Só ligadas/));
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'fogo' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['★ Fogo Ligado']);
    });

    it('"Só ligadas" sem nenhuma ligada mostra "Nenhuma técnica ligada." e a busca sem resultado mostra a outra mensagem', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { container, getByLabelText, getByText } = renderizar();
        fireEvent.click(getByText(/Só ligadas/));
        expect(getByText('Nenhuma técnica ligada.')).toBeTruthy();
        expect(chips(container)).toHaveLength(0);
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'zzz' } });
        expect(getByText('Nenhuma técnica com esse nome.')).toBeTruthy();
    });
});

describe('MapaTecnicasRapidas - "★ Só ligadas (n)" e contador na pasta', () => {
    const botaoLigadas = (container) => [...container.querySelectorAll('button')].find(b => /Só ligadas/.test(b.textContent));

    it('uma tecnica ativa aparece UMA unica vez (sem a faixa duplicada)', () => {
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 })) } });
        const { container } = renderizar();
        expect(chips(container).filter(c => c.textContent === '★ Tec 1')).toHaveLength(1);
        expect(chips(container)).toHaveLength(6);
    });

    it('o botao mostra o total de ligadas e comeca com aria-pressed=false', () => {
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 || i === 4 })) } });
        const { container, getByText } = renderizar();
        expect(getByText('★ Só ligadas (2)')).toBeTruthy();
        expect(botaoLigadas(container).getAttribute('aria-pressed')).toBe('false');
        expect(botaoLigadas(container).className).not.toContain('mapa-tecnicas-mini--ativo');
    });

    it('clicar liga o filtro: aria-pressed=true, classe --ativo e so as ativas continuam na lista', () => {
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 || i === 4 })) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(botaoLigadas(container).getAttribute('aria-pressed')).toBe('true');
        expect(botaoLigadas(container).className).toContain('mapa-tecnicas-mini--ativo');
        expect(chips(container).map(c => c.textContent).sort()).toEqual(['★ Tec 1', '★ Tec 4']);
    });

    it('as ativas continuam DENTRO das suas pastas', () => {
        // gerar(6): Fogo = Tec 0..2, Gelo = Tec 3..5
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 || i === 4 })) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        const fogo = botaoPasta(container, 'Fogo').closest('.mapa-tecnicas-pasta');
        const gelo = botaoPasta(container, 'Gelo').closest('.mapa-tecnicas-pasta');
        expect([...fogo.querySelectorAll('.mapa-tecnica-chip')].map(c => c.textContent)).toEqual(['★ Tec 1']);
        expect([...gelo.querySelectorAll('.mapa-tecnica-chip')].map(c => c.textContent)).toEqual(['★ Tec 4']);
    });

    it('pasta sem nenhuma ativa some enquanto filtra', () => {
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 0 })) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(botaoPasta(container, 'Fogo')).toBeTruthy();
        expect(botaoPasta(container, 'Gelo')).toBeUndefined();
    });

    it('segundo clique desliga o filtro e volta a lista inteira', () => {
        montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 })) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(chips(container)).toHaveLength(1);
        fireEvent.click(botaoLigadas(container));
        expect(chips(container)).toHaveLength(6);
        expect(botaoLigadas(container).getAttribute('aria-pressed')).toBe('false');
    });

    it('com TODAS as pastas fechadas (14 tecnicas), filtrar abre as pastas a forca e clicar no chip alterna a tecnica', () => {
        const minhaFicha = { poderes: gerar(14, i => ({ ativa: i === 3 })) };
        montarStore({ minhaFicha });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(0);
        fireEvent.click(botaoLigadas(container));
        expect(chips(container)).toHaveLength(1);
        act(() => { chips(container)[0].click(); });
        expect(minhaFicha.poderes[3].ativa).toBe(false);
    });

    it('desligar a ultima ativa enquanto filtra mostra "Nenhuma técnica ligada." e o contador vira 0', () => {
        const minhaFicha = { poderes: gerar(4, i => ({ ativa: i === 0 })) };
        montarStore({ minhaFicha });
        const { container, getByText, rerender } = renderizar();
        fireEvent.click(botaoLigadas(container));
        act(() => { chips(container)[0].click(); });
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(getByText('Nenhuma técnica ligada.')).toBeTruthy();
        expect(getByText('★ Só ligadas (0)')).toBeTruthy();
    });

    it('enquanto filtra, clicar no cabecalho da pasta e no-op (nao grava no store nem fecha)', () => {
        const st = montarStore({ minhaFicha: { poderes: gerar(6, i => ({ ativa: i === 1 })) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        act(() => { botaoPasta(container, 'Fogo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
        expect(chips(container)).toHaveLength(1);
    });

    it('enquanto busca, clicar no cabecalho da pasta tambem e no-op', () => {
        const st = montarStore({ minhaFicha: { poderes: gerar(6) } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'Tec 1' } });
        act(() => { botaoPasta(container, 'Fogo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Tec 1']);
    });

    it('ativar "Só ligadas" nao grava nada no store de pastas e, ao desligar, as pastas voltam ao estado salvo', () => {
        const st = montarStore({ minhaFicha: { poderes: gerar(14, i => ({ ativa: i === 0 })) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
        fireEvent.click(botaoLigadas(container));
        expect(chips(container)).toHaveLength(0); // voltaram a ficar fechadas (padrao com 14)
    });

    it('cabecalho da pasta mostra "★ n" so quando ha ativas naquela pasta', () => {
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

    it('"Expandir tudo" (botao unico, aparece com TODAS fechadas) grava false para as mesmas chaves', () => {
        const todasFechadas = { 'habilidade::Fogo': true, 'forma::Selos': true, 'habilidade::Sem Pasta': true, 'poder::Sem Pasta': true };
        const st = montarStore({ minhaFicha: { poderes: poderesMistos }, pastasFechadasMapaTecnicas: todasFechadas });
        const { getByText } = renderizar();
        act(() => { getByText('▼ Expandir tudo').click(); });
        const arg = st.setPastasFechadasMapaTecnicas.mock.calls[0][0];
        expect(Object.values(arg).every(v => v === false)).toBe(true);
        expect(Object.keys(arg).sort()).toEqual(['forma::Selos', 'habilidade::Fogo', 'habilidade::Sem Pasta', 'poder::Sem Pasta']);
    });

    it('com so UMA pasta fechada o botao ainda e "Recolher tudo" (existe pasta aberta)', () => {
        montarStore({ minhaFicha: { poderes: poderesMistos }, pastasFechadasMapaTecnicas: { 'habilidade::Fogo': true } });
        const { getByText, queryByText } = renderizar();
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
        expect(queryByText('▼ Expandir tudo')).toBeNull();
    });

    it('o rotulo alterna depois de clicar (Recolher -> Expandir -> Recolher) apos re-render', () => {
        montarStore({ minhaFicha: { poderes: gerar(4) } });
        const { getByText, queryByText, rerender } = renderizar();
        act(() => { getByText('▶ Recolher tudo').click(); });
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(getByText('▼ Expandir tudo')).toBeTruthy();
        expect(queryByText('▶ Recolher tudo')).toBeNull();
        act(() => { getByText('▼ Expandir tudo').click(); });
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
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
