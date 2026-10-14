import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../stores/useStore';
import useSincronizarAcoes from './useSincronizarAcoes';
import { salvarFichaSilencioso } from '../services/firebase-sync';

vi.mock('../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
}));

function Comp({ ativo }) { useSincronizarAcoes(ativo); return null; }

const antiga = () => ({
    bio: {}, poderes: [], inventario: [], passivas: [],
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } }
});

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('useSincronizarAcoes', () => {
    it('ficha sincronizada nao salva nem muda', () => {
        const f = { bio: {}, poderes: [], inventario: [], passivas: [],
            acoes: { padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 2, extra: 0 } } };
        useStore.setState({ minhaFicha: f });
        render(<Comp ativo={true} />);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(useStore.getState().minhaFicha.acoes.padrao.max).toBe(2);
    });

    it('ficha padrao do store (sem mexer) nao entra em loop e salva no maximo uma vez', () => {
        render(<Comp ativo={true} />);
        expect(vi.mocked(salvarFichaSilencioso).mock.calls.length).toBeLessThanOrEqual(1);
        const a = useStore.getState().minhaFicha.acoes;
        expect(a.padrao.max).toBe(2);
    });

    it('ficha antiga (max 1, sem extra) sincroniza e salva UMA vez, sem loop', () => {
        useStore.setState({ minhaFicha: antiga() });
        render(<Comp ativo={true} />);
        const a = useStore.getState().minhaFicha.acoes;
        expect(a.padrao).toMatchObject({ max: 2, atual: 1, extra: 0 });
        expect(a.bonus).toMatchObject({ max: 2, atual: 2 });
        expect(a.reacao).toMatchObject({ max: 2, atual: 2 });
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('ativo=false nao mexe na ficha nem salva', () => {
        useStore.setState({ minhaFicha: antiga() });
        render(<Comp ativo={false} />);
        expect(useStore.getState().minhaFicha.acoes.padrao.max).toBe(1);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('ao virar ativo=true depois, sincroniza uma vez', () => {
        useStore.setState({ minhaFicha: antiga() });
        const { rerender } = render(<Comp ativo={false} />);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        rerender(<Comp ativo={true} />);
        expect(useStore.getState().minhaFicha.acoes.padrao.max).toBe(2);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('item equipado novo que da Acao faz o hook subir o max e salvar', () => {
        const f = antiga();
        f.acoes = { padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 2, extra: 0 } };
        useStore.setState({ minhaFicha: f });
        render(<Comp ativo={true} />);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        act(() => { useStore.getState().updateFicha(x => { x.inventario.push({ equipado: true, efeitos: [{ nome: 'a', atributo: 'acao_padrao', propriedade: 'base', valor: 1 }] }); }); });
        const a = useStore.getState().minhaFicha.acoes;
        expect(a.padrao).toMatchObject({ max: 3, atual: 3 });
        expect(a.reacao.max).toBe(3);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('minhaFicha nula nao quebra', () => {
        useStore.setState({ minhaFicha: null });
        expect(() => render(<Comp ativo={true} />)).not.toThrow();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
});
