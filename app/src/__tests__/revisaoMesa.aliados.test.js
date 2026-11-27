import { describe, it, expect, vi, beforeEach } from 'vitest';

let listaAliados = [];
vi.mock('../core/aliadosEmCampo.js', () => ({
    listarAliadosEmCampoDaMesa: vi.fn(() => listaAliados),
    nomeDoPortador: vi.fn((f, n) => n || 'Eu'),
    naCena: vi.fn(() => true),
}));

import { efeitosDeAliados } from '../core/efeitosDeAliados';

const ef = (valor, atributo = 'acerto') => ({ atributo, propriedade: 'base', valor, valeParaAliados: true, quando: '' });
const poder = (nome, efeitos, extra = {}) => ({ id: nome, nome, ativa: true, efeitos, efeitosPassivos: [], ...extra });
const aliado = (nome, poderes) => ({ nome, ficha: { poderes, contadores: [] } });
const benef = { poderes: [] };

beforeEach(() => { listaAliados = []; });

describe('efeitosDeAliados dedup', () => {
    it('dois efeitos do MESMO Poder valem', () => {
        listaAliados = [aliado('A', [poder('Presa', [ef('2'), ef('3')])])];
        expect(efeitosDeAliados(benef, 'Eu')).toHaveLength(2);
    });
    it('portadores DIFERENTES com mesmo (Poder, atributo) contam um so', () => {
        listaAliados = [aliado('A', [poder('Presa', [ef('2')])]), aliado('B', [poder('presa', [ef('9')])])];
        const r = efeitosDeAliados(benef, 'Eu');
        expect(r).toHaveLength(1);
        expect(r[0].valor).toBe('2');
    });
    it('atributos diferentes ou Poderes diferentes nao colidem', () => {
        listaAliados = [aliado('A', [poder('X', [ef('2', 'acerto')])]), aliado('B', [poder('X', [ef('1', 'vantagem')]), poder('Y', [ef('4')])])];
        expect(efeitosDeAliados(benef, 'Eu')).toHaveLength(3);
    });
    it('passivo e ativo do mesmo Poder valem juntos; Poder desligado so passivos', () => {
        listaAliados = [aliado('A', [poder('X', [ef('1')], { efeitosPassivos: [ef('2')] })]), aliado('B', [poder('Z', [ef('5')], { ativa: false, efeitosPassivos: [ef('6')] })])];
        expect(efeitosDeAliados(benef, 'Eu').map(e => e.valor).sort()).toEqual(['1', '2', '6']);
    });
    it('sem aliados, efeitos sem a marca e ficha invalida', () => {
        expect(efeitosDeAliados(benef, 'Eu')).toEqual([]);
        expect(efeitosDeAliados(null)).toEqual([]);
        listaAliados = [aliado('B', [null, poder('Y', [{ ...ef('1'), valeParaAliados: false }, ef('1', 'forca'), null])]), { nome: 'C', ficha: null }];
        expect(efeitosDeAliados(benef, 'Eu')).toEqual([]);
    });
});
