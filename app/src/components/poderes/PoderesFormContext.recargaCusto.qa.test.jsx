import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { MapaTecnicasRapidas } from '../mapa/MapaCombate';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS, descansarCompleto } from '../../core/vitals';
import { aplicarCustosPorTurno } from '../../core/custoPorTurno';

// QA (endurecimento) - recarga/ao desligar no togglePoder, alternarTecnica do Mapa, descanso e editor com valores estranhos.
vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10 })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

const F = FATOR_EXIBICAO_VITAIS;
let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const vital = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual });
const poder = (extra = {}) => ({ id: 1, nome: 'Escudo', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], ...extra });

function montarStore({ poderes = [], vida, extra = {}, filho } = {}) {
    mockState = {
        minhaFicha: { poderes, vida: vital(vida ?? 100 * F), mana: vital(100 * F), aura: vital(100 * F), chakra: vital(100 * F), corpo: vital(100 * F), combate: {}, ...extra },
        meuNome: 'Heroi', isMestre: false,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(), dummies: {}, personagens: {}, feedCombate: [], alvoSelecionado: null, abaAtiva: 'mapa', setAbaAtiva: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    return render(<PoderesFormProvider><Harness />{filho}</PoderesFormProvider>);
}
const p0 = () => mockState.minhaFicha.poderes[0];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('togglePoder - recarga nao impede desligar', () => {
    it('poder ligado e em recarga desliga normalmente, mantendo o contador; religar segue barrado ate zerar', () => {
        montarStore({ poderes: [poder({ ativa: true, recargaTurnos: 3, recargaRestante: 2 })] });
        act(() => { probe.togglePoder(1); });
        expect(p0().ativa).toBe(false);
        expect(p0().recargaRestante).toBe(2);
        expect(window.alert).not.toHaveBeenCalled();
        act(() => { probe.togglePoder(1); });
        expect(p0().ativa).toBe(false);
        expect(window.alert).toHaveBeenCalledWith('Escudo em recarga: faltam 2 turnos');
    });

    it('mensagem no singular com 1 turno restante', () => {
        montarStore({ poderes: [poder({ recargaTurnos: 3, recargaRestante: 1 })] });
        act(() => { probe.togglePoder(1); });
        expect(window.alert).toHaveBeenCalledWith('Escudo em recarga: faltam 1 turno');
    });

    it('barrado em recarga NAO salva nem grava vitais; id inexistente nao quebra', () => {
        montarStore({ poderes: [poder({ recargaRestante: 2 })] });
        act(() => { probe.togglePoder(1); });
        expect(firebaseSync.salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(() => act(() => { probe.togglePoder(999); })).not.toThrow();
    });

    it('poder legado (sem os campos novos) liga e desliga sem criar chaves novas nem undefined', () => {
        montarStore({ poderes: [poder()] });
        act(() => { probe.togglePoder(1); });
        act(() => { probe.togglePoder(1); });
        expect(Object.keys(p0()).sort()).toEqual(['ativa', 'categoria', 'efeitos', 'efeitosPassivos', 'id', 'nome']);
        expect(JSON.stringify(mockState.minhaFicha)).not.toContain('undefined');
    });

    it('recargaTurnos estranha (NaN, negativo, string, enorme) no poder nao quebra o ligar e limita a 99', () => {
        const casos = [[NaN, undefined], [-3, undefined], ['abc', undefined], ['2', 2], [1e9, 99], [0, undefined]];
        casos.forEach(([valor, esperado]) => {
            cleanup();
            montarStore({ poderes: [poder({ recargaTurnos: valor })] });
            act(() => { probe.togglePoder(1); });
            expect(p0().ativa).toBe(true);
            expect(p0().recargaRestante).toBe(esperado);
            expect(JSON.stringify(p0())).not.toContain('undefined');
        });
    });
});

describe('togglePoder - aoDesligar manual x automatico', () => {
    it('desligar a mao: dano exato 238d6 com rng fixo e tira da vida bruta sem reducao', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999999); // todo dado sai 6
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 238, dadosFaces: 6 } })], vida: 5000 * F });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.vida.atual).toBe((5000 - 238 * 6) * F);
        expect(firebaseSync.enviarParaFeed.mock.calls[0][0].texto).toContain('1.428');
    });

    it('dano maior que a vida para em 0 e nunca fica negativo nem NaN', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999999);
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 1000, dadosFaces: 1000 } })], vida: 10 * F });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.vida.atual).toBe(0);
    });

    it('limite de 1000 dados/faces: valores absurdos sao limitados (rng fixo = 1000 x 1000)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.9999999);
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 99999, dadosFaces: 99999 } })], vida: 1e9 * F });
        act(() => { probe.togglePoder(1); });
        expect(firebaseSync.enviarParaFeed.mock.calls[0][0].texto).toBe('💥 Escudo ao desligar causou 1.000.000 de dano em Heroi');
    });

    it('aoDesligar invalido (0, negativo, string, NaN, array) desliga sem dano e sem aviso no Feed', () => {
        [{ dadosQtd: 0, dadosFaces: 6 }, { dadosQtd: -1, dadosFaces: 6 }, { dadosQtd: 'x', dadosFaces: 6 }, { dadosQtd: NaN, dadosFaces: NaN }, [], 'texto'].forEach((ao) => {
            cleanup(); vi.clearAllMocks();
            montarStore({ poderes: [poder({ ativa: true, aoDesligar: ao })] });
            act(() => { probe.togglePoder(1); });
            expect(p0().ativa).toBe(false);
            expect(mockState.minhaFicha.vida.atual).toBe(100 * F);
            expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
        });
    });

    it('desligamento AUTOMATICO (sem energia no inicio do turno) NAO cobra aoDesligar nem alerta no Feed', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999999);
        montarStore({ poderes: [poder({ ativa: true, custoPorTurno: { modo: 'fixo', valor: 50, energia: 'mana' }, aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })], extra: {} });
        mockState.minhaFicha.mana.atual = 1000;
        aplicarCustosPorTurno(mockState.minhaFicha);
        expect(p0().ativa).toBe(false);
        expect(mockState.minhaFicha.vida.atual).toBe(100 * F);
        expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
    });

    it('editar um poder ligado desliga SEM cobrar aoDesligar; excluir um poder ligado tambem', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999999);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })] });
        act(() => { probe.editarPoder(1); });
        expect(p0().ativa).toBe(false);
        expect(mockState.minhaFicha.vida.atual).toBe(100 * F);
        cleanup();
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })] });
        act(() => { probe.deletarPoder(1); });
        expect(mockState.minhaFicha.poderes).toHaveLength(0);
        expect(mockState.minhaFicha.vida.atual).toBe(100 * F);
        expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
    });

    it('ligar com aoDesligar configurado nao rola nada (rng nao e chamado)', () => {
        const rnd = vi.spyOn(Math, 'random');
        montarStore({ poderes: [poder({ aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })] });
        act(() => { probe.togglePoder(1); });
        expect(rnd).not.toHaveBeenCalled();
        expect(mockState.minhaFicha.vida.atual).toBe(100 * F);
    });

    it('desligar a mao um poder com recarga E aoDesligar: cobra dano, mantem a recarga', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        montarStore({ poderes: [poder({ ativa: true, recargaTurnos: 2, recargaRestante: 2, aoDesligar: { dadosQtd: 4, dadosFaces: 6 } })] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.vida.atual).toBe(96 * F);
        expect(p0().recargaRestante).toBe(2);
    });
});

describe('Mapa (MapaTecnicasRapidas.alternarTecnica) - recarga', () => {
    const clicar = (getByText, rotulo) => act(() => { getByText(rotulo).click(); });

    it('em recarga: barra ligar com a mensagem, sem gastar Acao nem ligar', () => {
        const { getByText } = montarStore({ poderes: [poder({ id: 'p1', nome: 'Bola', recargaTurnos: 2, recargaRestante: 2 })], filho: <MapaTecnicasRapidas /> });
        clicar(getByText, '☆ Bola');
        expect(window.alert).toHaveBeenCalledWith('Bola em recarga: faltam 2 turnos');
        expect(p0().ativa).toBe(false);
    });

    it('em recarga mas LIGADO: o clique desliga (recarga nao impede desligar)', () => {
        const { getByText } = montarStore({ poderes: [poder({ id: 'p1', nome: 'Bola', ativa: true, recargaTurnos: 2, recargaRestante: 2 })], filho: <MapaTecnicasRapidas /> });
        clicar(getByText, '★ Bola');
        expect(window.alert).not.toHaveBeenCalled();
        expect(p0().ativa).toBe(false);
    });

    it('sem recarga liga e inicia a recarga configurada', () => {
        const { getByText } = montarStore({ poderes: [poder({ id: 'p1', nome: 'Bola', recargaTurnos: 3 })], filho: <MapaTecnicasRapidas /> });
        clicar(getByText, '☆ Bola');
        expect(p0().ativa).toBe(true);
        expect(p0().recargaRestante).toBe(3);
    });
});

describe('descanso x recarga', () => {
    it('descansarCompleto zera todas as recargas, mas nao liga nem desliga poderes', () => {
        const f = {
            vida: vital(1), mana: vital(0), aura: vital(0), chakra: vital(0), corpo: vital(0), combate: {},
            poderes: [
                poder({ id: 1, ativa: false, recargaTurnos: 3, recargaRestante: 3 }),
                poder({ id: 2, ativa: true, recargaTurnos: 2, recargaRestante: 1 }),
                poder({ id: 3, ativa: false }),
            ],
        };
        descansarCompleto(f);
        expect(f.poderes.map(p => p.ativa)).toEqual([false, true, false]);
        f.poderes.forEach(p => expect('recargaRestante' in p).toBe(false));
        expect(f.poderes[0].recargaTurnos).toBe(3);
        expect(JSON.stringify(f.poderes)).not.toContain('undefined');
    });

    it('descansar sem poderes (ficha antiga, poderes ausente) nao quebra', () => {
        const f = { vida: vital(1), mana: vital(0), aura: vital(0), chakra: vital(0), corpo: vital(0), combate: {} };
        expect(() => descansarCompleto(f)).not.toThrow();
    });
});

describe('editor - valores estranhos em custo por turno e recarga', () => {
    const criar = async (campos) => {
        act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); campos(); });
        await act(async () => { probe.salvarNovoPoder(); });
    };
    it.each([
        ['NaN', { modo: 'fixo', valor: NaN, energia: 'mana' }],
        ['negativo', { modo: 'fixo', valor: '-4', energia: 'mana' }],
        ['texto', { modo: 'fixo', valor: 'abc', energia: 'mana' }],
        ['enorme', { modo: 'fixo', valor: '1e20', energia: 'mana' }],
        ['percentual > 100', { modo: 'percMax', valor: '101', energia: 'mana' }],
        ['energia invalida', { modo: 'fixo', valor: '5', energia: 'vida' }],
        ['modo invalido', { modo: 'xis', valor: '5', energia: 'mana' }],
        ['zero', { modo: 'fixo', valor: '0', energia: 'mana' }],
    ])('custo %s nao e gravado', async (_n, valor) => {
        montarStore();
        await criar(() => { probe.setCustoTurnoPoder(valor); });
        expect('custoPorTurno' in p0()).toBe(false);
        expect(JSON.stringify(p0())).not.toContain('undefined');
    });
    it('custo com virgula decimal e gravado como numero', async () => {
        montarStore();
        await criar(() => { probe.setCustoTurnoPoder({ modo: 'fixo', valor: '2,5', energia: 'aura' }); });
        expect(p0().custoPorTurno).toEqual({ modo: 'fixo', valor: 2.5, energia: 'aura' });
    });
    it.each([['-2', false, undefined], ['abc', false, undefined], ['0', false, undefined], ['500', true, 99], ['3.9', true, 3]])('recarga %s => %s/%s', async (entrada, grava, esperado) => {
        montarStore();
        await criar(() => { probe.setRecargaTurnosPoder(entrada); });
        expect('recargaTurnos' in p0()).toBe(grava);
        expect(p0().recargaTurnos).toBe(esperado);
        expect('recargaRestante' in p0()).toBe(false);
    });
it('editar sem mexer na recarga mantem o restante', async () => {        montarStore({ poderes: [poder({ descricao: 'd', recargaTurnos: 4, recargaRestante: 2 })] });        act(() => { probe.editarPoder(1); });        await act(async () => { probe.salvarNovoPoder(); });        expect(p0().recargaTurnos).toBe(4);        expect(p0().recargaRestante).toBe(2);    });    it('editar limpando a recarga apaga recargaTurnos e recargaRestante', async () => {        montarStore({ poderes: [poder({ descricao: 'd', recargaTurnos: 4, recargaRestante: 2 })] });        act(() => { probe.editarPoder(1); });        act(() => { probe.setRecargaTurnosPoder(''); });        await act(async () => { probe.salvarNovoPoder(); });        expect('recargaTurnos' in p0()).toBe(false);        expect('recargaRestante' in p0()).toBe(false);    });
    it('editar preserva o aoDesligar existente (o editor nao o apaga)', async () => {
        montarStore({ poderes: [poder({ descricao: 'd', aoDesligar: { dadosQtd: 3, dadosFaces: 4, texto: 'dor' } })] });
        act(() => { probe.editarPoder(1); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(p0().aoDesligar).toEqual({ dadosQtd: 3, dadosFaces: 4, texto: 'dor' });
    });
});
