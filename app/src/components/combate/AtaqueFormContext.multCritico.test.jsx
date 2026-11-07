import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - mult_critico / mult_critico_fatal + critico_automatico no fluxo do Ataque (calcularDano real, espiado).

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularDano: vi.fn(real.calcularDano) };
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

const ef = (atributo, valor = 1, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...extra });
const attr = (base) => ({ nome: '', base, atual: base });
const ficha = (efeitos = [], extra = {}) => ({
    armaEspiritual: { acessoArma: true, nome: 'Excalibur', danoBase: '10d8' },
    forca: { ...attr(0), nome: 'Força' }, destreza: { ...attr(0), nome: 'Destreza' }, sabedoria: { ...attr(0), nome: 'Sabedoria' },
    poderes: [], inventario: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10, bio: {},
    passivas: [{ id: 1, efeitos }], ...extra,
});

let probe;
function Harness() { probe = useAtaqueForm(); return null; }
function montar(minhaFicha, { dummies = {}, alvoSelecionado = null } = {}) {
    const state = {
        minhaFicha, meuNome: 'Heroi', personagens: {}, dummies, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        ignorarTravaAcerto: true, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}
const feedDano = () => enviarParaFeed.mock.calls.map(c => c[0]).filter(f => f.tipo === 'dano').at(-1) || enviarParaFeed.mock.calls.at(-1)[0];
const rolar = () => { act(() => { probe.rolarDano(); }); return calcularDano.mock.calls.at(-1)[0]; };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Ataque > critico_automatico com mult_critico', () => {
    it('sem nenhum efeito: golpe comum (sem critico) e comportamento antigo', () => {
        montar(ficha());
        const args = rolar();
        expect(args.isCriticoNormal).toBe(false);
        expect(args.isCriticoFatal).toBe(false);
        expect(feedDano().detalheConta || '').not.toContain('CRÍTICO');
    });
    it('critico_automatico + mult_critico +2: Critico automatico sai x4', () => {
        montar(ficha([ef('critico_automatico'), ef('mult_critico', 2)]));
        const args = rolar();
        expect(args.isCriticoNormal).toBe(true);
        expect(args.isCriticoFatal).toBe(false);
        expect(feedDano().detalheConta).toContain('x4');
        expect(feedDano().detalheConta).toContain('CRÍTICO NORMAL');
    });
    it('critico_fatal_automatico + mult_critico_fatal +1: Fatal automatico sai x5', () => {
        montar(ficha([ef('critico_fatal_automatico'), ef('mult_critico_fatal', 1)]));
        const args = rolar();
        expect(args.isCriticoFatal).toBe(true);
        expect(feedDano().detalheConta).toContain('x5');
        expect(feedDano().detalheConta).toContain('CRÍTICO FATAL');
    });
    it('mult_critico sozinho nao cria critico: sem critico o dano e o mesmo', () => {
        montar(ficha([ef('mult_critico', 50), ef('mult_critico_fatal', 50)]));
        const comEfeito = rolar();
        expect(comEfeito.isCriticoNormal).toBe(false);
        const d1 = feedDano().dano;
        cleanup(); vi.clearAllMocks();
        montar(ficha());
        rolar();
        expect(feedDano().dano).toBe(d1);
    });
    it('Assassin: critico automatico x3 + 1 = x4; fatal x5 + 3 = x8', () => {
        montar(ficha([ef('critico_automatico'), ef('mult_critico', 1)], { bio: { classe: 'Assassin' } }));
        rolar();
        expect(feedDano().detalheConta).toContain('x4');
        cleanup(); vi.clearAllMocks();
        montar(ficha([ef('critico_fatal_automatico'), ef('mult_critico_fatal', 3)], { bio: { classe: 'Assassin' } }));
        rolar();
        expect(feedDano().detalheConta).toContain('x8');
    });
    it('valores invalidos (NaN, negativo, string) ficam em x2; enorme limita em +100 (x102)', () => {
        montar(ficha([ef('critico_automatico'), ef('mult_critico', NaN), ef('mult_critico', -5), ef('mult_critico', 'abc')]));
        rolar();
        expect(feedDano().detalheConta).toContain('x2');
        expect(feedDano().detalheConta).not.toContain('NaN');
        cleanup(); vi.clearAllMocks();
        montar(ficha([ef('critico_automatico'), ef('mult_critico', 1e9)]));
        rolar();
        expect(feedDano().detalheConta).toContain('x102');
    });
    it('dano com mult_critico maior que o sem efeito, na mesma rolagem', () => {
        montar(ficha([ef('critico_automatico')]));
        rolar();
        const base = feedDano().dano;
        cleanup(); vi.clearAllMocks();
        montar(ficha([ef('critico_automatico'), ef('mult_critico', 2)]));
        rolar();
        expect(feedDano().dano).toBeGreaterThan(base);
    });
});
