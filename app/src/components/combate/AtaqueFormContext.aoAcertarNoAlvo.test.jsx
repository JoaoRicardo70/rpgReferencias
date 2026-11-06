import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCamposPersonagem } from '../../services/firebase-sync';
import { calcularDano, calcularCA } from '../../core/engine';

// "Ao acertar" no ALVO (dreno de energia / debuff): golpe em alvo-personagem grava na ficha dele (salvarCamposPersonagem),
// nao cura o atacante, e o Dummie so recebe um aviso.

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
const DEBUFF = [{ tipo: 'debuffAlvo', modo: 'fixo', valor: 3, atributo: 'evasiva', duracao: 4 }];
const CURA = { tipo: 'curarAtacante', modo: 'fixo', valor: 50 };

function montar({ alvoSelecionado, personagens = {}, dummies = {}, poderes = [], vidaAtual = 500000 }) {
    const minhaFicha = { poderes, inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10, vida: stat(vidaAtual) };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, dummies, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}

const ultimoFeed = () => enviarParaFeed.mock.calls[enviarParaFeed.mock.calls.length - 1][0];
const dano = (n) => calcularDano.mockReturnValue({ dano: n, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); dano(1000); });
afterEach(() => cleanup());

describe('AtaqueFormContext - Ao acertar no alvo', () => {
    it('Poder com debuffAlvo em alvo-personagem grava o buff negativo e nao cura o atacante', () => {
        montar({
            alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() },
            poderes: [{ id: 'p1', nome: 'Grilhoes', ativa: true, aoAcertar: DEBUFF }],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Ana');
        const buff = campos.buffsTemporarios[0];
        expect(buff).toMatchObject({ nome: 'Enfraquecido (Evasiva)', fonte: 'Heroi', restantes: 4 });
        expect(buff.efeitos[0]).toMatchObject({ atributo: 'evasiva', propriedade: 'base', valor: -3 });
        expect(mockState.minhaFicha.vida.atual).toBe(500000);
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('Ana: ');
        // efeito real: a CA de Ana cai com o buff
        const ana = fichaAna();
        expect(calcularCA({ ...ana, buffsTemporarios: campos.buffsTemporarios }, 'evasiva')).toBeLessThan(calcularCA(ana, 'evasiva'));
    });

    it('dreno de mana grava mana/atual reduzida na ficha da Ana', () => {
        montar({
            alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() },
            poderes: [{ id: 'p1', nome: 'Sifao', ativa: true, aoAcertar: [{ tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 20, energia: 'mana' }] }],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'mana/atual': 100000 - 20 * 1000 });
    });

    it('cura do atacante e debuff no alvo convivem: cura o atacante e grava no alvo', () => {
        montar({
            alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() },
            poderes: [{ id: 'p1', nome: 'Mix', ativa: true, aoAcertar: [CURA, ...DEBUFF] }],
        });
        act(() => { probe.rolarDano(); });
        expect(mockState.minhaFicha.vida.atual).toBe(500000 + 50 * 1000);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
    });

    it('Poder inativo nao grava no alvo', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() }, poderes: [{ id: 'p1', nome: 'G', ativa: false, aoAcertar: DEBUFF }] });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('dano 0 no alvo nao grava', () => {
        dano(0);
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() }, poderes: [{ id: 'p1', nome: 'G', ativa: true, aoAcertar: DEBUFF }] });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('Dummie recebe o aviso e nada e gravado em personagem', () => {
        montar({ alvoSelecionado: 'g1', dummies: { g1: { nome: 'Goblin', hpAtual: 100000, valorDefesa: 10 } }, poderes: [{ id: 'p1', nome: 'G', ativa: true, aoAcertar: DEBUFF }] });
        act(() => { probe.rolarDano(); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(ultimoFeed().textoPosGolpe.filter(t => t.includes('não tem ficha'))).toHaveLength(1);
    });
});
