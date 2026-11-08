import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso, salvarFichaAlvoSilencioso } from '../../services/firebase-sync';

// QA Fase 3 - armar/desarmar (dono e Mestre, inclusive na ficha de OUTRO jogador via updateFichaAlvo) e "Forcar disparo" (so Mestre, confirm).
vi.mock('../../stores/useStore', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, default: vi.fn() }; // sanitizarNome real
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('x')),
    enviarParaFeed: vi.fn(),
}));

let mockState; let probe; let fichaAlvo;
function Harness() { probe = usePoderesForm(); return null; }
const OPC = { id: 'g1', nome: 'Cinzas', modo: 'opcional', armado: true, evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 2, texto: 'baixo', acoes: [{ tipo: 'mensagem', texto: 'dois' }] }, { ate: 4, texto: 'alto', acoes: [{ tipo: 'mensagem', texto: 'quatro' }] }] }] };
const SEM_ARMADO = { id: 'g3', nome: 'Antigo', modo: 'opcional', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] };
const AUTO = { id: 'g2', nome: 'Auto', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] };
const novaFicha = () => ({ vida: { base: 100000, atual: 5 }, poderes: [{ id: 1, nome: 'Volta', categoria: 'poder', ativa: true, efeitos: [], efeitosPassivos: [], gatilhos: [JSON.parse(JSON.stringify(OPC)), AUTO, SEM_ARMADO] }] });
function montar(isMestre, { alvo, vizinho } = {}) {
    const minha = novaFicha();
    fichaAlvo = novaFicha();
    mockState = {
        minhaFicha: minha, meuNome: 'Mestre', isMestre, cenario: { ativa: 'c1' },
        personagens: alvo ? { [alvo]: fichaAlvo, ...(vizinho ? { [vizinho]: novaFicha() } : {}) } : {},
        updateFicha: vi.fn((cb) => cb(minha)), updateFichaAlvo: vi.fn((nome, cb) => cb(mockState.personagens[nome])),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    return render(alvo
        ? <FichaAlvoProvider nome={alvo}><PoderesFormProvider><Harness /></PoderesFormProvider></FichaAlvoProvider>
        : <PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const g = (id, f = mockState.minhaFicha) => f.poderes[0].gatilhos.find(x => x.id === id);
let rngSpy;
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { cleanup(); rngSpy.mockRestore(); });

describe('armar/desarmar', () => {
    it('opcional sem `armado` (dado antigo): conta como DESARMADO; um clique ARMA (grava true), outro desarma (false)', () => {
        montar(false);
        expect('armado' in g('g3')).toBe(false);
        act(() => { probe.alternarArmadoGatilho(1, 'g3'); });
        expect(g('g3').armado).toBe(true);
        act(() => { probe.alternarArmadoGatilho(1, 'g3'); });
        expect(g('g3').armado).toBe(false);
    });
    it('salva com debounce a cada clique (salvarFichaSilencioso), nunca imediato', () => {
        montar(false);
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    it('gatilho automatico, poder inexistente, gatilho inexistente, ids de tipo diferente (string "1"): nada muda e nao lanca', () => {
        montar(false);
        const antes = JSON.stringify(mockState.minhaFicha);
        act(() => { probe.alternarArmadoGatilho(1, 'g2'); });
        act(() => { probe.alternarArmadoGatilho(99, 'g1'); });
        act(() => { probe.alternarArmadoGatilho(1, 'nao-existe'); });
        act(() => { probe.alternarArmadoGatilho('1', 'g1'); }); // comparacao estrita do id do poder (numero)
        act(() => { probe.alternarArmadoGatilho(undefined, undefined); });
        expect(JSON.stringify(mockState.minhaFicha)).toBe(antes);
    });
    it('alternar nao mexe em outros campos do gatilho (limite, acoes, nome) nem cria undefined', () => {
        montar(false);
        const antes = JSON.parse(JSON.stringify(g('g1')));
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect({ ...g('g1'), armado: true }).toEqual(antes);
        expect(JSON.stringify(mockState.minhaFicha)).not.toContain('undefined');
    });
    it('Mestre arma/desarma na ficha de OUTRO jogador (updateFichaAlvo) e o save vai para a ficha do alvo, nao para a do Mestre', () => {
        montar(true, { alvo: 'Ana' });
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect(mockState.updateFichaAlvo).toHaveBeenCalledWith('Ana', expect.any(Function));
        expect(g('g1', fichaAlvo).armado).toBe(false);
        expect(g('g1', mockState.minhaFicha).armado).toBe(true); // a ficha do Mestre nao foi tocada
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Ana');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('Mestre mirando uma ficha nao altera a de outro jogador aberto na mesa', () => {
        montar(true, { alvo: 'Ana', vizinho: 'Bia' });
        act(() => { probe.alternarArmadoGatilho(1, 'g1'); });
        expect(g('g1', mockState.personagens.Bia).armado).toBe(true);
    });
});

describe('Forcar disparo', () => {
    it('jogador comum: nada (nem confirm, nem update, nem feed)', () => {
        montar(false);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(window.confirm).not.toHaveBeenCalled(); expect(mockState.updateFicha).not.toHaveBeenCalled(); expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('Mestre cancela o confirm: ficha, save e feed intactos', () => {
        montar(true); window.confirm = vi.fn(() => false);
        const antes = JSON.stringify(mockState.minhaFicha);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(mockState.minhaFicha)).toBe(antes);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled(); expect(enviarParaFeed).not.toHaveBeenCalled(); expect(mockState.updateFicha).not.toHaveBeenCalled();
    });
    it('o confirm avisa o nome do gatilho e que ignora condicoes e limite', () => {
        montar(true);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(window.confirm.mock.calls[0][0]).toMatch(/Cinzas.*ignora as condições e o limite/);
    });
    it('gatilho/poder inexistente: sem confirm, sem feed', () => {
        montar(true);
        act(() => { probe.forcarGatilhoMestre(1, 'nao'); probe.forcarGatilhoMestre(99, 'g1'); });
        expect(window.confirm).not.toHaveBeenCalled(); expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('forca gatilho DESARMADO, com limite ja esgotado, e NAO gasta o limite nem grava ultimoEvento; feed diz "forcado pelo Mestre"', () => {
        montar(true);
        mockState.minhaFicha.poderes[0].gatilhos[0].armado = false;
        mockState.minhaFicha.combate = { usosPoderes: { '1:g1': { n: 1, cena: 'c1' } } };
        const usosAntes = JSON.stringify(mockState.minhaFicha.combate);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(JSON.stringify(mockState.minhaFicha.combate)).toBe(usosAntes);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        const t = enviarParaFeed.mock.calls.at(-1)[0].texto;
        expect(t).toContain('Cinzas forçado pelo Mestre'); expect(t).not.toMatch(/undefined|NaN/);
        expect(enviarParaFeed.mock.calls.at(-1)[0]).toMatchObject({ tipo: 'sistema', nome: 'SISTEMA' });
    });
    it('forcar duas vezes seguidas executa duas vezes (nao fica "preso" no limite)', () => {
        montar(true);
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(enviarParaFeed).toHaveBeenCalledTimes(2);
    });
    it('poder DESLIGADO: ainda forca', () => {
        montar(true); mockState.minhaFicha.poderes[0].ativa = false;
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });
    it('gatilho mestreDesligou: ainda forca (o Mestre manda)', () => {
        montar(true); mockState.minhaFicha.poderes[0].gatilhos[0].mestreDesligou = true;
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(enviarParaFeed.mock.calls.at(-1)[0].texto).toContain('forçado pelo Mestre');
    });
    it('rolagem consistente se o produtor Immer rodar duas vezes (rng pre-sorteado reiniciado): o texto do feed e o da 1a execucao', () => {
        // primeiro Math.random (valor 0 do pre-sorteio) = 0.99 -> 1d4 = 4 ("alto"); o resto 0.001 -> se NAO reiniciasse, a 2a execucao rolaria 1 ("baixo")
        let n = 0; rngSpy.mockImplementation(() => (n++ === 0 ? 0.99 : 0.001));
        montar(true);
        const minha = mockState.minhaFicha;
        mockState.updateFicha = vi.fn((cb) => { cb(JSON.parse(JSON.stringify(minha))); cb(minha); }); // Immer "re-executando"
        useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
        cleanup(); render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
        n = 0;
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(enviarParaFeed.mock.calls.at(-1)[0].texto).toContain('rolou 4 (d4): alto');
    });
    it('Mestre forca na ficha de OUTRO jogador: muda a Vida dele (nao a do Mestre) e salva a ficha do alvo', () => {
        montar(true, { alvo: 'Ana' });
        act(() => { probe.forcarGatilhoMestre(1, 'g1'); });
        expect(mockState.updateFichaAlvo).toHaveBeenCalledWith('Ana', expect.any(Function));
        expect(fichaAlvo.vida.atual).not.toBe(5); expect(mockState.minhaFicha.vida.atual).toBe(5);
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Ana'); expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });
});
