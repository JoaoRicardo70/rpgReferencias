import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('firebase/database', () => ({
    ref: vi.fn(), get: vi.fn(async () => ({ exists: () => false, val: () => null })), set: vi.fn(async () => {}),
}));
vi.mock('../../services/firebase-config', () => ({ db: {} }));
vi.mock('../../services/firebase-sync', () => ({
    carregarFichaDoFirebase: vi.fn(), salvarFirebaseImediato: vi.fn(),
}));

import SessaoInfo from './SessaoInfo';
import useStore from '../../stores/useStore';

let confirmSpy;
beforeEach(() => {
    localStorage.clear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useStore.setState({
        jogadoresOnline: ['Ana', 'Bia'], mesaId: 'sala42', meuNome: 'Ana', isMestre: false, souMestreReal: false,
        modoJogador: false, mesaCriador: '', mesaMestres: {}, abaAtiva: 'aba-Ficha Def', feedCombate: [{ id: 1 }], personagens: {},
    });
});
afterEach(() => { cleanup(); confirmSpy.mockRestore(); });

describe('SessaoInfo', () => {
    it('mostra online, SALA e nome', () => {
        render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
        expect(screen.getByText('2 ON')).toBeTruthy();
        expect(screen.getByText('SALA: sala42')).toBeTruthy();
        expect(screen.getByText('👤 Ana')).toBeTruthy();
    });
    it('tooltip lista criador, co-mestres e aventureiros', () => {
        useStore.setState({ jogadoresOnline: ['Dono', 'Co', 'Ana'], mesaCriador: 'Dono', mesaMestres: { Co: true, Dono: true } });
        render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
        const t = document.querySelector('.sessao-online').getAttribute('title');
        expect(t).toContain('MESTRE SUPREMO:\n- Dono');
        expect(t).toContain('CO-MESTRES:\n- Co');
        expect(t).toContain('AVENTUREIROS:\n- Ana');
    });
    it('ninguem online mostra 0 ON e aviso', () => {
        useStore.setState({ jogadoresOnline: [] });
        render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
        expect(screen.getByText('0 ON')).toBeTruthy();
        expect(document.querySelector('.sessao-online').getAttribute('title')).toContain('Ninguém online');
    });

    describe('Modo Jogador', () => {
        it('sem mostrarModoJogador o botao nao aparece', () => {
            useStore.setState({ isMestre: true, souMestreReal: true });
            render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
            expect(document.querySelector('.sessao-botao-modo-jogador')).toBeNull();
        });
        it('mostrarModoJogador sem ser Mestre real: nao aparece', () => {
            render(<SessaoInfo aoTrocarPersonagem={() => {}} mostrarModoJogador />);
            expect(document.querySelector('.sessao-botao-modo-jogador')).toBeNull();
        });
        it('Mestre real: aparece e alterna o modoJogador', () => {
            useStore.setState({ isMestre: true, souMestreReal: true });
            render(<SessaoInfo aoTrocarPersonagem={() => {}} mostrarModoJogador />);
            const btn = () => document.querySelector('.sessao-botao-modo-jogador');
            expect(btn().getAttribute('aria-pressed')).toBe('false');
            fireEvent.click(btn());
            expect(useStore.getState().modoJogador).toBe(true);
            expect(useStore.getState().isMestre).toBe(false);
            expect(btn().getAttribute('aria-pressed')).toBe('true');
            expect(document.querySelector('.pill-modo-jogador')).toBeTruthy();
            fireEvent.click(btn());
            expect(useStore.getState().modoJogador).toBe(false);
            expect(useStore.getState().isMestre).toBe(true);
        });
        it('ao ligar estando na aba-mestre vai para a Ficha', () => {
            useStore.setState({ isMestre: true, souMestreReal: true, abaAtiva: 'aba-mestre' });
            render(<SessaoInfo aoTrocarPersonagem={() => {}} mostrarModoJogador />);
            fireEvent.click(document.querySelector('.sessao-botao-modo-jogador'));
            expect(useStore.getState().abaAtiva).toBe('aba-Ficha Def');
        });
        it('ao ligar em outra aba nao muda a aba', () => {
            useStore.setState({ isMestre: true, souMestreReal: true, abaAtiva: 'aba-mapa' });
            render(<SessaoInfo aoTrocarPersonagem={() => {}} mostrarModoJogador />);
            fireEvent.click(document.querySelector('.sessao-botao-modo-jogador'));
            expect(useStore.getState().abaAtiva).toBe('aba-mapa');
        });
        it('ao desligar estando em aba-mestre nao redireciona', () => {
            useStore.setState({ souMestreReal: true, isMestre: false, modoJogador: true, abaAtiva: 'aba-mestre' });
            render(<SessaoInfo aoTrocarPersonagem={() => {}} mostrarModoJogador />);
            fireEvent.click(document.querySelector('.sessao-botao-modo-jogador'));
            expect(useStore.getState().modoJogador).toBe(false);
            expect(useStore.getState().abaAtiva).toBe('aba-mestre');
        });
    });

    describe('confirmacoes', () => {
        it('Trocar confirmado chama aoTrocarPersonagem', () => {
            const aoTrocar = vi.fn();
            render(<SessaoInfo aoTrocarPersonagem={aoTrocar} />);
            fireEvent.click(document.querySelector('.sessao-botao-trocar'));
            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(aoTrocar).toHaveBeenCalledTimes(1);
        });
        it('Trocar cancelado nao chama', () => {
            confirmSpy.mockReturnValue(false);
            const aoTrocar = vi.fn();
            render(<SessaoInfo aoTrocarPersonagem={aoTrocar} />);
            fireEvent.click(document.querySelector('.sessao-botao-trocar'));
            expect(aoTrocar).not.toHaveBeenCalled();
        });
        it('Sair confirmado limpa o feed e zera a mesa', () => {
            localStorage.setItem('rpg_mesaId', 'sala42');
            render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
            fireEvent.click(document.querySelector('.sessao-botao-sair'));
            expect(useStore.getState().feedCombate).toEqual([]);
            expect(useStore.getState().mesaId).toBe('');
            expect(localStorage.getItem('rpg_mesaId')).toBeNull();
        });
        it('Sair cancelado nao altera nada', () => {
            confirmSpy.mockReturnValue(false);
            render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
            fireEvent.click(document.querySelector('.sessao-botao-sair'));
            expect(useStore.getState().feedCombate).toHaveLength(1);
            expect(useStore.getState().mesaId).toBe('sala42');
        });
        it('botao Resgatar so existe para o Mestre', () => {
            const { unmount } = render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
            expect(document.querySelector('.sessao-botao-resgatar')).toBeNull();
            unmount();
            useStore.setState({ isMestre: true, souMestreReal: true });
            render(<SessaoInfo aoTrocarPersonagem={() => {}} />);
            expect(document.querySelector('.sessao-botao-resgatar')).toBeTruthy();
        });
    });
});
