import React from 'react';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import BibliotecaRacialMestre from './BibliotecaRacialMestre';
import useStore from '../../stores/useStore';
import { atualizarEntradaDaBiblioteca, removerDaBiblioteca, concederHabilidade } from '../../services/bibliotecaRacial';
import { criarEntradaDePoder } from '../../core/bibliotecaRacial';

vi.mock('../../services/bibliotecaRacial', () => ({
    atualizarEntradaDaBiblioteca: vi.fn(() => ({ ok: true })), removerDaBiblioteca: vi.fn(() => ({ ok: true })),
    concederHabilidade: vi.fn(() => ({ ok: true, poder: {} })), publicarNaBiblioteca: vi.fn(), entradaExistenteParaPoder: vi.fn(),
}));
vi.mock('../../services/firebase-sync', () => ({ salvarCamposPersonagem: vi.fn(), salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarCenarioCompleto: vi.fn() }));

const RACAS = [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒' }, { id: 'humano', nome: 'Humano', icone: '🧍' }];
const entrada = criarEntradaDePoder({ nome: 'Zenkai', categoria: 'habilidadeRaca', descricao: 'Fica mais forte.', racasAcesso: ['saiyajin'], percentualMinimo: 50 },
    { resumo: 'Cresce ao se recuperar', icone: '⚡', requisito: 'Quase morrer', agora: 1 }).entrada;

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { bio: {}, poderes: [] },
        cenario: { racas: RACAS, bibliotecaRacial: [entrada] },
        personagens: {
            Kai: { bio: { racaId: 'saiyajin', raca: 'Saiyajin' }, poderes: [] },
            Lia: { bio: { racaId: 'humano', raca: 'Humano' }, poderes: [] },
            Gok: { bio: { composicaoRacial: [{ racaId: 'saiyajin', percentual: 30 }, { racaId: 'humano', percentual: 70 }] }, poderes: [{ nome: 'Zenkai' }] },
        },
        resumoTurnoMapa: { ordem: [], foraDaOrdem: [] }, secaoMestrePedida: null, ...extra,
    });
}
beforeEach(() => { vi.clearAllMocks(); preparar(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, personagens: {} }); });

describe('BibliotecaRacialMestre', () => {
    it('não aparece para quem não é Mestre (nem em Modo Jogador)', () => {
        preparar({ isMestre: false });
        const { container } = render(<BibliotecaRacialMestre />);
        expect(container.innerHTML).toBe('');
    });

    it('vazia: começa aberta com o texto de como usar', () => {
        preparar({ cenario: { racas: RACAS } });
        render(<BibliotecaRacialMestre />);
        expect(screen.getByText(/Nenhuma Habilidade de Raça na biblioteca\. Crie uma no Grimório/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }).getAttribute('aria-expanded')).toBe('true');
    });

    it('com entradas começa recolhida; abre e lista ícone, nome, resumo, Raças e mínimo', () => {
        render(<BibliotecaRacialMestre />);
        const titulo = screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ });
        expect(titulo.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(titulo);
        expect(screen.getByText('Zenkai')).toBeTruthy();
        expect(screen.getByText('Cresce ao se recuperar')).toBeTruthy();
        expect(screen.getByText(/Saiyajin/)).toBeTruthy();
        expect(screen.getByText('mínimo 50%')).toBeTruthy();
        expect(screen.getByText(/Requisito: Quase morrer/)).toBeTruthy();
    });

    it('edita ao sair do campo (nome e mínimo) e alterna Raças com acesso na hora; as cópias não são tocadas', () => {
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Editar Zenkai' }));
        const nome = screen.getByLabelText('Nome de Zenkai');
        fireEvent.change(nome, { target: { value: 'Zenkai Maior' } });
        fireEvent.blur(nome);
        expect(atualizarEntradaDaBiblioteca).toHaveBeenCalledWith('bib_zenkai', { nome: 'Zenkai Maior' });
        const minimo = screen.getByLabelText('Percentual mínimo de Zenkai');
        fireEvent.change(minimo, { target: { value: '70' } });
        fireEvent.blur(minimo);
        expect(atualizarEntradaDaBiblioteca.mock.calls.at(-1)[1]).toMatchObject({ percentualMinimo: 70 }); // (o mock não atualiza o store, então o nome pendente vai junto)
        const grupo = screen.getByRole('group', { name: /Raças com acesso a Zenkai/ });
        fireEvent.click(within(grupo).getByRole('button', { name: /Humano/ }));
        expect(atualizarEntradaDaBiblioteca).toHaveBeenLastCalledWith('bib_zenkai', { racasAcesso: ['saiyajin', 'humano'] });
        expect(screen.getAllByText(/não mudam/).length).toBeGreaterThan(0);
    });

    it('nome vazio ao sair do campo não grava', () => {
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Editar Zenkai' }));
        const nome = screen.getByLabelText('Nome de Zenkai');
        fireEvent.change(nome, { target: { value: '  ' } });
        fireEvent.blur(nome);
        expect(atualizarEntradaDaBiblioteca).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Nome de Zenkai').value).toBe('Zenkai');
    });

    it('remover pede confirmação temática e só então remove', () => {
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Remover Zenkai da biblioteca' }));
        expect(removerDaBiblioteca).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(removerDaBiblioteca).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Remover Zenkai da biblioteca' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sim, remover' }));
        expect(removerDaBiblioteca).toHaveBeenCalledWith('bib_zenkai');
        expect(screen.getByText(/saiu da biblioteca/)).toBeTruthy();
    });

    it('personagens compatíveis: só a Raça com acesso, Domínio, "Já possui" e Conceder abre diálogo com requisito pré-preenchido', async () => {
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Personagens compatíveis com Zenkai' }));
        const grupo = screen.getByRole('group', { name: 'Personagens compatíveis com Zenkai' });
        expect(within(grupo).getByText('Kai')).toBeTruthy();
        expect(within(grupo).getByText('Gok')).toBeTruthy();
        expect(within(grupo).queryByText('Lia')).toBeNull();
        expect(within(grupo).getByText('Domínio 30% de 50%')).toBeTruthy();
        expect(within(grupo).getByText('Já possui')).toBeTruthy();
        expect(within(grupo).queryByRole('button', { name: /Conceder Zenkai a Gok/ })).toBeNull();

        fireEvent.click(within(grupo).getByRole('button', { name: 'Conceder Zenkai a Kai' }));
        const dialogo = screen.getByRole('dialog');
        expect(within(dialogo).getByLabelText('Requisito para desbloquear').value).toBe('Quase morrer');
        fireEvent.click(within(dialogo).getByLabelText('Conceder já bloqueada (ainda não despertou)'));
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(concederHabilidade).toHaveBeenCalledTimes(1));
        expect(concederHabilidade).toHaveBeenCalledWith({ id: 'Kai', nome: 'Kai' }, 'bib_zenkai', { bloqueada: true, requisito: 'Quase morrer' });
        expect(await screen.findByText(/Kai recebeu "Zenkai" \(bloqueada\)/)).toBeTruthy();
    });

    it('Cancelar no diálogo não concede', () => {
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Personagens compatíveis com Zenkai' }));
        fireEvent.click(screen.getByRole('button', { name: 'Conceder Zenkai a Kai' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(concederHabilidade).not.toHaveBeenCalled();
    });

    it('serviço pede exceção: confirma e repete com excecaoConfirmada', async () => {
        concederHabilidade.mockReturnValueOnce({ ok: false, precisaExcecao: true, mensagem: 'Sem acesso.\n\nRaça sem acesso: conceder como exceção?' }).mockReturnValueOnce({ ok: true, excecao: true });
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Personagens compatíveis com Zenkai' }));
        fireEvent.click(screen.getByRole('button', { name: 'Conceder Zenkai a Kai' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(concederHabilidade).toHaveBeenCalledTimes(2));
        expect(confirmar).toHaveBeenCalled();
        expect(concederHabilidade.mock.calls[1][2]).toMatchObject({ excecaoConfirmada: true });
        confirmar.mockRestore();
    });

    it('filtro de busca por nome (aparece com mais de 4 compatíveis)', () => {
        const personagens = {};
        ['Ana', 'Beto', 'Caio', 'Duda', 'Edu'].forEach(n => { personagens[n] = { bio: { racaId: 'saiyajin' }, poderes: [] }; });
        preparar({ personagens });
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Personagens compatíveis com Zenkai' }));
        fireEvent.change(screen.getByLabelText('Buscar personagem para Zenkai'), { target: { value: 'dud' } });
        const grupo = screen.getByRole('group', { name: 'Personagens compatíveis com Zenkai' });
        expect(within(grupo).getByText('Duda')).toBeTruthy();
        expect(within(grupo).queryByText('Ana')).toBeNull();
        fireEvent.change(screen.getByLabelText('Buscar personagem para Zenkai'), { target: { value: 'zzz' } });
        expect(screen.getByText(/Nenhum personagem encontrado/)).toBeTruthy();
    });

    it('Raça órfã em racasAcesso é ignorada na exibição', () => {
        preparar({ cenario: { racas: RACAS, bibliotecaRacial: [{ ...entrada, racasAcesso: ['sumiu', 'humano'] }] } });
        render(<BibliotecaRacialMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Biblioteca de Habilidades de Raça/ }));
        expect(screen.queryByText(/sumiu/)).toBeNull();
        expect(screen.getByText(/Humano/)).toBeTruthy();
    });
});
