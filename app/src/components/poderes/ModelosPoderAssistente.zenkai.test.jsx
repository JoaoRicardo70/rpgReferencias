import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModelosPoderAssistente from './ModelosPoderAssistente';
import useStore from '../../stores/useStore';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
}));

// Modelo pronto "Zenkai" no assistente do Mestre: partes, parametros editaveis (pesos, teto, pontuacao), Resumo e Aplicar.
const ficha = () => useStore.getState().minhaFicha;
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Adicionar de modelo/ }));
const escolher = (nome) => fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }));
const proximo = () => fireEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));

beforeEach(() => { useStore.setState({ isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [], contadores: [] } }); vi.clearAllMocks(); });
afterEach(cleanup);

describe('Zenkai no assistente de modelos', () => {
    it('aparece no catalogo como Habilidade e lista a parte com os parametros padrao', () => {
        render(<ModelosPoderAssistente />); abrir();
        expect(screen.getByRole('button', { name: /Zenkai/ })).toBeTruthy();
        escolher('Zenkai');
        expect(screen.getByLabelText(/Ganho de Poder por dificuldade do combate/).checked).toBe(true);
        expect(screen.getByLabelText('Teto de ganho por combate (%)').value).toBe('5');
        expect(screen.getByLabelText('Pontuação que enche o teto').value).toBe('2');
        expect(screen.getByLabelText('Peso: dano recebido').value).toBe('1');
        expect(screen.getByLabelText('Peso: energia gasta').value).toBe('0.8');
        expect(screen.getByLabelText('Peso: quase morte').value).toBe('0.7');
    });
    it('Resumo mostra o teto, a pontuacao e a formula resumida (com virgula decimal)', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Zenkai');
        fireEvent.change(screen.getByLabelText('Teto de ganho por combate (%)'), { target: { value: '7.5' } });
        proximo();
        const linha = screen.getByText(/Liga o Zenkai: teto de 7,5% por combate/);
        expect(linha.textContent).toMatch(/pontuação 2 enche o teto/);
        expect(linha.textContent).toMatch(/dano 1, energia 0,8/);
        expect(linha.textContent).toMatch(/suposições a revisar/);
    });
    it('Aplicar liga o Zenkai e grava a configuracao escolhida na ficha do Mestre', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Zenkai');
        fireEvent.change(screen.getByLabelText('Teto de ganho por combate (%)'), { target: { value: '8' } });
        fireEvent.change(screen.getByLabelText('Peso: fadiga acumulada'), { target: { value: '1.5' } });
        proximo(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        expect(ficha().combate.zenkaiLigado).toBe(true);
        expect(ficha().combate.zenkaiConfig).toMatchObject({ teto: 8, pontuacaoRef: 2 });
        expect(ficha().combate.zenkaiConfig.pesos.fadiga).toBe(1.5);
        expect(ficha().poderes).toHaveLength(1);
        expect(ficha().poderes[0].modelo.zenkai.ligou).toBe(true);
    });
    it('so o Mestre ve o assistente', () => {
        useStore.setState({ isMestre: false });
        const { container } = render(<ModelosPoderAssistente />);
        expect(container.textContent).toBe('');
    });
});
