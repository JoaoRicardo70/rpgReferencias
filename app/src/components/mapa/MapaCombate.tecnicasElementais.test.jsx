import React from 'react';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaMagiasElementais } from './MapaCombate';
import { ElementosFormProvider } from '../arsenal/ElementosFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - MapaMagiasElementais (Tecnicas Elementais) reorganizada como as Tecnicas do Grimorio:
// busca (aria-label "Buscar técnica elemental"), "★ Só ligadas (n)" (aria-pressed), UM botao
// recolher/expandir tudo, um grupo recolhivel por elemento (chave elemental::<Elemento> em
// pastasFechadasMapaTecnicas; fechado por padrao com mais de 12 magias), chips em
// .mapa-tecnicas-grade/.mapa-tecnica-chip e "★ n" por grupo.
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
        minhaFicha: { ataquesElementais: [] },
        meuNome: 'Heroi', isMestre: true, personagens: {},
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-mapa', feedCombate: [], alvoSelecionado: null, dummies: {},
        elemEditandoId: null, setElemEditandoId: vi.fn(),
        pastasFechadasMapaTecnicas: {},
        setPastasFechadasMapaTecnicas: vi.fn((mapa) => { mockState.pastasFechadasMapaTecnicas = mapa; }),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    useStore.getState = () => mockState;
    return mockState;
}

const magia = (id, nome, elemento, extra = {}) => ({ id, nome, elemento, equipado: false, ...extra });
// n magias: metade Fogo, metade Agua
function gerar(n, ligada = () => false) {
    return Array.from({ length: n }, (_, i) => magia(i + 1, `Mag ${i}`, i < Math.ceil(n / 2) ? 'Fogo' : 'Agua', { equipado: ligada(i) }));
}
const renderizar = () => render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);
const chips = (container) => [...container.querySelectorAll('.mapa-tecnica-chip')];
const topoGrupo = (container, nome) => [...container.querySelectorAll('button.mapa-tecnicas-pasta-topo')].find(b => b.textContent.includes(nome));
const botaoLigadas = (container) => [...container.querySelectorAll('button')].find(b => /Só ligadas/.test(b.textContent));

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaMagiasElementais - estrutura', () => {
    it('mostra busca, "★ Só ligadas (n)" e um unico botao recolher/expandir', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(4, i => i === 0) } });
        const { getByLabelText, getByText, queryByText } = renderizar();
        expect(getByLabelText('Buscar técnica elemental')).toBeTruthy();
        expect(getByText('★ Só ligadas (1)')).toBeTruthy();
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
        expect(queryByText('▼ Expandir tudo')).toBeNull();
    });

    it('a busca e type=search e o botao "Só ligadas" comeca com aria-pressed=false', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(2) } });
        const { container, getByLabelText } = renderizar();
        expect(getByLabelText('Buscar técnica elemental').getAttribute('type')).toBe('search');
        expect(botaoLigadas(container).getAttribute('aria-pressed')).toBe('false');
    });

    it('lista vazia: so a dica, sem busca nem botoes', () => {
        montarStore({ minhaFicha: { ataquesElementais: [] } });
        const { queryByLabelText, queryByText, getByText } = renderizar();
        expect(getByText(/Nenhuma magia elemental criada ainda/i)).toBeTruthy();
        expect(queryByLabelText('Buscar técnica elemental')).toBeNull();
        expect(queryByText(/Só ligadas/)).toBeNull();
    });

    it('chips ficam em .mapa-tecnicas-grade dentro de .mapa-tecnicas-pasta, um grupo por elemento', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(4) } });
        const { container } = renderizar();
        expect(container.querySelectorAll('.mapa-tecnicas-pasta')).toHaveLength(2);
        expect(container.querySelectorAll('.mapa-tecnicas-grade')).toHaveLength(2);
        chips(container).forEach(c => expect(c.closest('.mapa-tecnicas-grade')).not.toBeNull());
    });

    it('cabecalho do grupo mostra seta, emoji, nome e a contagem (n)', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(4) } });
        const { container } = renderizar();
        expect(topoGrupo(container, 'Fogo').textContent).toContain('▼');
        expect(topoGrupo(container, 'Fogo').textContent).toContain('🔥 Fogo');
        expect(topoGrupo(container, 'Fogo').textContent).toContain('(2)');
    });

    it('grupos em ordem alfabetica (pt-BR)', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'R', 'Vento'), magia(2, 'O', 'Agua'), magia(3, 'C', 'Fogo')] } });
        const { container } = renderizar();
        const ordem = [...container.querySelectorAll('button.mapa-tecnicas-pasta-topo')].map(b => b.textContent);
        expect(ordem[0]).toContain('Agua');
        expect(ordem[1]).toContain('Fogo');
        expect(ordem[2]).toContain('Vento');
    });

    it('nao existe mais a faixa "Ligadas agora"; uma magia memorizada aparece uma unica vez', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(4, i => i === 1) } });
        const { container, queryByText } = renderizar();
        expect(queryByText(/Ligadas agora/)).toBeNull();
        expect(chips(container).filter(c => c.textContent === '★ Mag 1')).toHaveLength(1);
    });

    it('magia sem elemento cai no grupo "Neutro"; elemento desconhecido nao vira "undefined"', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'A', undefined), magia(2, 'B', 'Inventado')] } });
        const { container } = renderizar();
        expect(topoGrupo(container, 'Neutro')).toBeTruthy();
        expect(topoGrupo(container, 'Inventado').textContent).toContain('🌪️');
        expect(container.textContent).not.toMatch(/undefined/);
    });
});

describe('MapaMagiasElementais - busca', () => {
    const lista = [
        magia(1, 'Bola de Fogo', 'Fogo'), magia(2, 'Lança Ígnea', 'Fogo'),
        magia(3, 'Jato Dagua', 'Agua'), magia(4, 'Sopro', 'Vento'),
    ];

    it('filtra por nome sem diferenciar maiusculas', () => {
        montarStore({ minhaFicha: { ataquesElementais: lista } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'bOlA' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Bola de Fogo']);
    });

    it('filtra tambem pelo nome do elemento (traz o grupo todo)', () => {
        montarStore({ minhaFicha: { ataquesElementais: lista } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'vento' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Sopro']);
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'fogo' } });
        expect(chips(container)).toHaveLength(2);
    });

    it('grupos sem resultado somem', () => {
        montarStore({ minhaFicha: { ataquesElementais: lista } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'sopro' } });
        expect(topoGrupo(container, 'Fogo')).toBeUndefined();
        expect(topoGrupo(container, 'Vento')).toBeTruthy();
    });

    it('sem resultados: "Nenhuma magia com esse nome."; espacos so equivalem a sem filtro', () => {
        montarStore({ minhaFicha: { ataquesElementais: lista } });
        const { container, getByLabelText, getByText, queryByText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'zzzz' } });
        expect(getByText('Nenhuma magia com esse nome.')).toBeTruthy();
        expect(chips(container)).toHaveLength(0);
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: '   ' } });
        expect(chips(container)).toHaveLength(4);
        expect(queryByText(/Nenhuma magia com esse nome/)).toBeNull();
    });

    it('caracteres de regex sao literais e nao quebram', () => {
        montarStore({ minhaFicha: { ataquesElementais: lista } });
        const { container, getByLabelText } = renderizar();
        expect(() => fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: '.*[(' } })).not.toThrow();
        expect(chips(container)).toHaveLength(0);
    });

    it('magia sem nome nao quebra a busca', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, undefined, 'Fogo'), magia(2, 'Alvo', 'Fogo')] } });
        const { container, getByLabelText } = renderizar();
        expect(() => fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'alvo' } })).not.toThrow();
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Alvo']);
    });

    it('durante a busca os grupos ficam abertos mesmo marcados como fechados, sem gravar no store', () => {
        const st = montarStore({
            minhaFicha: { ataquesElementais: lista },
            pastasFechadasMapaTecnicas: { 'elemental::Fogo': true },
        });
        const { container, getByLabelText } = renderizar();
        expect(chips(container).map(c => c.textContent)).not.toContain('☆ Bola de Fogo');
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'bola' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Bola de Fogo']);
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
    });

    it('com mais de 12 magias (fechadas por padrao) buscar abre o grupo com resultado', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(14) } });
        const { container, getByLabelText } = renderizar();
        expect(chips(container)).toHaveLength(0);
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'Mag 13' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['☆ Mag 13']);
    });

    it('clicar no cabecalho durante a busca e no-op', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: lista } });
        const { container, getByLabelText } = renderizar();
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'fogo' } });
        act(() => { topoGrupo(container, 'Fogo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
        expect(chips(container)).toHaveLength(2);
    });
});

describe('MapaMagiasElementais - "★ Só ligadas (n)"', () => {
    it('mostra o total de memorizadas', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(6, i => i === 0 || i === 5) } });
        const { getByText } = renderizar();
        expect(getByText('★ Só ligadas (2)')).toBeTruthy();
    });

    it('clicar filtra: aria-pressed=true, classe --ativo e so as memorizadas', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(6, i => i === 0 || i === 5) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(botaoLigadas(container).getAttribute('aria-pressed')).toBe('true');
        expect(botaoLigadas(container).className).toContain('mapa-tecnicas-mini--ativo');
        expect(chips(container).map(c => c.textContent).sort()).toEqual(['★ Mag 0', '★ Mag 5']);
    });

    it('as memorizadas continuam dentro dos seus elementos e o grupo sem memorizadas some', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(6, i => i === 0) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(topoGrupo(container, 'Fogo')).toBeTruthy();
        expect(topoGrupo(container, 'Agua')).toBeUndefined();
        expect(topoGrupo(container, 'Fogo').closest('.mapa-tecnicas-pasta').querySelectorAll('.mapa-tecnica-chip')).toHaveLength(1);
    });

    it('segundo clique volta a lista inteira', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(6, i => i === 0) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        fireEvent.click(botaoLigadas(container));
        expect(chips(container)).toHaveLength(6);
        expect(botaoLigadas(container).getAttribute('aria-pressed')).toBe('false');
    });

    it('sem nenhuma memorizada: "Nenhuma magia memorizada."', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(4) } });
        const { container, getByText } = renderizar();
        fireEvent.click(botaoLigadas(container));
        expect(getByText('Nenhuma magia memorizada.')).toBeTruthy();
        expect(chips(container)).toHaveLength(0);
    });

    it('com grupos fechados por padrao (14 magias) o filtro abre a forca; clicar na magia desmemoriza', () => {
        const minhaFicha = { ataquesElementais: gerar(14, i => i === 3) };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(0);
        fireEvent.click(botaoLigadas(container));
        expect(chips(container)).toHaveLength(1);
        act(() => { chips(container)[0].click(); });
        expect(minhaFicha.ataquesElementais[3].equipado).toBe(false);
    });

    it('filtrar nao grava nada no store; clicar no cabecalho enquanto filtra e no-op', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: gerar(6, i => i === 0) } });
        const { container } = renderizar();
        fireEvent.click(botaoLigadas(container));
        act(() => { topoGrupo(container, 'Fogo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).not.toHaveBeenCalled();
    });

    it('combina com a busca (E)', () => {
        montarStore({ minhaFicha: { ataquesElementais: [
            magia(1, 'Fogo A', 'Fogo', { equipado: true }), magia(2, 'Fogo B', 'Fogo'), magia(3, 'Agua A', 'Agua', { equipado: true }),
        ] } });
        const { container, getByLabelText } = renderizar();
        fireEvent.click(botaoLigadas(container));
        fireEvent.change(getByLabelText('Buscar técnica elemental'), { target: { value: 'fogo' } });
        expect(chips(container).map(c => c.textContent)).toEqual(['★ Fogo A']);
    });
});

describe('MapaMagiasElementais - grupos recolhiveis (elemental::<Elemento>)', () => {
    it('ate 12 magias: grupos abertos por padrao', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(12) } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(12);
        expect(topoGrupo(container, 'Fogo').textContent).toContain('▼');
    });

    it('13 magias: grupos fechados por padrao (so cabecalhos)', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(13) } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(0);
        expect(topoGrupo(container, 'Fogo').textContent).toContain('▶');
        expect(topoGrupo(container, 'Agua').textContent).toContain('▶');
    });

    it('a escolha salva vence o padrao (13 magias, so Fogo aberto)', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(13) }, pastasFechadasMapaTecnicas: { 'elemental::Fogo': false } });
        const { container } = renderizar();
        expect(chips(container)).toHaveLength(7);
        expect(topoGrupo(container, 'Agua').textContent).toContain('▶');
    });

    it('clicar num grupo fechado por padrao ABRE gravando false e preservando outras chaves', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: gerar(14) }, pastasFechadasMapaTecnicas: { 'habilidade::X': true } });
        const { container } = renderizar();
        act(() => { topoGrupo(container, 'Fogo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'habilidade::X': true, 'elemental::Fogo': false });
    });

    it('clicar num grupo aberto FECHA gravando true', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: gerar(4) } });
        const { container } = renderizar();
        act(() => { topoGrupo(container, 'Agua').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'elemental::Agua': true });
    });

    it('cabecalho mostra "★ n" so quando o grupo tem memorizadas, inclusive fechado', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(14, i => i === 0 || i === 1) } });
        const { container } = renderizar();
        expect(topoGrupo(container, 'Fogo').textContent).toContain('★ 2');
        expect(topoGrupo(container, 'Fogo').textContent).toContain('▶');
        expect(topoGrupo(container, 'Fogo').querySelector('.mapa-tecnicas-pasta-ligadas')).not.toBeNull();
        expect(topoGrupo(container, 'Agua').textContent).not.toContain('★');
    });

    it('a escolha sobrevive a desmontar e remontar (estado no store)', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: gerar(4) } });
        const a = renderizar();
        act(() => { topoGrupo(a.container, 'Fogo').click(); });
        a.unmount();
        const b = renderizar();
        expect(st.pastasFechadasMapaTecnicas).toEqual({ 'elemental::Fogo': true });
        expect(topoGrupo(b.container, 'Fogo').textContent).toContain('▶');
        expect(topoGrupo(b.container, 'Agua').textContent).toContain('▼');
    });
});

describe('MapaMagiasElementais - botao unico recolher/expandir', () => {
    it('"Recolher tudo" (alguma aberta) grava true para todas as chaves elemental::', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: [...gerar(4), magia(99, 'Z', 'Vento')] } });
        const { getByText } = renderizar();
        act(() => { getByText('▶ Recolher tudo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledTimes(1);
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'elemental::Fogo': true, 'elemental::Agua': true, 'elemental::Vento': true });
    });

    it('com todas fechadas o mesmo botao e "Expandir tudo" e grava false', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: gerar(14) } });
        const { getByText, queryByText } = renderizar();
        expect(queryByText('▶ Recolher tudo')).toBeNull();
        act(() => { getByText('▼ Expandir tudo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'elemental::Fogo': false, 'elemental::Agua': false });
    });

    it('preserva chaves de OUTRAS secoes do store (nao apaga pastas das Tecnicas do Grimorio)', () => {
        const st = montarStore({ minhaFicha: { ataquesElementais: gerar(4) }, pastasFechadasMapaTecnicas: { 'habilidade::Fogo': true } });
        const { getByText } = renderizar();
        act(() => { getByText('▶ Recolher tudo').click(); });
        expect(st.setPastasFechadasMapaTecnicas).toHaveBeenCalledWith({ 'habilidade::Fogo': true, 'elemental::Fogo': true, 'elemental::Agua': true });
    });

    it('com uma so aberta o botao ainda e "Recolher tudo"', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(14) }, pastasFechadasMapaTecnicas: { 'elemental::Fogo': false } });
        const { getByText } = renderizar();
        expect(getByText('▶ Recolher tudo')).toBeTruthy();
    });

    it('Expandir tudo faz os chips aparecerem; Recolher tudo os esconde (apos re-render)', () => {
        montarStore({ minhaFicha: { ataquesElementais: gerar(14) } });
        const { container, getByText, rerender } = renderizar();
        expect(chips(container)).toHaveLength(0);
        act(() => { getByText('▼ Expandir tudo').click(); });
        rerender(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);
        expect(chips(container)).toHaveLength(14);
        act(() => { getByText('▶ Recolher tudo').click(); });
        rerender(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);
        expect(chips(container)).toHaveLength(0);
    });
});

describe('MapaMagiasElementais - memorizar', () => {
    it('clicar na magia alterna so ela (toggleEquiparElem) mesmo dentro de um grupo com varias', () => {
        const minhaFicha = { ataquesElementais: [magia(1, 'A', 'Fogo'), magia(2, 'B', 'Fogo'), magia(3, 'C', 'Fogo')] };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
        const { getByText } = renderizar();
        act(() => { getByText('☆ B').click(); });
        expect(minhaFicha.ataquesElementais.map(m => m.equipado)).toEqual([false, true, false]);
    });

    it('magia memorizada tem destaque visual (★) e nao memorizada (☆); equipado undefined conta como nao', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'On', 'Fogo', { equipado: true }), { id: 2, nome: 'Off', elemento: 'Fogo' }] } });
        const { getByText } = renderizar();
        expect(getByText('★ On')).toBeTruthy();
        expect(getByText('☆ Off')).toBeTruthy();
    });

    it('fora de um ElementosFormProvider renderiza null sem lancar', () => {
        montarStore();
        expect(() => render(<MapaMagiasElementais />)).not.toThrow();
    });
});
