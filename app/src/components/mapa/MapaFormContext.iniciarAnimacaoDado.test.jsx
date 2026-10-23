import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, iniciarAnimacaoDado } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarConfig } from '../../core/configuracoes';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')), salvarCenarioCompleto: vi.fn(), zerarIniciativaGlobal: vi.fn()
}));

const resultado = { cor: '#ffcc00', corTexto: '#ffe066', nivel: 'critico', duracaoMs: 2500 };
const args = (extra = {}) => ({ rawRoll: 19, quemRolou: 'Kenji', resultadoRolagem: resultado, ...extra });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('iniciarAnimacaoDado: modo desligado', () => {
    it('nao chama setDadoAnim nem agenda timers', () => {
        vi.useFakeTimers();
        salvarConfig({ dadoModo: 'desligado' });
        const set = vi.fn();
        iniciarAnimacaoDado(set, args());
        vi.advanceTimersByTime(5000);
        expect(set).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('iniciarAnimacaoDado: modo fisico', () => {
    it('chama setDadoAnim uma vez com fisica:true, resultado imediato e pousou:false', () => {
        vi.useFakeTimers();
        const set = vi.fn();
        iniciarAnimacaoDado(set, args());
        expect(set).toHaveBeenCalledTimes(1);
        const d = set.mock.calls[0][0];
        expect(d).toMatchObject({
            ativo: true, fisica: true, numero: 19, finalResult: 19, pousou: false, segurando: false, efeitos: 'intensos',
            cor: '#ffcc00', corTexto: '#ffe066', nivel: 'critico', duracaoMs: 2500, quemRolou: 'Kenji', forcar: false
        });
        expect(typeof d.id).toBe('string');
        expect(d.id.length).toBeGreaterThan(3);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('cada lancamento recebe um id diferente', () => {
        const set = vi.fn();
        iniciarAnimacaoDado(set, args());
        iniciarAnimacaoDado(set, args());
        expect(set.mock.calls[0][0].id).not.toBe(set.mock.calls[1][0].id);
    });
    it('segurando so se a opcao mao esta ligada E quem rolou sou eu', () => {
        salvarConfig({ dadoMao: true });
        const set = vi.fn();
        iniciarAnimacaoDado(set, args({ souQuemRolou: true }));
        iniciarAnimacaoDado(set, args({ souQuemRolou: false }));
        iniciarAnimacaoDado(set, args());
        expect(set.mock.calls[0][0].segurando).toBe(true);
        expect(set.mock.calls[1][0].segurando).toBe(false);
        expect(set.mock.calls[2][0].segurando).toBe(false);
    });
    it('sem a opcao mao nao segura nem quando fui eu quem rolou', () => {
        const set = vi.fn();
        iniciarAnimacaoDado(set, args({ souQuemRolou: true }));
        expect(set.mock.calls[0][0].segurando).toBe(false);
    });
    it('repassa forcar e efeitos configurados', () => {
        salvarConfig({ dadoEfeitos: 'suaves' });
        const set = vi.fn();
        iniciarAnimacaoDado(set, args({ forcar: true }));
        expect(set.mock.calls[0][0]).toMatchObject({ forcar: true, efeitos: 'suaves' });
    });
    it('reduzirAnimacoes cai no modo simples, sem efeitos', () => {
        vi.useFakeTimers();
        salvarConfig({ reduzirAnimacoes: true });
        const set = vi.fn();
        iniciarAnimacaoDado(set, args());
        expect(set.mock.calls[0][0].fisica).toBeUndefined();
        vi.advanceTimersByTime(80 * 17);
        expect(set.mock.calls[set.mock.calls.length - 1][0].efeitos).toBe('desligados');
    });
});

describe('iniciarAnimacaoDado: modo simples (timers)', () => {
    beforeEach(() => { salvarConfig({ dadoModo: 'simples' }); });

    it('abre com numero aleatorio 1-20 e sem resultado', () => {
        vi.useFakeTimers();
        const set = vi.fn();
        iniciarAnimacaoDado(set, args({ forcar: true }));
        expect(set).toHaveBeenCalledTimes(1);
        const d = set.mock.calls[0][0];
        expect(d).toMatchObject({ ativo: true, finalResult: null, nivel: 'normal', quemRolou: 'Kenji', forcar: true });
        expect(d.fisica).toBeUndefined();
        expect(d.numero).toBeGreaterThanOrEqual(1);
        expect(d.numero).toBeLessThanOrEqual(20);
    });
    it('embaralha o numero a cada 80ms ate o resultado final e depois fecha apos duracaoMs', () => {
        vi.useFakeTimers();
        const set = vi.fn();
        iniciarAnimacaoDado(set, args());
        vi.advanceTimersByTime(80);
        expect(set).toHaveBeenCalledTimes(2);
        const atualiza = set.mock.calls[1][0];
        expect(typeof atualiza).toBe('function');
        const n = atualiza({ ativo: true, numero: 3, finalResult: null }).numero;
        expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(20);

        vi.advanceTimersByTime(80 * 15);
        const ultima = set.mock.calls[set.mock.calls.length - 1][0];
        expect(ultima).toMatchObject({ ativo: true, numero: 19, finalResult: 19, cor: '#ffcc00', nivel: 'critico', efeitos: 'intensos' });
        const chamadasAntes = set.mock.calls.length;

        vi.advanceTimersByTime(80 * 5);
        expect(set.mock.calls.length).toBe(chamadasAntes);
        vi.advanceTimersByTime(2500);
        expect(set.mock.calls[set.mock.calls.length - 1][0]).toMatchObject({ ativo: false, finalResult: null });
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('evento rpg-testar-dado (MapaFormProvider)', () => {
    let probe;
    function Harness() { probe = useMapaForm(); return null; }
    function montar() {
        const minhaFicha = { acoes: {}, poderes: [], inventario: [], passivas: [], combate: {} };
        const state = {
            minhaFicha, meuNome: 'Heroi', personagens: {}, updateFicha: vi.fn(), feedCombate: [], isMestre: false, mesaCriador: '',
            dummies: {}, alvoSelecionado: null, abaAtiva: 'aba-Ficha', cenario: { ativa: 'default', lista: { default: { nome: 'C', escala: 1 } }, turnoAtualIndex: 0 }
        };
        useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
        useStore.getState = () => state;
        probe = undefined;
        return render(<MapaFormProvider><Harness /></MapaFormProvider>);
    }
    it.each([['fatal', 20, 'fatal'], ['critico', 19, 'critico'], ['falha', 1, 'falha'], ['normal', 13, 'normal']])('nivel %s rola %i e abre o dado fisico forcado', (nivel, valor, esperado) => {
        montar();
        act(() => { window.dispatchEvent(new CustomEvent('rpg-testar-dado', { detail: { nivel } })); });
        expect(probe.dadoAnim).toMatchObject({ ativo: true, fisica: true, finalResult: valor, nivel: esperado, forcar: true, quemRolou: 'Heroi' });
    });
    it('sem detalhe ou nivel desconhecido usa o valor comum (13)', () => {
        montar();
        act(() => { window.dispatchEvent(new CustomEvent('rpg-testar-dado')); });
        expect(probe.dadoAnim.finalResult).toBe(13);
        act(() => { window.dispatchEvent(new CustomEvent('rpg-testar-dado', { detail: { nivel: 'xyz' } })); });
        expect(probe.dadoAnim.finalResult).toBe(13);
    });
    it('no modo desligado o evento nao abre nada', () => {
        salvarConfig({ dadoModo: 'desligado' });
        montar();
        act(() => { window.dispatchEvent(new CustomEvent('rpg-testar-dado', { detail: { nivel: 'fatal' } })); });
        expect(probe.dadoAnim.ativo).toBe(false);
    });
    it('o listener e removido no unmount', () => {
        const rem = vi.spyOn(window, 'removeEventListener');
        const { unmount } = montar();
        unmount();
        expect(rem.mock.calls.some(c => c[0] === 'rpg-testar-dado')).toBe(true);
        rem.mockRestore();
    });
});
