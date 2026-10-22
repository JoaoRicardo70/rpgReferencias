import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase/database', () => ({ ref: vi.fn((db, p) => p), onValue: vi.fn(), set: vi.fn(), get: vi.fn() }));
vi.mock('../../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), salvarDummie: vi.fn() }));

import EfeitosDeFundo from './EfeitosDeFundo';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

const st = () => useStore.getState();
const fichaBase = ({ atual = 1000, furia = true, combate = {} } = {}) => ({
    bio: {}, vida: { base: 1000, atual }, poderes: furia ? [{ nome: 'Instinto', ativa: true, efeitos: [{ atributo: 'dano', propriedade: 'furia_berserker', valor: 5 }] }] : [],
    inventario: [], passivas: [], divisores: {}, estetica: {}, labels: {}, combate,
});

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ meuNome: 'Ana', minhaFicha: fichaBase(), sextaFeiraDecisoes: {}, avisosAcao: [] });
});
afterEach(() => cleanup());

describe('EfeitosDeFundo - Furia Berserker', () => {
    it('renderiza nada', () => {
        expect(render(<EfeitosDeFundo />).container.firstChild).toBeNull();
    });
    it('vida cheia: nao grava', () => {
        render(<EfeitosDeFundo />);
        expect(st().minhaFicha.combate.furiaMax).toBeUndefined();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('perde vida com furia: grava furiaMax e salva (debounce silencioso)', () => {
        render(<EfeitosDeFundo />);
        act(() => st().updateFicha(f => { f.vida.atual = 400; }));
        expect(st().minhaFicha.combate.furiaMax).toBe(60);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    it('ja montado com vida baixa: grava ao montar', () => {
        useStore.setState({ minhaFicha: fichaBase({ atual: 200 }) });
        render(<EfeitosDeFundo />);
        expect(st().minhaFicha.combate.furiaMax).toBe(80);
    });
    it('nao regrava quando o pico ja e maior; sobe quando a perda aumenta', () => {
        useStore.setState({ minhaFicha: fichaBase({ atual: 200, combate: { furiaMax: 90 } }) });
        render(<EfeitosDeFundo />);
        expect(st().minhaFicha.combate.furiaMax).toBe(90);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        act(() => st().updateFicha(f => { f.vida.atual = 0; }));
        expect(st().minhaFicha.combate.furiaMax).toBe(100);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
    it('curar nao reduz o pico', () => {
        render(<EfeitosDeFundo />);
        act(() => st().updateFicha(f => { f.vida.atual = 400; }));
        act(() => st().updateFicha(f => { f.vida.atual = 1000; }));
        expect(st().minhaFicha.combate.furiaMax).toBe(60);
    });
    it('sem efeito furia_berserker: nao grava mesmo perdendo vida', () => {
        useStore.setState({ minhaFicha: fichaBase({ atual: 100, furia: false }) });
        render(<EfeitosDeFundo />);
        expect(st().minhaFicha.combate.furiaMax).toBeUndefined();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('ficha sem objeto combate: cria e grava', () => {
        const f = fichaBase({ atual: 500 }); delete f.combate;
        useStore.setState({ minhaFicha: f });
        render(<EfeitosDeFundo />);
        expect(st().minhaFicha.combate.furiaMax).toBe(50);
    });
});

describe('EfeitosDeFundo - aviso de decisao da Sexta-Feira', () => {
    const decisao = (over = {}) => ({ solicitante: 'Ana', nomeCriacao: 'Raio', aprovado: true, em: Date.now() + 5000, ...over });
    const avisos = () => st().avisosAcao;

    it('aprovada: aviso info com o nome', () => {
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao() } }));
        expect(avisos()).toHaveLength(1);
        expect(avisos()[0].tipo).toBe('info');
        expect(avisos()[0].texto).toContain('aprovou "Raio"');
    });
    it('recusada: aviso alerta', () => {
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d2: decisao({ nomeCriacao: 'Escudo', aprovado: false }) } }));
        expect(avisos()[0].tipo).toBe('alerta');
        expect(avisos()[0].texto).toContain('recusou "Escudo"');
    });
    it('nao duplica em re-renders nem ao mudar outras decisoes', () => {
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao() } }));
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao() }, meuNome: 'Ana' }));
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao(), d2: decisao({ nomeCriacao: 'B' }) } }));
        expect(avisos()).toHaveLength(2);
    });
    it('decisoes antigas (antes de montar) nao avisam', () => {
        useStore.setState({ sextaFeiraDecisoes: { d0: decisao({ em: 1 }) } });
        render(<EfeitosDeFundo />);
        expect(avisos()).toHaveLength(0);
    });
    it('decisao antiga ja vista nao avisa depois, mesmo se reaparecer', () => {
        useStore.setState({ sextaFeiraDecisoes: { d0: decisao({ em: 1 }) } });
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d0: decisao({ em: Date.now() + 9000 }) } }));
        expect(avisos()).toHaveLength(0);
    });
    it('decisao de outro jogador nao avisa', () => {
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao({ solicitante: 'Bruno' }) } }));
        expect(avisos()).toHaveLength(0);
    });
    it('compara nomes sanitizados', () => {
        useStore.setState({ meuNome: 'Ana.B' });
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: decisao({ solicitante: 'Ana.B' }) } }));
        expect(avisos()).toHaveLength(1);
    });
    it('entrada nula e decisoes null/undefined nao quebram', () => {
        render(<EfeitosDeFundo />);
        act(() => useStore.setState({ sextaFeiraDecisoes: { d1: null } }));
        act(() => useStore.setState({ sextaFeiraDecisoes: null }));
        act(() => useStore.setState({ sextaFeiraDecisoes: undefined }));
        expect(avisos()).toHaveLength(0);
    });
});
