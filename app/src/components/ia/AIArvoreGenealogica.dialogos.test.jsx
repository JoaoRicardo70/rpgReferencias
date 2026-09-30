import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';

const fb = vi.hoisted(() => ({ set: vi.fn(), onValue: vi.fn() }));
vi.mock('firebase/database', () => ({ ref: vi.fn((db, c) => ({ c })), onValue: fb.onValue, set: fb.set, get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, database: {}, functions: {}, auth: {} }));

import AIArvoreGenealogica from './AIArvoreGenealogica';
import { DialogosSextaProvider } from './DialogosSexta';
import useStore from '../../stores/useStore';

const ARVORE = {
    Ackermann: [
        { id: 1, nome: 'Natsu Ackermann', avatar: '', parceiros: '', papel: '', classe: '', elemento: '', hp: '1', mana: '1', status: 'Vivo', lore: '', afiliacao: 'Ackermann', parentId: null },
        { id: 2, nome: 'Filho do Natsu', avatar: '', parceiros: '', papel: '', classe: '', elemento: '', hp: '1', mana: '1', status: 'Vivo', lore: '', afiliacao: 'Ackermann', parentId: 1 },
    ],
    Stark: [{ id: 3, nome: 'Tony Stark', avatar: '', parceiros: '', papel: '', classe: '', elemento: '', hp: '1', mana: '1', status: 'Vivo', lore: '', afiliacao: 'Stark', parentId: null }],
};
const salva = () => JSON.parse(localStorage.getItem('rpgSextaFeira_arvore'));
const montar = (comProvider = false) => render(comProvider ? <DialogosSextaProvider><AIArvoreGenealogica /></DialogosSextaProvider> : <AIArvoreGenealogica />);

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify(ARVORE));
    fb.set.mockReset(); fb.set.mockResolvedValue();
    fb.onValue.mockReset(); fb.onValue.mockReturnValue(() => {});
    useStore.setState({ mesaId: null, personagens: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const tabRenomear = (nome) => screen.getAllByTitle('Renomear Árvore')[nome === 'Ackermann' ? 0 : 1];
const tabApagar = (nome) => screen.getAllByTitle('Apagar Árvore')[nome === 'Ackermann' ? 0 : 1];

describe('Arvore - sem provider (fallback do navegador)', () => {
    it('renomear familia usa window.prompt e atualiza o storage', async () => {
        const p = vi.spyOn(window, 'prompt').mockReturnValue('Uchiha');
        montar();
        await act(async () => { fireEvent.click(tabRenomear('Ackermann')); });
        expect(p).toHaveBeenCalledWith('Novo nome da Árvore', 'Ackermann');
        expect(Object.keys(salva())).toEqual(['Stark', 'Uchiha']);
        expect(salva().Uchiha).toHaveLength(2);
    });
    it('renomear cancelado, vazio ou igual nao muda', async () => {
        const p = vi.spyOn(window, 'prompt');
        montar();
        for (const v of [null, '   ', 'Ackermann']) {
            p.mockReturnValueOnce(v);
            await act(async () => { fireEvent.click(tabRenomear('Ackermann')); });
        }
        expect(Object.keys(salva())).toEqual(['Ackermann', 'Stark']);
    });
    it('renomear para nome existente avisa (alert) e nao renomeia', async () => {
        vi.spyOn(window, 'prompt').mockReturnValue('Stark');
        const al = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar();
        await act(async () => { fireEvent.click(tabRenomear('Ackermann')); });
        expect(al).toHaveBeenCalledWith('Já existe uma árvore com este nome!');
        expect(Object.keys(salva())).toEqual(['Ackermann', 'Stark']);
    });
    it('apagar familia usa window.confirm: recusar mantem, aceitar remove e troca a ativa', async () => {
        const c = vi.spyOn(window, 'confirm').mockReturnValue(false);
        montar();
        await act(async () => { fireEvent.click(tabApagar('Ackermann')); });
        expect(c.mock.calls[0][0]).toContain('Ackermann');
        expect(Object.keys(salva())).toEqual(['Ackermann', 'Stark']);
        c.mockReturnValue(true);
        await act(async () => { fireEvent.click(tabApagar('Ackermann')); });
        expect(Object.keys(salva())).toEqual(['Stark']);
    });
    it('apagar NPC (gaveta) usa window.confirm; aceitar remove e filhos viram fundadores', async () => {
        const c = vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar();
        // tira o pai (id 1)
        const cartao = screen.getAllByText('Natsu Ackermann')[0];
        await act(async () => { fireEvent.click(cartao); });
        await act(async () => { fireEvent.click(screen.getByText('✖ APAGAR MEMBRO')); });
        expect(c).toHaveBeenCalledTimes(1);
        const lista = salva().Ackermann;
        expect(lista.map(n => n.id)).toEqual([2]);
        expect(lista[0].parentId).toBeNull();
    });
    it('apagar NPC recusado mantem tudo', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        montar();
        await act(async () => { fireEvent.click(screen.getAllByText('Natsu Ackermann')[0]); });
        await act(async () => { fireEvent.click(screen.getByText('✖ APAGAR MEMBRO')); });
        expect(salva().Ackermann).toHaveLength(2);
    });
});

describe('Arvore - com DialogosSextaProvider', () => {
    it('renomear abre modal tematico (nao chama window.prompt), pre-preenchido, e aplica ao confirmar', async () => {
        const p = vi.spyOn(window, 'prompt');
        montar(true);
        await act(async () => { fireEvent.click(tabRenomear('Ackermann')); });
        const dlg = screen.getByRole('dialog');
        expect(dlg.getAttribute('aria-label')).toBe('✏️ Renomear Árvore');
        const input = within(dlg).getByRole('textbox');
        expect(input.value).toBe('Ackermann');
        fireEvent.change(input, { target: { value: 'Uzumaki' } });
        await act(async () => { fireEvent.click(within(dlg).getByText('OK')); });
        expect(p).not.toHaveBeenCalled();
        expect(Object.keys(salva())).toEqual(['Stark', 'Uzumaki']);
    });
    it('renomear cancelado por Esc nao muda nada', async () => {
        montar(true);
        await act(async () => { fireEvent.click(tabRenomear('Stark')); });
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(Object.keys(salva())).toEqual(['Ackermann', 'Stark']);
    });
    it('nome ja existente mostra toast de erro (nao window.alert)', async () => {
        const al = vi.spyOn(window, 'alert').mockImplementation(() => {});
        montar(true);
        await act(async () => { fireEvent.click(tabRenomear('Ackermann')); });
        fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox'), { target: { value: 'Stark' } });
        await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByText('OK')); });
        expect(al).not.toHaveBeenCalled();
        expect(screen.getByText('Já existe uma árvore com este nome!').className).toContain('sexta-aviso-erro');
    });
    it('apagar familia: modal de perigo; Cancelar mantem, Apagar remove', async () => {
        const c = vi.spyOn(window, 'confirm');
        montar(true);
        await act(async () => { fireEvent.click(tabApagar('Stark')); });
        let dlg = screen.getByRole('dialog');
        expect(dlg.textContent).toContain('Apagar a ÁRVORE "Stark"');
        expect(within(dlg).getByText('Apagar').className).toContain('btn-red');
        await act(async () => { fireEvent.click(within(dlg).getByText('Cancelar')); });
        expect(Object.keys(salva())).toEqual(['Ackermann', 'Stark']);
        await act(async () => { fireEvent.click(tabApagar('Stark')); });
        dlg = screen.getByRole('dialog');
        await act(async () => { fireEvent.click(within(dlg).getByText('Apagar')); });
        expect(Object.keys(salva())).toEqual(['Ackermann']);
        expect(c).not.toHaveBeenCalled();
    });
    it('apagar NPC: modal tematico; confirmar remove o NPC', async () => {
        const c = vi.spyOn(window, 'confirm');
        montar(true);
        await act(async () => { fireEvent.click(screen.getAllByText('Filho do Natsu')[0]); });
        await act(async () => { fireEvent.click(screen.getByText('✖ APAGAR MEMBRO')); });
        const dlg = screen.getByRole('dialog');
        expect(dlg.getAttribute('aria-label')).toBe('🗑️ Apagar NPC');
        await act(async () => { fireEvent.click(within(dlg).getByText('Apagar')); });
        expect(salva().Ackermann.map(n => n.id)).toEqual([1]);
        expect(c).not.toHaveBeenCalled();
    });
    it('apagar NPC: Esc cancela e mantem o NPC', async () => {
        montar(true);
        await act(async () => { fireEvent.click(screen.getAllByText('Filho do Natsu')[0]); });
        await act(async () => { fireEvent.click(screen.getByText('✖ APAGAR MEMBRO')); });
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        expect(salva().Ackermann).toHaveLength(2);
    });
    it('com mesa: a mudanca estrutural sincroniza (set) so depois da confirmacao', async () => {
        useStore.setState({ mesaId: 'M1' });
        montar(true);
        await act(async () => { fireEvent.click(tabApagar('Stark')); });
        expect(fb.set).not.toHaveBeenCalled();
        await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByText('Apagar')); });
        expect(fb.set).toHaveBeenCalledTimes(1);
        expect(Object.keys(fb.set.mock.calls[0][1])).toEqual(['Ackermann']);
    });
});
