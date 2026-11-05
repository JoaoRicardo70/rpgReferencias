import { describe, it, expect } from 'vitest';
import { ATRIBUTOS_COM_QUANDO, ATRIBUTOS_COM_ESCOPO, passaQuando, somarEfeitosBase } from './efeitosCondicionais.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';
import { prepararItemImportado, montarPromptImportacao } from './importadorIA.js';
import { efeitosDeBuffsTemporarios } from './suporte.js';
import { efeitosDaArmaEspiritual } from './armaEspiritualEfeitos.js';
import { escalarPorFator } from './estagios.js';

const NAO_ESCALAM = ['vantagem', 'desvantagem', 'piso_d20', 'margem_critico', 'margem_critico_fatal', 'critico_automatico', 'critico_fatal_automatico'];

describe('ATRIBUTOS_COM_QUANDO / ATRIBUTOS_COM_ESCOPO', () => {
    it('listas exatas', () => {
        expect([...ATRIBUTOS_COM_QUANDO].sort()).toEqual(['acerto', 'evasiva', 'resistencia', 'iniciativa', ...NAO_ESCALAM].sort());
        expect(ATRIBUTOS_COM_ESCOPO).toEqual(['vantagem', 'desvantagem', 'piso_d20']);
    });
    it('todo atributo com escopo tambem aceita quando', () => {
        ATRIBUTOS_COM_ESCOPO.forEach(a => expect(ATRIBUTOS_COM_QUANDO).toContain(a));
    });
});

describe('passaQuando normaliza o quando guardado', () => {
    it('caixa e acento variados valem', () => {
        expect(passaQuando({ quando: 'Em_Combate' }, { emCombate: true })).toBe(true);
        expect(passaQuando({ quando: 'Em_Combate' }, { emCombate: false })).toBe(false);
        expect(passaQuando({ quando: 'alvo_com_estado:Surpreso' }, { alvoEstados: ['surpreso'] })).toBe(true);
        expect(passaQuando({ quando: 'Empunhando_Arma:Lança' }, { armaTipos: ['lanca'] })).toBe(true);
        expect(passaQuando({ quando: ' SEMPRE ' }, {})).toBe(true);
    });
    it('invalido => false (falha fechado), mesmo com contexto cheio', () => {
        const ctx = { emCombate: true, temArma: true, armaTipos: ['espada'], alvoEstados: ['surpreso'], alvoVidaPct: 1 };
        ['alvo_com_estado:xyz', 'alvo_vida_abaixo:0', 'alvo_vida_abaixo:101', 'lua', 'alvo_com_estado'].forEach(q => {
            expect(passaQuando({ quando: q }, ctx)).toBe(false);
        });
    });
    it('somarEfeitosBase aceita o quando em caixa diferente', () => {
        const f = { passivas: [{ efeitos: [{ atributo: 'acerto', propriedade: 'base', valor: 3, quando: 'EM_COMBATE' }] }] };
        expect(somarEfeitosBase(f, 'acerto', { emCombate: true })).toBe(3);
        expect(somarEfeitosBase(f, 'acerto')).toBe(0);
    });
});

describe('normalizarPoder: quando/escopo por atributo', () => {
    const poder = (efeitos) => normalizarPoder({ nome: 'P', categoria: 'habilidade', efeitos });
    it.each(['forca', 'dano', 'vida'])('quando valido em %s DESCARTA o efeito com aviso "ainda nao aceita condicao"', (atributo) => {
        const { objeto, avisos } = poder([{ nome: 'x', atributo, propriedade: 'base', valor: 5, quando: 'em_combate' }]);
        expect(objeto.efeitos).toEqual([]);
        expect(avisos.some(a => /ainda não aceita condição/.test(a))).toBe(true);
    });
    it.each(ATRIBUTOS_COM_QUANDO)('quando em %s e preservado', (atributo) => {
        const { objeto, avisos } = poder([{ nome: 'x', atributo, propriedade: 'base', valor: 1, quando: 'em_combate' }]);
        expect(objeto.efeitos).toHaveLength(1);
        expect(objeto.efeitos[0].quando).toBe('em_combate');
        expect(avisos).toEqual([]);
    });
    it('"sempre" em atributo sem suporte nao descarta', () => {
        const { objeto } = poder([{ nome: 'x', atributo: 'forca', propriedade: 'base', valor: 5, quando: 'sempre' }]);
        expect(objeto.efeitos).toHaveLength(1);
        expect('quando' in objeto.efeitos[0]).toBe(false);
    });
    it('escopo em atributo fora de ATRIBUTOS_COM_ESCOPO e ignorado (efeito fica, sem escopo) com aviso', () => {
        const { objeto, avisos } = poder([{ nome: 'x', atributo: 'acerto', propriedade: 'base', valor: 2, escopo: 'ataque' }]);
        expect(objeto.efeitos).toHaveLength(1);
        expect('escopo' in objeto.efeitos[0]).toBe(false);
        expect(avisos.some(a => /escopo/.test(a))).toBe(true);
    });
    it('escopo em vantagem e preservado', () => {
        const { objeto } = poder([{ nome: 'x', atributo: 'vantagem', propriedade: 'base', valor: 1, escopo: 'teste:furtividade' }]);
        expect(objeto.efeitos[0].escopo).toBe('teste:furtividade');
    });
    it('escopo invalido em atributo sem escopo ainda descarta o efeito (invalido e invalido)', () => {
        const { objeto } = poder([{ nome: 'x', atributo: 'acerto', propriedade: 'base', valor: 2, escopo: 'defesa' }]);
        expect(objeto.efeitos).toEqual([]);
    });
});

describe('importadorIA: efeito condicional em atributo sem suporte', () => {
    const item = (efeitos) => prepararItemImportado({ nome: 'Golpe', categoria: 'habilidade', efeitos });
    it('forca com quando vai para naoAplicado e nao entra nos efeitos', () => {
        const r = item([{ nome: 'Fúria', atributo: 'forca', propriedade: 'base', valor: 5, quando: 'em_combate' }]);
        expect(r.objeto.efeitos).toEqual([]);
        expect(r.naoAplicado.some(n => /Efeito condicional que o sistema ainda não suporta nesse atributo/.test(n))).toBe(true);
    });
    it('acerto com quando entra normalmente', () => {
        const r = item([{ nome: 'Mira', atributo: 'acerto', propriedade: 'base', valor: 5, quando: 'em_combate' }]);
        expect(r.objeto.efeitos).toHaveLength(1);
        expect(r.objeto.efeitos[0].quando).toBe('em_combate');
        expect(r.naoAplicado.filter(n => /condicional/.test(n))).toEqual([]);
    });
    it('forca com quando "sempre" ou vazio entra normalmente', () => {
        const r = item([
            { nome: 'a', atributo: 'forca', propriedade: 'base', valor: 5, quando: 'sempre' },
            { nome: 'b', atributo: 'forca', propriedade: 'base', valor: 5, quando: '' },
        ]);
        expect(r.objeto.efeitos).toHaveLength(2);
    });
    it('o prompt lista os atributos que aceitam quando', () => {
        const p = montarPromptImportacao('texto qualquer');
        ATRIBUTOS_COM_QUANDO.forEach(a => expect(p).toContain(a));
    });
});

describe('propagacao de quando/escopo por Suporte e Arma Espiritual', () => {
    it('efeitosDeBuffsTemporarios mantem quando e escopo', () => {
        const ficha = { buffsTemporarios: [{ id: 'a', nome: 'Bênção', efeitos: [{ atributo: 'vantagem', propriedade: 'base', valor: 1, quando: 'em_combate', escopo: 'tudo' }] }] };
        const r = efeitosDeBuffsTemporarios(ficha);
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ atributo: 'vantagem', quando: 'em_combate', escopo: 'tudo' });
    });
    it('buff sem quando/escopo nao ganha as chaves', () => {
        const ficha = { buffsTemporarios: [{ id: 'a', nome: 'B', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 1 }] }] };
        const r = efeitosDeBuffsTemporarios(ficha)[0];
        expect('quando' in r).toBe(false);
        expect('escopo' in r).toBe(false);
    });
    it('efeitosDaArmaEspiritual mantem quando e escopo', () => {
        const ficha = { poderes: [], inventario: [], armaEspiritual: { nome: 'Excalibur', acessoArma: true, efeitosEstados: { base: { efeitos: [
            { atributo: 'piso_d20', propriedade: 'base', valor: 8, quando: 'em_combate', escopo: 'ataque' },
            { atributo: 'acerto', propriedade: 'base', valor: 2 },
        ] } } } };
        const r = efeitosDaArmaEspiritual(ficha);
        expect(r[0]).toMatchObject({ quando: 'em_combate', escopo: 'ataque' });
        expect('quando' in r[1]).toBe(false);
    });
});

describe('estagios.escalarPorFator: atributos de rolagem nao escalam', () => {
    it.each(NAO_ESCALAM)('%s mantem o valor com fator 3', (atributo) => {
        const e = { atributo, propriedade: 'base', valor: 2 };
        expect(escalarPorFator([e], 3)[0].valor).toBe(2);
    });
    it('os demais escalam como antes (acerto, evasiva, forca)', () => {
        ['acerto', 'evasiva', 'forca', 'iniciativa'].forEach(atributo => {
            expect(escalarPorFator([{ atributo, propriedade: 'base', valor: 2 }], 3)[0].valor).toBe(6);
        });
    });
    it('fator 1 devolve a mesma lista; fixo nao escala; nulos tolerados', () => {
        const l = [{ atributo: 'acerto', valor: 2 }];
        expect(escalarPorFator(l, 1)).toBe(l);
        expect(escalarPorFator([{ atributo: 'acerto', valor: 2, fixo: true }], 3)[0].valor).toBe(2);
        expect(escalarPorFator([null], 3)).toEqual([null]);
        expect(escalarPorFator(undefined, 3)).toEqual([]);
    });
});
