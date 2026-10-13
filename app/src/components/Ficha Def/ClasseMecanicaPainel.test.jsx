import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const enviarParaFeed = vi.fn();
vi.mock('../../services/firebase-sync', () => ({ enviarParaFeed: (...a) => enviarParaFeed(...a) }));

import ClasseMecanicaPainel from './ClasseMecanicaPainel';

const opcoes = [
    { id: '', nome: 'Nenhuma', icone: '' },
    { id: 'saber', nome: 'Saber', icone: '⚔️' }, { id: 'rider', nome: 'Rider', icone: '🏇' },
    { id: 'foreigner', nome: 'Foreigner', icone: '🐙' }, { id: 'mooncancer', nome: 'Moon Cancer', icone: '🌕' },
    { id: 'alterego', nome: 'Alter Ego', icone: '🎭' }, { id: 'pretender', nome: 'Pretender', icone: '🤥' },
    { id: 'archer', nome: 'Archer', icone: '🏹' }
];
const montar = (ficha, salvar = vi.fn()) => { render(<ClasseMecanicaPainel ficha={ficha} salvar={salvar} meuNome="Ana" opcoesClasses={opcoes} />); return salvar; };

beforeEach(() => { enviarParaFeed.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ClasseMecanicaPainel', () => {
    it('não aparece sem classe com mecânica', () => {
        const { container } = render(<ClasseMecanicaPainel ficha={{ bio: {} }} salvar={vi.fn()} meuNome="Ana" opcoesClasses={opcoes} />);
        expect(container.firstChild).toBeNull();
    });

    it('mostra o resumo da classe', () => {
        montar({ bio: { classe: 'saber' } });
        expect(screen.getByText(/Mecânica da Classe/)).toBeTruthy();
        expect(screen.getByText(/DOBRO/)).toBeTruthy();
    });

    it('Rider: marca a Montaria; Dragão fica marcado e travado', () => {
        const salvar = montar({ bio: { classe: 'rider' }, combate: {} });
        fireEvent.click(screen.getByRole('checkbox'));
        expect(salvar).toHaveBeenCalledWith('combate.montariaPresente', true);
        cleanup();
        montar({ bio: { classe: 'rider', raca: 'Dragão' } });
        const cb = screen.getByRole('checkbox');
        expect(cb.checked).toBe(true);
        expect(cb.disabled).toBe(true);
    });

    it('Foreigner e Moon Cancer: Vazio, arauto e marcação manual', () => {
        let salvar = montar({ bio: { classe: 'foreigner' } });
        fireEvent.click(screen.getByRole('checkbox'));
        expect(salvar).toHaveBeenCalledWith('combate.contatoVazio', true);
        cleanup();
        salvar = montar({ bio: { classe: 'mooncancer', arauto: 'Fogo' } });
        fireEvent.change(screen.getByPlaceholderText(/Fogo, Lua/), { target: { value: 'Lua' } });
        expect(salvar).toHaveBeenCalledWith('bio.arauto', 'Lua');
        fireEvent.click(screen.getByRole('checkbox'));
        expect(salvar).toHaveBeenCalledWith('combate.arautoAtivo', true);
    });

    it('Alter Ego: troca livre fora de combate; em combate pede confirmação e avisa o feed', () => {
        const ficha = { bio: { classe: 'alterego', alterEgoSlot1: 'saber', subClasse: '' } };
        let salvar = montar(ficha);
        fireEvent.change(screen.getByLabelText(/Classe equipada/), { target: { value: 'saber' } });
        expect(salvar).toHaveBeenCalledWith('bio.subClasse', 'saber');
        expect(enviarParaFeed).not.toHaveBeenCalled();
        cleanup();

        const conf = vi.spyOn(window, 'confirm').mockReturnValue(true);
        salvar = montar({ ...ficha, iniciativa: 12 });
        fireEvent.change(screen.getByLabelText(/Classe equipada/), { target: { value: 'saber' } });
        expect(conf).toHaveBeenCalled();
        expect(salvar).toHaveBeenCalledWith('bio.subClasse', 'saber');
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sistema', texto: expect.stringContaining('Ação Bônus') }));
        cleanup();

        enviarParaFeed.mockClear();
        conf.mockReturnValue(false);
        salvar = montar({ ...ficha, iniciativa: 12 });
        fireEvent.change(screen.getByLabelText(/Classe equipada/), { target: { value: 'saber' } });
        expect(salvar).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('Alter Ego vestindo Rider mostra os controles do Rider', () => {
        montar({ bio: { classe: 'alterego', subClasse: 'rider' } });
        expect(screen.getByRole('checkbox')).toBeTruthy();
    });

    it('Pretender: memoriza classes, veste só as memorizadas e o Descanso Longo limpa tudo', () => {
        const salvar = montar({ bio: { classe: 'pretender', classesMemorizadas: ['archer'] } });
        fireEvent.change(screen.getByLabelText(/Memorizar/), { target: { value: 'saber' } });
        expect(salvar).toHaveBeenCalledWith('bio.classesMemorizadas', ['archer', 'saber']);
        const opcoesVestir = Array.from(screen.getByLabelText(/Classe vestida/).querySelectorAll('option')).map(o => o.value);
        expect(opcoesVestir).toEqual(['', 'archer']);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(screen.getByText(/Descanso Longo/));
        expect(salvar).toHaveBeenCalledWith('bio.classesMemorizadas', []);
        expect(salvar).toHaveBeenCalledWith('bio.subClasse', '');
    });
});
