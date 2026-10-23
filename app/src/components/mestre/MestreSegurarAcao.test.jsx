import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));

import MestreSegurarAcao from './MestreSegurarAcao';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';

// QA - MestreSegurarAcao.jsx: padrao da mesa para Segurar Acao (cenario.segurarAcaoMax).
const campo = () => screen.getByLabelText('Máximo de Ações seguradas por personagem');

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ cenario: { ativa: 'default', lista: { default: { nome: 'X' } }, segurarAcaoMax: 2 } });
});
afterEach(() => cleanup());

describe('MestreSegurarAcao', () => {
    it('mostra o limite atual da mesa', () => {
        render(<MestreSegurarAcao />);
        expect(campo().value).toBe('2');
    });

    it('sem configuracao mostra o padrao 1', () => {
        useStore.setState({ cenario: { ativa: 'default' } });
        render(<MestreSegurarAcao />);
        expect(campo().value).toBe('1');
    });

    it('alterar grava no cenario (copia nova, preserva o resto) e salva', () => {
        const antes = useStore.getState().cenario;
        render(<MestreSegurarAcao />);
        fireEvent.change(campo(), { target: { value: '4' } });
        const depois = useStore.getState().cenario;
        expect(depois.segurarAcaoMax).toBe(4);
        expect(depois.ativa).toBe('default');
        expect(depois.lista.default.nome).toBe('X');
        expect(depois).not.toBe(antes);
        expect(antes.segurarAcaoMax).toBe(2);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        expect(salvarCenarioCompleto.mock.calls[0][0].segurarAcaoMax).toBe(4);
    });

    it('0 desliga a regra e e gravado', () => {
        render(<MestreSegurarAcao />);
        fireEvent.change(campo(), { target: { value: '0' } });
        expect(useStore.getState().cenario.segurarAcaoMax).toBe(0);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
    });

    it('limita entre 0 e 5 (9 vira 5, -3 vira 0)', () => {
        render(<MestreSegurarAcao />);
        fireEvent.change(campo(), { target: { value: '9' } });
        expect(useStore.getState().cenario.segurarAcaoMax).toBe(5);
        fireEvent.change(campo(), { target: { value: '-3' } });
        expect(useStore.getState().cenario.segurarAcaoMax).toBe(0);
    });

    it('campo vazio e ignorado: nao altera nem salva', () => {
        render(<MestreSegurarAcao />);
        fireEvent.change(campo(), { target: { value: '' } });
        expect(useStore.getState().cenario.segurarAcaoMax).toBe(2);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('cenario nao carregado (null) nao grava nem lanca', () => {
        useStore.setState({ cenario: null });
        render(<MestreSegurarAcao />);
        expect(() => fireEvent.change(campo(), { target: { value: '3' } })).not.toThrow();
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        expect(useStore.getState().cenario).toBeNull();
    });
});
