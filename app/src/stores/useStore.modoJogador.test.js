import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore from './useStore';

// QA - Modo Jogador: souMestreReal / modoJogador / isMestre efetivo / entidadeInspecionada.
const chave = (mesa) => `rpgModoJogador_${mesa}`;
const st = () => useStore.getState();

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ mesaId: 'mesaA', isMestre: false, souMestreReal: false, modoJogador: false, entidadeInspecionada: null });
});

describe('setIsMestre', () => {
    it('Mestre real fora do Modo Jogador: isMestre true e souMestreReal true', () => {
        st().setIsMestre(true);
        expect(st().souMestreReal).toBe(true);
        expect(st().isMestre).toBe(true);
    });
    it('jogador comum: ambos false', () => {
        st().setIsMestre(false);
        expect(st().souMestreReal).toBe(false);
        expect(st().isMestre).toBe(false);
    });
    it('valores nao booleanos viram booleano (undefined/null/0/vazio)', () => {
        [undefined, null, 0, ''].forEach(v => {
            st().setIsMestre(v);
            expect(st().souMestreReal).toBe(false);
            expect(st().isMestre).toBe(false);
        });
        st().setIsMestre('sim');
        expect(st().souMestreReal).toBe(true);
    });
    it('listener primeiro: Modo Jogador ja ligado quando o Firebase confirma que e Mestre => isMestre continua false', () => {
        useStore.setState({ modoJogador: true });
        st().setIsMestre(true);
        expect(st().souMestreReal).toBe(true);
        expect(st().isMestre).toBe(false);
    });
    it('Firebase retirando o papel de Mestre em Modo Jogador zera souMestreReal e isMestre', () => {
        useStore.setState({ modoJogador: true, souMestreReal: true });
        st().setIsMestre(false);
        expect(st().souMestreReal).toBe(false);
        expect(st().isMestre).toBe(false);
    });
});

describe('setModoJogador', () => {
    it('ligar: isMestre false, souMestreReal preservado, persiste sim', () => {
        st().setIsMestre(true);
        st().setModoJogador(true);
        expect(st().modoJogador).toBe(true);
        expect(st().isMestre).toBe(false);
        expect(st().souMestreReal).toBe(true);
        expect(localStorage.getItem(chave('mesaA'))).toBe('sim');
    });
    it('desligar: volta a ser Mestre e persiste nao', () => {
        st().setIsMestre(true);
        st().setModoJogador(true);
        st().setModoJogador(false);
        expect(st().modoJogador).toBe(false);
        expect(st().isMestre).toBe(true);
        expect(localStorage.getItem(chave('mesaA'))).toBe('nao');
    });
    it('toggle primeiro, depois o listener: ordem inversa chega ao mesmo estado', () => {
        st().setModoJogador(true);
        expect(st().isMestre).toBe(false);
        st().setIsMestre(true);
        expect(st().isMestre).toBe(false);
        expect(st().souMestreReal).toBe(true);
        st().setModoJogador(false);
        expect(st().isMestre).toBe(true);
    });
    it('quem nao e Mestre real nunca vira Mestre ao desligar o modo', () => {
        st().setModoJogador(true);
        st().setModoJogador(false);
        expect(st().isMestre).toBe(false);
    });
    it('limpa a entidade inspecionada (ao ligar e ao desligar)', () => {
        st().setIsMestre(true);
        st().setEntidadeInspecionada({ tipo: 'dummie', id: 'd1' });
        st().setModoJogador(true);
        expect(st().entidadeInspecionada).toBeNull();
        st().setEntidadeInspecionada({ tipo: 'jogador', id: 'Ana' });
        st().setModoJogador(false);
        expect(st().entidadeInspecionada).toBeNull();
    });
    it('valor nao booleano e coagido', () => {
        st().setIsMestre(true);
        st().setModoJogador('x');
        expect(st().modoJogador).toBe(true);
        expect(st().isMestre).toBe(false);
        st().setModoJogador(undefined);
        expect(st().modoJogador).toBe(false);
        expect(st().isMestre).toBe(true);
    });
    it('localStorage indisponivel (setItem lanca) nao quebra e o estado muda mesmo assim', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cota'); });
        try {
            st().setIsMestre(true);
            expect(() => st().setModoJogador(true)).not.toThrow();
            expect(st().modoJogador).toBe(true);
            expect(st().isMestre).toBe(false);
        } finally { spy.mockRestore(); }
    });
    it('sem mesaId usa a chave semMesa', () => {
        useStore.setState({ mesaId: '' });
        st().setModoJogador(true);
        expect(localStorage.getItem(chave('semMesa'))).toBe('sim');
    });
});

describe('setMesaId recarrega o Modo Jogador da mesa', () => {
    it('mesa com modo salvo sim: liga o Modo Jogador e esconde o poder de Mestre', () => {
        localStorage.setItem(chave('mesaB'), 'sim');
        st().setIsMestre(true);
        st().setMesaId('mesaB');
        expect(st().mesaId).toBe('mesaB');
        expect(st().modoJogador).toBe(true);
        expect(st().isMestre).toBe(false);
        expect(st().souMestreReal).toBe(true);
    });
    it('mesa sem valor salvo: desliga e devolve o Mestre', () => {
        st().setIsMestre(true);
        st().setModoJogador(true);
        st().setMesaId('mesaC');
        expect(st().modoJogador).toBe(false);
        expect(st().isMestre).toBe(true);
    });
    it('o Modo Jogador e por mesa: ligado na A, ao voltar para a A continua ligado', () => {
        st().setIsMestre(true);
        st().setModoJogador(true);
        st().setMesaId('mesaB');
        expect(st().modoJogador).toBe(false);
        st().setMesaId('mesaA');
        expect(st().modoJogador).toBe(true);
        expect(st().isMestre).toBe(false);
    });
    it('valor salvo diferente de sim (nao, lixo) conta como desligado', () => {
        localStorage.setItem(chave('mesaD'), 'nao');
        localStorage.setItem(chave('mesaE'), 'true');
        st().setMesaId('mesaD'); expect(st().modoJogador).toBe(false);
        st().setMesaId('mesaE'); expect(st().modoJogador).toBe(false);
    });
    it('trocar de mesa limpa a entidade inspecionada', () => {
        st().setEntidadeInspecionada({ tipo: 'dummie', id: 'd1' });
        st().setMesaId('mesaB');
        expect(st().entidadeInspecionada).toBeNull();
    });
    it('jogador comum trocando para mesa com modo sim continua sem ser Mestre', () => {
        localStorage.setItem(chave('mesaB'), 'sim');
        st().setMesaId('mesaB');
        expect(st().isMestre).toBe(false);
        expect(st().souMestreReal).toBe(false);
    });
});

describe('setEntidadeInspecionada', () => {
    it('guarda e limpa', () => {
        st().setEntidadeInspecionada({ tipo: 'dummie', id: 'd1' });
        expect(st().entidadeInspecionada).toEqual({ tipo: 'dummie', id: 'd1' });
        st().setEntidadeInspecionada(null);
        expect(st().entidadeInspecionada).toBeNull();
    });
    it('undefined/falsy viram null', () => {
        st().setEntidadeInspecionada({ tipo: 'jogador', id: 'Ana' });
        st().setEntidadeInspecionada(undefined);
        expect(st().entidadeInspecionada).toBeNull();
        st().setEntidadeInspecionada(0);
        expect(st().entidadeInspecionada).toBeNull();
    });
    it('trocar de alvo substitui', () => {
        st().setEntidadeInspecionada({ tipo: 'dummie', id: 'd1' });
        st().setEntidadeInspecionada({ tipo: 'jogador', id: 'Ana' });
        expect(st().entidadeInspecionada).toEqual({ tipo: 'jogador', id: 'Ana' });
    });
});
