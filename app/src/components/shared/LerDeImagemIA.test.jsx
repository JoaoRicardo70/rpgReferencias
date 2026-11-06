import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LerDeImagemIA from './LerDeImagemIA';
import useStore from '../../stores/useStore';
import { reduzirImagem, lerImagensComIA } from '../../services/lerImagemIA';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/lerImagemIA', () => ({ reduzirImagem: vi.fn(), lerImagensComIA: vi.fn() }));

const arquivo = (nome) => new File(['x'], nome, { type: 'image/png' });
let config;
let seq;

function montar(props = {}) {
    const p = { montarPrompt: vi.fn(() => 'PROMPT'), onResposta: vi.fn(() => true), ...props };
    render(<LerDeImagemIA {...p} />);
    return p;
}
const escolher = async (...nomes) => {
    fireEvent.change(screen.getByLabelText('Escolher imagens'), { target: { files: nomes.map(arquivo) } });
    await waitFor(() => expect(screen.getByText(/Ler \d* ?imagem/).disabled).toBe(false));
};
const botaoLer = () => screen.getByText(/imagem\(ns\) com a Sexta-Feira|Lendo as imagens/);
const botaoEscolher = () => screen.getByText('+ Escolher imagens');

beforeEach(() => {
    config = { chaveGemini: 'CHAVE', modelo: 'gemini-teste' };
    seq = 0;
    useStore.mockImplementation((sel) => sel({ sextaFeiraConfig: config }));
    reduzirImagem.mockReset();
    lerImagensComIA.mockReset();
    reduzirImagem.mockImplementation(async (arq) => ({ nome: arq.name, mimeType: 'image/jpeg', data: `D${++seq}` }));
    lerImagensComIA.mockResolvedValue('{"json":1}');
});
afterEach(() => cleanup());

describe('LerDeImagemIA', () => {
    it('sem chave: mostra mensagem em role=alert e nao chama o servico', async () => {
        config = null;
        montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        expect((await screen.findByRole('alert')).textContent).toMatch(/não foi configurada/);
        expect(lerImagensComIA).not.toHaveBeenCalled();
    });
    it('chave vazia tambem conta como nao configurada', async () => {
        config = { chaveGemini: '' };
        montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(lerImagensComIA).not.toHaveBeenCalled();
    });
    it('estado inicial: botao de ler desabilitado e sem lista', () => {
        montar();
        expect(botaoLer().disabled).toBe(true);
        expect(screen.queryByLabelText('Imagens escolhidas')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('escolher arquivos reduz cada um e lista os nomes', async () => {
        montar();
        await escolher('a.png', 'b.png');
        expect(reduzirImagem).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('Imagens escolhidas').textContent).toMatch(/a\.png.*b\.png/s);
        expect(botaoLer().textContent).toMatch(/Ler 2 imagem/);
    });
    it('limite de 4: ignora o excedente, avisa e desabilita o botao de escolher', async () => {
        montar();
        await escolher('1.png', '2.png', '3.png', '4.png', '5.png', '6.png');
        expect(reduzirImagem).toHaveBeenCalledTimes(4);
        expect(screen.getAllByRole('listitem')).toHaveLength(4);
        expect(screen.getByRole('alert').textContent).toMatch(/ignorei 2/);
        expect(botaoEscolher().disabled).toBe(true);
    });
    it('limite de 4 somando em varias escolhas', async () => {
        montar();
        await escolher('1.png', '2.png', '3.png');
        fireEvent.change(screen.getByLabelText('Escolher imagens'), { target: { files: [arquivo('4.png'), arquivo('5.png')] } });
        await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
        expect(reduzirImagem).toHaveBeenCalledTimes(4);
        expect(screen.getByRole('alert').textContent).toMatch(/ignorei 1/);
    });
    it('imagem que falha na reducao vira aviso e as boas entram', async () => {
        reduzirImagem.mockImplementation(async (arq) => { if (arq.name === 'ruim.png') throw new Error('"ruim.png" não é PNG, JPG ou WEBP.'); return { nome: arq.name, mimeType: 'image/jpeg', data: 'X' }; });
        montar();
        fireEvent.change(screen.getByLabelText('Escolher imagens'), { target: { files: [arquivo('ruim.png'), arquivo('boa.png')] } });
        await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
        expect(screen.getByRole('alert').textContent).toMatch(/ruim\.png/);
    });
    it('sem arquivos no evento nao faz nada', async () => {
        montar();
        fireEvent.change(screen.getByLabelText('Escolher imagens'), { target: { files: [] } });
        expect(reduzirImagem).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('remover tira so a imagem escolhida', async () => {
        montar();
        await escolher('a.png', 'b.png');
        fireEvent.click(screen.getByLabelText('Tirar a.png'));
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(screen.queryByLabelText('Tirar a.png')).toBeNull();
        expect(screen.getByLabelText('Tirar b.png')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Tirar b.png'));
        expect(botaoLer().disabled).toBe(true);
    });
    it('ler: chama o servico com chave, modelo, prompt com imagens e depois onResposta; limpa a lista', async () => {
        const p = montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        await waitFor(() => expect(p.onResposta).toHaveBeenCalledWith('{"json":1}'));
        const arg = lerImagensComIA.mock.calls[0][0];
        expect(arg.chave).toBe('CHAVE');
        expect(arg.modelo).toBe('gemini-teste');
        expect(arg.prompt).toContain('PROMPT');
        expect(arg.prompt).toMatch(/imagens anexadas/);
        expect(arg.imagens).toHaveLength(1);
        await waitFor(() => expect(screen.queryByLabelText('Imagens escolhidas')).toBeNull());
        expect(botaoLer().disabled).toBe(true);
    });
    it('sem modelo configurado usa o padrao', async () => {
        config = { chaveGemini: 'C' };
        montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        await waitFor(() => expect(lerImagensComIA).toHaveBeenCalled());
        expect(typeof lerImagensComIA.mock.calls[0][0].modelo).toBe('string');
        expect(lerImagensComIA.mock.calls[0][0].modelo.length).toBeGreaterThan(0);
    });
    it('onResposta retornando undefined (nao false) tambem descarta as imagens', async () => {
        montar({ onResposta: vi.fn(() => undefined) });
        await escolher('a.png');
        fireEvent.click(botaoLer());
        await waitFor(() => expect(screen.queryByLabelText('Imagens escolhidas')).toBeNull());
    });
    it('onResposta retornando false mantem as imagens para nova tentativa', async () => {
        const p = montar({ onResposta: vi.fn(() => false) });
        await escolher('a.png', 'b.png');
        fireEvent.click(botaoLer());
        await waitFor(() => expect(p.onResposta).toHaveBeenCalled());
        await waitFor(() => expect(botaoLer().textContent).toMatch(/Ler 2 imagem/));
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(botaoLer().disabled).toBe(false);
    });
    it('erro do servico aparece em role=alert, mantem imagens e nao chama onResposta', async () => {
        lerImagensComIA.mockRejectedValue(new Error('A cota gratuita do Gemini acabou'));
        const p = montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        expect((await screen.findByRole('alert')).textContent).toMatch(/cota gratuita/);
        expect(p.onResposta).not.toHaveBeenCalled();
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(botaoLer().disabled).toBe(false);
    });
    it('erro sem mensagem usa texto padrao', async () => {
        lerImagensComIA.mockRejectedValue({});
        montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        expect((await screen.findByRole('alert')).textContent).toMatch(/Não consegui ler as imagens/);
    });
    it('onResposta que lanca excecao e tratada como erro (nao quebra)', async () => {
        montar({ onResposta: vi.fn(() => { throw new Error('boom'); }) });
        await escolher('a.png');
        fireEvent.click(botaoLer());
        expect((await screen.findByRole('alert')).textContent).toMatch(/boom/);
    });
    it('botoes ficam desabilitados enquanto le', async () => {
        let resolver;
        lerImagensComIA.mockReturnValue(new Promise((r) => { resolver = r; }));
        montar();
        await escolher('a.png');
        fireEvent.click(botaoLer());
        await waitFor(() => expect(screen.getByText('Lendo as imagens…').disabled).toBe(true));
        expect(botaoEscolher().disabled).toBe(true);
        // clique repetido durante a leitura nao dispara segunda chamada
        fireEvent.click(screen.getByText('Lendo as imagens…'));
        expect(lerImagensComIA).toHaveBeenCalledTimes(1);
        await act(async () => { resolver('ok'); });
        await waitFor(() => expect(botaoEscolher().disabled).toBe(false));
    });
    it('botoes ficam desabilitados enquanto reduz', async () => {
        let resolver;
        reduzirImagem.mockReturnValue(new Promise((r) => { resolver = r; }));
        montar();
        fireEvent.change(screen.getByLabelText('Escolher imagens'), { target: { files: [arquivo('a.png')] } });
        await waitFor(() => expect(botaoEscolher().disabled).toBe(true));
        expect(botaoLer().disabled).toBe(true);
        await act(async () => { resolver({ nome: 'a.png', mimeType: 'image/jpeg', data: 'X' }); });
        await waitFor(() => expect(botaoEscolher().disabled).toBe(false));
        expect(botaoLer().disabled).toBe(false);
    });
    it('ler sem imagens (clique forcado) nao chama o servico', () => {
        montar();
        fireEvent.click(botaoLer());
        expect(lerImagensComIA).not.toHaveBeenCalled();
    });
});
