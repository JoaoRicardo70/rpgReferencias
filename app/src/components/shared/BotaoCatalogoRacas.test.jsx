import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import BotaoCatalogoRacas from './BotaoCatalogoRacas';
import SeletorRaca from './SeletorRaca';
import RacasAcessoCampo from '../poderes/RacasAcessoCampo';
import useStore from '../../stores/useStore';

const CATALOGO = { racas: [{ id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' }] };
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, abaAtiva: 'aba-Ficha Def', secaoMestrePedida: null }); });

describe('BotaoCatalogoRacas', () => {
    it('Mestre: clique pede a seção racas e leva à aba Mestre', () => {
        useStore.setState({ isMestre: true });
        render(<BotaoCatalogoRacas />);
        fireEvent.click(screen.getByRole('button', { name: /Abrir catálogo de Raças/ }));
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
        expect(useStore.getState().secaoMestrePedida).toEqual({ id: 'racas' });
    });
    it('jogador não vê o botão', () => {
        useStore.setState({ isMestre: false });
        const { container } = render(<BotaoCatalogoRacas />);
        expect(container.innerHTML).toBe('');
    });
});

describe('SeletorRaca: link para o catálogo', () => {
    it('só o Mestre vê "Gerenciar catálogo de Raças" (com e sem catálogo)', () => {
        useStore.setState({ isMestre: true, cenario: {} });
        const { rerender } = render(<SeletorRaca valor="" aoMudar={() => {}} />);
        expect(screen.getByRole('button', { name: /Gerenciar catálogo de Raças/ })).toBeTruthy();
        useStore.setState({ cenario: CATALOGO });
        rerender(<SeletorRaca valor="" aoMudar={() => {}} />);
        expect(screen.getByRole('button', { name: /Gerenciar catálogo de Raças/ })).toBeTruthy();
    });
    it('jogador não vê', () => {
        useStore.setState({ isMestre: false, cenario: CATALOGO });
        render(<SeletorRaca valor="" aoMudar={() => {}} />);
        expect(screen.queryByRole('button', { name: /catálogo/ })).toBeNull();
    });
});

describe('Grimório: RacasAcessoCampo sem catálogo', () => {
    it('Mestre vê "Nenhuma Raça cadastrada — abrir catálogo"', () => {
        useStore.setState({ isMestre: true });
        render(<RacasAcessoCampo poder={{ nome: 'X' }} cenario={{}} podeEditar aoMudar={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Nenhuma Raça cadastrada — abrir catálogo/ }));
        expect(useStore.getState().secaoMestrePedida).toEqual({ id: 'racas' });
    });
});
