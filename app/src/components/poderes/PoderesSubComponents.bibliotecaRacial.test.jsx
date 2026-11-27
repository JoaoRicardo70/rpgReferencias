import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';
import { publicarNaBiblioteca, concederHabilidade } from '../../services/bibliotecaRacial';
import { criarEntradaDePoder } from '../../core/bibliotecaRacial';

// Grimório, aba 🧬 Habilidades de Raça: "📚 Publicar na biblioteca" (só Mestre) e "📚 Disponíveis para a sua Raça" (jogador só lê; Mestre concede).
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));
vi.mock('../../services/bibliotecaRacial', async (importar) => {
    const real = await importar();
    return { ...real, publicarNaBiblioteca: vi.fn(() => ({ ok: true, entrada: { nome: 'Zenkai' }, atualizada: false })), concederHabilidade: vi.fn(() => ({ ok: true })) };
});

const RACAS = [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' }, { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' }];
const zenkai = (extra = {}) => ({ id: 7, nome: 'Zenkai', categoria: 'habilidadeRaca', ativa: false, racasAcesso: ['saiyajin'], efeitos: [], efeitosPassivos: [], descricao: 'Cresce.', ...extra });
const entradaSaiyajin = criarEntradaDePoder({ nome: 'Zenkai', categoria: 'habilidadeRaca', efeitos: [{ nome: 'SEGREDO_DO_MODELO', atributo: 'forca', propriedade: 'bonus', valor: 9 }], racasAcesso: ['saiyajin'], percentualMinimo: 50 },
    { resumo: 'Cresce ao se recuperar', requisito: 'Quase morrer', agora: 1 }).entrada;
const entradaHumano = criarEntradaDePoder({ nome: 'Tenacidade', categoria: 'habilidadeRaca', racasAcesso: ['humano'] }, { resumo: 'Só humanos', agora: 2 }).entrada;
let mockState;
function montar({ isMestre, composicao, poderes = [], biblioteca = [entradaSaiyajin, entradaHumano] }) {
    mockState = {
        minhaFicha: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', ...(composicao ? { composicaoRacial: composicao } : {}) }, poderes },
        meuNome: 'Heroi', isMestre, cenario: { racas: RACAS, bibliotecaRacial: biblioteca }, pedirSecaoMestre: vi.fn(), adicionarAviso: vi.fn(),
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.getState = () => mockState;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
    fireEvent.click(screen.getByRole('tab', { name: /Habilidades de Raça/ }));
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Grimório — Disponíveis para a sua Raça (jogador)', () => {
    it('lista só as entradas da Raça dele, com Domínio e requisito, somente leitura e sem expor o modelo', () => {
        montar({ isMestre: false, composicao: [{ racaId: 'saiyajin', percentual: 30 }, { racaId: 'humano', percentual: 70 }], poderes: [] });
        const secao = screen.getByRole('region', { name: /disponíveis para a sua Raça/ });
        expect(within(secao).getByText('Zenkai')).toBeTruthy();
        expect(within(secao).getByText('Cresce ao se recuperar')).toBeTruthy();
        expect(within(secao).getByText('Domínio 30% de 50%')).toBeTruthy();
        expect(within(secao).getByText(/Para desbloquear: Quase morrer/)).toBeTruthy();
        expect(within(secao).getByText('Tenacidade')).toBeTruthy(); // composição inclui Humano
        expect(within(secao).getAllByText(/Peça ao Mestre para receber/).length).toBe(2);
        expect(within(secao).queryByRole('button')).toBeNull();
        expect(document.body.textContent).not.toContain('SEGREDO_DO_MODELO');
    });
    it('não mostra entradas de outras Raças nem as que ele já possui', () => {
        montar({ isMestre: false, poderes: [zenkai()] });
        expect(screen.queryByRole('region', { name: /disponíveis para a sua Raça/ })).toBeNull();
        expect(screen.queryByText('Tenacidade')).toBeNull();
    });
    it('jogador não vê o botão de publicar', () => {
        montar({ isMestre: false, poderes: [zenkai()] });
        expect(screen.queryByRole('button', { name: /Publicar .* na biblioteca/ })).toBeNull();
    });
    it('Domínio suficiente quando atinge o mínimo', () => {
        montar({ isMestre: false });
        expect(within(screen.getByRole('region', { name: /disponíveis para a sua Raça/ })).getByText('Domínio suficiente')).toBeTruthy();
    });
});

describe('Grimório — Mestre', () => {
    it('vê a mesma lista com "✨ Conceder" do personagem e as sem acesso como exceção', () => {
        montar({ isMestre: true });
        const secao = screen.getByRole('region', { name: /disponíveis para Heroi/ });
        fireEvent.click(within(secao).getByRole('button', { name: 'Conceder Zenkai a Heroi' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }));
        expect(concederHabilidade).toHaveBeenCalledWith({ id: 'Heroi', nome: 'Heroi' }, 'bib_zenkai', { bloqueada: false, requisito: 'Quase morrer' });
        expect(within(secao).getByText(/Sem acesso pela Raça/)).toBeTruthy();
        expect(within(secao).getByRole('button', { name: 'Conceder Tenacidade a Heroi como exceção' })).toBeTruthy();
    });

    it('cartão: "📚 Publicar na biblioteca" abre diálogo com nome/resumo/ícone e publica', () => {
        montar({ isMestre: true, poderes: [zenkai({ percentualMinimo: 40 })], biblioteca: [] });
        fireEvent.click(screen.getByRole('button', { name: 'Publicar Zenkai na biblioteca' }));
        const d = screen.getByRole('dialog');
        expect(within(d).getByLabelText('Nome').value).toBe('Zenkai');
        expect(within(d).getByLabelText('Resumo').value).toBe('Cresce.');
        expect(within(d).getByText(/Raças com acesso: Saiyajin\. Percentual mínimo: 40%/)).toBeTruthy();
        fireEvent.change(within(d).getByLabelText('Resumo'), { target: { value: 'Novo resumo' } });
        fireEvent.change(within(d).getByLabelText('Ícone'), { target: { value: '⚡' } });
        fireEvent.click(within(d).getByRole('button', { name: 'Publicar' }));
        expect(publicarNaBiblioteca).toHaveBeenCalledTimes(1);
        const [poder, meta] = publicarNaBiblioteca.mock.calls[0];
        expect(poder.id).toBe(7);
        expect(meta).toMatchObject({ nome: 'Zenkai', resumo: 'Novo resumo', icone: '⚡' });
        expect(meta.atualizarId).toBeUndefined();
        expect(screen.getByText(/publicada na biblioteca/)).toBeTruthy();
    });

    it('cartão: já existe entrada equivalente, oferece "Atualizar a entrada existente"', () => {
        montar({ isMestre: true, poderes: [zenkai({ origemBiblioteca: 'bib_zenkai' })] });
        fireEvent.click(screen.getByRole('button', { name: 'Publicar Zenkai na biblioteca' }));
        const d = screen.getByRole('dialog');
        expect(within(d).queryByRole('button', { name: 'Publicar' })).toBeNull();
        fireEvent.click(within(d).getByRole('button', { name: 'Atualizar a entrada existente' }));
        expect(publicarNaBiblioteca.mock.calls[0][1]).toMatchObject({ atualizarId: 'bib_zenkai' });
    });

    it('falha ao publicar mostra a mensagem do serviço', () => {
        publicarNaBiblioteca.mockReturnValueOnce({ ok: false, mensagem: 'A biblioteca está cheia.' });
        montar({ isMestre: true, poderes: [zenkai()], biblioteca: [] });
        fireEvent.click(screen.getByRole('button', { name: 'Publicar Zenkai na biblioteca' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publicar' }));
        expect(screen.getByText('A biblioteca está cheia.')).toBeTruthy();
    });
});
