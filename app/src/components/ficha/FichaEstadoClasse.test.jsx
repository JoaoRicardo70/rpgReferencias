import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaFormProvider, useFichaForm } from './FichaFormContext';
import { FichaEstadoClasse } from './FichaSubComponents';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync.js';

// QA - FichaEstadoClasse (checkboxes Rider/Foreigner, arauto Moon Cancer) e mudarSubClasseDireto (Acao Bonus em combate).

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let mockState;
let probe;
function Harness() { probe = useFichaForm(); return null; }

function montar(fichaExtra = {}, filho = null) {
    const ficha = { seresSelados: [], bio: {}, ...fichaExtra };
    mockState = {
        minhaFicha: ficha, personagens: {}, meuNome: 'Heroi',
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
    };
    useStore.getState = vi.fn(() => mockState);
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<FichaFormProvider><Harness />{filho}</FichaFormProvider>);
    return ficha;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FichaEstadoClasse - renderizacao', () => {
    it('nao renderiza nada para classe sem mecanica (vazia, Shielder, desconhecida)', () => {
        for (const classe of ['', 'shielder', 'xyz']) {
            montar({ bio: { classe } }, <FichaEstadoClasse />);
            expect(document.querySelector('.classe-mecanica')).toBeNull();
            cleanup();
        }
    });

    it('nao quebra com ficha sem bio', () => {
        montar({ bio: undefined }, <FichaEstadoClasse />);
        expect(document.querySelector('.classe-mecanica')).toBeNull();
    });

    it('Saber mostra o resumo mas nenhum checkbox nem campo', () => {
        montar({ bio: { classe: 'saber' } }, <FichaEstadoClasse />);
        expect(screen.getByText(/Mecânica da Classe/)).toBeTruthy();
        expect(screen.getByText(/DOBRO/)).toBeTruthy();
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('Rider mostra o checkbox da Montaria, desmarcado e habilitado', () => {
        montar({ bio: { classe: 'rider' } }, <FichaEstadoClasse />);
        const cb = screen.getByLabelText(/Montaria no campo de batalha/);
        expect(cb.checked).toBe(false);
        expect(cb.disabled).toBe(false);
    });

    it('Rider com montariaPresente vem marcado; clicar alterna e salva com debounce', () => {
        const ficha = montar({ bio: { classe: 'rider' }, combate: { montariaPresente: true } }, <FichaEstadoClasse />);
        const cb = screen.getByLabelText(/Montaria no campo de batalha/);
        expect(cb.checked).toBe(true);
        fireEvent.click(cb);
        expect(ficha.combate.montariaPresente).toBe(false);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('Rider cria o objeto combate quando ausente', () => {
        const ficha = montar({ bio: { classe: 'rider' } }, <FichaEstadoClasse />);
        fireEvent.click(screen.getByLabelText(/Montaria no campo de batalha/));
        expect(ficha.combate.montariaPresente).toBe(true);
    });

    it('Rider Dragao: checkbox marcado e desabilitado, com texto passivo', () => {
        montar({ bio: { classe: 'rider', raca: 'Dragão' } }, <FichaEstadoClasse />);
        const cb = screen.getByLabelText(/Dragão: benefício da Montaria passivo/);
        expect(cb.checked).toBe(true);
        expect(cb.disabled).toBe(true);
    });

    it('Foreigner mostra checkbox do Vazio e alterna contatoVazio', () => {
        const ficha = montar({ bio: { classe: 'foreigner' } }, <FichaEstadoClasse />);
        const cb = screen.getByLabelText(/Em contato com o VAZIO/);
        expect(cb.checked).toBe(false);
        fireEvent.click(cb);
        expect(ficha.combate.contatoVazio).toBe(true);
        expect(screen.queryByLabelText(/Montaria/)).toBeNull();
    });

    it('Moon Cancer mostra o campo do arauto, preenchido, e grava ao digitar', () => {
        const ficha = montar({ bio: { classe: 'mooncancer', arauto: 'Lua' } }, <FichaEstadoClasse />);
        const input = screen.getByLabelText(/Arauto de/);
        expect(input.value).toBe('Lua');
        fireEvent.change(input, { target: { value: 'Tempo' } });
        expect(ficha.bio.arauto).toBe('Tempo');
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('Moon Cancer sem arauto: campo vazio e checkbox arautoAtivo alterna', () => {
        const ficha = montar({ bio: { classe: 'mooncancer' } }, <FichaEstadoClasse />);
        expect(screen.getByLabelText(/Arauto de/).value).toBe('');
        const cb = screen.getByLabelText(/Usando algo do que represento/);
        expect(cb.checked).toBe(false);
        fireEvent.click(cb);
        expect(ficha.combate.arautoAtivo).toBe(true);
    });

    it('Alter Ego vestindo Rider mostra os controles do Rider; sem subClasse nao mostra nada especial', () => {
        montar({ bio: { classe: 'alterego', subClasse: 'rider' } }, <FichaEstadoClasse />);
        expect(screen.getByLabelText(/Montaria no campo de batalha/)).toBeTruthy();
        cleanup();
        montar({ bio: { classe: 'alterego', subClasse: '' } }, <FichaEstadoClasse />);
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.getByText(/Trocar a Classe equipada em combate/)).toBeTruthy();
    });

    it('arauto digitado cria bio quando ausente', () => {
        const ficha = montar({ bio: undefined });
        act(() => { probe.mudarArauto('Fogo'); });
        expect(ficha.bio.arauto).toBe('Fogo');
    });
});

describe('mudarSubClasseDireto - Acao Bonus em combate', () => {
    it('fora de combate troca livre, sem confirm e sem aviso', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const ficha = montar({ bio: { classe: 'alterego', subClasse: '' } });
        act(() => { probe.mudarSubClasseDireto('saber'); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ficha.bio.subClasse).toBe('saber');
    });

    it('em combate pede confirm; confirmando troca e avisa o feed', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const ficha = montar({ bio: { classe: 'alterego', subClasse: '' }, iniciativa: 12 });
        act(() => { probe.mudarSubClasseDireto('saber'); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toMatch(/Ação Bônus/);
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        const msg = enviarParaFeed.mock.calls[0][0];
        expect(msg.tipo).toBe('sistema');
        expect(msg.nome).toBe('Heroi');
        expect(msg.texto).toMatch(/Heroi/);
        expect(msg.texto).toMatch(/Ação Bônus/);
        expect(ficha.bio.subClasse).toBe('saber');
    });

    it('em combate, cancelar o confirm nao troca nem avisa', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const ficha = montar({ bio: { classe: 'alterego', subClasse: 'archer' }, iniciativa: 5 });
        act(() => { probe.mudarSubClasseDireto('saber'); });
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ficha.bio.subClasse).toBe('archer');
    });

    it('escolher a mesma classe ja vestida nao pede confirm nem gasta Acao Bonus', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar({ bio: { classe: 'alterego', subClasse: 'saber' }, iniciativa: 5 });
        act(() => { probe.mudarSubClasseDireto('saber'); });
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('iniciativa 0, negativa ou invalida conta como fora de combate', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        for (const ini of [0, -3, 'abc', null]) {
            montar({ bio: { classe: 'pretender', subClasse: '' }, iniciativa: ini });
            act(() => { probe.mudarSubClasseDireto('lancer'); });
            cleanup();
        }
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('iniciativa em string numerica conta como combate', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        montar({ bio: { classe: 'pretender', subClasse: '' }, iniciativa: '7' });
        act(() => { probe.mudarSubClasseDireto('lancer'); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
    });

    it('voltar para "nenhuma" (string vazia) em combate tambem gasta Acao Bonus', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar({ bio: { classe: 'alterego', subClasse: 'saber' }, iniciativa: 3 });
        act(() => { probe.mudarSubClasseDireto(''); });
        expect(confirmSpy).toHaveBeenCalledTimes(1);
    });
});
