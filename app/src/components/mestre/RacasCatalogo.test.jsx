import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import RacasCatalogo from './RacasCatalogo';
import useStore from '../../stores/useStore';
import { salvarCamposPersonagem } from '../../services/firebase-sync';

vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)), salvarFichaSilencioso: vi.fn(),
}));

const acoes = { salvarRacas: vi.fn(), definirRacaDoPersonagem: vi.fn() };
const SAIYAJIN = { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Sayajin'], herdaDe: '' };
const HIBRIDO = { id: 'hibrido', nome: 'Híbrido', icone: '🧬', apelidos: [], herdaDe: 'saiyajin' };

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [] }, cenario: { racas: [SAIYAJIN, HIBRIDO] },
        personagens: {
            Kai: { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [{ id: 1, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] }] },
            Lia: { bio: { raca: 'Elfo da Lua' }, poderes: [] },
        },
        dummies: {}, resumoTurnoMapa: { ordem: [], foraDaOrdem: [], turnoAtualIndex: 0 },
        acoesOrdemTurnoMapa: acoes, ...extra,
    });
}
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Raças/ }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, acoesOrdemTurnoMapa: null, personagens: {} }); });

describe('RacasCatalogo', () => {
    it('não aparece para quem não é Mestre', () => {
        preparar({ isMestre: false });
        const { container } = render(<RacasCatalogo />);
        expect(container.innerHTML).toBe('');
    });

    it('é recolhível (aria-expanded) e lista as raças com apelidos', () => {
        preparar();
        render(<RacasCatalogo />);
        const botao = screen.getByRole('button', { name: /Raças/ });
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByLabelText('Nome da raça saiyajin')).toBeNull();
        abrir();
        expect(botao.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByLabelText('Nome da raça saiyajin').value).toBe('Saiyajin');
        expect(screen.getByLabelText('Apelidos da raça Saiyajin').value).toBe('Sayajin');
    });

    it('adicionar raça grava a lista com a nova raça', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /Adicionar raça/ }));
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        const lista = acoes.salvarRacas.mock.calls[0][0];
        expect(lista).toHaveLength(3);
        expect(lista[2].nome).toBe('Nova raça');
    });

    it('apelidos separados por vírgula só gravam ao sair do campo', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        const campo = screen.getByLabelText('Apelidos da raça Saiyajin');
        fireEvent.change(campo, { target: { value: 'Sayajin, Macaco ,  ' } });
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        fireEvent.blur(campo);
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        expect(acoes.salvarRacas.mock.calls[0][0][0].apelidos).toEqual(['Sayajin', 'Macaco']);
    });

    it('nome vazio no blur volta ao nome anterior e não grava', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        const campo = screen.getByLabelText('Nome da raça saiyajin');
        fireEvent.change(campo, { target: { value: '  ' } });
        fireEvent.blur(campo);
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Nome da raça saiyajin').value).toBe('Saiyajin');
    });

    it('"herda de" grava na hora', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        fireEvent.change(screen.getByLabelText('Saiyajin herda de'), { target: { value: 'hibrido' } });
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        expect(acoes.salvarRacas.mock.calls[0][0].find(r => r.id === 'saiyajin').herdaDe).toBe('hibrido');
    });

    it('remover pede confirmação, cita as referências e limpa herdaDe e racasAcesso', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'Remover raça Saiyajin' }));
        const aviso = screen.getByRole('alertdialog');
        expect(aviso.textContent).toMatch(/1 Habilidade\(s\) de Raça/);
        expect(aviso.textContent).toMatch(/1 raça\(s\) filha\(s\)/);
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        fireEvent.click(within(aviso).getByRole('button', { name: 'Sim, remover' }));
        const lista = acoes.salvarRacas.mock.calls[0][0];
        expect(lista.map(r => r.id)).toEqual(['hibrido']);
        expect(lista[0].herdaDe).toBe('');
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Kai', { 'poderes/0/racasAcesso': [] });
    });

    it('cancelar a remoção não grava nada', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'Remover raça Híbrido' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('"Quem é de qual raça": mostra a raça de cada um, troca pela ação e avisa raça não cadastrada', () => {
        preparar();
        render(<RacasCatalogo />);
        abrir();
        expect(screen.getByLabelText('Raça de Kai').value).toBe('saiyajin');
        expect(screen.getByText(/Raça não cadastrada: "Elfo da Lua"/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Raça de Lia'), { target: { value: 'hibrido' } });
        expect(acoes.definirRacaDoPersonagem).toHaveBeenCalledWith({ id: 'Lia', nome: 'Lia', isDummie: false }, 'hibrido');
    });
});
