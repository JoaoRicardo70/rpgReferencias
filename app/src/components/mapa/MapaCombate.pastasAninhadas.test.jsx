import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - Pastas aninhadas na lista de Tecnicas do Mapa (renderPasta recursivo, chaves
// `<categoria>::<caminho completo>`, "★ n" na subarvore, Recolher/Expandir tudo e busca).
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
const renderizar = () => render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
const botaoPasta = (container, nome) => [...container.querySelectorAll('button.mapa-tecnicas-pasta-topo')].find(b => b.textContent.includes(`📁 ${nome}`));
const nomesChips = (container) => [...container.querySelectorAll('.mapa-tecnica-chip')].map(c => c.textContent.replace(/^[★☆]\s*/, ''));

const fichaArvore = (extra = {}) => ({
    poderes: [
        poder('1', 'RaizTai', { pasta: 'Taijutsu' }),
        poder('2', 'PortaoUm', { pasta: 'Taijutsu/Portões' }),
        poder('3', 'PortaoDois', { pasta: 'Taijutsu/Portões' }),
        poder('4', 'Fundo', { pasta: 'Taijutsu/Portões/Extra' }),
        poder('5', 'Nin1', { pasta: 'Ninjutsu' }),
        poder('6', 'Solta'),
        ...(extra.mais || []),
    ],
    inventario: [],
});

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaTecnicasRapidas - pastas aninhadas: renderizacao', () => {
    it('renderiza subpastas dentro da pasta-mae (.mapa-tecnicas-subpasta)', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        const topo = [...container.querySelectorAll('.mapa-tecnicas-pasta:not(.mapa-tecnicas-subpasta)')];
        const subs = container.querySelectorAll('.mapa-tecnicas-subpasta');
        expect(topo).toHaveLength(3); // Ninjutsu, Taijutsu, Sem Pasta
        expect(subs).toHaveLength(2); // Portoes, Extra
        const tai = topo.find(n => n.textContent.includes('📁 Taijutsu'));
        expect(tai.querySelectorAll('.mapa-tecnicas-subpasta')).toHaveLength(2);
    });

    it('ordem alfabetica e "Sem Pasta" por ultimo', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        const nomes = [...container.querySelectorAll('.mapa-tecnicas-pasta:not(.mapa-tecnicas-subpasta) > .mapa-tecnicas-pasta-topo')].map(b => b.textContent);
        expect(nomes[0]).toContain('Ninjutsu');
        expect(nomes[1]).toContain('Taijutsu');
        expect(nomes[2]).toContain('Sem Pasta');
    });

    it('contador "(n)" inclui subpastas e mostra so o rotulo', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        expect(botaoPasta(container, 'Taijutsu').textContent).toContain('(4)');
        expect(botaoPasta(container, 'Portões').textContent).toContain('(3)');
        expect(botaoPasta(container, 'Extra').textContent).toContain('(1)');
        expect(botaoPasta(container, 'Taijutsu/Portões')).toBeUndefined();
    });

    it('todos os chips aparecem quando tudo esta aberto (<=12 tecnicas)', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        expect(nomesChips(container).sort()).toEqual(['Fundo', 'Nin1', 'PortaoDois', 'PortaoUm', 'RaizTai', 'Solta']);
    });

    it('categoria sem pasta nenhuma continua em grade simples (sem .mapa-tecnicas-pasta)', () => {
        montarStore({ minhaFicha: { poderes: [poder('1', 'A'), poder('2', 'B')] } });
        const { container } = renderizar();
        expect(container.querySelectorAll('.mapa-tecnicas-pasta')).toHaveLength(0);
        expect(nomesChips(container)).toHaveLength(2);
    });

    it('pasta com barras soltas e espacos (" A // B / ") vira A > B', () => {
        montarStore({ minhaFicha: { poderes: [poder('1', 'X', { pasta: ' A // B / ' })] } });
        const { container } = renderizar();
        expect(container.querySelectorAll('.mapa-tecnicas-subpasta')).toHaveLength(1);
        expect(botaoPasta(container, 'B')).toBeDefined();
    });

    it('categorias separadas: mesmo caminho em categorias diferentes nao se mistura', () => {
        montarStore({ minhaFicha: { poderes: [poder('1', 'H', { pasta: 'A/B' }), poder('2', 'P', { pasta: 'A/B', categoria: 'poder' })] } });
        const { container } = renderizar();
        expect(container.querySelectorAll('.mapa-tecnicas-subpasta')).toHaveLength(2);
    });
});

describe('MapaTecnicasRapidas - pastas aninhadas: recolher/expandir', () => {
    it('clicar na pasta-mae grava a chave `<cat>::<caminho completo>`', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        fireEvent.click(botaoPasta(container, 'Taijutsu'));
        expect(mockState.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'habilidade::Taijutsu': true });
    });

    it('clicar na subpasta grava a chave com o caminho completo', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        fireEvent.click(botaoPasta(container, 'Portões'));
        expect(mockState.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'habilidade::Taijutsu/Portões': true });
    });

    it('pai fechado esconde itens e subpastas', () => {
        montarStore({ minhaFicha: fichaArvore(), pastasFechadasMapaTecnicas: { 'habilidade::Taijutsu': true } });
        const { container } = renderizar();
        expect(botaoPasta(container, 'Taijutsu').textContent).toContain('▶');
        expect(botaoPasta(container, 'Portões')).toBeUndefined();
        expect(botaoPasta(container, 'Extra')).toBeUndefined();
        expect(nomesChips(container).sort()).toEqual(['Nin1', 'Solta']);
    });

    it('subpasta fechada esconde so seus itens; mae continua aberta', () => {
        montarStore({ minhaFicha: fichaArvore(), pastasFechadasMapaTecnicas: { 'habilidade::Taijutsu/Portões': true } });
        const { container } = renderizar();
        expect(botaoPasta(container, 'Portões').textContent).toContain('▶');
        expect(botaoPasta(container, 'Extra')).toBeUndefined();
        expect(nomesChips(container).sort()).toEqual(['Nin1', 'RaizTai', 'Solta']);
    });

    it('fechar a mae NAO altera o estado salvo das filhas (reabrir restaura)', () => {
        montarStore({ minhaFicha: fichaArvore(), pastasFechadasMapaTecnicas: { 'habilidade::Taijutsu': true, 'habilidade::Taijutsu/Portões': false } });
        const { container, rerender } = renderizar();
        fireEvent.click(botaoPasta(container, 'Taijutsu'));
        // clique reabre a mae preservando a chave da filha
        expect(mockState.pastasFechadasMapaTecnicas).toEqual({ 'habilidade::Taijutsu': false, 'habilidade::Taijutsu/Portões': false });
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(nomesChips(container)).toContain('PortaoUm');
    });

    it('"Recolher tudo" grava chaves para TODOS os caminhos, inclusive pastas-mae, e Sem Pasta', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { getByText } = renderizar();
        fireEvent.click(getByText('▶ Recolher tudo'));
        expect(mockState.pastasFechadasMapaTecnicas).toEqual({
            'habilidade::Ninjutsu': true,
            'habilidade::Taijutsu': true,
            'habilidade::Taijutsu/Portões': true,
            'habilidade::Taijutsu/Portões/Extra': true,
            'habilidade::Sem Pasta': true,
        });
    });

    it('"Expandir tudo" grava false nas mesmas chaves', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { getByText } = renderizar();
        fireEvent.click(getByText('▼ Expandir tudo'));
        const v = mockState.pastasFechadasMapaTecnicas;
        expect(Object.keys(v)).toHaveLength(5);
        expect(Object.values(v).every(x => x === false)).toBe(true);
    });

    it('chaves por categoria: poder e habilidade ficam separadas; sem "Sem Pasta" quando nao ha itens soltos', () => {
        montarStore({ minhaFicha: { poderes: [poder('1', 'H', { pasta: 'A/B' }), poder('2', 'P', { pasta: 'A', categoria: 'poder' })] } });
        const { getByText } = renderizar();
        fireEvent.click(getByText('▶ Recolher tudo'));
        expect(mockState.pastasFechadasMapaTecnicas).toEqual({
            'habilidade::A': true,
            'habilidade::A/B': true,
            'poder::A': true,
        });
    });

    it('Recolher tudo realmente fecha a arvore (rerender com o estado salvo)', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { getByText, container, rerender } = renderizar();
        fireEvent.click(getByText('▶ Recolher tudo'));
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(nomesChips(container)).toHaveLength(0);
        expect(botaoPasta(container, 'Taijutsu')).toBeDefined();
        expect(botaoPasta(container, 'Portões')).toBeUndefined();
    });

    it('Expandir tudo abre a arvore mesmo com > 12 tecnicas (padrao fechado)', () => {
        const muitas = Array.from({ length: 14 }, (_, i) => poder(`m${i}`, `Mu${i}`, { pasta: i % 2 ? 'Gelo/Sub' : 'Gelo' }));
        montarStore({ minhaFicha: { poderes: muitas } });
        const { getByText, container, rerender } = renderizar();
        expect(nomesChips(container)).toHaveLength(0); // tudo fechado por padrao
        fireEvent.click(getByText('▼ Expandir tudo'));
        rerender(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);
        expect(nomesChips(container)).toHaveLength(14);
    });

    it('com > 12 tecnicas, pastas nascem fechadas (so a de primeiro nivel aparece)', () => {
        const muitas = Array.from({ length: 14 }, (_, i) => poder(`m${i}`, `Mu${i}`, { pasta: 'Gelo/Sub' }));
        montarStore({ minhaFicha: { poderes: muitas } });
        const { container } = renderizar();
        expect(botaoPasta(container, 'Gelo').textContent).toContain('▶');
        expect(botaoPasta(container, 'Sub')).toBeUndefined();
    });
});

describe('MapaTecnicasRapidas - pastas aninhadas: contagem de ativas', () => {
    it('"★ n" da mae conta tecnicas ativas em toda a subarvore', () => {
        montarStore({
            minhaFicha: fichaArvore({ mais: [] }),
        });
        mockState.minhaFicha.poderes.find(p => p.id === '1').ativa = true; // direto na mae
        mockState.minhaFicha.poderes.find(p => p.id === '2').ativa = true; // Portoes
        mockState.minhaFicha.poderes.find(p => p.id === '4').ativa = true; // Extra (neta)
        const { container } = renderizar();
        expect(botaoPasta(container, 'Taijutsu').textContent).toContain('★ 3');
        expect(botaoPasta(container, 'Portões').textContent).toContain('★ 2');
        expect(botaoPasta(container, 'Extra').textContent).toContain('★ 1');
        expect(botaoPasta(container, 'Ninjutsu').textContent).not.toContain('★');
    });

    it('sem ativas, nenhuma pasta mostra ★', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        expect(container.querySelectorAll('.mapa-tecnicas-pasta-ligadas')).toHaveLength(0);
    });

    it('a mae fechada ainda mostra o contador da subarvore', () => {
        montarStore({ minhaFicha: fichaArvore(), pastasFechadasMapaTecnicas: { 'habilidade::Taijutsu': true } });
        mockState.minhaFicha.poderes.find(p => p.id === '4').ativa = true;
        const { container } = renderizar();
        expect(botaoPasta(container, 'Taijutsu').textContent).toContain('★ 1');
    });

    it('"Sem Pasta" conta suas proprias ativas', () => {
        montarStore({ minhaFicha: fichaArvore() });
        mockState.minhaFicha.poderes.find(p => p.id === '6').ativa = true;
        const { container } = renderizar();
        expect(botaoPasta(container, 'Sem Pasta').textContent).toContain('★ 1');
        expect(botaoPasta(container, 'Taijutsu').textContent).not.toContain('★');
    });

    it('clicar num chip chama togglePoder via updateFicha', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container } = renderizar();
        const chip = [...container.querySelectorAll('.mapa-tecnica-chip')].find(c => c.textContent.includes('Fundo'));
        fireEvent.click(chip);
        expect(mockState.updateFicha).toHaveBeenCalled();
    });
});

describe('MapaTecnicasRapidas - pastas aninhadas: busca', () => {
    it('busca forca tudo aberto e filtra por nome, mantendo as maes do resultado', () => {
        montarStore({ minhaFicha: fichaArvore(), pastasFechadasMapaTecnicas: { 'habilidade::Taijutsu': true, 'habilidade::Taijutsu/Portões': true } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'fundo' } });
        expect(nomesChips(container)).toEqual(['Fundo']);
        expect(botaoPasta(container, 'Taijutsu')).toBeDefined();
        expect(botaoPasta(container, 'Portões')).toBeDefined();
        expect(botaoPasta(container, 'Extra')).toBeDefined();
        expect(botaoPasta(container, 'Ninjutsu')).toBeUndefined();
    });

    it('busca pelo nome da pasta encontra as tecnicas dela', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'portões' } });
        expect(nomesChips(container).sort()).toEqual(['Fundo', 'PortaoDois', 'PortaoUm']);
    });

    it('durante a busca, clicar numa pasta nao altera o estado salvo', () => {
        montarStore({ minhaFicha: fichaArvore() });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica'), { target: { value: 'portao' } });
        fireEvent.click(botaoPasta(container, 'Taijutsu'));
        expect(mockState.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
    });
});
