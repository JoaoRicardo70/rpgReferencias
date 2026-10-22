import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DescricoesAtaqueEditor from './DescricoesAtaqueEditor';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso } from '../../services/firebase-sync';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

const minha = () => useStore.getState().minhaFicha;
const outro = () => useStore.getState().personagens.Outro;

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
        meuNome: 'Heroi',
        minhaFicha: { ...useStore.getState().minhaFicha, poderes: [{ id: 'p1', nome: 'Golpe' }], ataquesElementais: [], inventario: [{ id: 7, nome: 'Espada', tipo: 'arma' }] },
        personagens: { Outro: { poderes: [{ id: 'p9', nome: 'Raio' }], ataquesElementais: [], inventario: [] } },
    });
});
afterEach(() => cleanup());

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Como executo este ataque/ }));

describe('DescricoesAtaqueEditor', () => {
    it('item inexistente → null', () => {
        const { container } = render(<DescricoesAtaqueEditor colecao="poderes" itemId="nao-existe" />);
        expect(container.firstChild).toBeNull();
    });
    it('coleção inexistente → null', () => {
        const { container } = render(<DescricoesAtaqueEditor colecao="coisaNenhuma" itemId="p1" />);
        expect(container.firstChild).toBeNull();
    });
    it('abre e fecha', () => {
        render(<DescricoesAtaqueEditor colecao="poderes" itemId="p1" />);
        expect(document.querySelector('.descricoes-ataque-corpo')).toBeNull();
        abrir();
        expect(document.querySelector('.descricoes-ataque-corpo')).not.toBeNull();
        expect(screen.getByRole('button', { name: /Como executo/ }).getAttribute('aria-expanded')).toBe('true');
        abrir();
        expect(document.querySelector('.descricoes-ataque-corpo')).toBeNull();
    });
    it('adicionar, editar e remover gravam na ficha (e salvam)', () => {
        render(<DescricoesAtaqueEditor colecao="poderes" itemId="p1" />);
        abrir();
        fireEvent.click(screen.getByText(/Escrever descrição/));
        expect(minha().poderes[0].descricoesAtaque).toHaveLength(1);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        fireEvent.change(document.querySelector('textarea'), { target: { value: '{atacante} ataca' } });
        expect(minha().poderes[0].descricoesAtaque[0].texto).toBe('{atacante} ataca');
        expect(screen.getByRole('button', { name: /Como executo/ }).textContent).toContain('(1)');
        fireEvent.click(screen.getByText(/Outra descrição/));
        expect(minha().poderes[0].descricoesAtaque).toHaveLength(2);
        fireEvent.click(screen.getByLabelText('Apagar a descrição 1'));
        expect(minha().poderes[0].descricoesAtaque).toHaveLength(1);
        expect(minha().poderes[0].descricoesAtaque[0].texto).toBe('');
    });
    it('funciona em inventário (arma)', () => {
        render(<DescricoesAtaqueEditor colecao="inventario" itemId={7} />);
        abrir();
        fireEvent.click(screen.getByText(/Escrever descrição/));
        expect(minha().inventario[0].descricoesAtaque).toHaveLength(1);
    });
    it('limite de 8 esconde o botão de adicionar', () => {
        render(<DescricoesAtaqueEditor colecao="poderes" itemId="p1" />);
        abrir();
        for (let i = 0; i < 8; i++) fireEvent.click(screen.getByText(/(Escrever descrição|Outra descrição)/));
        expect(minha().poderes[0].descricoesAtaque).toHaveLength(8);
        expect(screen.queryByText(/Outra descrição/)).toBeNull();
        fireEvent.click(screen.getByLabelText('Apagar a descrição 8'));
        expect(screen.queryByText(/Outra descrição/)).not.toBeNull();
    });
    it('texto é limitado a 600 caracteres', () => {
        render(<DescricoesAtaqueEditor colecao="poderes" itemId="p1" />);
        abrir();
        fireEvent.click(screen.getByText(/Escrever descrição/));
        fireEvent.change(document.querySelector('textarea'), { target: { value: 'x'.repeat(900) } });
        expect(minha().poderes[0].descricoesAtaque[0].texto.length).toBe(600);
    });
    it('com FichaAlvoProvider mirando outro personagem grava na ficha dele', () => {
        render(<FichaAlvoProvider nome="Outro"><DescricoesAtaqueEditor colecao="poderes" itemId="p9" /></FichaAlvoProvider>);
        abrir();
        fireEvent.click(screen.getByText(/Escrever descrição/));
        expect(outro().poderes[0].descricoesAtaque).toHaveLength(1);
        expect(minha().poderes[0].descricoesAtaque).toBeUndefined();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('mirando outro personagem, item que só existe na minha ficha → null', () => {
        const { container } = render(<FichaAlvoProvider nome="Outro"><DescricoesAtaqueEditor colecao="poderes" itemId="p1" /></FichaAlvoProvider>);
        expect(container.firstChild).toBeNull();
    });
});
