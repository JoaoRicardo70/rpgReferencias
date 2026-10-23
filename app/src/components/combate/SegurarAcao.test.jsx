import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(),
    salvarFirebaseImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

import SegurarAcao from './SegurarAcao';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { criarAcoesIniciais, getAcoesExibicao, getCreditoAcaoSegurada } from '../../core/acoes';
import { getAcoesSeguradas } from '../../core/segurarAcao';

// QA - SegurarAcao.jsx: quadro de Segurar Acao (segurar com gatilho, usar, soltar, limite do Mestre).
function montarStore({ isMestre = false, cenario = { segurarAcaoMax: 1 }, combate = {} } = {}) {
    useStore.setState({
        meuNome: 'Heroi', isMestre, cenario, avisosAcao: [],
        minhaFicha: { acoes: criarAcoesIniciais(), combate },
    });
}
const ficha = () => useStore.getState().minhaFicha;
const contagem = () => document.querySelector('.segurar-acao-contagem').textContent;
const botaoSegurar = () => screen.getByText(/⏳ Segurar$/);

beforeEach(() => { vi.clearAllMocks(); montarStore(); });
afterEach(() => { cleanup(); });

describe('SegurarAcao', () => {
    it('renderiza titulo, contagem 0/limite e o botao Segurar', () => {
        render(<SegurarAcao />);
        expect(screen.getByText(/Segurar Ação/, { selector: 'strong' })).toBeTruthy();
        expect(contagem()).toBe('0/1');
        expect(botaoSegurar()).toBeTruthy();
    });

    it('segurar com gatilho: gasta 1 Acao, guarda o gatilho, salva, avisa o feed e limpa o campo', () => {
        render(<SegurarAcao />);
        const antes = getAcoesExibicao(ficha()).padrao.atual;
        const input = screen.getByLabelText('Gatilho da Ação segurada');
        fireEvent.change(input, { target: { value: '  inimigo sair da cobertura ' } });
        fireEvent.click(botaoSegurar());
        expect(getAcoesSeguradas(ficha())).toHaveLength(1);
        expect(getAcoesSeguradas(ficha())[0].gatilho).toBe('inimigo sair da cobertura');
        expect(getAcoesExibicao(ficha()).padrao.atual).toBe(antes - 1);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed.mock.calls[0][0].texto).toContain('gatilho: inimigo sair da cobertura');
        expect(input.value).toBe('');
        expect(screen.getByText('Quando: inimigo sair da cobertura')).toBeTruthy();
        expect(contagem()).toBe('1/1');
    });

    it('Enter no campo tambem segura; sem gatilho mostra "Sem gatilho anotado"', () => {
        render(<SegurarAcao />);
        fireEvent.keyDown(screen.getByLabelText('Gatilho da Ação segurada'), { key: 'Enter' });
        expect(getAcoesSeguradas(ficha())).toHaveLength(1);
        expect(screen.getByText('Sem gatilho anotado')).toBeTruthy();
    });

    it('no limite o botao Segurar fica desabilitado e Enter nao gasta nada', () => {
        render(<SegurarAcao />);
        fireEvent.click(botaoSegurar());
        expect(botaoSegurar().disabled).toBe(true);
        const atual = getAcoesExibicao(ficha()).padrao.atual;
        fireEvent.keyDown(screen.getByLabelText('Gatilho da Ação segurada'), { key: 'Enter' });
        expect(getAcoesSeguradas(ficha())).toHaveLength(1);
        expect(getAcoesExibicao(ficha()).padrao.atual).toBe(atual);
        expect(useStore.getState().avisosAcao.at(-1).texto).toMatch(/máximo/);
    });

    it('usar: remove da lista, da credito de Acao e avisa', () => {
        render(<SegurarAcao />);
        fireEvent.click(botaoSegurar());
        fireEvent.click(screen.getByText(/▶ Usar/));
        expect(getAcoesSeguradas(ficha())).toHaveLength(0);
        expect(getCreditoAcaoSegurada(ficha())).toBe(1);
        expect(screen.getByText(/em uso/)).toBeTruthy();
        expect(enviarParaFeed.mock.calls.at(-1)[0].texto).toContain('usa a Ação segurada');
        expect(useStore.getState().avisosAcao.at(-1).tipo).toBe('info');
    });

    it('soltar: devolve a Acao ao turno e remove da lista', () => {
        render(<SegurarAcao />);
        const inicial = getAcoesExibicao(ficha()).padrao.atual;
        fireEvent.click(botaoSegurar());
        expect(getAcoesExibicao(ficha()).padrao.atual).toBe(inicial - 1);
        fireEvent.click(screen.getByTitle(/Desistir de segurar/));
        expect(getAcoesSeguradas(ficha())).toHaveLength(0);
        expect(getAcoesExibicao(ficha()).padrao.atual).toBe(inicial);
        expect(enviarParaFeed.mock.calls.at(-1)[0].texto).toContain('desistiu');
    });

    it('limite 0 (Mestre desligou): mostra a dica e esconde o formulario', () => {
        montarStore({ cenario: { segurarAcaoMax: 0 } });
        render(<SegurarAcao />);
        expect(screen.getByText(/não liberou segurar Ação/)).toBeTruthy();
        expect(screen.queryByLabelText('Gatilho da Ação segurada')).toBeNull();
    });

    it('sem Acao disponivel: avisa (alerta) e nao segura', () => {
        const f = { acoes: criarAcoesIniciais(), combate: {} };
        f.acoes.padrao.atual = 0;
        useStore.setState({ minhaFicha: f });
        render(<SegurarAcao />);
        fireEvent.keyDown(screen.getByLabelText('Gatilho da Ação segurada'), { key: 'Enter' });
        expect(getAcoesSeguradas(ficha())).toHaveLength(0);
        expect(useStore.getState().avisosAcao.at(-1).tipo).toBe('alerta');
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('limite proprio do personagem vence o da mesa', () => {
        montarStore({ cenario: { segurarAcaoMax: 1 }, combate: { segurarAcaoMax: 3 } });
        render(<SegurarAcao />);
        expect(contagem()).toBe('0/3');
    });

    it('input de limite do personagem so aparece para o Mestre', () => {
        render(<SegurarAcao />);
        expect(document.querySelector('.segurar-acao-limite')).toBeNull();
        cleanup();
        montarStore({ isMestre: true, cenario: { segurarAcaoMax: 2 } });
        render(<SegurarAcao />);
        const campo = document.querySelector('.segurar-acao-limite');
        expect(campo).toBeTruthy();
        expect(campo.placeholder).toBe('mesa: 2');
    });

    it('Mestre altera o limite do personagem (clamp 0..5) e vazio limpa', () => {
        montarStore({ isMestre: true });
        render(<SegurarAcao />);
        const campo = document.querySelector('.segurar-acao-limite');
        fireEvent.change(campo, { target: { value: '9' } });
        expect(ficha().combate.segurarAcaoMax).toBe(5);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        fireEvent.change(campo, { target: { value: '2' } });
        expect(ficha().combate.segurarAcaoMax).toBe(2);
        expect(contagem()).toBe('0/2');
        fireEvent.change(campo, { target: { value: '' } });
        expect(ficha().combate.segurarAcaoMax).toBe('');
    });

    it('sem ficha nao renderiza nada', () => {
        useStore.setState({ minhaFicha: null });
        const { container } = render(<SegurarAcao />);
        expect(container.innerHTML).toBe('');
    });
});
