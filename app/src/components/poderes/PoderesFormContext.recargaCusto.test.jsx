import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

// QA - recarga em turnos, custo por turno (editor) e efeito ao desligar no togglePoder.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const poder = (extra = {}) => ({ id: 1, nome: 'Escudo', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], ...extra });

function montarStore({ poderes = [], vida } = {}) {
    mockState = {
        minhaFicha: { poderes, ...(vida !== undefined ? { vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: vida } } : {}) },
        meuNome: 'Heroi', isMestre: false,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('togglePoder - recarga em turnos', () => {
    it('ligar inicia a recarga; ligar de novo em recarga e barrado com mensagem', () => {
        montarStore({ poderes: [poder({ recargaTurnos: 3 })] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(mockState.minhaFicha.poderes[0].recargaRestante).toBe(3);
        act(() => { probe.togglePoder(1); });   // desliga (permitido)
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        mockState.updateFicha.mockClear();
        act(() => { probe.togglePoder(1); });   // em recarga
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(window.alert).toHaveBeenCalledWith('Escudo em recarga: faltam 3 turnos');
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });

    it('recarga zerada libera de novo; poder sem recarga nunca grava o campo', () => {
        montarStore({ poderes: [poder({ recargaTurnos: 1, recargaRestante: 1 }), poder({ id: 2, nome: 'Livre' })] });
        act(() => { probe.togglePoder(2); });
        expect('recargaRestante' in mockState.minhaFicha.poderes[1]).toBe(false);
        delete mockState.minhaFicha.poderes[0].recargaRestante;
        rerender();
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
    });
});

function rerender() { act(() => { probe.setNomePoder('x' + Math.random()); }); }

describe('editor - custo por turno e recarga', () => {
    const criar = async (campos) => {
        act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); campos(); });
        await act(async () => { probe.salvarNovoPoder(); });
    };
    it('grava custoPorTurno e recargaTurnos validos', async () => {
        montarStore();
        await criar(() => { probe.setCustoTurnoPoder({ modo: 'percMax', valor: '5', energia: 'chakra' }); probe.setRecargaTurnosPoder('2'); });
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ custoPorTurno: { modo: 'percMax', valor: 5, energia: 'chakra' }, recargaTurnos: 2 });
    });
    it('vazio nao grava os campos; editar carrega e limpar remove', async () => {
        montarStore();
        await criar(() => {});
        expect('custoPorTurno' in mockState.minhaFicha.poderes[0]).toBe(false);
        expect('recargaTurnos' in mockState.minhaFicha.poderes[0]).toBe(false);
        mockState.minhaFicha.poderes[0] = { ...mockState.minhaFicha.poderes[0], custoPorTurno: { modo: 'fixo', valor: 12, energia: 'mana' }, recargaTurnos: 4, recargaRestante: 2 };
        act(() => { probe.editarPoder(mockState.minhaFicha.poderes[0].id); });
        expect(probe.custoTurnoPoder).toEqual({ modo: 'fixo', valor: 12, energia: 'mana' });
        expect(probe.recargaTurnosPoder).toBe(4);
        act(() => { probe.setCustoTurnoPoder({ modo: 'fixo', valor: '', energia: 'mana' }); probe.setRecargaTurnosPoder(''); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = mockState.minhaFicha.poderes[0];
        expect('custoPorTurno' in p).toBe(false);
        expect('recargaTurnos' in p).toBe(false);
        expect('recargaRestante' in p).toBe(false);
    });
});

describe('togglePoder - efeito ao desligar', () => {
    it('desligar a mao rola, tira da Vida e avisa no Feed', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0); // todo dado sai 1
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })], vida: 100 * FATOR_EXIBICAO_VITAIS });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(mockState.minhaFicha.vida.atual).toBe(90 * FATOR_EXIBICAO_VITAIS);
        expect(firebaseSync.enviarParaFeed.mock.calls[0][0].texto).toBe('💥 Escudo ao desligar causou 10 de dano em Heroi');
    });
    it('ligar nao causa dano; edicao (semAoDesligar) tambem nao', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        montarStore({ poderes: [poder({ aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })], vida: 100 * FATOR_EXIBICAO_VITAIS });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.vida.atual).toBe(100 * FATOR_EXIBICAO_VITAIS);
        act(() => { probe.togglePoder(1, { semAoDesligar: true }); });
        expect(mockState.minhaFicha.vida.atual).toBe(100 * FATOR_EXIBICAO_VITAIS);
        expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
    });

    it('feed so quando o dano foi realmente aplicado (sem Vida na ficha = sem dano e sem aviso)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        montarStore({ poderes: [poder({ ativa: true, aoDesligar: { dadosQtd: 10, dadosFaces: 6 } })] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
    });
    it('clique com ficha velha (Poder ja desligado no rascunho) nao avisa nem causa dano', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const velho = poder({ ativa: true, aoDesligar: { dadosQtd: 10, dadosFaces: 6 } });
        montarStore({ poderes: [velho], vida: 100 * FATOR_EXIBICAO_VITAIS });
        // o rascunho real ja tem o Poder ligado->desligado->ligado de novo? simula: rascunho ligado vira desligado, mas aqui o rascunho esta DESLIGADO
        const rascunho = { poderes: [{ ...velho, ativa: false }], vida: { ...mockState.minhaFicha.vida } };
        mockState.updateFicha = vi.fn((cb) => cb(rascunho));
        rerender();
        act(() => { probe.togglePoder(1); });
        expect(rascunho.vida.atual).toBe(100 * FATOR_EXIBICAO_VITAIS);
        expect(firebaseSync.enviarParaFeed).not.toHaveBeenCalled();
    });
});
