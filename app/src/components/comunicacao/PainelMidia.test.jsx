import React from 'react';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import PainelMidia from './PainelMidia';
import useStore from '../../stores/useStore';
import {
    iniciarListenerMidia, enviarImagemMidia, apagarImagemMidia, limparMidia, marcarImagemUsada, criarPersonagemNaMesa, personagemExiste,
} from '../../services/midia-sync';

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
    fichaPadrao: { nome: '', avatar: { zoom: 1 }, bio: { classe: '' }, forca: 3 },
}));
vi.mock('../../services/midia-sync', () => ({
    iniciarListenerMidia: vi.fn(),
    enviarImagemMidia: vi.fn(),
    apagarImagemMidia: vi.fn(),
    limparMidia: vi.fn(),
    marcarImagemUsada: vi.fn(),
    criarPersonagemNaMesa: vi.fn(),
    personagemExiste: vi.fn(),
}));

const IMAGENS = [
    { id: 'i1', autor: 'Ana', url: 'https://cdn/1.png', ts: 1000 },
    { id: 'i2', autor: 'Bia', url: 'https://cdn/2.png', ts: 2000 },
];
let adicionarAviso;
let cancelaListener;

function montar({ isMestre = false, meuNome = 'Ana', personagens = { Ana: {}, Goblin: {} }, imagens = IMAGENS, props = {} } = {}) {
    adicionarAviso = vi.fn();
    const state = { meuNome, isMestre, personagens, adicionarAviso };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    cancelaListener = vi.fn();
    iniciarListenerMidia.mockImplementation((cb) => { cb(imagens); return cancelaListener; });
    return render(<PainelMidia {...props} />);
}
const abrirImagem = (i = 0) => fireEvent.click(screen.getAllByTitle('Ampliar')[i]);

beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    apagarImagemMidia.mockResolvedValue(true);
    limparMidia.mockResolvedValue({ ok: true, apagadas: 2 });
    criarPersonagemNaMesa.mockResolvedValue(true);
    personagemExiste.mockResolvedValue(false);
    marcarImagemUsada.mockResolvedValue(true);
    enviarImagemMidia.mockResolvedValue({ ok: true, id: 'x' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PainelMidia - lista', () => {
    it('lista as imagens e mostra "Você" para as próprias', () => {
        montar();
        const imgs = document.querySelectorAll('.midia-item img');
        expect(imgs).toHaveLength(2);
        expect(imgs[0].getAttribute('src')).toBe('https://cdn/1.png');
        expect(screen.getByText('Você')).toBeTruthy();
        expect(screen.getByText('Bia')).toBeTruthy();
    });
    it('mostra o vazio quando não há imagens', () => {
        montar({ imagens: [] });
        expect(screen.getByText(/Nenhuma imagem ainda/)).toBeTruthy();
    });
    it('cancela o listener ao desmontar', () => {
        const { unmount } = montar();
        unmount();
        expect(cancelaListener).toHaveBeenCalled();
    });
    it('erro do listener mostra mensagem', () => {
        adicionarAviso = vi.fn();
        const state = { meuNome: 'Ana', isMestre: false, personagens: {}, adicionarAviso };
        useStore.mockImplementation((s) => s(state));
        iniciarListenerMidia.mockImplementation((cb, aoErro) => { aoErro({ code: 'PERMISSION_DENIED' }); return () => {}; });
        render(<PainelMidia />);
        expect(screen.getByRole('alert').textContent).toMatch(/permission_denied/);
    });
    it('botão de fechar chama onFechar', () => {
        const onFechar = vi.fn();
        montar({ props: { onFechar } });
        fireEvent.click(screen.getByLabelText('Ocultar o chat de mídia'));
        expect(onFechar).toHaveBeenCalled();
    });
});

describe('PainelMidia - limpar', () => {
    it('Mestre vê "🧹 Limpar"; jogador não', () => {
        montar({ isMestre: true });
        expect(screen.getByText('🧹 Limpar')).toBeTruthy();
        cleanup();
        montar({ isMestre: false });
        expect(screen.queryByText('🧹 Limpar')).toBeNull();
    });
    it('pede confirmação e chama limparMidia; avisa o resultado', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar({ isMestre: true });
        fireEvent.click(screen.getByText('🧹 Limpar'));
        expect(window.confirm).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(limparMidia).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(adicionarAviso).toHaveBeenCalledWith('Chat de mídia limpo (2 imagens apagadas).', 'info'));
    });
    it('singular quando 1 arquivo e informa os mantidos por serem avatar de NPC', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        limparMidia.mockResolvedValue({ ok: true, apagadas: 1, mantidas: 2 });
        montar({ isMestre: true });
        fireEvent.click(screen.getByText('🧹 Limpar'));
        await waitFor(() => expect(adicionarAviso).toHaveBeenCalledWith(
            'Chat de mídia limpo (1 imagem apagada; 2 mantido(s) por já serem avatar de NPC).', 'info'
        ));
    });
    it('cancelar a confirmação não limpa', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        montar({ isMestre: true });
        fireEvent.click(screen.getByText('🧹 Limpar'));
        expect(limparMidia).not.toHaveBeenCalled();
    });
    it('falha ao limpar mostra erro', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        limparMidia.mockResolvedValue({ ok: false, apagadas: 0 });
        montar({ isMestre: true });
        fireEvent.click(screen.getByText('🧹 Limpar'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/limpar/));
        expect(adicionarAviso).not.toHaveBeenCalled();
    });
});

describe('PainelMidia - apagar', () => {
    it('jogador só vê apagar nas próprias', () => {
        montar({ meuNome: 'Ana' });
        expect(screen.getAllByLabelText('Apagar esta imagem')).toHaveLength(1);
    });
    it('Mestre vê apagar em todas', () => {
        montar({ isMestre: true, meuNome: 'Zed' });
        expect(screen.getAllByLabelText('Apagar esta imagem')).toHaveLength(2);
    });
    it('confirmado chama apagarImagemMidia com a entrada', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar({ meuNome: 'Ana' });
        fireEvent.click(screen.getByLabelText('Apagar esta imagem'));
        await waitFor(() => expect(apagarImagemMidia).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' })));
    });
    it('sem confirmação não apaga', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        montar({ meuNome: 'Ana' });
        fireEvent.click(screen.getByLabelText('Apagar esta imagem'));
        expect(apagarImagemMidia).not.toHaveBeenCalled();
    });
    it('falha ao apagar mostra erro', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        apagarImagemMidia.mockResolvedValue(false);
        montar({ meuNome: 'Ana' });
        fireEvent.click(screen.getByLabelText('Apagar esta imagem'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/apagar/));
    });
});

describe('PainelMidia - visualizador e NPC', () => {
    it('clicar na imagem abre o visualizador; Esc fecha', () => {
        montar();
        expect(screen.queryByRole('dialog')).toBeNull();
        abrirImagem(1);
        const dlg = screen.getByRole('dialog');
        expect(dlg.querySelector('img').getAttribute('src')).toBe('https://cdn/2.png');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('jogador não vê "Criar NPC"', () => {
        montar({ isMestre: false });
        abrirImagem();
        expect(screen.queryByText(/Criar NPC com esta imagem/)).toBeNull();
    });
    it('Mestre cria NPC: ficha com avatar.base = url, marca imagem usada, avisa e fecha', async () => {
        montar({ isMestre: true, meuNome: 'Zed' });
        abrirImagem(0);
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        fireEvent.change(screen.getByLabelText('Nome do NPC'), { target: { value: '  Orc  ' } });
        fireEvent.click(screen.getByText('Criar NPC'));
        await waitFor(() => expect(criarPersonagemNaMesa).toHaveBeenCalledTimes(1));
        const [nome, ficha] = criarPersonagemNaMesa.mock.calls[0];
        expect(nome).toBe('Orc');
        expect(ficha.nome).toBe('Orc');
        expect(ficha.isNPC).toBe(true);
        expect(ficha.avatar.base).toBe('https://cdn/1.png');
        expect(ficha.avatar.zoom).toBe(1);
        expect(ficha.bio.mesa).toBe('npc');
        expect(ficha.forca).toBe(3);
        await waitFor(() => expect(marcarImagemUsada).toHaveBeenCalledWith('i1'));
        await waitFor(() => expect(adicionarAviso).toHaveBeenCalledWith(expect.stringContaining('NPC Orc criado'), 'info'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
    it('nome vazio: botão desabilitado e nada é criado', () => {
        montar({ isMestre: true });
        abrirImagem();
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        expect(screen.getByText('Criar NPC').disabled).toBe(true);
        fireEvent.submit(screen.getByLabelText('Nome do NPC').closest('form'));
        expect(screen.getByRole('alert').textContent).toMatch(/nome/i);
        expect(criarPersonagemNaMesa).not.toHaveBeenCalled();
    });
    it('nome duplicado (sem diferenciar maiúsculas) mostra erro', () => {
        montar({ isMestre: true });
        abrirImagem();
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        fireEvent.change(screen.getByLabelText('Nome do NPC'), { target: { value: 'goblin' } });
        fireEvent.click(screen.getByText('Criar NPC'));
        expect(screen.getByRole('alert').textContent).toMatch(/Já existe/);
        expect(criarPersonagemNaMesa).not.toHaveBeenCalled();
        expect(marcarImagemUsada).not.toHaveBeenCalled();
    });
    it('nome que já existe no banco (ainda não carregado no store) mostra erro e não cria', async () => {
        personagemExiste.mockResolvedValue(true);
        montar({ isMestre: true });
        abrirImagem();
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        fireEvent.change(screen.getByLabelText('Nome do NPC'), { target: { value: 'Outro' } });
        fireEvent.click(screen.getByText('Criar NPC'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Já existe/));
        expect(criarPersonagemNaMesa).not.toHaveBeenCalled();
        expect(marcarImagemUsada).not.toHaveBeenCalled();
    });
    it('marca a imagem como usada ANTES de criar o personagem', async () => {
        const ordem = [];
        marcarImagemUsada.mockImplementation(async () => { ordem.push('marcar'); return true; });
        criarPersonagemNaMesa.mockImplementation(async () => { ordem.push('criar'); return true; });
        montar({ isMestre: true });
        abrirImagem();
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        fireEvent.change(screen.getByLabelText('Nome do NPC'), { target: { value: 'Novo' } });
        fireEvent.click(screen.getByText('Criar NPC'));
        await waitFor(() => expect(ordem).toEqual(['marcar', 'criar']));
    });
    it('falha ao criar mostra erro e mantém o visualizador aberto', async () => {
        criarPersonagemNaMesa.mockResolvedValue(false);
        montar({ isMestre: true });
        abrirImagem();
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        fireEvent.change(screen.getByLabelText('Nome do NPC'), { target: { value: 'Novo' } });
        fireEvent.click(screen.getByText('Criar NPC'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível criar/));
        expect(adicionarAviso).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });
    it('Cancelar volta ao botão de criar', () => {
        montar({ isMestre: true });
        abrirImagem();
        fireEvent.click(screen.getByText('🎭 Criar NPC com esta imagem'));
        fireEvent.click(screen.getByText('Cancelar'));
        expect(screen.getByText('🎭 Criar NPC com esta imagem')).toBeTruthy();
    });
});

describe('PainelMidia - envio', () => {
    const escolher = (file) => {
        const input = document.querySelector('input[type="file"]');
        fireEvent.change(input, { target: { files: [file] } });
    };
    it('arquivo inválido mostra erro sem chamar enviarImagemMidia', () => {
        montar();
        escolher(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
        expect(screen.getByRole('alert').textContent).toMatch(/Escolha uma imagem/);
        expect(enviarImagemMidia).not.toHaveBeenCalled();
    });
    it('arquivo válido chama enviarImagemMidia com o nome do autor', async () => {
        montar({ meuNome: 'Ana' });
        const f = new File(['conteudo'], 'a.png', { type: 'image/png' });
        escolher(f);
        await waitFor(() => expect(enviarImagemMidia).toHaveBeenCalledWith(f, 'Ana'));
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('falha no envio mostra a mensagem descritiva', async () => {
        enviarImagemMidia.mockResolvedValue({ ok: false, erro: { code: 'storage/unauthorized' } });
        montar();
        escolher(new File(['x'], 'a.png', { type: 'image/png' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/armazenamento/));
    });
    it('colar uma imagem envia', async () => {
        montar();
        const f = new File(['x'], 'cola.png', { type: 'image/png' });
        const aside = document.querySelector('aside.sala-party-midia');
        await act(async () => {
            fireEvent.paste(aside, { clipboardData: { items: [{ type: 'image/png', getAsFile: () => f }] } });
        });
        expect(enviarImagemMidia).toHaveBeenCalledWith(f, 'Ana');
    });
});
