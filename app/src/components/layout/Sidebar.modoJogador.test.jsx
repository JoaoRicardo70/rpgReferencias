import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Sidebar from './Sidebar';
import useStore from '../../stores/useStore';

// QA - Sidebar: botao 🎭 (Modo Jogador) e aba 👑 do Mestre. Usa a store real.
const st = () => useStore.getState();
const botaoModo = () => document.querySelector('.btn-modo-jogador');
const botaoMestre = () => document.querySelector('.btn-macro-mestre');

beforeEach(() => {
    localStorage.clear();
    useStore.setState({
        mesaId: 'mesaT', isMestre: false, souMestreReal: false, modoJogador: false,
        abaAtiva: 'aba-ficha', sextaFeiraPendentes: {}, entidadeInspecionada: null,
    });
});
afterEach(() => cleanup());

describe('Sidebar - Modo Jogador', () => {
    it('jogador comum: nem 🎭 nem 👑', () => {
        render(<Sidebar onResetClick={() => {}} />);
        expect(botaoModo()).toBeNull();
        expect(botaoMestre()).toBeNull();
    });

    it('Mestre real: ve 🎭 (title com Modo Jogador) e 👑', () => {
        st().setIsMestre(true);
        render(<Sidebar onResetClick={() => {}} />);
        expect(botaoModo()).not.toBeNull();
        expect(botaoModo().getAttribute('title')).toContain('Modo Jogador');
        expect(botaoModo().getAttribute('aria-pressed')).toBe('false');
        expect(botaoMestre()).not.toBeNull();
    });

    it('clicar em 🎭 liga o Modo Jogador: some o 👑, o 🎭 continua e fica pressionado', () => {
        st().setIsMestre(true);
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        expect(st().modoJogador).toBe(true);
        expect(st().isMestre).toBe(false);
        expect(botaoMestre()).toBeNull();
        expect(botaoModo()).not.toBeNull();
        expect(botaoModo().getAttribute('aria-pressed')).toBe('true');
        expect(botaoModo().className).toContain('ativa');
        expect(botaoModo().getAttribute('title')).toContain('Modo Jogador');
    });

    it('clicar de novo desliga e o 👑 volta', () => {
        st().setIsMestre(true);
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        fireEvent.click(botaoModo());
        expect(st().modoJogador).toBe(false);
        expect(st().isMestre).toBe(true);
        expect(botaoMestre()).not.toBeNull();
    });

    it('ligar o Modo Jogador na aba do Mestre leva para a Ficha', () => {
        st().setIsMestre(true);
        useStore.setState({ abaAtiva: 'aba-mestre' });
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        expect(st().abaAtiva).toBe('aba-ficha');
    });

    it('ligar o Modo Jogador em outra aba NAO muda a aba', () => {
        st().setIsMestre(true);
        useStore.setState({ abaAtiva: 'aba-mapa' });
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        expect(st().abaAtiva).toBe('aba-mapa');
    });

    it('desligar o Modo Jogador nao muda a aba atual', () => {
        st().setIsMestre(true);
        st().setModoJogador(true);
        useStore.setState({ abaAtiva: 'aba-mapa' });
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        expect(st().abaAtiva).toBe('aba-mapa');
    });

    it('Modo Jogador ja ligado ao montar (persistido): so o 🎭 aparece', () => {
        localStorage.setItem('rpgModoJogador_mesaT', 'sim');
        st().setMesaId('mesaT');
        st().setIsMestre(true);
        render(<Sidebar onResetClick={() => {}} />);
        expect(botaoMestre()).toBeNull();
        expect(botaoModo().getAttribute('aria-pressed')).toBe('true');
    });

    it('o clique persiste a escolha no localStorage da mesa', () => {
        st().setIsMestre(true);
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        expect(localStorage.getItem('rpgModoJogador_mesaT')).toBe('sim');
        fireEvent.click(botaoModo());
        expect(localStorage.getItem('rpgModoJogador_mesaT')).toBe('nao');
    });

    it('clicar limpa a entidade inspecionada', () => {
        st().setIsMestre(true);
        st().setEntidadeInspecionada({ tipo: 'dummie', id: 'd1' });
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoModo());
        expect(st().entidadeInspecionada).toBeNull();
    });

    it('em Modo Jogador o badge de pedidos nao aparece (nao e Mestre efetivo)', () => {
        st().setIsMestre(true);
        st().setModoJogador(true);
        useStore.setState({ sextaFeiraPendentes: { p1: { tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: 1, avisos: [], objeto: { nome: 'Golpe' } } } });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.sidebar-badge-pedidos')).toBeNull();
    });

    it('perder o papel de Mestre (Firebase) enquanto montado esconde os dois botoes', () => {
        st().setIsMestre(true);
        const { rerender } = render(<Sidebar onResetClick={() => {}} />);
        expect(botaoModo()).not.toBeNull();
        st().setIsMestre(false);
        rerender(<Sidebar onResetClick={() => {}} />);
        expect(botaoModo()).toBeNull();
        expect(botaoMestre()).toBeNull();
    });

    it('clicar no 👑 abre a aba do Mestre', () => {
        st().setIsMestre(true);
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botaoMestre());
        expect(st().abaAtiva).toBe('aba-mestre');
    });
});
