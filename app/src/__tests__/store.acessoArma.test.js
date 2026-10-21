import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { fichaPadrao } from '../stores/useStore.js';

function congelarProfundo(o) {
    Object.values(o).forEach(v => { if (v && typeof v === 'object') congelarProfundo(v); });
    return Object.freeze(o);
}
const carregar = (d) => useStore.getState().carregarDadosFicha(d);
const arma = () => useStore.getState().minhaFicha.armaEspiritual;

describe('carregarDadosFicha > acessoArma', () => {
    beforeEach(() => { useStore.getState().resetFicha(); });

    it('fichaPadrao nasce com acessoArma=false', () => {
        expect(fichaPadrao.armaEspiritual.acessoArma).toBe(false);
    });
    it('ficha antiga COM conteúdo e sem flag => acessoArma true', () => {
        carregar({ armaEspiritual: { nome: 'Excalibur', passivas: [] } });
        expect(arma().acessoArma).toBe(true);
        expect(arma().nome).toBe('Excalibur');
    });
    it('ficha antiga vazia e sem flag => false', () => {
        carregar({ armaEspiritual: { nome: '', passivas: [] } });
        expect(arma().acessoArma).toBe(false);
    });
    it('flag explícita é preservada (false mesmo com conteúdo; true mesmo vazia)', () => {
        carregar({ armaEspiritual: { nome: 'X', acessoArma: false } });
        expect(arma().acessoArma).toBe(false);
        carregar({ armaEspiritual: { acessoArma: true } });
        expect(arma().acessoArma).toBe(true);
    });
    it('dados profundamente congelados não lançam e não são mutados', () => {
        const dados = congelarProfundo({ armaEspiritual: { nome: 'Congelada', passivas: [{ id: 1, texto: 'a' }] } });
        expect(() => carregar(dados)).not.toThrow();
        expect(arma().acessoArma).toBe(true);
        expect('acessoArma' in dados.armaEspiritual).toBe(false);
    });
    it('sem armaEspiritual nos dados usa o padrão (acessoArma false)', () => {
        carregar({ ascensaoBase: 2 });
        expect(arma().acessoArma).toBe(false);
    });
});
