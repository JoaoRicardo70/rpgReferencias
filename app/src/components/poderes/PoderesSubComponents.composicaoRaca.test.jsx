import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';
import * as comp from '../../services/composicaoRacial';

// Cartões do Grimório ligados à Raça: selos de bloqueio, Domínio, controles do Mestre (percentual mínimo, bloqueio/despertar) e Manipulação de DNA.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));
vi.mock('../../services/composicaoRacial', () => ({
    definirBloqueioDoPoder: vi.fn(() => ({ ok: true })), despertarHabilidade: vi.fn(() => ({ ok: true })),
    definirPercentualMinimoDoPoder: vi.fn(() => ({ ok: true })), definirManipulaDNA: vi.fn(() => ({ ok: true })),
    definirComposicaoRacial: vi.fn(() => ({ ok: true })), concederPraticaRacial: vi.fn(() => ({ ok: true })),
    adicionarRacaAdquirida: vi.fn(() => ({ ok: true })), removerRacaDaComposicao: vi.fn(() => ({ ok: true })),
}));

const CENARIO = { racas: [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
] };
const ENTIDADE = { id: 'Heroi', nome: 'Heroi', isDummie: false };
let mockState;
function montar({ isMestre, poderes, bio, aba = /Habilidades de Raça/ }) {
    mockState = {
        minhaFicha: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', ...(bio || {}) }, poderes },
        meuNome: 'Heroi', isMestre, cenario: CENARIO, pedirSecaoMestre: vi.fn(), adicionarAviso: vi.fn(),
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.getState = () => mockState;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
    fireEvent.click(screen.getByRole('tab', { name: aba }));
}
const hab = (extra = {}) => ({ id: 7, nome: 'Zenkai', categoria: 'habilidadeRaca', ativa: false, racasAcesso: ['saiyajin'], efeitos: [], efeitosPassivos: [], ...extra });
const composicao = (p) => ({ composicaoRacial: [{ racaId: 'saiyajin', percentual: p, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'nativa' }] });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Grimório — Domínio e bloqueio de Habilidades de Raça', () => {
    it('cabeçalho resume o Domínio da composição e dá a dica de prática', () => {
        montar({ isMestre: false, bio: composicao(70), poderes: [hab()] });
        expect(screen.getByText(/Seu Domínio:/).textContent).toMatch(/Saiyajin 70%.*Humano 30%/);
        expect(screen.getByText(/Pratique para elevar o percentual e desbloquear mais Habilidades/)).toBeTruthy();
    });

    it('Domínio insuficiente: selo com X% de Y%, botão de ligar desabilitado com tooltip e "Domínio: Raça X% (mínimo Y%)"', () => {
        montar({ isMestre: false, bio: composicao(20), poderes: [hab({ percentualMinimo: 50 })] });
        expect(screen.getByText('🔒 Domínio insuficiente (20% de 50%)')).toBeTruthy();
        expect(screen.getByText('Domínio: Saiyajin 20% (mínimo 50%)')).toBeTruthy();
        const ligar = screen.getByRole('button', { name: /Desativada/ });
        expect(ligar.disabled).toBe(true);
        expect(ligar.getAttribute('title')).toMatch(/Domínio insuficiente/);
        expect(screen.getByText(/sobe com a prática/)).toBeTruthy();
    });

    it('atingindo o mínimo não há selo nem bloqueio', () => {
        montar({ isMestre: false, bio: composicao(80), poderes: [hab({ percentualMinimo: 50 })] });
        expect(screen.queryByText(/Domínio insuficiente/)).toBeNull();
        expect(screen.getByRole('button', { name: /Desativada/ }).disabled).toBe(false);
        expect(screen.getByText('Domínio: Saiyajin 80% (mínimo 50%)')).toBeTruthy();
    });

    it('bloqueio manual: selo 🔒 Bloqueada e o requisito "Para desbloquear" visível ao jogador, que não vê controles', () => {
        montar({ isMestre: false, poderes: [hab({ bloqueio: { ativo: true, requisito: 'Vencer o Mestre Kame', motivo: 'Ainda dormente' } })] });
        expect(screen.getByText('🔒 Bloqueada')).toBeTruthy();
        expect(screen.getByText('Para desbloquear: Vencer o Mestre Kame')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Desativada/ }).disabled).toBe(true);
        expect(screen.queryByText(/Percentual mínimo da Raça/)).toBeNull();
        expect(screen.queryByRole('button', { name: /Despertar/ })).toBeNull();
    });

    it('habilidade já ligada e depois bloqueada ainda pode ser desligada', () => {
        montar({ isMestre: false, poderes: [hab({ ativa: true, bloqueio: { ativo: true } })] });
        expect(screen.getByRole('button', { name: /ATIVADA/ }).disabled).toBe(false);
    });

    it('Mestre grava o percentual mínimo ao sair do campo', () => {
        montar({ isMestre: true, poderes: [hab()] });
        const campo = screen.getByLabelText('Percentual mínimo da Raça (%) de Zenkai');
        fireEvent.change(campo, { target: { value: '40' } });
        expect(comp.definirPercentualMinimoDoPoder).not.toHaveBeenCalled();
        fireEvent.blur(campo);
        expect(comp.definirPercentualMinimoDoPoder).toHaveBeenCalledWith(ENTIDADE, 7, 40);
    });

    it('Mestre liga o bloqueio com requisito e motivo', () => {
        montar({ isMestre: true, poderes: [hab()] });
        fireEvent.change(screen.getByLabelText('Requisito para desbloquear Zenkai'), { target: { value: 'Quase morrer' } });
        fireEvent.click(screen.getByLabelText('Bloquear Zenkai'));
        expect(comp.definirBloqueioDoPoder).toHaveBeenCalledWith(ENTIDADE, 7, { ativo: true, requisito: 'Quase morrer', motivo: '' });
    });

    it('Mestre despertar: pede confirmação (role=dialog), Esc cancela e confirmar chama despertarHabilidade', () => {
        montar({ isMestre: true, poderes: [hab({ bloqueio: { ativo: true, requisito: 'x', motivo: '' } })] });
        fireEvent.click(screen.getByRole('button', { name: /Despertar \(desbloquear\)/ }));
        expect(screen.getByRole('dialog', { name: /Despertar Habilidade/ })).toBeTruthy();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(comp.despertarHabilidade).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Despertar \(desbloquear\)/ }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '✨ Despertar' }));
        expect(comp.despertarHabilidade).toHaveBeenCalledWith(ENTIDADE, 7);
    });

    it('sem bloqueio manual não há botão de Despertar; bloqueio por percentual oferece "Conceder prática" que abre o editor', () => {
        montar({ isMestre: true, bio: composicao(10), poderes: [hab({ percentualMinimo: 50 })] });
        expect(screen.queryByRole('button', { name: /Despertar \(desbloquear\)/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Conceder prática/ }));
        expect(screen.getByRole('group', { name: /Composição racial de Heroi/ })).toBeTruthy();
    });
});

describe('Grimório — Manipulação de DNA', () => {
    it('Mestre vê o interruptor em QUALQUER categoria (aqui um poder comum) e grava', () => {
        montar({ isMestre: true, aba: /Habilidades(?! de Raça)/, poderes: [{ id: 3, nome: 'Absorção', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [] }] });
        const caixa = screen.getByLabelText('Manipulação de DNA em Absorção');
        expect(caixa.checked).toBe(false);
        fireEvent.click(caixa);
        expect(comp.definirManipulaDNA).toHaveBeenCalledWith(ENTIDADE, 3, true);
    });

    it('jogador vê só o selo discreto 🧬 DNA quando o poder tem a marca, sem interruptor', () => {
        montar({ isMestre: false, aba: /Habilidades(?! de Raça)/, poderes: [{ id: 3, nome: 'Absorção', categoria: 'habilidade', ativa: false, manipulaDNA: true, efeitos: [], efeitosPassivos: [] }] });
        expect(screen.getByText('🧬 DNA')).toBeTruthy();
        expect(screen.queryByLabelText(/Manipulação de DNA em/)).toBeNull();
    });

    it('jogador não vê selo quando o poder não tem a marca', () => {
        montar({ isMestre: false, aba: /Habilidades(?! de Raça)/, poderes: [{ id: 3, nome: 'Absorção', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [] }] });
        expect(screen.queryByText('🧬 DNA')).toBeNull();
    });
});
