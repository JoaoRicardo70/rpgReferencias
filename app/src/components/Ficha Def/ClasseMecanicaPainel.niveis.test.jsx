import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../services/firebase-sync', () => ({ enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn() }));

import ClasseMecanicaPainel from './ClasseMecanicaPainel';
import useStore from '../../stores/useStore';

const opcoes = [
    { id: 'ruler', nome: 'Ruler', icone: '⚖️' }, { id: 'avenger', nome: 'Avenger', icone: '⛓️' }, { id: 'berserker', nome: 'Berserker', icone: '狂' }
];
const montar = (ficha, salvar = vi.fn()) => { render(<ClasseMecanicaPainel ficha={ficha} salvar={salvar} meuNome="Ana" opcoesClasses={opcoes} />); return salvar; };
const mesa = (ficha, grands, classes = {}) => useStore.setState({ meuNome: 'Ana', minhaFicha: ficha, personagens: { Mestre: { compendioOverrides: { grands, classes } } } });

beforeEach(() => { useStore.setState({ meuNome: 'Ana', minhaFicha: null, personagens: {} }); });
afterEach(() => { cleanup(); });

describe('ClasseMecanicaPainel — Focos', () => {
    it('Ruler marca o Foco de Proteção', () => {
        const salvar = montar({ bio: { classe: 'ruler' }, combate: {} });
        expect(screen.getByRole('checkbox', { name: /Foco de Proteção/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('checkbox'));
        expect(salvar).toHaveBeenCalledWith('combate.focoProtecao', true);
    });

    it('Avenger desmarca o Foco de Ódio já ativo', () => {
        const salvar = montar({ bio: { classe: 'avenger' }, combate: { focoOdio: true } });
        const cb = screen.getByRole('checkbox');
        expect(cb.checked).toBe(true);
        fireEvent.click(cb);
        expect(salvar).toHaveBeenCalledWith('combate.focoOdio', false);
    });
});

describe('ClasseMecanicaPainel — Grand e Candidato', () => {
    it('Comum: sem selo', () => {
        const ficha = { bio: { classe: 'ruler', mesa: 'presente' }, combate: {} };
        mesa(ficha, {});
        montar(ficha);
        expect(screen.queryByText(/Candidato a Grand/)).toBeNull();
        expect(screen.queryByText(/GRAND/)).toBeNull();
    });

    it('Candidato: selo e texto com o benefício maior', () => {
        const ficha = { bio: { classe: 'avenger', mesa: 'presente' }, combate: {} };
        mesa(ficha, { avenger_presente_candidatos: ['Ana'] });
        montar(ficha);
        expect(screen.getByText('🌟 Candidato a Grand')).toBeTruthy();
        expect(screen.getByText(/Poder Calculado x15/)).toBeTruthy();
    });

    it('Grand: selo, texto x20 e habilidade exclusiva cadastrada no Compêndio', () => {
        const ficha = { bio: { classe: 'avenger', mesa: 'presente' }, combate: {} };
        mesa(ficha, { avenger_presente: 'Ana' }, { avenger: { habilidadeGrand: 'Vingança Absoluta' } });
        montar(ficha);
        expect(screen.getByText(/👑 GRAND/)).toBeTruthy();
        expect(screen.getByText(/Poder Calculado x20/)).toBeTruthy();
        expect(screen.getByText(/Vingança Absoluta/)).toBeTruthy();
    });

    it('a habilidade exclusiva não aparece para quem não é Grand', () => {
        const ficha = { bio: { classe: 'avenger', mesa: 'presente' }, combate: {} };
        mesa(ficha, { avenger_presente_candidatos: ['Ana'] }, { avenger: { habilidadeGrand: 'Vingança Absoluta' } });
        montar(ficha);
        expect(screen.queryByText(/Vingança Absoluta/)).toBeNull();
    });
});

describe('ClasseMecanicaPainel — Fúria do Berserker', () => {
    it('mostra a Vida perdida e "Acalmar Fúria" grava a Vida perdida como novo máximo', () => {
        const ficha = { bio: { classe: 'berserker' }, combate: { furiaMax: 60 }, vida: { base: 100000000, atual: 50000000 } };
        const salvar = montar(ficha);
        expect(screen.getByText(/🩸 Vida perdida/)).toBeTruthy();
        fireEvent.click(screen.getByText('Acalmar Fúria'));
        expect(salvar).toHaveBeenCalledWith('combate.furiaMax', expect.any(Number));
    });
});
