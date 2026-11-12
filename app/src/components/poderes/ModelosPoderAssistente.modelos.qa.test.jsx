import React from 'react';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModelosPoderAssistente from './ModelosPoderAssistente';
import useStore from '../../stores/useStore';
import { acharPoderDoModelo } from '../../core/modelosPoder';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));
import { salvarFirebaseImediato } from '../../services/firebase-sync';

const ficha = () => useStore.getState().minhaFicha;
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Adicionar de modelo/ }));
const escolher = (nome) => fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }));
const proximo = () => fireEvent.click(screen.getByRole('button', { name: 'Ver resumo' }));

beforeEach(() => {
    useStore.setState({ isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [], contadores: [] } });
    vi.clearAllMocks();
});
afterEach(cleanup);

describe('botao e visibilidade', () => {
    it('Mestre ve o botao', () => {
        render(<ModelosPoderAssistente />);
        expect(screen.getByRole('button', { name: /Adicionar de modelo/ })).toBeTruthy();
    });
    it('isMestre false: nada renderiza', () => {
        useStore.setState({ isMestre: false });
        const { container } = render(<ModelosPoderAssistente />);
        expect(container.innerHTML).toBe('');
        expect(screen.queryByRole('button', { name: /Adicionar de modelo/ })).toBeNull();
    });
    it('Modo Jogador (souMestreReal true, isMestre false) tambem esconde', () => {
        useStore.setState({ souMestreReal: true, isMestre: false });
        const { container } = render(<ModelosPoderAssistente />);
        expect(container.innerHTML).toBe('');
        useStore.setState({ souMestreReal: false });
    });
    it('painel fechado ate clicar', () => {
        render(<ModelosPoderAssistente />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('fluxo em 3 etapas', () => {
    it('etapa 1 lista os dois modelos', () => {
        render(<ModelosPoderAssistente />);
        abrir();
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Ego Superior')).toBeTruthy();
        expect(screen.getByText('Verg Avesta')).toBeTruthy();
        expect(screen.getByText(/1\. Modelo/).className).toContain('ativa');
    });
    it('etapa 2: partes marcadas por padrao, parametros visiveis, vira nota', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        const checks = screen.getAllByRole('checkbox');
        // 8 partes (Ego ganhou as permanentes) + opcao criar opcionais
        expect(checks).toHaveLength(9);
        expect(checks.slice(0, 8).every(c => c.checked)).toBe(true);
        expect(checks[8].checked).toBe(false);
        expect(screen.getAllByText('vira nota')).toHaveLength(2);
        expect(screen.getByLabelText('Multiplicador').value).toBe('140');
        expect(screen.queryByLabelText('Origem do poder')).toBeNull();
    });
    it('desmarcar parte esconde seus parametros', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        fireEvent.click(screen.getByLabelText(/Multiplicador x140/));
        expect(screen.queryByLabelText('Multiplicador')).toBeNull();
    });
    it('Verg mostra origem; parametros numericos', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        expect(screen.getByLabelText('Origem do poder').value).toBe('herdada');
        expect(screen.getByLabelText('Nome do ser de origem')).toBeTruthy();
        expect(screen.getByLabelText('Fração da diferença de Poder (%)').type).toBe('number');
    });
    it('desmarcar tudo desabilita Ver resumo', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        screen.getAllByRole('checkbox').slice(0, 6).forEach(c => fireEvent.click(c));
        expect(screen.getByRole('button', { name: 'Ver resumo' }).disabled).toBe(true);
    });
    it('parametro vazio/invalido volta ao padrao no resumo (nao quebra)', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        fireEvent.change(screen.getByLabelText('Fração da diferença de Poder (%)'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText(/Divisor/), { target: { value: '-5' } });
        proximo();
        expect(screen.getByRole('button', { name: 'Aplicar' }).disabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        const p = acharPoderDoModelo(ficha(), 'vergAvesta');
        // vazio -> padrao (5); negativo -> preso ao min (1)
        expect(p.modelo.params.fracaoDaDiferenca).toBe(50);
        expect(p.modelo.params.divisor).toBe(1);
    });
    it('campo vazio/texto volta ao padrao (nao ao min)', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        fireEvent.change(screen.getByLabelText('Fração da diferença de Poder (%)'), { target: { value: 'abc' } }); // number input => ''
        proximo(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        expect(acharPoderDoModelo(ficha(), 'vergAvesta').modelo.params.fracaoDaDiferenca).toBe(50);
    });
    it('resumo mostra contagens, origem e avisos', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        fireEvent.change(screen.getByLabelText('Nome do ser de origem'), { target: { value: 'Reid' } });
        proximo();
        expect(screen.getByText(/Criar Verg Avesta/)).toBeTruthy();
        expect(screen.getByText(/1 poder novo, 0 efeito/)).toBeTruthy();
        expect(screen.getByText(/1 contador\(es\) novo\(s\)/)).toBeTruthy();
        expect(screen.getByText(/2 gatilho\(s\) automáticos e armados/)).toBeTruthy();
        expect(screen.getByText(/Liga a Adaptação: 50% da diferença de Poder/)).toBeTruthy();
        expect(screen.getByText(/Origem: herdada de Reid/)).toBeTruthy();
        expect(screen.getAllByText(/não existe no app/).length).toBe(4);
        expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy();
    });
    it('criar opcionais muda o texto do resumo', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        fireEvent.click(screen.getAllByRole('checkbox')[8]);
        proximo();
        expect(screen.getByText(/6 gatilho\(s\) opcionais e desarmados/)).toBeTruthy();
    });
    it('Voltar do resumo retorna as partes; Voltar das partes retorna aos modelos', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        expect(screen.getByRole('button', { name: 'Ver resumo' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        expect(screen.getByText('Verg Avesta')).toBeTruthy();
    });
    it('Aplicar desabilitado com erro (12 contadores) e mostra alerta', () => {
        useStore.setState({ minhaFicha: { poderes: [], contadores: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, nome: 'c', valor: 0, min: 0, max: 5 })) } });
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        expect(screen.getByRole('alert').textContent).toMatch(/12 contadores/);
        expect(screen.getByRole('button', { name: 'Aplicar' }).disabled).toBe(true);
    });
});

describe('aplicar e editar', () => {
    it('Aplicar cria poder e contador na ficha, salva imediato e mostra sucesso', async () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar' })); });
        expect(ficha().poderes).toHaveLength(1);
        expect(ficha().contadores).toHaveLength(1);
        expect(salvarFirebaseImediato).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('status').textContent).toMatch(/Ego Superior adicionado/);
        expect(screen.getAllByRole('button', { name: 'Fechar' }).length).toBeGreaterThan(0);
    });
    it('origem do Verg gravada no poder', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Verg Avesta');
        fireEvent.change(screen.getByLabelText('Origem do poder'), { target: { value: 'independente' } });
        proximo(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        expect(acharPoderDoModelo(ficha(), 'vergAvesta').origem).toEqual({ tipo: 'independente', fonte: '' });
    });
    it('ja existente: cartao mostra selo, comeca pelas partes salvas, botao vira Aplicar partes', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        screen.getAllByRole('checkbox').slice(0, 6).forEach((c, i) => { if (i !== 3) fireEvent.click(c); });
        proximo(); fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' }).find(b => b.textContent === 'Fechar'));
        abrir();
        expect(screen.getByText(/já na ficha: editar partes/)).toBeTruthy();
        escolher('Ego Superior');
        const checks = screen.getAllByRole('checkbox');
        expect(checks.map(c => c.checked).slice(0, 6)).toEqual([false, false, false, true, false, false]);
        proximo();
        expect(screen.getByText(/Atualizar Ego Superior/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Aplicar partes' })).toBeTruthy();
    });
    it('Aplicar com isMestre revogado entre abrir e aplicar nao muta (componente some)', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior'); proximo();
        act(() => { useStore.setState({ isMestre: false }); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(ficha().poderes).toHaveLength(0);
    });
});

describe('acessibilidade', () => {
    it('role dialog, aria-modal, aria-labelledby apontando para o titulo, foco inicial', () => {
        render(<ModelosPoderAssistente />);
        abrir();
        const d = screen.getByRole('dialog');
        expect(d.getAttribute('aria-modal')).toBe('true');
        const t = document.getElementById(d.getAttribute('aria-labelledby'));
        expect(t.textContent).toMatch(/Adicionar de modelo/);
        expect(document.activeElement).toBe(d);
        expect(screen.getByRole('dialog', { name: /Adicionar de modelo/ })).toBe(d);
    });
    it('Escape fecha e devolve o foco ao botao', async () => {
        vi.useFakeTimers();
        try {
            render(<ModelosPoderAssistente />);
            const botao = screen.getByRole('button', { name: /Adicionar de modelo/ });
            abrir();
            fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
            expect(screen.queryByRole('dialog')).toBeNull();
            act(() => { vi.runAllTimers(); });
            expect(document.activeElement).toBe(botao);
        } finally { vi.useRealTimers(); }
    });
    it('Tab no ultimo foca o primeiro; Shift+Tab no painel/primeiro vai ao ultimo', () => {
        render(<ModelosPoderAssistente />);
        abrir();
        const d = screen.getByRole('dialog');
        const focaveis = Array.from(d.querySelectorAll('button:not([disabled])'));
        const primeiro = focaveis[0]; const ultimo = focaveis[focaveis.length - 1];
        ultimo.focus();
        fireEvent.keyDown(ultimo, { key: 'Tab' });
        expect(document.activeElement).toBe(primeiro);
        fireEvent.keyDown(primeiro, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(ultimo);
        d.focus();
        fireEvent.keyDown(d, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(ultimo);
    });
    it('clique no fundo fecha se nada mudou', () => {
        render(<ModelosPoderAssistente />);
        abrir();
        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('clique no fundo NAO fecha depois de mexer; clique dentro do painel nunca fecha', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.mouseDown(screen.getByRole('dialog'));
        expect(screen.getByRole('dialog')).toBeTruthy();
    });
    it('botao fechar (X) fecha', () => {
        render(<ModelosPoderAssistente />);
        abrir();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('reabrir reinicia no passo 1', () => {
        render(<ModelosPoderAssistente />);
        abrir(); escolher('Ego Superior');
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        abrir();
        expect(screen.getByText('Verg Avesta')).toBeTruthy();
    });
});
