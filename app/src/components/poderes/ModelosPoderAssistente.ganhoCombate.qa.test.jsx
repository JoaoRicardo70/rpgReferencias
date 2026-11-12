import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModelosPoderAssistente from './ModelosPoderAssistente';
import useStore from '../../stores/useStore';
import { acharPoderDoModelo } from '../../core/modelosPoder';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
}));

// QA - Assistente de modelos: Resumo "Liga a Adaptacao" (Verg) e partes do Ego (combate x permanente).
const ficha = () => useStore.getState().minhaFicha;
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Adicionar de modelo/ }));
const escolher = (nome) => fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }));
const proximo = () => fireEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));

beforeEach(() => { useStore.setState({ isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [], contadores: [] } }); vi.clearAllMocks(); });
afterEach(cleanup);

describe('Verg: etapa de partes e Resumo', () => {
    it('lista a parte "Crescimento por turno (Adaptação)" e nao mais "Acerto por turno"', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Verg Avesta');
        expect(screen.getByLabelText(/Crescimento por turno \(Adaptação\)/)).toBeTruthy();
        expect(screen.queryByLabelText('Acerto por turno')).toBeNull();
        expect(screen.getByLabelText('Fração da diferença de Poder (%)').value).toBe('50');
    });
    it('Resumo padrao: "Liga a Adaptação: 50% da diferença de Poder..."', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Verg Avesta'); proximo();
        expect(screen.getByText('Liga a Adaptação: 50% da diferença de Poder para o oponente mais forte, por turno')).toBeTruthy();
    });
    it('taxa decimal aparece com virgula no Resumo', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Verg Avesta');
        fireEvent.change(screen.getByLabelText('Fração da diferença de Poder (%)'), { target: { value: '2.5' } });
        proximo();
        expect(screen.getByText('Liga a Adaptação: 2,5% da diferença de Poder para o oponente mais forte, por turno')).toBeTruthy();
    });
    it('parte desmarcada: Resumo sem a linha da Adaptacao', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Verg Avesta');
        fireEvent.click(screen.getByLabelText(/Crescimento por turno \(Adaptação\)/));
        proximo();
        expect(screen.queryByText(/Liga a Adaptação/)).toBeNull();
    });
    it('Aplicar liga o interruptor na ficha do Mestre com a taxa escolhida', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Verg Avesta');
        fireEvent.change(screen.getByLabelText('Fração da diferença de Poder (%)'), { target: { value: '7' } });
        proximo(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        expect(ficha().combate).toMatchObject({ adaptacaoLigada: true, adaptacaoFracao: 7 });
        expect(acharPoderDoModelo(ficha(), 'vergAvesta').modelo.adaptacao).toEqual({ ligou: true, fracao: 7 });
    });
    it('Ego nao mostra a linha da Adaptacao', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Ego Superior'); proximo();
        expect(screen.queryByText(/Liga a Adaptação/)).toBeNull();
    });
});

describe('Ego: Resumo com partes temporarias e permanentes', () => {
    it('padrao: 6 gatilhos e 1 contador', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Ego Superior'); proximo();
        expect(screen.getByText(/6 gatilho\(s\) automáticos e armados/)).toBeTruthy();
        expect(screen.getByText(/1 contador\(es\) novo\(s\)/)).toBeTruthy();
    });
    it('Aplicar cria acoes de combate e permanentes juntas no mesmo gatilho', () => {
        render(<ModelosPoderAssistente />); abrir(); escolher('Ego Superior'); proximo();
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        const g = acharPoderDoModelo(ficha(), 'egoSuperior').gatilhos.find(x => x.id === 'mp_ego_acerto_1');
        expect(g.acoes).toHaveLength(2);
        expect(g.acoes[0].duracao).toBe('combate');
        expect(g.acoes[1].duracao).toBeUndefined();
    });
});
