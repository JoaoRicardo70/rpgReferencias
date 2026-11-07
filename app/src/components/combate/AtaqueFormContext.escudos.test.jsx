import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCamposPersonagem, aplicarDanoDireto } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// Escudos e Vida Temporaria: o Dano FINAL contra um alvo-personagem passa pelos escudos dele antes da Vida; o que sobra vai para a Vida.
// Cura reduzida ("ao acertar"): o golpe grava o buff de cura reduzida na ficha do alvo e o feed diz o percentual.

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
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const fichaAna = (extra = {}) => ({ vida: stat(1000000), mana: stat(100000), reducoesDano: [], iniciativa: 10, destreza: { base: 50 }, ...extra });
const esc = (id, nome, valor, tipo = 'escudo') => ({ id, nome, valor, tipo });

function montar({ personagens, poderes = [], danoVerdadeiroLigado = false }) {
    const minhaFicha = { poderes, inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10, vida: stat(500000) };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, dummies: {}, alvoSelecionado: 'pj:Ana',
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    if (danoVerdadeiroLigado) act(() => { probe.setDanoVerdadeiro(true); });
}

const ultimoFeed = () => enviarParaFeed.mock.calls[enviarParaFeed.mock.calls.length - 1][0];
const dano = (n) => calcularDano.mockReturnValue({ dano: n, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); dano(1000); });
afterEach(() => cleanup());

describe('AtaqueFormContext - escudos do alvo-personagem', () => {
    it('escudo maior que o dano absorve tudo: Vida intacta, escudo diminui e feed avisa', () => {
        montar({ personagens: { Ana: fichaAna({ escudos: [esc('a', 'Domo Gelido', 1600)] }) } });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: [expect.objectContaining({ id: 'a', valor: 600 })] });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000);
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('Ana absorveu 1.000 (restam 600)');
    });

    it('escudo menor: o escudo some (null no Firebase) e a sobra vai para a Vida', () => {
        montar({ personagens: { Ana: fichaAna({ escudos: [esc('a', 'Parede', 600)] }) } });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: null });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 400 * 1000);
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('Ana absorveu 600 (restam 0)');
    });

    it('Dano Verdadeiro tambem passa pelo escudo', () => {
        montar({ personagens: { Ana: fichaAna({ escudos: [esc('a', 'Parede', 300)] }) }, danoVerdadeiroLigado: true });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 700 * 1000);
    });

    it('sem escudos (ficha antiga): comportamento de sempre, nada gravado em escudos', () => {
        montar({ personagens: { Ana: fichaAna() } });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 1000 * 1000);
        const chamouEscudos = salvarCamposPersonagem.mock.calls.some(([, c]) => 'escudos' in c);
        expect(chamouEscudos).toBe(false);
    });
});

describe('AtaqueFormContext - cura reduzida (ao acertar)', () => {
    it('grava o buff de cura reduzida no alvo e o feed diz o percentual', () => {
        montar({
            personagens: { Ana: fichaAna() },
            poderes: [{ id: 'p1', nome: 'EA', ativa: true, aoAcertar: [{ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 1 }] }],
        });
        act(() => { probe.rolarDano(); });
        const chamada = salvarCamposPersonagem.mock.calls.find(([, c]) => c.buffsTemporarios);
        expect(chamada[0]).toBe('Ana');
        expect(chamada[1].buffsTemporarios[0]).toMatchObject({ nome: 'Cura reduzida', fonte: 'Heroi', restantes: 1 });
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('cura do alvo reduzida a 50% por 1 turno(s)');
    });
});
