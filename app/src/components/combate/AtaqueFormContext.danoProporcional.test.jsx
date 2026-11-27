import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCenarioCompleto } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// ---------------------------------------------------------------------------
// QA - Dano proporcional a Vida. O Dano de Ataque (calcularDano = dados + Status) NAO e mais reescalado
// pela Vida do alvo: segue Disputa de Poder -> Reducoes/Resistencias -> Vida. So a formula livre
// (rolarDanoCustomizado) continua proporcional a Vida (core/danoProporcional.js). A Zona gerada nasce danoDeDados=false.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

function montar({ meuPoder = 1000, personagens = {}, alvoSelecionado = null, alvosArea = null, zonaIdGerada = null, cenario = { zonas: [] } } = {}) {
    const minhaFicha = {
        __poder: meuPoder, poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {},
        mana: { base: 100000, atual: 100000 }, vida: { base: 1000000, atual: 1000000 },
    };
    const acerto = alvosArea || zonaIdGerada
        ? [{ tipo: 'acerto', nome: 'Heroi', ...(alvosArea ? { alvosArea } : {}), ...(zonaIdGerada ? { zonaIdGerada } : {}) }]
        : [];
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: acerto,
        alvoSelecionado,
        ignorarTravaAcerto: true, setIgnorarTravaAcerto: vi.fn(),
        cenario,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    return minhaFicha;
}

const feedEnviado = () => enviarParaFeed.mock.calls.at(-1)[0];
const setDano = (dano) => calcularDano.mockReturnValue({ dano, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    setDano(35);
});
afterEach(() => cleanup());

describe('rolarDano - alvo unico: dano de Ataque (calcularDano) NAO e reescalado pela Vida', () => {
    it('sem alvo: feed sem fatorVida nem danoAplicado', () => {
        montar();
        act(() => { probe.rolarDano(); });
        expect('fatorVida' in feedEnviado()).toBe(false);
        expect('danoAplicado' in feedEnviado()).toBe(false);
        expect(feedEnviado().dano).toBe(35);
    });
});

describe('rolarDano - Zona criada pelo ataque', () => {
    it('a Zona gerada nasce com danoDeDados = false e guarda o dano CRU', () => {
        const cenario = { zonas: [{ id: 'z1', nome: 'Fogo', raio: 2 }, { id: 'z2', nome: 'Outra' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        const z1 = salvo.zonas.find(z => z.id === 'z1');
        expect(z1.danoDeDados).toBe(false);
        expect(z1.danoAplicado).toBe(35);
        expect(z1.danoOriginal).toBe(35);
        expect(z1.multiplicadorOriginal).toBe(1);
    });
    it('outras Zonas do cenario nao sao marcadas', () => {
        const cenario = { zonas: [{ id: 'z1' }, { id: 'z2', nome: 'Manual' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.zonas.find(z => z.id === 'z2').danoDeDados).toBeUndefined();
    });
    it('zonaIdGerada que nao existe no cenario: nada e salvo e nada quebra', () => {
        montar({ zonaIdGerada: 'zX', cenario: { zonas: [{ id: 'z1' }] } });
        act(() => { probe.rolarDano(); });
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalled();
    });
    it('nao muta o cenario original do store (usa copia)', () => {
        const cenario = { zonas: [{ id: 'z1' }] };
        montar({ zonaIdGerada: 'z1', cenario });
        act(() => { probe.rolarDano(); });
        expect(cenario.zonas[0].danoDeDados).toBeUndefined();
    });
});

describe('rolarDanoCustomizado (Modo Deus) - dado proporcional a Vida', () => {
    it('sem alvo: sem fatorVida/danoAplicado', () => {
        montar();
        act(() => { probe.rolarDanoCustomizado('35', 0, 'mana', 0); });
        expect('fatorVida' in feedEnviado()).toBe(false);
        expect('danoAplicado' in feedEnviado()).toBe(false);
    });
});
