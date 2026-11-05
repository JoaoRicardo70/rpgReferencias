import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesImportadorIA } from './PoderesSubComponents';
import { lerRespostaDaIA, prepararImportacao } from '../../core/importadorIA';

const ctx = { abaAtual: 'forma', lerImportacao: null, confirmarImportacao: null };
vi.mock('./PoderesFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, usePoderesForm: () => ctx };
});
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(),
}));

const JSON_IA = JSON.stringify({ poderes: [{ nome: 'A' }, { nome: 'B' }] });

function abrirEPreencher() {
    render(<PoderesImportadorIA />);
    fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
    fireEvent.change(screen.getByPlaceholderText('Cole aqui os textos longos...'), { target: { value: 'meu texto' } });
}
async function ate3() {
    abrirEPreencher();
    fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
    await screen.findByText(/2\. Ler resposta/);
    fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: JSON_IA } });
    fireEvent.click(screen.getByText(/2\. Ler resposta/));
}

beforeEach(() => {
    window.alert = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    ctx.lerImportacao = vi.fn((txt, chave) => {
        const l = lerRespostaDaIA(txt);
        return l.ok ? { ok: true, itens: prepararImportacao(l.itens, 'forma', chave) } : l;
    });
    ctx.confirmarImportacao = vi.fn(() => 2);
});
afterEach(() => cleanup());

describe('PoderesImportadorIA - fluxo em fases', () => {
    it('ler resposta abre a prévia (fase 3) com os itens', async () => {
        await ate3();
        expect(await screen.findByText(/2 de 2 marcados/)).toBeTruthy();
    });
    it('JSON inválido alerta e fica na fase 2', async () => {
        abrirEPreencher();
        fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
        await screen.findByText(/2\. Ler resposta/);
        fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: 'lixo' } });
        fireEvent.click(screen.getByText(/2\. Ler resposta/));
        expect(window.alert).toHaveBeenCalled();
        expect(screen.queryByText(/marcados/)).toBeNull();
    });
    it('Voltar na prévia vai para a fase 2 SEM apagar a prévia; "Ver prévia (N)" reabre', async () => {
        await ate3();
        await screen.findByText(/2 de 2 marcados/);
        fireEvent.click(screen.getByText('Voltar'));
        expect(screen.getByText('Ver prévia (2)')).toBeTruthy();
        fireEvent.click(screen.getByText('Ver prévia (2)'));
        expect(screen.getByText(/2 de 2 marcados/)).toBeTruthy();
    });
    it('+ Colar outra resposta soma itens com chaves novas', async () => {
        await ate3();
        fireEvent.click(await screen.findByText('+ Colar outra resposta'));
        fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: JSON_IA } });
        fireEvent.click(screen.getByText(/2\. Ler resposta/));
        expect(screen.getByText(/4 de 4 marcados/)).toBeTruthy();
        expect(ctx.lerImportacao.mock.calls[1][1]).toBe(3);
    });
    it('gravar confirma, e depois de gravar texto e prompt são limpos', async () => {
        await ate3();
        fireEvent.click(await screen.findByText('Gravar 2 no Grimório'));
        expect(ctx.confirmarImportacao).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls.at(-1)[0]).toMatch(/Inscritos: 2/);
        fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
        expect(screen.getByPlaceholderText('Cole aqui os textos longos...').value).toBe('');
        fireEvent.change(screen.getByPlaceholderText('Cole aqui os textos longos...'), { target: { value: 'novo' } });
        fireEvent.click(screen.getByText(/1\. Copiar Feitiço/));
        await screen.findByText(/2\. Ler resposta/);
        expect(screen.queryByText(/Ver prévia/)).toBeNull();
    });
    it('remover todos os itens volta para a fase 2', async () => {
        await ate3();
        const botoes = await screen.findAllByLabelText('Tirar da lista');
        fireEvent.click(botoes[0]);
        fireEvent.click(screen.getByLabelText('Tirar da lista'));
        expect(screen.getByText(/2\. Ler resposta/)).toBeTruthy();
    });
});
