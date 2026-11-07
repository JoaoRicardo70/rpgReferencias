import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AoAcertarEditor from './AoAcertarEditor';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

const lista = () => useStore.getState().minhaFicha.poderes[0].aoAcertar;

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
        meuNome: 'Heroi',
        minhaFicha: { ...useStore.getState().minhaFicha, poderes: [{ id: 'p1', nome: 'Golpe' }], ataquesElementais: [], inventario: [] },
        personagens: {},
    });
});
afterEach(() => cleanup());

const preparar = () => {
    render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: /💚/ }));
    fireEvent.click(screen.getByText('+ Ao acertar'));
};
const tipo = (v) => fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: v } });

describe('AoAcertarEditor - efeitos no alvo', () => {
    it('opcoes de tipo incluem dreno e debuff', () => {
        preparar();
        const valores = Array.from(screen.getByLabelText('O que acontece').querySelectorAll('option')).map(o => o.value);
        expect(valores).toEqual(['curarAtacante', 'energiaAtacante', 'drenarEnergiaAlvo', 'debuffAlvo', 'reduzirCuraAlvo']);
    });

    it('Drena energia do alvo mostra energia e modo; grava energia padrao mana', () => {
        preparar();
        tipo('drenarEnergiaAlvo');
        expect(screen.getByLabelText('Energia drenada do alvo')).toBeTruthy();
        expect(screen.getByLabelText('Como o valor é medido')).toBeTruthy();
        expect(screen.queryByLabelText('Duração em turnos do alvo')).toBeNull();
        expect(lista()[0]).toMatchObject({ tipo: 'drenarEnergiaAlvo', energia: 'mana' });
        fireEvent.change(screen.getByLabelText('Energia drenada do alvo'), { target: { value: 'aura' } });
        expect(lista()[0].energia).toBe('aura');
        fireEvent.change(screen.getByLabelText('Como o valor é medido'), { target: { value: 'percAtual' } });
        expect(lista()[0].modo).toBe('percAtual');
    });

    it('Enfraquece o alvo mostra atributo/duracao/empilha e esconde modo e energia', () => {
        preparar();
        tipo('debuffAlvo');
        expect(screen.getByLabelText('O que o debuff reduz')).toBeTruthy();
        expect(screen.getByLabelText('Duração em turnos do alvo')).toBeTruthy();
        expect(screen.getByLabelText(/empilha/)).toBeTruthy();
        expect(screen.queryByLabelText('Como o valor é medido')).toBeNull();
        expect(screen.queryByLabelText('Energia drenada do alvo')).toBeNull();
        expect(screen.queryByLabelText('Energia restaurada')).toBeNull();
        expect(lista()[0]).toEqual({ tipo: 'debuffAlvo', modo: 'fixo', valor: 5, atributo: 'evasiva', duracao: 3 });
    });

    it('debuff: troca de atributo e empilha gravam normalizado', () => {
        preparar();
        tipo('debuffAlvo');
        fireEvent.change(screen.getByLabelText('O que o debuff reduz'), { target: { value: 'resistencia' } });
        expect(lista()[0].atributo).toBe('resistencia');
        fireEvent.click(screen.getByLabelText(/empilha/));
        expect(lista()[0].empilha).toBe(true);
        fireEvent.click(screen.getByLabelText(/empilha/));
        expect('empilha' in lista()[0]).toBe(false);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('duracao: digitar vazio e depois 5 nao salta para 3; grava so ao sair do campo', () => {
        preparar();
        tipo('debuffAlvo');
        salvarFichaSilencioso.mockClear();
        const campo = screen.getByLabelText('Duração em turnos do alvo');
        fireEvent.change(campo, { target: { value: '' } });
        expect(screen.getByLabelText('Duração em turnos do alvo').value).toBe('');
        fireEvent.change(screen.getByLabelText('Duração em turnos do alvo'), { target: { value: '5' } });
        expect(screen.getByLabelText('Duração em turnos do alvo').value).toBe('5');
        expect(lista()[0].duracao).toBe(3);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        fireEvent.blur(screen.getByLabelText('Duração em turnos do alvo'));
        expect(lista()[0].duracao).toBe(5);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('duracao acima do limite e clampada para 20 ao sair; vazia ao sair vira 1 (clamp minimo)', () => {
        preparar();
        tipo('debuffAlvo');
        let campo = screen.getByLabelText('Duração em turnos do alvo');
        fireEvent.change(campo, { target: { value: '99' } });
        fireEvent.blur(campo);
        expect(lista()[0].duracao).toBe(20);
        campo = screen.getByLabelText('Duração em turnos do alvo');
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.blur(campo);
        expect(lista()[0].duracao).toBe(1);
    });

    it('trocar de debuff para cura remove atributo/duracao/empilha da entrada gravada', () => {
        preparar();
        tipo('debuffAlvo');
        fireEvent.click(screen.getByLabelText(/empilha/));
        tipo('curarAtacante');
        expect(lista()[0]).toEqual({ tipo: 'curarAtacante', modo: 'fixo', valor: 5 });
        expect(screen.getByLabelText('Como o valor é medido')).toBeTruthy();
    });

    it('mostra debuff ja existente no item', () => {
        useStore.setState({ minhaFicha: { ...useStore.getState().minhaFicha, poderes: [{ id: 'p1', nome: 'Golpe', aoAcertar: [{ tipo: 'debuffAlvo', modo: 'fixo', valor: 2, atributo: 'acerto', duracao: 7, empilha: true }] }] } });
        render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
        fireEvent.click(screen.getByRole('button', { name: /💚/ }));
        expect(screen.getByLabelText('O que o debuff reduz').value).toBe('acerto');
        expect(screen.getByLabelText('Duração em turnos do alvo').value).toBe('7');
        expect(screen.getByLabelText(/empilha/).checked).toBe(true);
        expect(screen.getByLabelText('Valor').value).toBe('2');
    });
});
