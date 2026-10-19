import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas, MapaMagiasElementais } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import { ElementosFormProvider } from '../arsenal/ElementosFormContext';
import useStore from '../../stores/useStore';

// QA - Cabecalho de pasta/grupo: spans .mapa-pasta-seta/-icone/-nome/-total, aria-expanded e textContent.

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
const magia = (id, nome, elemento, extra = {}) => ({ id, nome, elemento, equipado: false, ...extra });
const ui = () => <PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>;
const uiEl = () => <ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>;
const botao = (container, nome) => [...container.querySelectorAll('button.mapa-tecnicas-pasta-topo')]
    .find(b => b.querySelector('.mapa-pasta-nome')?.textContent === nome);

function verificarSpans(b, { icone, nome, total }) {
    const seta = b.querySelector('span.mapa-pasta-seta');
    const ic = b.querySelector('span.mapa-pasta-icone');
    expect(seta).not.toBeNull();
    expect(ic).not.toBeNull();
    expect(seta.getAttribute('aria-hidden')).toBe('true');
    expect(ic.getAttribute('aria-hidden')).toBe('true');
    expect(ic.textContent).toBe(icone);
    expect(b.querySelector('span.mapa-pasta-nome').textContent).toBe(nome);
    expect(b.querySelector('span.mapa-pasta-total').textContent).toBe(`(${total})`);
}

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

const ficha = () => ({
    poderes: [
        poder('1', 'RaizTai', { pasta: 'Taijutsu' }),
        poder('2', 'PortaoUm', { pasta: 'Taijutsu/Portões' }),
        poder('3', 'PortaoDois', { pasta: 'Taijutsu/Portões' }),
    ],
    inventario: [],
});

describe('Cabecalho de pasta das Tecnicas', () => {
    it('(a) tem os 4 spans com as classes certas e seta/icone aria-hidden', () => {
        montarStore({ minhaFicha: ficha() });
        const { container } = renderizarTec();
        verificarSpans(botao(container, 'Taijutsu'), { icone: '📁', nome: 'Taijutsu', total: 3 });
    });

    it('(b) aria-expanded true aberta, false recolhida, e muda ao clicar', () => {
        montarStore({ minhaFicha: ficha() });
        const { container, rerender } = renderizarTec();
        expect(botao(container, 'Taijutsu').getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(botao(container, 'Taijutsu'));
        rerender(ui());
        expect(botao(container, 'Taijutsu').getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(botao(container, 'Taijutsu'));
        rerender(ui());
        expect(botao(container, 'Taijutsu').getAttribute('aria-expanded')).toBe('true');
    });

    it('(b) pasta salva como fechada nasce com aria-expanded=false e seta ▶', () => {
        montarStore({ minhaFicha: ficha(), pastasFechadasMapaTecnicas: { 'habilidade::Taijutsu': true } });
        const { container } = renderizarTec();
        const b = botao(container, 'Taijutsu');
        expect(b.getAttribute('aria-expanded')).toBe('false');
        expect(b.querySelector('.mapa-pasta-seta').textContent).toBe('▶');
    });

    it('(c) textContent mantem o formato e o selo "★ n" aparece com ligadas', () => {
        montarStore({ minhaFicha: ficha() });
        const { container, rerender } = renderizarTec();
        expect(botao(container, 'Taijutsu').textContent).toBe('▼ 📁 Taijutsu (3)');
        expect(botao(container, 'Taijutsu').querySelector('.mapa-tecnicas-pasta-ligadas')).toBeNull();
        fireEvent.click(botao(container, 'Taijutsu'));
        rerender(ui());
        expect(botao(container, 'Taijutsu').textContent).toBe('▶ 📁 Taijutsu (3)');

        cleanup();
        const f = ficha();
        f.poderes[1].ativa = true;
        montarStore({ minhaFicha: f });
        const r = renderizarTec();
        expect(botao(r.container, 'Taijutsu').textContent.trim()).toBe('▼ 📁 Taijutsu (3) ★ 1');
        expect(botao(r.container, 'Taijutsu').querySelector('.mapa-tecnicas-pasta-ligadas').textContent.trim()).toBe('★ 1');
    });

    it('(d) subpasta "Taijutsu/Portões" tambem tem os spans', () => {
        montarStore({ minhaFicha: ficha() });
        const { container } = renderizarTec();
        const b = botao(container, 'Portões');
        expect(b.closest('.mapa-tecnicas-subpasta')).not.toBeNull();
        verificarSpans(b, { icone: '📁', nome: 'Portões', total: 2 });
        expect(b.getAttribute('aria-expanded')).toBe('true');
        expect(b.textContent).toBe('▼ 📁 Portões (2)');
    });
});

describe('Cabecalho de grupo das Tecnicas Elementais', () => {
    const lista = () => [magia(1, 'A', 'Fogo'), magia(2, 'B', 'Fogo'), magia(3, 'C', 'Agua')];

    it('(e) spans com emoji do elemento, nome e total; seta/icone aria-hidden', () => {
        montarStore({ minhaFicha: { ataquesElementais: lista() } });
        const { container } = render(uiEl());
        verificarSpans(botao(container, 'Fogo'), { icone: '🔥', nome: 'Fogo', total: 2 });
        verificarSpans(botao(container, 'Agua'), { icone: botao(container, 'Agua').querySelector('.mapa-pasta-icone').textContent, nome: 'Agua', total: 1 });
        expect(botao(container, 'Fogo').textContent).toBe('▼ 🔥 Fogo (2)');
    });

    it('(e) aria-expanded muda ao clicar e o selo ★ aparece com ligadas', () => {
        montarStore({ minhaFicha: { ataquesElementais: [magia(1, 'A', 'Fogo', { equipado: true }), magia(2, 'B', 'Fogo')] } });
        const { container, rerender } = render(uiEl());
        expect(botao(container, 'Fogo').getAttribute('aria-expanded')).toBe('true');
        expect(botao(container, 'Fogo').textContent.trim()).toBe('▼ 🔥 Fogo (2) ★ 1');
        fireEvent.click(botao(container, 'Fogo'));
        rerender(uiEl());
        expect(botao(container, 'Fogo').getAttribute('aria-expanded')).toBe('false');
        expect(botao(container, 'Fogo').textContent.trim()).toBe('▶ 🔥 Fogo (2) ★ 1');
    });
});

function renderizarTec() { return render(ui()); }
