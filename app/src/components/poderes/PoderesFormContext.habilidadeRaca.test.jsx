import React from 'react';
import { render, cleanup, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { ConfirmarExcecaoRacaHost } from '../shared/ConfirmarExcecaoRaca';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

const CENARIO = { racas: [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' }] };
let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
function montar({ isMestre, poderes = [], raca = 'Saiyajin' }) {
    mockState = {
        minhaFicha: { poderes, bio: { raca } }, meuNome: 'Heroi', isMestre, cenario: CENARIO, adicionarAviso: vi.fn(),
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.getState = () => mockState;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<><PoderesFormProvider><Harness /></PoderesFormProvider><ConfirmarExcecaoRacaHost /></>);
}
const preencher = () => act(() => { probe.setAbaAtual('habilidadeRaca'); probe.setNomePoder('Zenkai'); probe.setDescricaoPoder('Evolui ao lutar'); });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PoderesFormContext — Habilidade de Raça', () => {
    it('jogador não cria Habilidade de Raça nova: mensagem e nada gravado', () => {
        // A aba só existe para o jogador se ele já tem alguma Habilidade de Raça (concedida pelo Mestre).
        montar({ isMestre: false, poderes: [{ id: 9, nome: 'Outra', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] }] });
        preencher();
        act(() => { probe.salvarNovoPoder(); });
        expect(mockState.adicionarAviso).toHaveBeenCalledWith(expect.stringMatching(/concedidas pelo Mestre/), 'alerta');
        expect(window.alert).not.toHaveBeenCalled();
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
    });
    it('Mestre cria com a Raça da ficha como acesso padrão, sem exceção', () => {
        montar({ isMestre: true });
        preencher();
        act(() => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] });
        expect(mockState.minhaFicha.poderes[0].racaExcecao).toBeUndefined();
    });
    it('Mestre em ficha de Raça sem acesso confirma a exceção no diálogo; recusar não grava', async () => {
        montar({ isMestre: true, raca: 'Humano' });
        preencher();
        act(() => { probe.salvarNovoPoder(); });
        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        act(() => { probe.salvarNovoPoder(); });
        fireEvent.click(await screen.findByRole('button', { name: 'Conceder como exceção' }));
        await waitFor(() => expect(mockState.minhaFicha.poderes).toHaveLength(1));
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ categoria: 'habilidadeRaca', racasAcesso: [], racaExcecao: true });
    });
    it('segundo clique em Gravar com o diálogo aberto não abre outro nem duplica o poder', async () => {
        montar({ isMestre: true, raca: 'Humano' });
        preencher();
        act(() => { probe.salvarNovoPoder(); probe.salvarNovoPoder(); });
        expect(await screen.findAllByRole('dialog')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Conceder como exceção' }));
        await waitFor(() => expect(mockState.minhaFicha.poderes).toHaveLength(1));
        expect(mockState.updateFicha).toHaveBeenCalledTimes(1);
    });
    it('renomear, mover e apagar pasta na aba habilidadeRaca altera os poderes dela (e só deles)', () => {
        const a = { id: 1, nome: 'A', categoria: 'habilidadeRaca', pasta: 'Velha' };
        const b = { id: 2, nome: 'B', categoria: 'habilidade', pasta: 'Velha' };
        montar({ isMestre: true, poderes: [a, b] });
        act(() => { probe.renomearPastaForma('Velha', 'Nova', 'habilidadeRaca'); });
        expect(a.pasta).toBe('Nova');
        expect(b.pasta).toBe('Velha');
        act(() => { probe.renomearPastaForma('Nova', 'Outra/Sub', 'habilidadeRaca'); });
        expect(a.pasta).toBe('Outra/Sub');
        act(() => { probe.renomearPastaForma('Outra/Sub', '', 'habilidadeRaca'); });
        expect(a.pasta).toBe('Outra'); // apagar a subpasta deixa o poder na pasta-mãe
    });
    it('importar: Mestre em ficha de Raça com acesso grava racasAcesso padrão sem diálogo; jogador é bloqueado', () => {
        montar({ isMestre: true });
        let n; act(() => { n = probe.confirmarImportacao([{ marcado: true, valido: true, objeto: { nome: 'Z', categoria: 'habilidadeRaca', racasAcesso: ['x'] } }]); });
        expect(n).toBe(1);
        expect(mockState.minhaFicha.poderes[0]).toMatchObject({ racasAcesso: ['saiyajin'] });
        expect(mockState.minhaFicha.poderes[0].racaExcecao).toBeUndefined();
        cleanup();
        montar({ isMestre: false });
        act(() => { n = probe.confirmarImportacao([{ marcado: true, valido: true, objeto: { nome: 'Z', categoria: 'habilidadeRaca' } }]); });
        expect(n).toBe(0);
    });
    it('importar com exceção pendente: segunda chamada devolve a mesma Promise e grava uma vez só', async () => {
        montar({ isMestre: true, raca: 'Humano' });
        const itens = [{ marcado: true, valido: true, objeto: { nome: 'Z', categoria: 'habilidadeRaca' } }];
        let p1; let p2;
        act(() => { p1 = probe.confirmarImportacao(itens); p2 = probe.confirmarImportacao(itens); });
        expect(p2).toBe(p1);
        fireEvent.click(await screen.findByRole('button', { name: 'Conceder como exceção' }));
        expect(await p1).toBe(1);
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0].racaExcecao).toBe(true);
    });
    it('só o Mestre muda racasAcesso; jogador é avisado e a lista fica', () => {
        const poder = { id: 5, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] };
        montar({ isMestre: false, poderes: [poder] });
        let r; act(() => { r = probe.definirRacasAcessoDoPoder(5, ['outra']); });
        expect(r).toBe(false);
        expect(poder.racasAcesso).toEqual(['saiyajin']);
        expect(mockState.adicionarAviso).toHaveBeenCalled();
        cleanup();
        montar({ isMestre: true, poderes: [poder] });
        act(() => { r = probe.definirRacasAcessoDoPoder(5, ['outra', 'outra', '']); });
        expect(r).toBe(true);
        expect(poder.racasAcesso).toEqual(['outra']);
    });
});
