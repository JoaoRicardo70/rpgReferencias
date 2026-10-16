import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

let mockState; let probe; let ficha;
function Harness() { probe = useAtaqueForm(); return null; }

function montar(extra = {}, ajustar) {
    ficha = {
        poderes: [{ id: 'p1', nome: 'Golpe', ativa: true, statusUsados: ['inteligencia'], energiaCombustao: 'vida', custoPercentual: 10 }],
        inventario: [], passivas: [], hierarquia: {}, combate: {},
        ataquesElementais: [
            { id: 'm1', nome: 'Bola', equipado: true, elemento: 'Fogo', dadosExtraQtd: 10, dadosExtraFaces: 10, custoValor: 5 },
        ],
        ataqueConfig: { armaStatusUsados: ['destreza'], armaEnergiaCombustao: 'vida', armaPercEnergia: 7 },
        ...extra,
    };
    if (ajustar) ajustar(ficha);
    mockState = {
        minhaFicha: ficha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [], alvoSelecionado: null, dummies: {},
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}

const salvoBase = (over = {}) => ({
    id: 1, nome: 'Combo', versao: 2,
    config: {
        armaStatusUsados: ['forca'], armaEnergiaCombustao: 'mana', armaPercEnergia: 3,
        poderesIds: ['p1'], magiasIds: ['m1'],
        skillConfigs: {
            p1: { statusUsados: ['forca'], energiaCombustao: 'mana', comoPoder: true, percComoPoder: 25 },
            m1: { statusUsados: ['sabedoria'], energiaCombustao: 'mana', comoPoder: false },
        },
        ...over,
    },
});
const argsEngine = () => calcularDano.mock.calls[0][0];

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    window.prompt = vi.fn();
    calcularDano.mockReturnValue({ dano: 5, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('AtaqueFormContext.rolarAtaqueSalvo', () => {
    it('usa a configuracao SALVA (arma, habilidade e magia), nao a de tela', () => {
        montar();
        act(() => { probe.rolarAtaqueSalvo(salvoBase()); });
        expect(calcularDano).toHaveBeenCalledTimes(1);
        const a = argsEngine();
        expect(a.configArma).toEqual({ statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 3 });
        const p = a.configHabilidades.find(h => h.id === 'p1');
        expect(p).toMatchObject({ statusUsados: ['forca'], energiaCombustao: 'mana', comoPoder: true, percComoPoder: 25 });
        const m = a.configHabilidades.find(h => h.id === 'm1');
        expect(m).toMatchObject({ statusUsados: ['sabedoria'], energiaCombustao: 'mana', comoPoder: false });
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('rolarDano normal usa a config de tela (contraste) e salva a config da ficha', () => {
        montar();
        act(() => { probe.rolarDano(); });
        const a = argsEngine();
        expect(a.configArma.statusUsados).toEqual(['destreza']);
        expect(a.configHabilidades.find(h => h.id === 'p1').statusUsados).toEqual(['inteligencia']);
        expect(ficha.ataqueConfig.criticoNormalMin).toBe(16);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('NAO chama salvarConfigAtaque (ficha e config da tela ficam intactas)', () => {
        montar();
        act(() => { probe.rolarAtaqueSalvo(salvoBase()); });
        expect(ficha.ataqueConfig.criticoNormalMin).toBeUndefined();
        expect(ficha.ataqueConfig.armaStatusUsados).toEqual(['destreza']);
        expect(ficha.poderes[0].statusUsados).toEqual(['inteligencia']);
        expect(ficha.poderes[0].comoPoder).toBeUndefined();
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('habilidade nao mais ativa: pede confirmacao; recusar nao executa', () => {
        montar({}, f => { f.poderes[0].ativa = false; });
        window.confirm = vi.fn(() => false);
        act(() => { probe.rolarAtaqueSalvo(salvoBase()); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toMatch(/^1 habilidade/);
        expect(calcularDano).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('habilidade ausente: confirmar executa so com o que esta ativo', () => {
        montar({}, f => { f.poderes[0].ativa = false; });
        act(() => { probe.rolarAtaqueSalvo(salvoBase()); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(argsEngine().configHabilidades.map(h => h.id)).toEqual(['m1']);
    });

    it('magia desequipada tambem conta como faltando (2 faltando)', () => {
        montar({}, f => { f.poderes[0].ativa = false; f.ataquesElementais[0].equipado = false; });
        act(() => { probe.rolarAtaqueSalvo(salvoBase()); });
        expect(window.confirm.mock.calls[0][0]).toMatch(/^2 habilidade/);
        expect(argsEngine().configHabilidades).toEqual([]);
    });

    it('habilidade ativa NAO listada no salvo fica de fora do golpe', () => {
        montar();
        act(() => { probe.rolarAtaqueSalvo(salvoBase({ poderesIds: [], magiasIds: ['m1'] })); });
        expect(argsEngine().configHabilidades.map(h => h.id)).toEqual(['m1']);
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('registro sem config: alerta e nao executa', () => {
        montar();
        act(() => { probe.rolarAtaqueSalvo({ id: 9, nome: 'Velho' }); });
        expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/incompleto/));
        expect(calcularDano).not.toHaveBeenCalled();
    });

    it('limite de dados: magia com 10d10 de Fogo (limite 50) chega na engine com 5 dados', () => {
        montar();
        act(() => { probe.rolarAtaqueSalvo(salvoBase()); });
        const m = argsEngine().configHabilidades.find(h => h.id === 'm1');
        expect(m.dadosQtd).toBe(5);
        expect(m.dadosFaces).toBe(10);
    });

    it('limite de dados vale no rolarDano normal; magia sem limite (Neutro) passa intacta', () => {
        montar({}, f => f.ataquesElementais.push({ id: 'm2', nome: 'Soco', equipado: true, elemento: 'Neutro', dadosExtraQtd: 30, dadosExtraFaces: 20 }));
        act(() => { probe.rolarDano(); });
        const hs = argsEngine().configHabilidades;
        expect(hs.find(h => h.id === 'm1').dadosQtd).toBe(5);
        expect(hs.find(h => h.id === 'm2').dadosQtd).toBe(30);
    });

    it('limiteDados proprio da tecnica sobrepoe o padrao do elemento', () => {
        montar({}, f => { f.ataquesElementais[0].limiteDados = 80; });
        act(() => { probe.rolarDano(); });
        expect(argsEngine().configHabilidades.find(h => h.id === 'm1').dadosQtd).toBe(8);
    });
});

describe('AtaqueFormContext.salvarAtaque / deletarAtaqueSalvo', () => {
    it('salvarAtaque grava a configuracao atual na ficha e persiste', () => {
        montar();
        window.prompt = vi.fn(() => '  Meu Combo  ');
        act(() => { probe.salvarAtaque(); });
        const lista = ficha.ataqueConfig.ataquesSalvos;
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ nome: 'Meu Combo', versao: 2 });
        expect(lista[0].config.poderesIds).toEqual(['p1']);
        expect(lista[0].config.magiasIds).toEqual(['m1']);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('salvarAtaque com nome vazio ou cancelado nao grava', () => {
        montar();
        for (const v of [null, '', '   ']) {
            window.prompt = vi.fn(() => v);
            act(() => { probe.salvarAtaque(); });
        }
        expect(ficha.ataqueConfig.ataquesSalvos).toBeUndefined();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('deletarAtaqueSalvo remove so o id pedido; id inexistente nao quebra', () => {
        montar({ ataqueConfig: { ataquesSalvos: [{ id: 1, nome: 'a' }, { id: 2, nome: 'b' }] } });
        act(() => { probe.deletarAtaqueSalvo(1); });
        expect(ficha.ataqueConfig.ataquesSalvos.map(a => a.id)).toEqual([2]);
        act(() => { probe.deletarAtaqueSalvo(999); });
        expect(ficha.ataqueConfig.ataquesSalvos.map(a => a.id)).toEqual([2]);
    });
    it('deletarAtaqueSalvo sem ataqueConfig nao quebra', () => {
        montar({ ataqueConfig: undefined });
        expect(() => act(() => { probe.deletarAtaqueSalvo(1); })).not.toThrow();
    });
});
