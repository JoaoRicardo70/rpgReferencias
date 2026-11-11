import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModelosPoderAssistente from './ModelosPoderAssistente';
import useStore from '../../stores/useStore';
import { acharPoderDoModelo, temGanhoLegado } from '../../core/modelosPoder';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

const ficha = () => useStore.getState().minhaFicha;
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Adicionar de modelo/ }));
const escolher = (nome) => fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }));
const proximo = () => fireEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));
const alertaLegado = () => screen.queryAllByRole('alert').find(a => /valor bruto/.test(a.textContent));

beforeEach(() => {
    useStore.setState({ isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [], contadores: [] } });
    vi.clearAllMocks();
});
afterEach(cleanup);

describe('Assistente: parametro Modo', () => {
    it('Ego mostra dois seletores de modo com padrao Multiplicar', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        const sel = screen.getAllByRole('combobox').filter(s => /modo do ganho/.test(s.getAttribute('aria-label') || ''));
        expect(sel).toHaveLength(2);
        sel.forEach(s => expect(s.value).toBe('multiplicar'));
        expect(Array.from(sel[0].options).map(o => o.value).sort()).toEqual(['multiplicar', 'somar']);
    });
    it('Verg mostra o modo com padrao Somar e divisor continua numerico', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        const sel = screen.getAllByRole('combobox').filter(s => /modo do ganho/.test(s.getAttribute('aria-label') || ''));
        expect(sel).toHaveLength(1);
        expect(sel[0].value).toBe('somar');
        expect(screen.getByLabelText(/Divisor do acumulado/).type).toBe('number');
    });
    it('rotulos numericos viram (%)', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        expect(screen.getByLabelText('Acerto normal (%)').value).toBe('2');
        expect(screen.getByLabelText('Acerto crítico (%)').value).toBe('3');
        expect(screen.getByLabelText('Acerto fatal (%)').value).toBe('4');
    });
    it('mudar o modo para Somar e aplicar grava gatilhos percentual + somar', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        const sel = screen.getAllByRole('combobox').filter(s => /modo do ganho/.test(s.getAttribute('aria-label') || ''));
        fireEvent.change(sel[0], { target: { value: 'somar' } });
        proximo(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        const acertos = acharPoderDoModelo(ficha(), 'egoSuperior').gatilhos.filter(g => g.evento.tipo === 'acertou').flatMap(g => g.acoes);
        expect(acertos.length).toBeGreaterThan(0);
        acertos.forEach(a => expect(a).toMatchObject({ unidade: 'percentual', modo: 'somar' }));
        const outros = acharPoderDoModelo(ficha(), 'egoSuperior').gatilhos.filter(g => g.evento.tipo !== 'acertou').flatMap(g => g.acoes).filter(a => a.tipo === 'ganhoPermanente');
        outros.forEach(a => expect(a.modo).toBe('multiplicar'));
    });
    it('desmarcar a parte esconde o seletor de modo dela', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        fireEvent.click(screen.getAllByRole('checkbox')[1]); // prestigioPorAcerto
        const sel = screen.getAllByRole('combobox').filter(s => /modo do ganho/.test(s.getAttribute('aria-label') || ''));
        expect(sel).toHaveLength(1);
    });
});

describe('Assistente: aviso de ganho legado', () => {
    const legado = () => ({
        id: 77, nome: 'Ego Superior', ativa: true,
        modelo: { id: 'egoSuperior', partes: ['prestigioPorAcerto'], params: { ganhoNormal: 2, ganhoCritico: 3, ganhoFatal: 4 } },
        gatilhos: [{ id: 'mp_ego_acerto_1', nome: 'Ego: +2 por acerto normal', evento: { tipo: 'acertou', nivel: 'normal' }, acoes: [{ tipo: 'ganhoPermanente', valor: 2 }], modo: 'automatico', armado: true }],
    });
    it('modelo novo (poder fora da ficha): sem aviso', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        expect(alertaLegado()).toBeUndefined();
    });
    it('poder na ficha com ganho legado: aviso destacado com role=alert no Resumo', () => {
        useStore.setState({ minhaFicha: { poderes: [legado()], contadores: [] } });
        expect(temGanhoLegado(ficha().poderes[0])).toBe(true);
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        const a = alertaLegado();
        expect(a).toBeTruthy();
        expect(a.textContent).toMatch(/em %/);
        expect(a.textContent).toMatch(/\+2 = \+200%/);
    });
    it('aviso NAO aparece na etapa Partes, so no Resumo', () => {
        useStore.setState({ minhaFicha: { poderes: [legado()], contadores: [] } });
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        expect(alertaLegado()).toBeUndefined();
    });
    it('poder na ficha ja percentual: sem aviso', () => {
        const p = legado(); p.gatilhos[0].acoes[0] = { tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 };
        useStore.setState({ minhaFicha: { poderes: [p], contadores: [] } });
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        expect(alertaLegado()).toBeUndefined();
    });
    it('aviso do Ego nao aparece ao abrir o Verg (outro modelo)', () => {
        useStore.setState({ minhaFicha: { poderes: [legado()], contadores: [] } });
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta'); proximo();
        expect(alertaLegado()).toBeUndefined();
    });
    it('Aplicar partes regenera sem duplicar e o ganho deixa de ser legado', async () => {
        useStore.setState({ minhaFicha: { poderes: [legado()], contadores: [] } });
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar partes' })); });
        expect(ficha().poderes).toHaveLength(1);
        expect(temGanhoLegado(ficha().poderes[0])).toBe(false);
        expect(ficha().poderes[0].gatilhos.filter(g => g.evento.tipo === 'acertou')).toHaveLength(3);
    });
});
