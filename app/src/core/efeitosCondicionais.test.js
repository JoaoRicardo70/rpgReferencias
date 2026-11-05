import { describe, it, expect } from 'vitest';
import {
    coletarEfeitos, normalizarQuando, passaQuando, tiposDeArmasEquipadas, montarContextoDeCombate,
    normalizarEscopo, escopoPassa, valoresDeEfeitos, somarEfeitosBase, menorValorDeEfeitos, OPCOES_QUANDO, OPCOES_ESCOPO,
} from './efeitosCondicionais.js';
import { ESTADOS } from './condicoes.js';

const ef = (atributo, valor, extra = {}) => ({ nome: 'e', atributo, propriedade: 'base', valor, ...extra });

describe('coletarEfeitos: fontes', () => {
    it('ficha nula/vazia => []', () => {
        expect(coletarEfeitos(null)).toEqual([]);
        expect(coletarEfeitos(undefined)).toEqual([]);
        expect(coletarEfeitos({})).toEqual([]);
    });
    it('Poder ativo: efeitos + passivos; inativo: so passivos', () => {
        const ficha = { poderes: [
            { ativa: true, efeitos: [ef('acerto', 1)], efeitosPassivos: [ef('acerto', 2)] },
            { ativa: false, efeitos: [ef('acerto', 4)], efeitosPassivos: [ef('acerto', 8)] },
        ] };
        expect(coletarEfeitos(ficha).map(e => e.valor).sort()).toEqual([1, 2, 8]);
    });
    it('Passivas entram', () => {
        expect(coletarEfeitos({ passivas: [{ efeitos: [ef('acerto', 3)] }, null] }).map(e => e.valor)).toEqual([3]);
    });
    it('Item equipado entra; nao equipado nao', () => {
        const ficha = { inventario: [
            { equipado: true, efeitos: [ef('acerto', 5)] },
            { equipado: false, efeitos: [ef('acerto', 50)] },
            null,
        ] };
        expect(coletarEfeitos(ficha).map(e => e.valor)).toEqual([5]);
    });
    it('Pacto ativo entra; inativo nao', () => {
        const ficha = { seresSelados: [
            { ativo: true, efeitos: [ef('acerto', 6)], efeitosPassivos: [ef('acerto', 7)] },
            { ativo: false, efeitos: [ef('acerto', 60)] },
        ] };
        expect(coletarEfeitos(ficha).map(e => e.valor).sort()).toEqual([6, 7]);
    });
    it('ignora entradas nao-objeto e poderes nulos', () => {
        const ficha = { poderes: [null, { ativa: true, efeitos: [null, 'x', ef('acerto', 1)] }] };
        expect(coletarEfeitos(ficha)).toHaveLength(1);
    });
    it('preserva quando/escopo no efeito coletado', () => {
        const ficha = { passivas: [{ efeitos: [ef('vantagem', 1, { quando: 'em_combate', escopo: 'tudo' })] }] };
        expect(coletarEfeitos(ficha)[0]).toMatchObject({ quando: 'em_combate', escopo: 'tudo' });
    });
    it('varias fontes somam na mesma lista', () => {
        const ficha = {
            poderes: [{ ativa: true, efeitos: [ef('acerto', 1)] }],
            passivas: [{ efeitos: [ef('acerto', 2)] }],
            inventario: [{ equipado: true, efeitos: [ef('acerto', 4)] }],
            seresSelados: [{ ativo: true, efeitos: [ef('acerto', 8)] }],
        };
        expect(coletarEfeitos(ficha).map(e => e.valor).sort((a, b) => a - b)).toEqual([1, 2, 4, 8]);
    });
});

describe('normalizarQuando', () => {
    it.each([[undefined], [null], [''], ['   '], ['sempre'], ['SEMPRE'], ['Sempre ']])('%j => "" (sempre)', (v) => {
        expect(normalizarQuando(v)).toBe('');
    });
    it('em_combate (com maiusculas/espacos)', () => {
        expect(normalizarQuando('em_combate')).toBe('em_combate');
        expect(normalizarQuando('  EM_COMBATE ')).toBe('em_combate');
    });
    it('empunhando_arma sem e com tipo (tipo em minusculo sem acento)', () => {
        expect(normalizarQuando('empunhando_arma')).toBe('empunhando_arma');
        expect(normalizarQuando('empunhando_arma:Espada')).toBe('empunhando_arma:espada');
        expect(normalizarQuando('empunhando_arma:Lança')).toBe('empunhando_arma:lanca');
    });
    it('alvo_com_estado: aceita todo id de ESTADOS e rejeita inexistente/vazio', () => {
        ESTADOS.forEach(s => expect(normalizarQuando(`alvo_com_estado:${s.id}`)).toBe(`alvo_com_estado:${s.id}`));
        expect(normalizarQuando('alvo_com_estado:surpreso')).toBe('alvo_com_estado:surpreso');
        expect(normalizarQuando('alvo_com_estado:inexistente')).toBeNull();
        expect(normalizarQuando('alvo_com_estado:')).toBeNull();
        expect(normalizarQuando('alvo_com_estado')).toBeNull();
    });
    it('alvo_vida_abaixo: 1..100 valido; fora disso nulo', () => {
        expect(normalizarQuando('alvo_vida_abaixo:50')).toBe('alvo_vida_abaixo:50');
        expect(normalizarQuando('alvo_vida_abaixo:1')).toBe('alvo_vida_abaixo:1');
        expect(normalizarQuando('alvo_vida_abaixo:100')).toBe('alvo_vida_abaixo:100');
        expect(normalizarQuando('alvo_vida_abaixo:12,5')).toBe('alvo_vida_abaixo:12.5');
        ['0', '-5', '101', 'abc', ''].forEach(a => expect(normalizarQuando(`alvo_vida_abaixo:${a}`)).toBeNull());
    });
    it('condicao desconhecida => null', () => {
        expect(normalizarQuando('quando_chove')).toBeNull();
        expect(normalizarQuando(':x')).toBeNull();
    });
    it('nao-string (numero) tratado como texto: invalido => null', () => {
        expect(normalizarQuando(5)).toBeNull();
    });
});

describe('passaQuando', () => {
    it('sem quando => true (inclusive efeito nulo e sem contexto)', () => {
        expect(passaQuando({})).toBe(true);
        expect(passaQuando(null)).toBe(true);
        expect(passaQuando({ quando: '' })).toBe(true);
        expect(passaQuando({ quando: 'sempre' }, {})).toBe(true);
    });
    it('desconhecida => false (falha fechado)', () => {
        expect(passaQuando({ quando: 'lua_cheia' }, { emCombate: true })).toBe(false);
        expect(passaQuando({ quando: 'alvo_com_estado' }, { alvoEstados: ['surpreso'] })).toBe(false);
    });
    it('em_combate', () => {
        expect(passaQuando({ quando: 'em_combate' }, { emCombate: true })).toBe(true);
        expect(passaQuando({ quando: 'em_combate' }, { emCombate: false })).toBe(false);
        expect(passaQuando({ quando: 'em_combate' })).toBe(false);
        expect(passaQuando({ quando: 'em_combate' }, null)).toBe(false);
    });
    it('empunhando_arma sem tipo: temArma ou armaTipos', () => {
        const e = { quando: 'empunhando_arma' };
        expect(passaQuando(e, { temArma: true })).toBe(true);
        expect(passaQuando(e, { armaTipos: ['espada'] })).toBe(true);
        expect(passaQuando(e, { temArma: false, armaTipos: [] })).toBe(false);
        expect(passaQuando(e, {})).toBe(false);
    });
    it('empunhando_arma:tipo exige o tipo (sem acento/caixa)', () => {
        const e = { quando: 'empunhando_arma:espada' };
        expect(passaQuando(e, { armaTipos: ['espada'] })).toBe(true);
        expect(passaQuando(e, { armaTipos: ['lanca'] })).toBe(false);
        expect(passaQuando(e, { temArma: true })).toBe(false);
        expect(passaQuando({ quando: 'empunhando_arma:Lança' }, { armaTipos: ['lanca'] })).toBe(true);
    });
    it('alvo_com_estado', () => {
        const e = { quando: 'alvo_com_estado:surpreso' };
        expect(passaQuando(e, { alvoEstados: ['surpreso', 'cego'] })).toBe(true);
        expect(passaQuando(e, { alvoEstados: ['cego'] })).toBe(false);
        expect(passaQuando(e, { alvoEstados: [] })).toBe(false);
        expect(passaQuando(e, {})).toBe(false);
    });
    it('alvo_vida_abaixo: estritamente menor; NaN/ausente => false', () => {
        const e = { quando: 'alvo_vida_abaixo:50' };
        expect(passaQuando(e, { alvoVidaPct: 49.9 })).toBe(true);
        expect(passaQuando(e, { alvoVidaPct: 50 })).toBe(false);
        expect(passaQuando(e, { alvoVidaPct: 0 })).toBe(true);
        expect(passaQuando(e, { alvoVidaPct: NaN })).toBe(false);
        expect(passaQuando(e, {})).toBe(false);
    });
});

describe('tiposDeArmasEquipadas', () => {
    it('so armas/artefatos equipados, normalizados', () => {
        const ficha = { inventario: [
            { equipado: true, tipo: 'arma', armaTipo: 'Espada' },
            { equipado: true, tipo: 'artefato', armaTipo: 'Lança' },
            { equipado: false, tipo: 'arma', armaTipo: 'Arco' },
            { equipado: true, tipo: 'armadura', armaTipo: 'Escudo' },
            null,
        ] };
        expect(tiposDeArmasEquipadas(ficha)).toEqual(['espada', 'lanca']);
    });
    it('ficha nula/vazia => []', () => {
        expect(tiposDeArmasEquipadas(null)).toEqual([]);
        expect(tiposDeArmasEquipadas({})).toEqual([]);
    });
});

describe('montarContextoDeCombate', () => {
    it('emCombate depende de ficha.iniciativa > 0', () => {
        expect(montarContextoDeCombate({ iniciativa: 12 }).emCombate).toBe(true);
        expect(montarContextoDeCombate({ iniciativa: 0 }).emCombate).toBe(false);
        expect(montarContextoDeCombate({}).emCombate).toBe(false);
        expect(montarContextoDeCombate(null).emCombate).toBe(false);
    });
    it('temArma e armaTipos pelo inventario', () => {
        const c = montarContextoDeCombate({ inventario: [{ equipado: true, tipo: 'arma', armaTipo: 'Espada' }] });
        expect(c.temArma).toBe(true);
        expect(c.armaTipos).toEqual(['espada']);
        expect(montarContextoDeCombate({ inventario: [{ equipado: false, tipo: 'arma' }] }).temArma).toBe(false);
    });
    it('sem alvo: alvoEstados vazio e vida NaN', () => {
        const c = montarContextoDeCombate({});
        expect(c.alvoEstados).toEqual([]);
        expect(Number.isNaN(c.alvoVidaPct)).toBe(true);
    });
    it('alvo Dummie: estados e vida em %', () => {
        const c = montarContextoDeCombate({}, { hpAtual: 25, hpMax: 100, condicoes: [{ id: 'surpreso', stacks: 1 }] });
        expect(c.alvoEstados).toEqual(['surpreso']);
        expect(c.alvoVidaPct).toBe(25);
    });
    it('alvo personagem: estados vem da ficha dele', () => {
        const c = montarContextoDeCombate({}, { isPersonagem: true, hpAtual: 10, hpMax: 40, ficha: { condicoes: [{ id: 'surpreso', stacks: 1 }] } });
        expect(c.alvoEstados).toEqual(['surpreso']);
        expect(c.alvoVidaPct).toBe(25);
    });
    it('vida: clamp 0..100, hpMax 0 ou invalido => NaN', () => {
        expect(montarContextoDeCombate({}, { hpAtual: 500, hpMax: 100 }).alvoVidaPct).toBe(100);
        expect(montarContextoDeCombate({}, { hpAtual: -5, hpMax: 100 }).alvoVidaPct).toBe(0);
        expect(Number.isNaN(montarContextoDeCombate({}, { hpAtual: 5, hpMax: 0 }).alvoVidaPct)).toBe(true);
        expect(Number.isNaN(montarContextoDeCombate({}, { hpAtual: 'x', hpMax: 10 }).alvoVidaPct)).toBe(true);
    });
    it('estado com id invalido no alvo e ignorado', () => {
        expect(montarContextoDeCombate({}, { condicoes: [{ id: 'xyz', stacks: 1 }] }).alvoEstados).toEqual([]);
    });
    it('alvo nao-objeto e ignorado', () => {
        expect(montarContextoDeCombate({}, 'Fulano').alvoEstados).toEqual([]);
    });
});

describe('normalizarEscopo', () => {
    it('vazio => ""', () => {
        expect(normalizarEscopo(undefined)).toBe('');
        expect(normalizarEscopo(null)).toBe('');
        expect(normalizarEscopo('  ')).toBe('');
    });
    it('ataque, teste, tudo (caixa livre)', () => {
        expect(normalizarEscopo('ataque')).toBe('ataque');
        expect(normalizarEscopo('TESTE')).toBe('teste');
        expect(normalizarEscopo('Tudo')).toBe('tudo');
    });
    it('teste:<id> normaliza sem acento; teste: vazio vira teste', () => {
        expect(normalizarEscopo('teste:Intuição')).toBe('teste:intuicao');
        expect(normalizarEscopo('teste:')).toBe('teste');
    });
    it('invalidos => null', () => {
        expect(normalizarEscopo('defesa')).toBeNull();
        expect(normalizarEscopo('ataque:espada')).toBeNull();
        expect(normalizarEscopo('tudo:x')).toBeNull();
    });
});

describe('escopoPassa', () => {
    const atq = { tipo: 'ataque', ids: [] };
    const tst = { tipo: 'teste', ids: ['furtividade', 'destreza'] };
    it('padrao ataque: sem escopo vale so em ataque', () => {
        expect(escopoPassa({}, atq)).toBe(true);
        expect(escopoPassa({}, tst)).toBe(false);
    });
    it('padrao teste: sem escopo vale em todo teste e nao em ataque', () => {
        expect(escopoPassa({}, tst, 'teste')).toBe(true);
        expect(escopoPassa({}, atq, 'teste')).toBe(false);
    });
    it('escopo do efeito vence o padrao', () => {
        expect(escopoPassa({ escopo: 'tudo' }, atq, 'teste')).toBe(true);
        expect(escopoPassa({ escopo: 'tudo' }, tst, 'ataque')).toBe(true);
        expect(escopoPassa({ escopo: 'ataque' }, tst, 'teste')).toBe(false);
        expect(escopoPassa({ escopo: 'teste' }, atq, 'ataque')).toBe(false);
    });
    it('teste:<id> bate com a pericia ou o atributo, nao com outro', () => {
        expect(escopoPassa({ escopo: 'teste:furtividade' }, tst)).toBe(true);
        expect(escopoPassa({ escopo: 'teste:destreza' }, tst)).toBe(true);
        expect(escopoPassa({ escopo: 'teste:intuicao' }, tst)).toBe(false);
        expect(escopoPassa({ escopo: 'teste:furtividade' }, atq)).toBe(false);
        expect(escopoPassa({ escopo: 'teste:x' }, { tipo: 'teste' })).toBe(false);
    });
    it('rolagem nula/escopo desconhecido => false, exceto tudo', () => {
        expect(escopoPassa({}, null)).toBe(false);
        expect(escopoPassa({ escopo: 'tudo' }, null)).toBe(true);
        expect(escopoPassa({ escopo: 'xyz' }, tst)).toBe(false);
    });
});

describe('valoresDeEfeitos / somarEfeitosBase / menorValorDeEfeitos', () => {
    const ficha = { passivas: [{ efeitos: [
        ef('acerto', 2),
        ef('acerto', '3'),
        ef('acerto', 5, { quando: 'em_combate' }),
        ef('acerto', 7, { quando: 'lua' }),
        { nome: 'x', atributo: 'acerto', propriedade: 'multiplicador', valor: 100 },
        ef('evasiva', 11),
        ef('acerto', 'abc'),
    ] }] };
    it('so propriedade base e o atributo pedido; valor invalido vira 0', () => {
        expect(valoresDeEfeitos(ficha, 'acerto').sort()).toEqual([0, 2, 3]);
    });
    it('somarEfeitosBase sem contexto ignora os com quando', () => {
        expect(somarEfeitosBase(ficha, 'acerto')).toBe(5);
    });
    it('com contexto em combate soma o condicional; desconhecido nunca soma', () => {
        expect(somarEfeitosBase(ficha, 'acerto', { emCombate: true })).toBe(10);
    });
    it('atributo sem efeitos => 0 e ficha nula => 0', () => {
        expect(somarEfeitosBase(ficha, 'iniciativa')).toBe(0);
        expect(somarEfeitosBase(null, 'acerto')).toBe(0);
    });
    it('escopo padrao: vantagem sem escopo so em ataque; piso sem escopo (padrao teste) so em teste', () => {
        const f = { passivas: [{ efeitos: [ef('vantagem', 1), ef('vantagem', 1, { escopo: 'teste' }), ef('piso_d20', 8)] }] };
        const atq = { tipo: 'ataque', ids: [] };
        const tst = { tipo: 'teste', ids: ['x'] };
        expect(valoresDeEfeitos(f, 'vantagem', { rolagem: atq, escopoPadrao: 'ataque' })).toHaveLength(1);
        expect(valoresDeEfeitos(f, 'vantagem', { rolagem: tst, escopoPadrao: 'ataque' })).toHaveLength(1);
        expect(valoresDeEfeitos(f, 'piso_d20', { rolagem: atq, escopoPadrao: 'teste' })).toHaveLength(0);
        expect(valoresDeEfeitos(f, 'piso_d20', { rolagem: tst, escopoPadrao: 'teste' })).toEqual([8]);
    });
    it('menorValorDeEfeitos: menor > 0, ignora zero/negativos, null se nenhum', () => {
        const f = { passivas: [{ efeitos: [ef('margem_critico', 17), ef('margem_critico', 14), ef('margem_critico', 0), ef('margem_critico', -3), ef('margem_critico', 10, { quando: 'em_combate' })] }] };
        expect(menorValorDeEfeitos(f, 'margem_critico')).toBe(14);
        expect(menorValorDeEfeitos(f, 'margem_critico', { emCombate: true })).toBe(10);
        expect(menorValorDeEfeitos(f, 'margem_critico_fatal')).toBeNull();
        expect(menorValorDeEfeitos(null, 'margem_critico')).toBeNull();
    });
});

describe('constantes de opcoes', () => {
    it('OPCOES_QUANDO e OPCOES_ESCOPO tem os ids esperados', () => {
        expect(OPCOES_QUANDO.map(o => o.id)).toEqual(['sempre', 'em_combate', 'empunhando_arma', 'alvo_com_estado', 'alvo_vida_abaixo']);
        expect(OPCOES_ESCOPO.map(o => o.id)).toEqual(['', 'ataque', 'teste', 'teste:', 'tudo']);
    });
});
