import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementosImportadorIA } from './ElementosSubComponents';
import { lerRespostaTecnicas, prepararImportacaoTecnicas } from '../../core/importadorTecnicas';
import { reduzirImagem, lerImagensComIA } from '../../services/lerImagemIA';
import useStore from '../../stores/useStore';

const ELEMS = ['Fogo', 'Agua', 'Neutro'];
const ctx = { lerImportacao: null, confirmarImportacao: null, nomesElementos: ELEMS, elemSelecionado: 'Neutro' };
vi.mock('./ElementosFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useElementosForm: () => ctx };
});
vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(),
}));
vi.mock('../../services/lerImagemIA', () => ({ reduzirImagem: vi.fn(), lerImagensComIA: vi.fn() }));

const JSON_IA = JSON.stringify({ ataquesElementais: [{ nome: 'Bola', elemento: 'Fogo', danoQtd: 2, danoFaces: 6 }] });

async function escolherEler() {
    fireEvent.click(screen.getByText('Abrir Círculo de Invocação (IA)'));
    fireEvent.change(screen.getByLabelText('Escolher imagens'), { target: { files: [new File(['x'], 'print.png', { type: 'image/png' })] } });
    const botao = await screen.findByText(/Ler 1 imagem/);
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
}

beforeEach(() => {
    window.alert = vi.fn();
    useStore.mockImplementation((sel) => sel({ sextaFeiraConfig: { chaveGemini: 'K' } }));
    reduzirImagem.mockReset();
    lerImagensComIA.mockReset();
    reduzirImagem.mockResolvedValue({ nome: 'print.png', mimeType: 'image/jpeg', data: 'QUJD' });
    ctx.lerImportacao = vi.fn((txt, chave) => {
        const l = lerRespostaTecnicas(txt);
        return l.ok ? { ok: true, itens: prepararImportacaoTecnicas(l.itens, { elementos: ELEMS, elementoPadrao: 'Neutro' }, chave) } : l;
    });
    ctx.confirmarImportacao = vi.fn(() => 1);
});
afterEach(() => cleanup());

describe('ElementosImportadorIA - Ler de imagem', () => {
    it('resposta valida da IA abre a previa (fase 3)', async () => {
        lerImagensComIA.mockResolvedValue(JSON_IA);
        render(<ElementosImportadorIA />);
        await escolherEler();
        expect(await screen.findByText(/1 de 1 marcados/)).toBeTruthy();
        expect(screen.getByDisplayValue('Bola')).toBeTruthy();
        expect(ctx.lerImportacao).toHaveBeenCalledWith(JSON_IA, 1);
        expect(window.alert).not.toHaveBeenCalledWith(expect.stringMatching(/Cole o texto/));
    });
    it('o prompt enviado usa o texto das imagens e traz os elementos', async () => {
        lerImagensComIA.mockResolvedValue(JSON_IA);
        render(<ElementosImportadorIA />);
        await escolherEler();
        await screen.findByText(/marcados\)/);
        const prompt = lerImagensComIA.mock.calls[0][0].prompt;
        expect(prompt).toContain('IMAGENS anexadas');
        expect(prompt).toContain('Fogo, Agua, Neutro');
    });
    it('resposta invalida cai na fase 2 mostrando o texto cru e alerta o erro', async () => {
        lerImagensComIA.mockResolvedValue('isto nao e json');
        render(<ElementosImportadorIA />);
        await escolherEler();
        await screen.findByText(/2\. Ler resposta/);
        expect(screen.getByPlaceholderText(/Cole o Código Arcano/).value).toBe('isto nao e json');
        expect(window.alert).toHaveBeenCalled();
        expect(screen.queryByText(/marcados\)/)).toBeNull();
    });
    it('na fase 2 apos falha da imagem, o jogador pode corrigir o texto e ler normalmente', async () => {
        lerImagensComIA.mockResolvedValue('quase json');
        render(<ElementosImportadorIA />);
        await escolherEler();
        await screen.findByText(/2\. Ler resposta/);
        fireEvent.change(screen.getByPlaceholderText(/Cole o Código Arcano/), { target: { value: JSON_IA } });
        fireEvent.click(screen.getByText(/2\. Ler resposta/));
        expect(await screen.findByText(/1 de 1 marcados/)).toBeTruthy();
    });
    it('erro do servico fica na fase 1 com alerta e sem chamar lerImportacao', async () => {
        lerImagensComIA.mockRejectedValue(new Error('A cota gratuita do Gemini acabou'));
        render(<ElementosImportadorIA />);
        await escolherEler();
        expect((await screen.findByRole('alert')).textContent).toMatch(/cota gratuita/);
        expect(ctx.lerImportacao).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText(/Cole aqui os manuscritos/)).toBeTruthy();
    });
});
