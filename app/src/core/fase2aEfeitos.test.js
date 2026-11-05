import { describe, it, expect } from 'vitest';
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo } from './efeitos-constants.js';
import { ESTADOS, resumoDosEstados, modificadoresDeEstados, ehEstadoValido } from './condicoes.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';
import { CAMPOS_VALOR_DO_ACERTO, ocultarValorDoAcerto } from './dadosMestre.js';

const NOVOS = ['vantagem', 'desvantagem', 'piso_d20', 'iniciativa', 'margem_critico', 'margem_critico_fatal', 'critico_automatico', 'critico_fatal_automatico', 'imune_surpresa'];

describe('efeitos-constants: grupo ROLAGENS E CRITICO', () => {
    it('existe um unico grupo com os 8 atributos novos', () => {
        const grupos = ATRIBUTOS_AGRUPADOS.filter(g => /ROLAGENS/.test(g.label));
        expect(grupos).toHaveLength(1);
        expect(grupos[0].options).toEqual(NOVOS);
    });
    it.each(NOVOS)('%s so aceita a propriedade base', (a) => {
        expect(getPropriedadesDoAtributo(a)).toEqual(['base']);
    });
    it('nenhum atributo aparece em dois grupos', () => {
        const todos = ATRIBUTOS_AGRUPADOS.flatMap(g => g.options);
        expect(new Set(todos).size).toBe(todos.length);
    });
});

describe('condicoes: estado Surpreso', () => {
    it('ESTADOS tem 17 e inclui surpreso valido', () => {
        expect(ESTADOS).toHaveLength(17);
        expect(ehEstadoValido('surpreso')).toBe(true);
    });
    it('surpreso nao altera modificadores numericos', () => {
        const base = modificadoresDeEstados({});
        const com = modificadoresDeEstados({ condicoes: [{ id: 'surpreso', stacks: 1 }] });
        expect(com).toEqual(base);
    });
    it('resumoDosEstados tem uma linha para Surpreso', () => {
        const linhas = resumoDosEstados({ condicoes: [{ id: 'surpreso', stacks: 1 }] });
        expect(linhas.some(l => /Surpreso/.test(l))).toBe(true);
    });
});

describe('normalizarPoder: quando e escopo nos efeitos', () => {
    const poder = (efeitos, efeitosPassivos = []) => normalizarPoder({ nome: 'P', categoria: 'habilidade', efeitos, efeitosPassivos });

    it('preserva quando e escopo validos (forma canonica)', () => {
        const { objeto, avisos } = poder([{ nome: 'v', atributo: 'vantagem', propriedade: 'base', valor: 1, quando: 'Alvo_Com_Estado:Surpreso', escopo: 'TESTE:Furtividade' }]);
        expect(objeto.efeitos).toHaveLength(1);
        expect(objeto.efeitos[0]).toMatchObject({ atributo: 'vantagem', quando: 'alvo_com_estado:surpreso', escopo: 'teste:furtividade' });
        expect(avisos).toEqual([]);
    });
    it('sem quando/escopo: chaves nao existem no efeito', () => {
        const { objeto } = poder([{ nome: 'a', atributo: 'acerto', propriedade: 'base', valor: 2 }]);
        expect('quando' in objeto.efeitos[0]).toBe(false);
        expect('escopo' in objeto.efeitos[0]).toBe(false);
    });
    it('"sempre" e vazio nao gravam quando', () => {
        const { objeto } = poder([
            { atributo: 'acerto', propriedade: 'base', valor: 1, quando: 'sempre' },
            { atributo: 'acerto', propriedade: 'base', valor: 1, quando: '', escopo: '' },
        ]);
        expect(objeto.efeitos).toHaveLength(2);
        objeto.efeitos.forEach(e => { expect('quando' in e).toBe(false); expect('escopo' in e).toBe(false); });
    });
    it('quando invalido DESCARTA o efeito com aviso (nunca vale sempre)', () => {
        const { objeto, avisos } = poder([
            { nome: 'ruim', atributo: 'vantagem', propriedade: 'base', valor: 1, quando: 'lua_cheia' },
            { nome: 'bom', atributo: 'acerto', propriedade: 'base', valor: 1 },
        ]);
        expect(objeto.efeitos.map(e => e.nome)).toEqual(['bom']);
        expect(avisos.some(a => /lua_cheia/.test(a) && /descartado/.test(a))).toBe(true);
    });
    it('estado inexistente em alvo_com_estado descarta o efeito', () => {
        const { objeto, avisos } = poder([{ atributo: 'vantagem', propriedade: 'base', valor: 1, quando: 'alvo_com_estado:xyz' }]);
        expect(objeto.efeitos).toEqual([]);
        expect(avisos.length).toBeGreaterThan(0);
    });
    it('alvo_vida_abaixo fora de 1..100 descarta', () => {
        const { objeto } = poder([{ atributo: 'acerto', propriedade: 'base', valor: 1, quando: 'alvo_vida_abaixo:150' }]);
        expect(objeto.efeitos).toEqual([]);
    });
    it('escopo invalido DESCARTA o efeito com aviso', () => {
        const { objeto, avisos } = poder([{ nome: 'x', atributo: 'piso_d20', propriedade: 'base', valor: 8, escopo: 'defesa' }]);
        expect(objeto.efeitos).toEqual([]);
        expect(avisos.some(a => /defesa/.test(a) && /descartado/.test(a))).toBe(true);
    });
    it('vale tambem para efeitos passivos, com o rotulo certo no aviso', () => {
        const { objeto, avisos } = poder([], [
            { atributo: 'vantagem', propriedade: 'base', valor: 1, quando: 'em_combate', escopo: 'tudo' },
            { atributo: 'vantagem', propriedade: 'base', valor: 1, quando: 'nada' },
        ]);
        expect(objeto.efeitosPassivos).toHaveLength(1);
        expect(objeto.efeitosPassivos[0]).toMatchObject({ quando: 'em_combate', escopo: 'tudo' });
        expect(avisos.some(a => /Efeito passivo 2/.test(a))).toBe(true);
    });
    it('atributos novos (margem_critico etc.) sao aceitos sem aviso', () => {
        const { objeto, avisos } = poder(NOVOS.map(a => ({ nome: a, atributo: a, propriedade: 'base', valor: 1 })));
        expect(objeto.efeitos.map(e => e.atributo)).toEqual(NOVOS);
        expect(avisos).toEqual([]);
    });
});

describe('dadosMestre: dadoNatural oculto', () => {
    it('CAMPOS_VALOR_DO_ACERTO inclui dadoNatural e naturalD20', () => {
        expect(CAMPOS_VALOR_DO_ACERTO).toContain('dadoNatural');
        expect(CAMPOS_VALOR_DO_ACERTO).toContain('naturalD20');
    });
    it('ocultarValorDoAcerto remove dadoNatural e mantem o resto', () => {
        const e = { tipo: 'acerto', nome: 'X', acertoTotal: 20, rolagem: '[19]', dadoNatural: 19, naturalD20: 20, valorOculto: true, alvos: ['A'] };
        const r = ocultarValorDoAcerto(e);
        expect(r).not.toHaveProperty('dadoNatural');
        expect(r).not.toHaveProperty('naturalD20');
        expect(r).toEqual({ tipo: 'acerto', nome: 'X', valorOculto: true, alvos: ['A'] });
        expect(e.dadoNatural).toBe(19);
    });
    it('sem valorOculto devolve a mesma entrada com dadoNatural', () => {
        const e = { tipo: 'acerto', dadoNatural: 17 };
        expect(ocultarValorDoAcerto(e)).toBe(e);
    });
});
