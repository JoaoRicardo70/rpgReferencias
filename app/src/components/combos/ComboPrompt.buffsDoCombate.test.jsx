import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ComboPrompt from './ComboPrompt';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { somarBuffTemporario } from '../../core/suporte';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({ enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn() }));

const efeitos = [{ atributo: 'dano', propriedade: 'base', valor: 5 }];
let state; let ficha;

function listaBuffs() {
    let l = somarBuffTemporario([], { id: 'c', nome: 'Combate', fonte: 'X', efeitos, duracaoModo: 'combate' });
    l = somarBuffTemporario(l, { id: 't', nome: 'Turnos', fonte: 'X', efeitos, duracao: 3 });
    l = somarBuffTemporario(l, { id: 'p', nome: 'Perm', fonte: 'X', efeitos, duracaoModo: 'permanente' });
    return l;
}

function montar({ iniciativa = 7, buffs = listaBuffs() } = {}) {
    ficha = { acoes: { padrao: { max: 1, atual: 1 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } }, iniciativa, combate: {}, buffsTemporarios: buffs };
    state = { feedCombate: [], meuNome: 'Heroi', minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), adicionarAviso: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<ComboPrompt />);
}
function mudarIniciativa(r, valor, nome = 'Heroi') {
    state = { ...state, meuNome: nome, minhaFicha: { ...ficha, iniciativa: valor } };
    r.rerender(<ComboPrompt />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ComboPrompt: buffs ateFimCombate saem quando a iniciativa vai de >0 para 0', () => {
    it('remove so o buff do combate; por turnos e permanente ficam', () => {
        const r = montar();
        expect(state.updateFicha).not.toHaveBeenCalled();
        mudarIniciativa(r, 0);
        expect(state.updateFicha).toHaveBeenCalledTimes(1);
        expect(ficha.buffsTemporarios.map(b => b.nome)).toEqual(['Turnos', 'Perm']);
        expect(ficha.buffsTemporarios.find(b => b.nome === 'Turnos').restantes).toBe(3);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(state.adicionarAviso).toHaveBeenCalledWith(expect.stringContaining('buffs do combate removidos'), 'info');
    });

    it('sem buff de combate nao grava nada', () => {
        const buffs = listaBuffs().filter(b => !b.ateFimCombate);
        const r = montar({ buffs });
        mudarIniciativa(r, 0);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(ficha.buffsTemporarios).toHaveLength(2);
    });

    it('iniciativa que continua > 0 nao remove', () => {
        const r = montar();
        mudarIniciativa(r, 12);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(ficha.buffsTemporarios).toHaveLength(3);
    });

    it('iniciativa que ja era 0 e continua 0 nao remove', () => {
        const r = montar({ iniciativa: 0 });
        mudarIniciativa(r, 0);
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(ficha.buffsTemporarios).toHaveLength(3);
    });

    it('subir de 0 para >0 nao remove', () => {
        const r = montar({ iniciativa: 0 });
        mudarIniciativa(r, 9);
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('trocar de personagem com iniciativa 0 nao remove os buffs do outro', () => {
        const r = montar();
        mudarIniciativa(r, 0, 'Outro');
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(ficha.buffsTemporarios).toHaveLength(3);
    });

    it('ficha sem buffsTemporarios nao quebra', () => {
        const r = montar({ buffs: null });
        expect(() => mudarIniciativa(r, 0)).not.toThrow();
        expect(state.updateFicha).not.toHaveBeenCalled();
    });
});
