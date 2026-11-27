import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// "Ao acertar" (core/aoAcertar.js): o golpe cura/restaura QUEM ACERTOU, UMA vez por golpe, so com alvo marcado e Dano > 0.
// Fontes: Poderes ativos, Tecnicas Elementais ofensivas e a ARMA equipada (armadura/acessorio nao curam).

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn() }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularDisputaPoder: vi.fn(() => ({ ativa: false })),
    aplicarDisputaAoDano: vi.fn((dano) => dano),
}));
vi.mock('../../core/danoProporcional', async (importOriginal) => ({
    ...(await importOriginal()),
    escalarDanoPelaVida: vi.fn((dano) => dano),
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

const FATOR = 1000;
const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const goblin = () => ({ vida: stat(1000000, 1000000), reducoesDano: [], iniciativa: 10, isNPC: true, poderes: [], inventario: [], passivas: [] });
const AO = [{ tipo: 'curarAtacante', modo: 'fixo', valor: 50 }];

function montar({ alvoSelecionado = null, personagens = {}, alvosArea, poderes = [], inventario = [], vidaAtual = 500000, ficha = {} }) {
    const minhaFicha = {
        poderes, inventario, passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10,
        vida: stat(vidaAtual), ...ficha,
    };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: alvosArea ? [{ tipo: 'acerto', nome: 'Heroi', alvosArea }] : [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    return minhaFicha;
}

const vidaHeroi = () => mockState.minhaFicha.vida.atual;
const ultimoFeed = () => enviarParaFeed.mock.calls[enviarParaFeed.mock.calls.length - 1][0];
const dano = (n) => calcularDano.mockReturnValue({ dano: n, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    dano(30);
});
afterEach(() => cleanup());

describe('AtaqueFormContext - Ao acertar', () => {
    it('Poder ativo com curarAtacante e alvo marcado cura o atacante', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: true, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000 + 50 * FATOR);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('a frase vai para o textoPosGolpe do feed com a origem', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: true, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().textoPosGolpe).toContain('💚 Vampirismo: +50 de Vida');
    });

    it('em area com 2 alvos acertados cura UMA vez so', () => {
        montar({
            personagens: { G1: goblin(), G2: goblin() },
            alvosArea: [{ nome: 'G1', acertou: true, alvoId: 'pj:G1' }, { nome: 'G1', acertou: true, alvoId: 'pj:G2' }],
            poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: true, aoAcertar: AO }],
        });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000 + 50 * FATOR);
        expect(ultimoFeed().textoPosGolpe.filter(t => t.includes('Vampirismo'))).toHaveLength(1);
    });

    it('sem alvo marcado nao cura e nao salva a ficha por isso', () => {
        montar({ alvoSelecionado: null, poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: true, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
        const feed = enviarParaFeed.mock.calls.length ? ultimoFeed() : {};
        expect(JSON.stringify(feed.textoPosGolpe || [])).not.toContain('Vampirismo');
    });

    it('dano 0 no alvo nao cura', () => {
        dano(0);
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: true, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
    });

    it('area em que ninguem acertou nao cura', () => {
        montar({
            personagens: { G1: goblin() },
            alvosArea: [{ nome: 'G1', acertou: false, alvoId: 'pj:G1' }],
            poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: true, aoAcertar: AO }],
        });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
    });

    it('Poder inativo nao cura', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, poderes: [{ id: 'p1', nome: 'Vampirismo', ativa: false, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
    });

    it('nunca passa do maximo da Vida', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, vidaAtual: 999000, poderes: [{ id: 'p1', nome: 'V', ativa: true, aoAcertar: [{ tipo: 'curarAtacante', modo: 'fixo', valor: 9999 }] }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(1000000);
    });

    it('restaura energia (mana) do atacante', () => {
        montar({
            alvoSelecionado: 'pj:G1', personagens: { G1: goblin() },
            ficha: { mana: stat(100000) },
            poderes: [{ id: 'p1', nome: 'Siphon', ativa: true, aoAcertar: [{ tipo: 'energiaAtacante', modo: 'fixo', valor: 20, energia: 'mana' }] }],
        });
        act(() => { probe.rolarDano(); });
        expect(mockState.minhaFicha.mana.atual).toBe(100000 + 20 * FATOR);
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('🔋 Siphon: +20 de mana');
    });

    it('arma equipada com aoAcertar cura', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, inventario: [{ id: 1, nome: 'Lamina', tipo: 'arma', equipado: true, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000 + 50 * FATOR);
    });

    it('armadura equipada com aoAcertar NAO cura', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, inventario: [{ id: 2, nome: 'Peitoral', tipo: 'armadura', equipado: true, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
    });

    it('arma NAO equipada com aoAcertar nao cura', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, inventario: [{ id: 1, nome: 'Lamina', tipo: 'arma', equipado: false, aoAcertar: AO }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
    });

    it('Poder + arma somam (duas fontes, cada uma uma vez)', () => {
        montar({
            alvoSelecionado: 'pj:G1', personagens: { G1: goblin() },
            poderes: [{ id: 'p1', nome: 'P', ativa: true, aoAcertar: AO }],
            inventario: [{ id: 1, nome: 'Lamina', tipo: 'arma', equipado: true, aoAcertar: AO }],
        });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000 + 100 * FATOR);
    });

    it('apenasCritico nao cura em golpe sem critico', () => {
        montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, poderes: [{ id: 'p1', nome: 'P', ativa: true, aoAcertar: [{ ...AO[0], apenasCritico: true }] }] });
        act(() => { probe.rolarDano(); });
        expect(vidaHeroi()).toBe(500000);
    });

    it('sem Vida na ficha do atacante nao quebra', () => {
        const m = montar({ alvoSelecionado: 'pj:G1', personagens: { G1: goblin() }, poderes: [{ id: 'p1', nome: 'P', ativa: true, aoAcertar: AO }] });
        expect(m).toBeTruthy();
        delete mockState.minhaFicha.vida;
        expect(() => act(() => { probe.rolarDano(); })).not.toThrow();
    });
});
