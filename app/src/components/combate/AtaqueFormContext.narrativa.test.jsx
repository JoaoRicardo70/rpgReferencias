import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - rolarDano grava narrativa/narrativaComplemento no feed (descricoesAtaque da arma e das tecnicas do golpe).
vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

let mockState; let probe; let ficha;
function Harness() { probe = useAtaqueForm(); return null; }
const desc = (t) => [{ id: 'd1', texto: t }];

function montar(ajustar) {
    ficha = {
        poderes: [
            { id: 'p1', nome: 'Golpe', ativa: true, statusUsados: ['inteligencia'], energiaCombustao: 'vida', custoPercentual: 10 },
            { id: 'p2', nome: 'Forma Extra', ativa: true, statusUsados: ['forca'], energiaCombustao: 'vida', custoPercentual: 10 },
        ],
        inventario: [], passivas: [], hierarquia: {}, combate: {},
        ataquesElementais: [],
        ataqueConfig: { armaStatusUsados: ['destreza'], armaEnergiaCombustao: 'vida', armaPercEnergia: 7 },
    };
    if (ajustar) ajustar(ficha);
    mockState = {
        minhaFicha: ficha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [], alvoSelecionado: null, dummies: {},
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] }, adicionarAviso: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}
const base = { dano: 50, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' };
const feedEnviado = () => enviarParaFeed.mock.calls.map(c => c[0]).find(f => f.tipo === 'dano');

beforeEach(() => {
    vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true);
    calcularDano.mockReturnValue({ ...base });
});
afterEach(() => cleanup());

describe('rolarDano grava a narrativa no feed', () => {
    it('sem descrições: o feed não ganha os campos', () => {
        montar();
        act(() => { probe.rolarDano(); });
        const f = feedEnviado();
        expect(f).toBeDefined();
        expect('narrativa' in f).toBe(false);
        expect('narrativaComplemento' in f).toBe(false);
    });
    it('poder ativo com descrição: narrativa com marcadores trocados e complemento com ativos', () => {
        montar(f => { f.poderes[0].descricoesAtaque = desc('{atacante} usa {tecnica}'); });
        act(() => { probe.rolarDano(); });
        const f = feedEnviado();
        expect(f.narrativa).toBe('Heroi usa Golpe.');
        expect(f.narrativaComplemento).toContain('Ativos: Golpe, Forma Extra');
    });
    it('arma equipada com descrição usa {arma}', () => {
        montar(f => { f.inventario = [{ id: 1, nome: 'Katana', tipo: 'arma', equipado: true, descricoesAtaque: desc('Corta com {arma}') }]; });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().narrativa).toBe('Corta com Katana.');
    });
    it('arma não equipada é ignorada', () => {
        montar(f => { f.inventario = [{ id: 1, nome: 'Katana', tipo: 'arma', equipado: false, descricoesAtaque: desc('x') }]; });
        act(() => { probe.rolarDano(); });
        expect('narrativa' in feedEnviado()).toBe(false);
    });
    it('Técnica Elemental equipada contribui', () => {
        montar(f => { f.ataquesElementais = [{ id: 'm1', nome: 'Bola', equipado: true, elemento: 'Fogo', dadosExtraQtd: 1, dadosExtraFaces: 6, descricoesAtaque: desc('Lança {tecnica}') }]; });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().narrativa).toBe('Lança Bola.');
    });
    it('crítico no armaStr entra no complemento', () => {
        calcularDano.mockReturnValue({ ...base, armaStr: ' (CRÍTICO FATAL)' });
        montar(f => { f.poderes[0].descricoesAtaque = desc('oi'); });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().narrativaComplemento).toContain('Crítico Fatal!');
    });
    it('rolarAtaqueSalvo usa só as técnicas do golpe salvo, não todas as ativas', () => {
        montar(f => {
            f.poderes[0].descricoesAtaque = desc('Primeiro');
            f.poderes[1].descricoesAtaque = desc('Segundo');
        });
        const salvo = { id: 1, nome: 'Combo', versao: 2, config: {
            armaStatusUsados: ['forca'], armaEnergiaCombustao: 'mana', armaPercEnergia: 3, poderesIds: ['p1'], magiasIds: [],
            skillConfigs: { p1: { statusUsados: ['forca'], energiaCombustao: 'mana', comoPoder: false } },
        } };
        act(() => { probe.rolarAtaqueSalvo(salvo); });
        const f = feedEnviado();
        expect(f.narrativa).toBe('Primeiro.');
        expect(f.narrativa).not.toContain('Segundo');
        expect(f.narrativaComplemento).toContain('Ativos: Golpe');
        expect(f.narrativaComplemento).not.toContain('Forma Extra');
    });
    it('rolarDano normal (sem salvo) usa todas as ativas', () => {
        montar(f => { f.poderes[0].descricoesAtaque = desc('Primeiro'); f.poderes[1].descricoesAtaque = desc('Segundo'); });
        act(() => { probe.rolarDano(); });
        expect(feedEnviado().narrativa).toBe('Primeiro. Segundo.');
    });
});
