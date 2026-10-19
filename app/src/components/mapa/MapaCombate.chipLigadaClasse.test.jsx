import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas, MapaMagiasElementais } from './MapaCombate';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import { ElementosFormProvider } from '../arsenal/ElementosFormContext';
import useStore from '../../stores/useStore';

// QA - classe mapa-tecnica-chip--ligada (tema pergaminho) e mapa-tecnicas-categoria.

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
function montarStore(minhaFicha) {
    mockState = {
        minhaFicha,
        meuNome: 'Heroi', isMestre: true, personagens: {},
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-mapa', feedCombate: [], alvoSelecionado: null, dummies: {},
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(), itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(), efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn(),
        elemEditandoId: null, setElemEditandoId: vi.fn(),
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        pastasFechadasMapaTecnicas: {},
        setPastasFechadasMapaTecnicas: vi.fn(),
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    useStore.getState = () => mockState;
    return mockState;
}

const poder = (id, nome, extra = {}) => ({ id, nome, categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {}, ...extra });
const magia = (id, nome, extra = {}) => ({ id, nome, elemento: 'Fogo', equipado: false, ...extra });
const Poderes = () => <PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>;
const Elementos = () => <ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>;
const chipPorTexto = (container, nome) => [...container.querySelectorAll('.mapa-tecnica-chip')].find(c => c.textContent.includes(nome));

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('chip de Poder/Forma - classe --ligada', () => {
    it('(a) ligado tem a classe; desligado nao; ambos mantem btn-neon e mapa-tecnica-chip', () => {
        montarStore({ poderes: [poder('a', 'Ligado', { ativa: true }), poder('b', 'Apagado', { categoria: 'forma' })], inventario: [] });
        const { container } = render(<Poderes />);
        const on = chipPorTexto(container, 'Ligado');
        const off = chipPorTexto(container, 'Apagado');
        expect(on.classList.contains('mapa-tecnica-chip--ligada')).toBe(true);
        expect(off.classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
        [on, off].forEach(c => {
            expect(c.classList.contains('btn-neon')).toBe(true);
            expect(c.classList.contains('mapa-tecnica-chip')).toBe(true);
        });
    });

    it('(c) a classe muda quando a ficha muda (re-render)', () => {
        const st = montarStore({ poderes: [poder('a', 'Alvo')], inventario: [] });
        const { container, rerender } = render(<Poderes />);
        expect(chipPorTexto(container, 'Alvo').classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
        st.minhaFicha = { poderes: [poder('a', 'Alvo', { ativa: true })], inventario: [] };
        rerender(<Poderes />);
        expect(chipPorTexto(container, 'Alvo').classList.contains('mapa-tecnica-chip--ligada')).toBe(true);
        st.minhaFicha = { poderes: [poder('a', 'Alvo', { ativa: false })], inventario: [] };
        rerender(<Poderes />);
        expect(chipPorTexto(container, 'Alvo').classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
    });

    it('(d) cada categoria renderizada (Formas/Habilidades/Poderes) tem um .mapa-tecnicas-categoria', () => {
        montarStore({ poderes: [
            poder('1', 'H', { categoria: 'habilidade' }),
            poder('2', 'F', { categoria: 'forma' }),
            poder('3', 'P', { categoria: 'poder' }),
        ], inventario: [] });
        const { container } = render(<Poderes />);
        const rotulos = [...container.querySelectorAll('.mapa-tecnicas-categoria')].map(e => e.textContent);
        expect(rotulos).toHaveLength(3);
        expect(rotulos.some(t => /Formas/i.test(t))).toBe(true);
        expect(rotulos.some(t => /Habilidades/i.test(t))).toBe(true);
        expect(rotulos.some(t => /Poderes/i.test(t))).toBe(true);
    });

    it('(d) categoria sem tecnicas nao renderiza rotulo', () => {
        montarStore({ poderes: [poder('1', 'H')], inventario: [] });
        const { container } = render(<Poderes />);
        expect(container.querySelectorAll('.mapa-tecnicas-categoria')).toHaveLength(1);
    });

    it('(e) clicar no chip continua alternando a tecnica (togglePoder)', () => {
        const ficha = { poderes: [poder('a', 'Alvo')], inventario: [] };
        montarStore(ficha);
        const { container } = render(<Poderes />);
        act(() => { chipPorTexto(container, 'Alvo').click(); });
        expect(ficha.poderes[0].ativa).toBe(true);
    });
});

describe('chip de magia elemental - classe --ligada', () => {
    it('(b) equipada tem a classe; nao equipada nao; ambas mantem btn-neon e mapa-tecnica-chip', () => {
        montarStore({ ataquesElementais: [magia(1, 'Quente', { equipado: true }), magia(2, 'Fria')] });
        const { container } = render(<Elementos />);
        const on = chipPorTexto(container, 'Quente');
        const off = chipPorTexto(container, 'Fria');
        expect(on.classList.contains('mapa-tecnica-chip--ligada')).toBe(true);
        expect(off.classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
        [on, off].forEach(c => {
            expect(c.classList.contains('btn-neon')).toBe(true);
            expect(c.classList.contains('mapa-tecnica-chip')).toBe(true);
        });
    });

    it('(b) equipado undefined conta como nao ligada', () => {
        montarStore({ ataquesElementais: [{ id: 1, nome: 'Sem', elemento: 'Fogo' }] });
        const { container } = render(<Elementos />);
        expect(chipPorTexto(container, 'Sem').classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
    });

    it('(c) a classe muda quando a ficha muda (re-render)', () => {
        const st = montarStore({ ataquesElementais: [magia(1, 'Alvo')] });
        const { container, rerender } = render(<Elementos />);
        expect(chipPorTexto(container, 'Alvo').classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
        st.minhaFicha = { ataquesElementais: [magia(1, 'Alvo', { equipado: true })] };
        rerender(<Elementos />);
        expect(chipPorTexto(container, 'Alvo').classList.contains('mapa-tecnica-chip--ligada')).toBe(true);
        st.minhaFicha = { ataquesElementais: [magia(1, 'Alvo')] };
        rerender(<Elementos />);
        expect(chipPorTexto(container, 'Alvo').classList.contains('mapa-tecnica-chip--ligada')).toBe(false);
    });

    it('(e) clicar no chip continua alternando a magia (toggleEquiparElem)', () => {
        const ficha = { ataquesElementais: [magia(1, 'Alvo')] };
        montarStore(ficha);
        const { container } = render(<Elementos />);
        act(() => { chipPorTexto(container, 'Alvo').click(); });
        expect(ficha.ataquesElementais[0].equipado).toBe(true);
    });
});
