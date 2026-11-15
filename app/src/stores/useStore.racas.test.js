import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { fichaPadrao } from './useStore';
import { resolverRaca, poderRacaIncompativel } from '../core/racas';

beforeEach(() => { useStore.setState({ minhaFicha: structuredClone(fichaPadrao) }); });

describe('useStore - Raças e Habilidades de Raça', () => {
    it('ficha padrão tem bio.racaId vazio', () => {
        expect(fichaPadrao.bio.racaId).toBe('');
    });
    it('carregarDadosFicha: ficha antiga sem racaId recebe o padrão e mantém o texto da Raça', () => {
        useStore.getState().carregarDadosFicha({ bio: { raca: 'Saiyajin' } });
        const { bio } = useStore.getState().minhaFicha;
        expect(bio.raca).toBe('Saiyajin');
        expect(bio.racaId).toBe('');
    });
    it('carregarDadosFicha migra o Zenkai (habilidade) para habilidadeRaca com exceção, sem selo, e deixa o resto', () => {
        useStore.getState().carregarDadosFicha({ bio: { raca: 'Humano' }, poderes: [
            { id: 1, nome: 'Zenkai', categoria: 'habilidade', modelo: { id: 'zenkai' } },
            { id: 2, nome: 'Soco', categoria: 'habilidade' },
        ] });
        const f = useStore.getState().minhaFicha;
        expect(f.poderes[0]).toMatchObject({ categoria: 'habilidadeRaca', racaExcecao: true, racasAcesso: [] });
        expect(f.poderes[1].categoria).toBe('habilidade');
        expect(poderRacaIncompativel({ racas: [] }, f, f.poderes[0])).toBe(false);
        expect(resolverRaca({ racas: [{ id: 'humano', nome: 'Humano' }] }, f)).toMatchObject({ id: 'humano', cadastrada: true });
    });
});
