import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ordem = [];
const mocks = vi.hoisted(() => ({
    listarBackups: vi.fn(),
    lerBackup: vi.fn(),
    backupAntesDeImportar: vi.fn(),
    salvarFirebaseImediato: vi.fn(),
    remotoConfirmado: vi.fn(),
}));
vi.mock('../../services/backup-ficha', () => ({
    listarBackups: mocks.listarBackups,
    lerBackup: mocks.lerBackup,
    backupAntesDeImportar: mocks.backupAntesDeImportar,
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFirebaseImediato: mocks.salvarFirebaseImediato,
    remotoConfirmado: mocks.remotoConfirmado,
}));

import BackupFichaPanel from './BackupFichaPanel';
import useStore from '../../stores/useStore';

const lista = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const fichaAtual = { vida: 10, bio: 'atual', poderes: lista(6), inventario: [], mana: 5 };
const fichaNova = { vida: 99, bio: 'nova', poderes: lista(6), inventario: [], mana: 7 };
const fichaPequena = { vida: 1, bio: 'p', poderes: [], inventario: [], mana: 1 };

let carregar;
const avisos = () => useStore.getState().avisosAcao.map(a => a.texto);
const arquivo = (conteudo) => new File([typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo)], 'f.json', { type: 'application/json' });

async function escolher(conteudo) {
    const f = arquivo(conteudo);
    // jsdom's File pode nao ter .text()
    if (typeof f.text !== 'function') f.text = () => Promise.resolve(typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
    const input = screen.getByLabelText('Arquivo da ficha para importar');
    fireEvent.change(input, { target: { files: [f] } });
}

beforeEach(() => {
    ordem.length = 0;
    carregar = vi.fn(() => { ordem.push('carregar'); });
    useStore.setState({ meuNome: 'Ana', minhaFicha: fichaAtual, carregarDadosFicha: carregar, avisosAcao: [] });
    mocks.listarBackups.mockReset().mockResolvedValue({ ok: true, itens: [{ chave: '2026-03-04', em: 1 }, { chave: '2026-03-03', em: 0 }] });
    mocks.lerBackup.mockReset().mockResolvedValue(fichaNova);
    mocks.backupAntesDeImportar.mockReset().mockImplementation(async () => { ordem.push('backup'); return { ok: true, chave: 'k' }; });
    mocks.salvarFirebaseImediato.mockReset().mockImplementation(async () => { ordem.push('salvar'); });
    mocks.remotoConfirmado.mockReset().mockReturnValue(true);
    window.confirm = vi.fn(() => true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('BackupFichaPanel - lista', () => {
    it('lista backups com botao Restaurar', async () => {
        render(<BackupFichaPanel />);
        expect(await screen.findAllByText('Restaurar')).toHaveLength(2);
        expect(screen.getByText('04/03/2026')).toBeTruthy();
        expect(mocks.listarBackups).toHaveBeenCalledWith('Ana');
    });
    it('mostra mensagem quando nao ha copias', async () => {
        mocks.listarBackups.mockResolvedValue({ ok: true, itens: [] });
        render(<BackupFichaPanel />);
        expect(await screen.findByText(/Ainda não há cópias/)).toBeTruthy();
    });
    it('mostra erro quando a listagem falha', async () => {
        mocks.listarBackups.mockResolvedValue({ ok: false, erro: 'x', itens: [] });
        render(<BackupFichaPanel />);
        expect(await screen.findByText(/Não consegui ler os backups/)).toBeTruthy();
    });
    it('sem nome nao consulta a nuvem', async () => {
        useStore.setState({ meuNome: '' });
        render(<BackupFichaPanel />);
        expect(await screen.findByText(/Ainda não há cópias/)).toBeTruthy();
        expect(mocks.listarBackups).not.toHaveBeenCalled();
    });
});

describe('BackupFichaPanel - exportar', () => {
    let click, criar;
    beforeEach(() => {
        click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { click.baixou = this.download; });
        criar = URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
    });
    it('baixa um arquivo com nome da ficha', async () => {
        render(<BackupFichaPanel />);
        await screen.findAllByText('Restaurar');
        fireEvent.click(screen.getByText(/Exportar ficha/));
        expect(criar).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
        expect(click.baixou).toMatch(/^ficha-Ana-\d{4}-\d{2}-\d{2}\.json$/);
        expect(avisos().some(t => /Ficha exportada/.test(t))).toBe(true);
        expect(avisos().some(t => /pode estar desatualizado/.test(t))).toBe(false);
    });
    it('avisa se remotoConfirmado() e false, mas ainda baixa', async () => {
        mocks.remotoConfirmado.mockReturnValue(false);
        render(<BackupFichaPanel />);
        await screen.findAllByText('Restaurar');
        fireEvent.click(screen.getByText(/Exportar ficha/));
        expect(avisos().some(t => /pode estar desatualizado/.test(t))).toBe(true);
        expect(click).toHaveBeenCalledTimes(1);
    });
});

describe('BackupFichaPanel - importar', () => {
    it('arquivo invalido: aviso e nada muda', async () => {
        render(<BackupFichaPanel />);
        await escolher('isto nao e json');
        await waitFor(() => expect(avisos().some(t => /JSON válido/.test(t))).toBe(true));
        expect(window.confirm).not.toHaveBeenCalled();
        expect(carregar).not.toHaveBeenCalled();
        expect(mocks.backupAntesDeImportar).not.toHaveBeenCalled();
    });
    it('arquivo valido mas confirm false: nada muda', async () => {
        window.confirm = vi.fn(() => false);
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(carregar).not.toHaveBeenCalled();
        expect(mocks.backupAntesDeImportar).not.toHaveBeenCalled();
        expect(mocks.salvarFirebaseImediato).not.toHaveBeenCalled();
    });
    it('confirm true: backup ANTES de carregar e salvar depois', async () => {
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(ordem).toEqual(['backup', 'carregar', 'salvar']));
        expect(mocks.backupAntesDeImportar).toHaveBeenCalledWith('Ana', fichaAtual);
        expect(carregar).toHaveBeenCalledWith(fichaNova);
        await waitFor(() => expect(avisos().some(t => /Ficha substituída/.test(t))).toBe(true));
    });
    it('arquivo embrulhado do app tambem funciona', async () => {
        render(<BackupFichaPanel />);
        await escolher({ tipo: 'rpg-anime-system/ficha', versao: 1, nome: 'Outro', exportadoEm: '2026-01-01T00:00:00.000Z', ficha: fichaNova });
        await waitFor(() => expect(carregar).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).toContain('Outro');
    });
    it('se backupAntesDeImportar falhar NAO substitui nada', async () => {
        mocks.backupAntesDeImportar.mockResolvedValue({ ok: false, erro: 'x' });
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(avisos().some(t => /NÃO substituí/.test(t))).toBe(true));
        expect(carregar).not.toHaveBeenCalled();
        expect(mocks.salvarFirebaseImediato).not.toHaveBeenCalled();
    });
    it('sem remotoConfirmado() bloqueia com aviso', async () => {
        mocks.remotoConfirmado.mockReturnValue(false);
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(avisos().some(t => /Espere a ficha sincronizar/.test(t))).toBe(true));
        expect(window.confirm).not.toHaveBeenCalled();
        expect(carregar).not.toHaveBeenCalled();
        expect(mocks.backupAntesDeImportar).not.toHaveBeenCalled();
    });
    it('falha no envio ao servidor avisa', async () => {
        mocks.salvarFirebaseImediato.mockRejectedValue(new Error('x'));
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(avisos().some(t => /envio ao servidor falhou/.test(t))).toBe(true));
        expect(carregar).toHaveBeenCalled();
    });
    it('ficha bem menor faz o confirm trazer o aviso', async () => {
        render(<BackupFichaPanel />);
        await escolher(fichaPequena);
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).toContain('⚠️');
    });
    it('ficha parecida nao traz o aviso', async () => {
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).not.toContain('⚠️');
    });
});

describe('BackupFichaPanel - restaurar', () => {
    it('le o backup e substitui na ordem certa', async () => {
        render(<BackupFichaPanel />);
        const botoes = await screen.findAllByText('Restaurar');
        fireEvent.click(botoes[0]);
        await waitFor(() => expect(ordem).toEqual(['backup', 'carregar', 'salvar']));
        expect(mocks.lerBackup).toHaveBeenCalledWith('Ana', '2026-03-04');
        expect(carregar).toHaveBeenCalledWith(fichaNova);
    });
    it('backup ilegivel: aviso e nada muda', async () => {
        mocks.lerBackup.mockResolvedValue(null);
        render(<BackupFichaPanel />);
        fireEvent.click((await screen.findAllByText('Restaurar'))[0]);
        await waitFor(() => expect(avisos().some(t => /Não consegui ler esse backup/.test(t))).toBe(true));
        expect(carregar).not.toHaveBeenCalled();
    });
    it('sem remotoConfirmado() bloqueia restaurar', async () => {
        mocks.remotoConfirmado.mockReturnValue(false);
        render(<BackupFichaPanel />);
        fireEvent.click((await screen.findAllByText('Restaurar'))[0]);
        await waitFor(() => expect(avisos().some(t => /Espere a ficha sincronizar/.test(t))).toBe(true));
        expect(carregar).not.toHaveBeenCalled();
    });
    it('restaurar ficha bem menor traz o aviso no confirm', async () => {
        mocks.lerBackup.mockResolvedValue(fichaPequena);
        render(<BackupFichaPanel />);
        fireEvent.click((await screen.findAllByText('Restaurar'))[0]);
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).toContain('⚠️');
    });
});

describe('BackupFichaPanel - proteções extras', () => {
    it('o dono da ficha continua sendo o da ficha atual (arquivo de outra conta não troca o dono)', async () => {
        useStore.setState({ minhaFicha: { ...fichaAtual, donoDaFicha: 'conta-A' } });
        render(<BackupFichaPanel />);
        await escolher({ ...fichaNova, donoDaFicha: 'conta-B' });
        await waitFor(() => expect(carregar).toHaveBeenCalled());
        expect(carregar.mock.calls[0][0].donoDaFicha).toBe('conta-A');
    });
    it('trocar de personagem durante a operação ABORTA e não carrega nada', async () => {
        mocks.backupAntesDeImportar.mockImplementation(async () => { useStore.setState({ meuNome: 'Outro' }); return { ok: true, chave: 'k' }; });
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(avisos().some(a => /trocou de personagem/.test(a))).toBe(true));
        expect(carregar).not.toHaveBeenCalled();
        expect(mocks.salvarFirebaseImediato).not.toHaveBeenCalled();
    });
    it('restaurar um backup mantém a imagem grande que a ficha atual tem onde o backup ficou vazio', async () => {
        const grande = 'data:image/png;base64,' + 'A'.repeat(300100);
        useStore.setState({ minhaFicha: { ...fichaAtual, avatar: { base: grande } } });
        mocks.lerBackup.mockResolvedValue({ ...fichaNova, avatar: { base: '' } });
        render(<BackupFichaPanel />);
        fireEvent.click((await screen.findAllByText('Restaurar'))[0]);
        await waitFor(() => expect(carregar).toHaveBeenCalled());
        expect(carregar.mock.calls[0][0].avatar.base).toBe(grande);
    });
    it('o confirm avisa quando há imagem grande que não entra na cópia da nuvem', async () => {
        const grande = 'data:image/png;base64,' + 'A'.repeat(300100);
        useStore.setState({ minhaFicha: { ...fichaAtual, avatar: { base: grande } } });
        render(<BackupFichaPanel />);
        await escolher(fichaNova);
        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).toMatch(/imagem[(]ns[)] embutida/);
    });
    it('arquivo com chave inválida (. # $ [ ] / ou __proto__) é recusado', async () => {
        render(<BackupFichaPanel />);
        await escolher('{"vida":1,"bio":{},"poderes":[],"mana":1,"inventario":[],"x.y":1}');
        await waitFor(() => expect(avisos().some(a => /nomes que o servidor não aceita/.test(a))).toBe(true));
        expect(carregar).not.toHaveBeenCalled();
    });
});
