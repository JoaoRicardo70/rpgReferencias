import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, version: '0', getDocument: vi.fn() }));
vi.mock('../../services/sextaFeiraIA', () => ({
    chamarGemini: vi.fn(), traduzirErroGemini: vi.fn(), listarModelosGemini: vi.fn(),
}));

import { AIConfig } from './AISubComponents';
import { AIFormProvider } from './AIFormContext';
import useStore from '../../stores/useStore';
import { listarModelosGemini } from '../../services/sextaFeiraIA';
import { MODELO_GEMINI_PADRAO } from '../../core/sextaFeira';
import { set as fbSet } from 'firebase/database';

const montar = () => render(<AIFormProvider><AIConfig /></AIFormProvider>);

beforeEach(() => {
    listarModelosGemini.mockReset();
    fbSet.mockReset(); fbSet.mockResolvedValue(undefined);
    localStorage.clear();
    useStore.setState({ isMestre: true, mesaId: 'M1', meuNome: 'Mestre', sextaFeiraConfig: null });
});
afterEach(() => cleanup());

const campoChave = () => document.querySelector('input[autocomplete="off"]');
const botaoTestar = () => screen.getByRole('button', { name: /Testar chave/ });

describe('AIConfig', () => {
    it('jogador ve so o aviso', () => {
        useStore.setState({ isMestre: false });
        montar();
        expect(screen.getByText(/Somente o Mestre/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Testar chave/ })).toBeNull();
    });
    it('Testar chave desabilitado sem chave', () => {
        montar();
        expect(botaoTestar().disabled).toBe(true);
    });
    it('Testar chave chama listarModelosGemini (chave com trim) e mostra select com os modelos', async () => {
        listarModelosGemini.mockResolvedValue([
            { id: 'gemini-2.5-pro', nome: 'Pro' }, { id: 'gemini-2.5-flash', nome: 'Flash' },
        ]);
        montar();
        fireEvent.change(campoChave(), { target: { value: '  AIzaXYZ  ' } });
        fireEvent.click(botaoTestar());
        await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
        expect(listarModelosGemini).toHaveBeenCalledWith({ chave: 'AIzaXYZ' });
        const opcoes = [...document.querySelectorAll('select option')].map(o => o.value);
        // o modelo atual (padrao) nao esta na lista: vem como primeira opcao "(atual)"
        expect(opcoes).toEqual([MODELO_GEMINI_PADRAO, 'gemini-2.5-pro', 'gemini-2.5-flash']);
        expect(screen.getByText(/2 modelo\(s\)/)).toBeTruthy();
        fireEvent.change(document.querySelector('select'), { target: { value: 'gemini-2.5-flash' } });
        expect(document.querySelector('select').value).toBe('gemini-2.5-flash');
    });
    it('modelo atual que esta na lista nao e duplicado', async () => {
        useStore.setState({ sextaFeiraConfig: { chaveGemini: 'AIza', modelo: 'gemini-2.5-pro' } });
        listarModelosGemini.mockResolvedValue([{ id: 'gemini-2.5-pro', nome: 'Pro' }]);
        montar();
        fireEvent.click(botaoTestar());
        await waitFor(() => expect(document.querySelector('select')).toBeTruthy());
        expect([...document.querySelectorAll('select option')].map(o => o.value)).toEqual(['gemini-2.5-pro']);
    });
    it('lista vazia mostra aviso e mantem campo de texto', async () => {
        listarModelosGemini.mockResolvedValue([]);
        montar();
        fireEvent.change(campoChave(), { target: { value: 'K' } });
        fireEvent.click(botaoTestar());
        await waitFor(() => expect(screen.getByText(/nenhum modelo de texto/)).toBeTruthy());
        expect(document.querySelector('select')).toBeNull();
    });
    it('erro ao testar mostra a mensagem e limpa modelos', async () => {
        listarModelosGemini.mockRejectedValue(new Error('A chave do Gemini cadastrada pelo Mestre é inválida.'));
        montar();
        fireEvent.change(campoChave(), { target: { value: 'K' } });
        fireEvent.click(botaoTestar());
        await waitFor(() => expect(screen.getByText(/❌ A chave do Gemini cadastrada pelo Mestre é inválida/)).toBeTruthy());
        expect(document.querySelector('select')).toBeNull();
        expect(botaoTestar().disabled).toBe(false);
    });
    it('erro sem mensagem usa texto padrao', async () => {
        listarModelosGemini.mockRejectedValue({});
        montar();
        fireEvent.change(campoChave(), { target: { value: 'K' } });
        fireEvent.click(botaoTestar());
        await waitFor(() => expect(screen.getByText(/Não foi possível testar a chave/)).toBeTruthy());
    });
    it('durante o teste o botao fica desabilitado', async () => {
        let resolver;
        listarModelosGemini.mockReturnValue(new Promise(r => { resolver = r; }));
        montar();
        fireEvent.change(campoChave(), { target: { value: 'K' } });
        fireEvent.click(botaoTestar());
        await waitFor(() => expect(screen.getByRole('button', { name: '...' }).disabled).toBe(true));
        await act(async () => { resolver([]); });
        await waitFor(() => expect(botaoTestar().disabled).toBe(false));
    });
    it('Salvar grava e mostra confirmacao', async () => {
        montar();
        fireEvent.change(campoChave(), { target: { value: 'KEY' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        await waitFor(() => expect(screen.getByText(/Configuração salva/)).toBeTruthy());
        expect(fbSet).toHaveBeenCalledTimes(1);
        expect(useStore.getState().sextaFeiraConfig.chaveGemini).toBe('KEY');
    });
    it('permission denied mostra a mensagem sobre as regras (por code)', async () => {
        fbSet.mockRejectedValue(Object.assign(new Error('x'), { code: 'PERMISSION_DENIED' }));
        montar();
        fireEvent.change(campoChave(), { target: { value: 'KEY' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        await waitFor(() => expect(screen.getByText(/Regras do Firebase/)).toBeTruthy());
        expect(screen.getByText(/O banco recusou a gravação/)).toBeTruthy();
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
    });
    it('permission denied detectado pela mensagem (sem code)', async () => {
        fbSet.mockRejectedValue(new Error('Permission denied'));
        montar();
        fireEvent.change(campoChave(), { target: { value: 'KEY' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        await waitFor(() => expect(screen.getByText(/Regras do Firebase/)).toBeTruthy());
    });
    it('outro erro de gravacao mostra a mensagem generica', async () => {
        fbSet.mockRejectedValue(new Error('rede caiu'));
        montar();
        fireEvent.change(campoChave(), { target: { value: 'KEY' } });
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        await waitFor(() => expect(screen.getByText(/Não foi possível salvar \(rede caiu\)/)).toBeTruthy());
    });
    it('Salvar desabilitado sem chave', () => {
        montar();
        expect(screen.getByRole('button', { name: /Salvar/ }).disabled).toBe(true);
    });
});
