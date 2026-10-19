import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas, MapaMagiasElementais } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import { ElementosFormProvider, cores as ELEMENTOS_CORES } from '../arsenal/ElementosFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - Categorias recolhiveis (Formas/Habilidades/Poderes) em MapaTecnicasRapidas
// (chave `categoria::<cat>` em pastasFechadasMapaTecnicas) e cor por elemento em
// MapaMagiasElementais (classes --elemento e variavel CSS --cor-elemento).
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
        minhaFicha: { poderes: [], inventario: [], ataquesElementais: [] },
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
    useStore.getState = () => mockState;
    return mockState;
}

const poder = (id, nome, extra = {}) => ({ id, nome, categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {}, ...extra });
const renderizar = () => render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
const botaoCat = (container, texto) => [...container.querySelectorAll('button.mapa-tecnicas-categoria')].find(b => b.textContent.includes(texto));
const botaoPasta = (container, nome) => [...container.querySelectorAll('button.mapa-tecnicas-pasta-topo')].find(b => b.textContent.includes(`📁 ${nome}`));
const nomesChips = (container) => [...container.querySelectorAll('.mapa-tecnica-chip')].map(c => c.textContent.replace(/^[★☆]\s*/, ''));

const ficha = () => ({
    poderes: [
        poder('1', 'HabA', { pasta: 'Taijutsu' }),
        poder('2', 'HabB'),
        poder('3', 'PodA', { categoria: 'poder', pasta: 'Fogo' }),
        poder('4', 'PodB', { categoria: 'poder' }),
        poder('5', 'FormaA', { categoria: 'forma' }),
    ],
    inventario: [],
});

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('categoria recolhivel: botao', () => {
    it('renderiza botoes com aria-expanded=true, seta aria-hidden e contagem', () => {
        montarStore({ minhaFicha: ficha() });
        const { container } = renderizar();
        const btn = botaoCat(container, 'Habilidades');
        expect(btn.tagName).toBe('BUTTON');
        expect(btn.getAttribute('type')).toBe('button');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(btn.querySelector('.mapa-categoria-seta').getAttribute('aria-hidden')).toBe('true');
        expect(btn.querySelector('.mapa-categoria-seta').textContent).toBe('▼');
        expect(btn.querySelector('.mapa-categoria-total').textContent).toBe('(2)');
        expect(botaoCat(container, 'Poderes').querySelector('.mapa-categoria-total').textContent).toBe('(2)');
        expect(botaoCat(container, 'Formas').querySelector('.mapa-categoria-total').textContent).toBe('(1)');
    });

    it('categoria salva como fechada nasce recolhida (aria-expanded=false, seta ▶, sem conteudo)', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::habilidade': true } });
        const { container } = renderizar();
        const btn = botaoCat(container, 'Habilidades');
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        expect(btn.querySelector('.mapa-categoria-seta').textContent).toBe('▶');
        expect(btn.querySelector('.mapa-categoria-total').textContent).toBe('(2)');
        expect(botaoPasta(container, 'Taijutsu')).toBeUndefined();
        expect(nomesChips(container).sort()).toEqual(['FormaA', 'PodA', 'PodB']);
    });

    it('categoria salva com false fica aberta', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::habilidade': false } });
        const { container } = renderizar();
        expect(botaoCat(container, 'Habilidades').getAttribute('aria-expanded')).toBe('true');
    });

    it('categoria nasce aberta mesmo com mais de 12 tecnicas (padrao de pasta fechada nao se aplica)', () => {
        const muitas = Array.from({ length: 14 }, (_, i) => poder(`m${i}`, `Mu${i}`));
        montarStore({ minhaFicha: { poderes: muitas } });
        const { container } = renderizar();
        expect(botaoCat(container, 'Habilidades').getAttribute('aria-expanded')).toBe('true');
    });
});

describe('categoria recolhivel: clique', () => {
    it.each([['Formas', 'categoria::forma'], ['Habilidades', 'categoria::habilidade'], ['Poderes', 'categoria::poder']])('clicar em %s grava %s=true', (rotulo, chave) => {
        montarStore({ minhaFicha: ficha() });
        const { container } = renderizar();
        fireEvent.click(botaoCat(container, rotulo));
        expect(mockState.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ [chave]: true });
    });

    it('recolher so a categoria clicada esconde as suas pastas/tecnicas e preserva as outras', () => {
        montarStore({ minhaFicha: ficha() });
        const { container, rerender } = renderizar();
        fireEvent.click(botaoCat(container, 'Habilidades'));
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(botaoCat(container, 'Habilidades').getAttribute('aria-expanded')).toBe('false');
        expect(botaoPasta(container, 'Taijutsu')).toBeUndefined();
        expect(nomesChips(container)).not.toContain('HabA');
        expect(nomesChips(container)).not.toContain('HabB');
        expect(botaoPasta(container, 'Fogo')).toBeDefined();
        expect(nomesChips(container).sort()).toEqual(['FormaA', 'PodA', 'PodB']);
        expect(botaoCat(container, 'Poderes').getAttribute('aria-expanded')).toBe('true');
        expect(botaoCat(container, 'Formas').getAttribute('aria-expanded')).toBe('true');
    });

    it('clicar de novo reabre (grava false) e preserva chaves existentes', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::poder': true, 'habilidade::Taijutsu': true } });
        const { container } = renderizar();
        fireEvent.click(botaoCat(container, 'Poderes'));
        expect(mockState.pastasFechadasMapaTecnicas).toEqual({ 'categoria::poder': false, 'habilidade::Taijutsu': true });
    });

    it('sobrevive a desmontar/remontar', () => {
        montarStore({ minhaFicha: ficha() });
        const r1 = renderizar();
        fireEvent.click(botaoCat(r1.container, 'Formas'));
        r1.unmount();
        const r2 = renderizar();
        expect(botaoCat(r2.container, 'Formas').getAttribute('aria-expanded')).toBe('false');
        expect(nomesChips(r2.container)).not.toContain('FormaA');
    });

    it('reabrir a categoria nao altera o estado salvo das pastas internas', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::habilidade': true, 'habilidade::Taijutsu': true } });
        const { container, rerender } = renderizar();
        fireEvent.click(botaoCat(container, 'Habilidades'));
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(botaoPasta(container, 'Taijutsu').textContent).toContain('▶');
    });
});

describe('categoria recolhivel: busca e "Só ligadas"', () => {
    it('com busca, categoria salva como fechada aparece aberta, e o clique nao grava', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::habilidade': true } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'haba' } });
        const btn = botaoCat(container, 'Habilidades');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(btn.querySelector('.mapa-categoria-total').textContent).toBe('(1)');
        expect(nomesChips(container)).toEqual(['HabA']);
        fireEvent.click(btn);
        expect(mockState.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
    });

    it('com "Só ligadas", categoria recolhida aparece aberta, contagem usa a lista filtrada e clique nao grava', () => {
        const f = ficha();
        f.poderes[1].ativa = true; // HabB
        montarStore({ minhaFicha: f, pastasFechadasMapaTecnicas: { 'categoria::habilidade': true } });
        const { container, getByText } = renderizar();
        fireEvent.click(getByText(/Só ligadas/));
        const btn = botaoCat(container, 'Habilidades');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(btn.querySelector('.mapa-categoria-total').textContent).toBe('(1)');
        expect(nomesChips(container)).toEqual(['HabB']);
        fireEvent.click(btn);
        expect(mockState.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
    });

    it('ao limpar a busca a categoria volta a ficar recolhida', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::habilidade': true } });
        const { container, getByLabelText } = renderizar();
        const input = getByLabelText('Buscar técnica');
        fireEvent.change(input, { target: { value: 'haba' } });
        fireEvent.change(input, { target: { value: '' } });
        expect(botaoCat(container, 'Habilidades').getAttribute('aria-expanded')).toBe('false');
    });
});

describe('categoria recolhivel: Recolher/Expandir tudo', () => {
    it('Recolher tudo nao cria nem altera chaves categoria::* e preserva as existentes', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'categoria::poder': true, 'categoria::forma': false } });
        const { getByText } = renderizar();
        fireEvent.click(getByText('▶ Recolher tudo'));
        const v = mockState.pastasFechadasMapaTecnicas;
        expect(v['categoria::poder']).toBe(true);
        expect(v['categoria::forma']).toBe(false);
        expect('categoria::habilidade' in v).toBe(false);
        expect(v['habilidade::Taijutsu']).toBe(true);
    });

    it('Expandir tudo tambem nao mexe nas categorias', () => {
        montarStore({
            minhaFicha: ficha(),
            pastasFechadasMapaTecnicas: {
                'categoria::habilidade': true,
                'habilidade::Taijutsu': true, 'habilidade::Sem Pasta': true,
                'poder::Fogo': true, 'poder::Sem Pasta': true, 'forma::Sem Pasta': true,
            },
        });
        const { getByText } = renderizar();
        fireEvent.click(getByText('▼ Expandir tudo'));
        const v = mockState.pastasFechadasMapaTecnicas;
        expect(v['categoria::habilidade']).toBe(true);
        expect(v['habilidade::Taijutsu']).toBe(false);
    });
});

describe('MapaMagiasElementais: cor do elemento', () => {
    const magia = (id, nome, elemento) => ({ id, nome, elemento, equipado: false });
    const renderElem = () => render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

    it('cabecalho e chip de Fogo tem classes --elemento e --cor-elemento da tabela', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'Bola', 'Fogo')] } });
        const { container } = renderElem();
        const topo = container.querySelector('button.mapa-tecnicas-pasta-topo');
        const chip = container.querySelector('.mapa-tecnica-chip');
        expect(ELEMENTOS_CORES.Fogo).toBeTruthy();
        expect(topo.classList.contains('mapa-tecnicas-pasta-topo--elemento')).toBe(true);
        expect(chip.classList.contains('mapa-tecnica-chip--elemento')).toBe(true);
        expect(topo.style.getPropertyValue('--cor-elemento')).toBe(ELEMENTOS_CORES.Fogo);
        expect(chip.style.getPropertyValue('--cor-elemento')).toBe(ELEMENTOS_CORES.Fogo);
    });

    it('elemento fora da tabela usa o fallback #00ffcc', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'X', 'Inventado')] } });
        expect(ELEMENTOS_CORES.Inventado).toBeUndefined();
        const { container } = renderElem();
        const topo = container.querySelector('button.mapa-tecnicas-pasta-topo');
        const chip = container.querySelector('.mapa-tecnica-chip');
        expect(topo.style.getPropertyValue('--cor-elemento')).toBe('#00ffcc');
        expect(chip.style.getPropertyValue('--cor-elemento')).toBe('#00ffcc');
        expect(topo.classList.contains('mapa-tecnicas-pasta-topo--elemento')).toBe(true);
    });

    it('cada elemento recebe a sua propria cor', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'A', 'Fogo'), magia(2, 'B', 'Agua')] } });
        const { container } = renderElem();
        const topos = [...container.querySelectorAll('button.mapa-tecnicas-pasta-topo')];
        const cor = (n) => topos.find(b => b.textContent.includes(n)).style.getPropertyValue('--cor-elemento');
        expect(cor('Fogo')).toBe(ELEMENTOS_CORES.Fogo || '#00ffcc');
        expect(cor('Agua')).toBe(ELEMENTOS_CORES.Agua || '#00ffcc');
    });
});
