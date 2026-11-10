import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    ESTADOS, ehEstadoValido, nomeDoEstado, iconeDoEstado, condicoesDaFicha, estadosEfetivos, modificadoresDeEstados, resumoDosEstados,
    somarEstado, tirarEstado, danoDeEstadosNoTurno, DANO_POR_TURNO, cortesDeCuraDosEstadosNovos
} from './condicoes';
import { ESTADOS_NOVOS, IDS_ESTADOS_NOVOS, definicaoEstadoNovo, descreverEfeitoNovo } from './estadosNovos';
import { aplicarEstadoComDuracao, passarTurnoDosEstados, removerEstadoComDuracao, duracaoDe } from './duracaoEstados';
import { imuneAoEstado } from './efeitosCondicionais';
import { resolverEstadosNoAlvo, normalizarAplicaEstados, coletarEstadosDoGolpe } from './estadosGolpe';
import { normalizarAcaoGatilho } from './gatilhos';
import { calcularCA, calcularAcerto, calcularEficaciaCura } from './engine';
import { restaurarAcoes, criarAcoesIniciais, calcularMaximoAcoes } from './acoes';
import { montarPromptImportacao } from './importadorIA';
import { montarPromptTecnicas } from './importadorTecnicas';
import { DECLARACOES_CRIACAO } from './sextaFeiraCriacao';

const c = (id, stacks = 1, fonte) => ({ id, stacks, ...(fonte ? { fonte } : {}) });
const f = (...cs) => ({ condicoes: cs });
const m = (id, stacks = 1) => modificadoresDeEstados(f(c(id, stacks)));

const NOVOS = ['paralisado', 'atordoado', 'emchoque', 'caido', 'agarrado', 'impedido', 'fraco', 'debilitado', 'adoecido', 'enjoado',
    'sufocado', 'eletrizado', 'intimidado', 'apavorado', 'banido', 'dilacerante', 'dolorido', 'inconsciente', 'cego', 'surdo'];

describe('estados novos - cadastro', () => {
    it('os 20 estados novos existem em ESTADOS, sem repetir id, com nome e icone', () => {
        expect(IDS_ESTADOS_NOVOS).toEqual(NOVOS);
        const ids = ESTADOS.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ESTADOS).toHaveLength(17 + 20);
        NOVOS.forEach((id) => {
            expect(ehEstadoValido(id)).toBe(true);
            expect(nomeDoEstado(id)).not.toBe(id);
            expect(iconeDoEstado(id)).not.toBe('❔');
            expect(definicaoEstadoNovo(id).desc.length).toBeGreaterThan(10);
            expect(/^[a-z]+$/.test(id)).toBe(true);
        });
    });
    it('os 17 estados antigos seguem nas mesmas posicoes e ids (inclusive cegosurdo)', () => {
        expect(ESTADOS.slice(0, 17).map(e => e.id)).toEqual(['sangrando', 'queimado', 'exausto', 'envenenado', 'criogenia', 'lento', 'imobilizado', 'incapacitado',
            'vulneravel', 'amedrontado', 'enlouquecido', 'necrosado', 'cegosurdo', 'petrificado', 'charmado', 'provocado', 'surpreso']);
    });
    it('todo estado novo tem efeito sem erro nos 6 stacks e nada de NaN', () => {
        ESTADOS_NOVOS.forEach((e) => {
            for (let s = 1; s <= 6; s++) {
                const mod = m(e.id, s);
                ['evasivaMult', 'resistenciaMult', 'movimentoMult', 'curaMult', 'custoDefesaMult', 'desvTestes', 'desvAtaque', 'vantagemContraEle'].forEach(k => expect(Number.isFinite(mod[k])).toBe(true));
                expect(descreverEfeitoNovo(e.id, s)).toContain(e.nome);
            }
        });
    });
    it('todo estado novo mexe em alguma conta (nao e so enfeite)', () => {
        const neutro = modificadoresDeEstados({});
        NOVOS.forEach((id) => {
            const mod = m(id, 6);
            const diferente = ['evasivaMult', 'resistenciaMult', 'movimentoMult', 'curaMult', 'custoDefesaMult', 'desvTestes', 'desvAtaque', 'vantagemContraEle'].some(k => mod[k] !== neutro[k])
                || mod.perdeTurno || Object.values(mod.acoesPerdidas).some(v => v > 0) || !!DANO_POR_TURNO[id];
            expect(diferente, id).toBe(true);
        });
    });
    it('ficha sem os novos continua com o neutro de sempre (campos antigos iguais)', () => {
        expect(modificadoresDeEstados({})).toMatchObject({ evasivaMult: 1, resistenciaMult: 1, movimentoMult: 1, curaMult: 1, custoDefesaMult: 1, desvTestes: 0, desvAtaque: 0, vantagemContraEle: 0, perdeTurno: false, acoesPerdidas: { padrao: 0, bonus: 0, reacao: 0 } });
        expect(modificadoresDeEstados(f(c('imobilizado'))).desvPorAtributo).toEqual({ forca: 1, destreza: 1 });
    });
});

describe('estados novos - regras e cadeias', () => {
    it('Paralisado = Imobilizado + perde o turno; 3+ stacks dupla vantagem', () => {
        const a = m('paralisado', 1);
        expect(a).toMatchObject({ imobilizado: true, semMovimento: true, evasivaMult: 0, vantagemContraEle: 1, perdeTurno: true, acoesPerdidas: { padrao: 99, bonus: 99, reacao: 99 } });
        expect(a.desvPorAtributo).toMatchObject({ forca: 1, destreza: 1 });
        expect(m('paralisado', 3).vantagemContraEle).toBe(2);
    });
    it('Atordoado: perde Acao e Reacao (Bonus so com 2+), metade da Evasiva, se move', () => {
        const a = m('atordoado', 1);
        expect(a.acoesPerdidas).toEqual({ padrao: 99, bonus: 0, reacao: 99 });
        expect(m('atordoado', 2).acoesPerdidas.bonus).toBe(99);
        expect(a).toMatchObject({ evasivaMult: 0.5, movimentoMult: 1, vantagemContraEle: 1, desvTestes: 1, incapacitado: false });
    });
    it('Em choque: perde so a Reacao; desvantagens crescem', () => {
        expect(m('emchoque', 1)).toMatchObject({ acoesPerdidas: { padrao: 0, bonus: 0, reacao: 99 }, desvTestes: 1, desvAtaque: 0, evasivaMult: 0.75 });
        expect(m('emchoque', 2).desvAtaque).toBe(1);
        expect(m('emchoque', 4)).toMatchObject({ desvAtaque: 2, acoesPerdidas: { bonus: 99, reacao: 99 } });
    });
    it('Caido: metade do deslocamento, desvantagem de ataque e vantagem contra', () => {
        expect(m('caido')).toMatchObject({ movimentoMult: 0.5, desvAtaque: 1, vantagemContraEle: 1, semMovimento: false, evasivaMult: 1 });
    });
    it('Agarrado: 0 de deslocamento sem zerar Evasiva; 3+ vira Imobilizado', () => {
        expect(m('agarrado', 1)).toMatchObject({ semMovimento: true, movimentoMult: 0, evasivaMult: 0.5, desvAtaque: 1, imobilizado: false, vantagemContraEle: 0 });
        expect(m('agarrado', 1).desvPorAtributo.destreza).toBe(1);
        expect(m('agarrado', 3)).toMatchObject({ imobilizado: true, evasivaMult: 0, vantagemContraEle: 1 });
    });
    it('Impedido: 25% do deslocamento, degrau abaixo do Imobilizado; 4+ vira Imobilizado', () => {
        expect(m('impedido', 3)).toMatchObject({ movimentoMult: 0.25, semMovimento: false, imobilizado: false, evasivaMult: 0.75, desvAtaque: 1 });
        expect(m('impedido', 4)).toMatchObject({ imobilizado: true, movimentoMult: 0 });
    });
    it('Fraco: desvantagem em Forca (2 com 3+) e em ataques com 2+', () => {
        expect(m('fraco', 1).desvPorAtributo.forca).toBe(1);
        expect(m('fraco', 1).desvAtaque).toBe(0);
        expect(m('fraco', 2).desvAtaque).toBe(1);
        expect(m('fraco', 3).desvPorAtributo.forca).toBe(2);
    });
    it('Debilitado: Resistencia cai 15% por stack ate o piso 25%', () => {
        expect(m('debilitado', 1).resistenciaMult).toBeCloseTo(0.85, 10);
        expect(m('debilitado', 2).resistenciaMult).toBeCloseTo(0.7, 10);
        expect(m('debilitado', 6).resistenciaMult).toBe(0.25);
        expect(m('debilitado', 2).desvPorAtributo.constituicao).toBe(1);
        expect(m('debilitado', 1).desvPorAtributo.constituicao).toBeUndefined();
    });
    it('Adoecido: cura x0.75 por stack, 4 stacks soma 1 de Exaustao', () => {
        expect(m('adoecido', 2).curaMult).toBeCloseTo(0.5625, 10);
        expect(m('adoecido', 3).nivelExaustao).toBe(0);
        expect(m('adoecido', 4).nivelExaustao).toBe(1);
        expect(m('adoecido', 4).desvTestes).toBe(2); // 1 por Adoecido 2+ e 1 pela Exaustao 1
    });
    it('Enjoado: perde 1 Acao Bonus com 3+ stacks', () => {
        expect(m('enjoado', 2).acoesPerdidas.bonus).toBe(0);
        expect(m('enjoado', 3).acoesPerdidas.bonus).toBe(1);
        expect(m('enjoado', 3).desvAtaque).toBe(1);
    });
    it('Sufocado: dano por stack, exaustao a cada 2 stacks e soma com Sangrando', () => {
        expect(DANO_POR_TURNO.sufocado).toEqual({ qtd: 4, faces: 4 });
        expect(m('sufocado', 2).nivelExaustao).toBe(1);
        expect(m('sufocado', 6).nivelExaustao).toBe(3);
        const mod = modificadoresDeEstados(f(c('sufocado', 4), c('sangrando', 3), c('exausto', 1)));
        expect(mod.nivelExaustao).toBe(4);
        expect(mod.curaMult).toBeCloseTo(0.5 * 0.5 * 0.5 * 0.5, 10);
    });
    it('Eletrizado: dano por stack, 75% do deslocamento; 6 stacks Imobilizado', () => {
        expect(DANO_POR_TURNO.eletrizado).toEqual({ qtd: 6, faces: 4 });
        expect(m('eletrizado', 2)).toMatchObject({ movimentoMult: 0.75, desvAtaque: 0, imobilizado: false });
        expect(m('eletrizado', 3).desvAtaque).toBe(1);
        expect(m('eletrizado', 6)).toMatchObject({ imobilizado: true, semMovimento: true });
    });
    it('Intimidado e Apavorado: degraus distintos do Amedrontado', () => {
        expect(m('intimidado')).toMatchObject({ desvAtaque: 1, perdeTurno: false });
        expect(m('intimidado').desvPorAtributo.carisma).toBe(1);
        expect(m('apavorado')).toMatchObject({ desvAtaque: 2, desvTestes: 1, perdeTurno: true, semMovimento: false, evasivaMult: 0.75 });
        expect(modificadoresDeEstados(f(c('amedrontado'))).desvAtaque).toBe(0);
    });
    it('Banido: perde o turno, sem deslocamento', () => {
        expect(m('banido')).toMatchObject({ perdeTurno: true, semMovimento: true, movimentoMult: 0 });
        expect(resumoDosEstados(f(c('banido'))).join('\n')).toContain('não pode ser alvo');
    });
    it('Dilacerante: cura x0.75/stack, Resistencia -10%/stack (piso 50%), defesa +5%/stack', () => {
        const mod = m('dilacerante', 2);
        expect(mod.curaMult).toBeCloseTo(0.5625, 10);
        expect(mod.resistenciaMult).toBeCloseTo(0.8, 10);
        expect(mod.custoDefesaMult).toBeCloseTo(1.1, 10);
        expect(m('dilacerante', 6).resistenciaMult).toBe(0.5);
    });
    it('Dolorido: desvantagens, custo de defesa e Reacao com 4+', () => {
        expect(m('dolorido', 1)).toMatchObject({ desvTestes: 1, desvAtaque: 0 });
        expect(m('dolorido', 2).custoDefesaMult).toBeCloseTo(1.2, 10);
        expect(m('dolorido', 4).acoesPerdidas.reacao).toBe(99);
        expect(m('dolorido', 3).acoesPerdidas.reacao).toBe(0);
    });
    it('Inconsciente: puxa Incapacitado inteiro e perde o turno', () => {
        expect(m('inconsciente')).toMatchObject({ incapacitado: true, perdeFormas: true, vantagemContraEle: 2, evasivaMult: 0, semMovimento: true, perdeTurno: true });
        expect(m('inconsciente').desvAtaque).toBe(1);
    });
    it('Cego e Surdo separados; Cego/Surdo antigo fica igual e vale pelos dois', () => {
        expect(m('cego')).toMatchObject({ desvAtaque: 2, desvTestes: 1, vantagemContraEle: 1 });
        expect(m('surdo', 1)).toMatchObject({ desvAtaque: 0, desvTestes: 0, evasivaMult: 1 });
        expect(m('surdo', 1).desvPorAtributo.sabedoria).toBe(1);
        expect(m('surdo', 2).evasivaMult).toBe(0.75);
        expect(m('surdo', 3).desvTestes).toBe(1);
        expect(m('cegosurdo')).toMatchObject({ desvTestes: 1, desvAtaque: 2, vantagemContraEle: 0, cego: true, surdo: true });
        expect(estadosEfetivos(f(c('cego')))).toMatchObject({ cego: true, surdo: false, cegosurdo: false });
        expect(estadosEfetivos(f(c('surdo')))).toMatchObject({ cego: false, surdo: true });
    });
    it('estados novos somam entre si sem estourar (vantagem contra no maximo 2, mults multiplicam)', () => {
        const mod = modificadoresDeEstados(f(c('caido'), c('atordoado'), c('cego')));
        expect(mod.vantagemContraEle).toBe(2);
        expect(mod.evasivaMult).toBe(0.5);
        const lento = modificadoresDeEstados(f(c('lento'), c('impedido')));
        expect(lento.movimentoMult).toBeCloseTo(0.125, 10);
        expect(lento.evasivaMult).toBeCloseTo(0.375, 10);
    });
    it('somar e tirar stacks funciona como nos antigos (limite 6, remocao)', () => {
        let l = somarEstado([], 'adoecido', 2, 'Veneno');
        l = somarEstado(l, 'adoecido', 9);
        expect(l).toEqual([{ id: 'adoecido', stacks: 6, fonte: 'Veneno' }]);
        expect(tirarEstado(l, 'adoecido', 4)[0].stacks).toBe(2);
        expect(tirarEstado(l, 'adoecido')).toEqual([]);
        expect(condicoesDaFicha(f(c('banido', 9)))[0].stacks).toBe(6);
    });
    it('resumo mostra uma linha por estado novo ativo e a fonte do medo', () => {
        const linhas = resumoDosEstados(f(c('paralisado'), c('apavorado', 1, 'Zeus')));
        expect(linhas.some(l => l.includes('Paralisado'))).toBe(true);
        expect(linhas.some(l => l.includes('Apavorado') && l.includes('Zeus'))).toBe(true);
        expect(linhas.some(l => l.includes('Imobilizado'))).toBe(true);
    });
    it('cortes de cura listam so os estados novos que cortam', () => {
        const r = cortesDeCuraDosEstadosNovos(f(c('adoecido', 2), c('dilacerante', 1), c('caido')));
        expect(r.map(x => x.id)).toEqual(['adoecido', 'dilacerante']);
        expect(r[0].mult).toBeCloseTo(0.5625, 10);
    });
});

describe('estados novos - dano no turno', () => {
    it('Eletrizado e Sufocado rolam dados por stack', () => {
        const rolar = vi.fn(() => 2);
        const r = danoDeEstadosNoTurno(f(c('eletrizado', 2), c('sufocado', 1)), rolar);
        expect(r.partes.map(p => p.dado)).toEqual(['12d4', '4d4']);
        expect(r.total).toBe((12 + 4) * 2);
    });
});

describe('estados novos - duracao, remocao e imunidade', () => {
    it('todos aceitam duracao, descem no fim do turno e saem por completo', () => {
        NOVOS.forEach((id) => {
            const ficha = {};
            aplicarEstadoComDuracao(ficha, id, 2, 'x', 2);
            expect(duracaoDe(ficha, id)).toBe(2);
            expect(passarTurnoDosEstados(ficha).expirados).toEqual([]);
            expect(duracaoDe(ficha, id)).toBe(1);
            const r = passarTurnoDosEstados(ficha);
            expect(r.expirados).toEqual([id]);
            expect(condicoesDaFicha(ficha)).toEqual([]);
            expect(r.textos[0]).toContain(nomeDoEstado(id));
        });
    });
    it('remover estado tira stacks e duracao', () => {
        const ficha = {};
        aplicarEstadoComDuracao(ficha, 'paralisado', 3, '', 5);
        expect(removerEstadoComDuracao(ficha, 'paralisado')).toBe(true);
        expect(ficha.condicoes).toBeUndefined();
        expect(ficha.duracaoEstados).toBeUndefined();
    });
    it('imune_estado vale para cada novo e o golpe nem aplica', () => {
        NOVOS.forEach((id) => {
            const imune = { poderes: [{ id: 'p', nome: 'P', ativa: true, efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: id }] }] };
            expect(imuneAoEstado(imune, id)).toBe(true);
            expect(imuneAoEstado(imune, 'lento')).toBe(false);
            const r = resolverEstadosNoAlvo([{ id, stacks: 1 }], imune);
            expect(r.aplicados).toEqual([]);
            expect(r.imunes.map(x => x.id)).toEqual([id]);
        });
    });
    it("escopo 'todos' cobre os novos", () => {
        const f2 = { poderes: [{ id: 'p', nome: 'P', ativa: true, efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'todos' }] }] };
        NOVOS.forEach(id => expect(imuneAoEstado(f2, id)).toBe(true));
    });
});

describe('estados novos - golpes e gatilhos', () => {
    it('aplicaEstados do golpe aceita os novos com stacks e duracao', () => {
        const lista = normalizarAplicaEstados(NOVOS.slice(0, 8).map(id => ({ id, stacks: 3, duracao: 2 })));
        expect(lista).toHaveLength(8);
        const r = resolverEstadosNoAlvo(coletarEstadosDoGolpe({ fontes: [{ nome: 'Raio', aplicaEstados: [{ id: 'paralisado', stacks: 1, duracao: '1d4+1' }, { id: 'eletrizado', stacks: 2 }] }] }), null, { rng: () => 0 });
        expect(r.aplicados.map(a => a.id)).toEqual(['paralisado', 'eletrizado']);
        expect(r.aplicados[0].duracao).toBe(2);
        expect(r.aplicados[1].duracao).toBeUndefined();
    });
    it('gatilhos aplicarEstado e removerEstado aceitam os novos', () => {
        NOVOS.forEach((id) => {
            expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: id, stacks: 2, duracao: 3 })).toMatchObject({ tipo: 'aplicarEstado', estado: id, stacks: 2, duracao: 3 });
            expect(normalizarAcaoGatilho({ tipo: 'removerEstado', estado: id })).toEqual({ tipo: 'removerEstado', estado: id });
        });
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'inexistente' })).toBeNull();
    });
});

describe('estados novos - consumidores (Acerto, Defesa, Cura)', () => {
    const base = (cond) => ({ forca: { base: 1000000, nome: 'Força' }, destreza: { base: 1000000, nome: 'Destreza' }, mana: { base: 1000000, atual: 1000000 }, ...(cond ? { condicoes: cond } : {}) });
    const acerto = (ficha) => calcularAcerto({ qD: 1, fD: 20, prof: 0, usarProf: false, bonus: 0, sels: ['destreza'], minhaFicha: ficha, itensEquipados: [], vantagens: 0, desvantagens: 0, alvo: null });
    afterEach(() => vi.restoreAllMocks());

    it('Acerto: Cego rola 3 d20 (2 desvantagens) e Caido 2 d20', () => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        acerto(base([c('cego')]));
        expect(spy).toHaveBeenCalledTimes(3);
        spy.mockClear();
        acerto(base([c('caido')]));
        expect(spy).toHaveBeenCalledTimes(2);
        spy.mockClear();
        acerto(base([c('surdo')]));
        expect(spy).toHaveBeenCalledTimes(1);
    });
    it('Acerto: Apavorado soma 2 desvantagens e o jogador cancela uma com vantagem', () => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        acerto(base([c('apavorado')]));
        expect(spy).toHaveBeenCalledTimes(3);
    });
    it('Defesa: Evasiva e Resistencia seguem os multiplicadores dos novos', () => {
        const ev = calcularCA(base(), 'evasiva');
        const res = calcularCA(base(), 'resistencia');
        expect(calcularCA(base([c('atordoado')]), 'evasiva')).toBe(Math.floor(ev * 0.5));
        expect(calcularCA(base([c('emchoque')]), 'evasiva')).toBe(Math.floor(ev * 0.75));
        expect(calcularCA(base([c('agarrado')]), 'evasiva')).toBe(Math.floor(ev * 0.5));
        expect(calcularCA(base([c('paralisado')]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('inconsciente')]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('debilitado', 2)]), 'resistencia')).toBe(Math.floor(res * 0.7));
        expect(calcularCA(base([c('dilacerante', 1)]), 'evasiva')).toBe(ev);
        expect(calcularCA(base([c('caido')]), 'evasiva')).toBe(ev);
    });
    it('Cura: Adoecido e Dilacerante cortam a Eficacia de Cura', () => {
        expect(calcularEficaciaCura(base([c('adoecido', 1)]))).toBeCloseTo(0.75, 10);
        expect(calcularEficaciaCura(base([c('adoecido', 1), c('dilacerante', 1)]))).toBeCloseTo(0.5625, 10);
    });
});

describe('estados novos - acoes do turno', () => {
    const fichaCom = (...cs) => ({ acoes: criarAcoesIniciais(), condicoes: cs });
    it('restaurarAcoes sem comEstados devolve tudo (descanso manual nao muda)', () => {
        const ficha = fichaCom(c('paralisado'));
        ficha.acoes.padrao.atual = 0;
        restaurarAcoes(ficha);
        expect(ficha.acoes.padrao.atual).toBe(2);
    });
    it('Paralisado/Inconsciente/Apavorado/Banido tiram tudo no turno', () => {
        ['paralisado', 'inconsciente', 'apavorado', 'banido'].forEach((id) => {
            const ficha = fichaCom(c(id));
            restaurarAcoes(ficha, { comEstados: true });
            expect(['padrao', 'bonus', 'reacao'].map(t => ficha.acoes[t].atual), id).toEqual([0, 0, 0]);
        });
    });
    it('Atordoado tira Acao e Reacao; Enjoado 3 tira 1 Bonus; Em choque tira a Reacao', () => {
        const a = fichaCom(c('atordoado')); restaurarAcoes(a, { comEstados: true });
        expect(['padrao', 'bonus', 'reacao'].map(t => a.acoes[t].atual)).toEqual([0, 2, 0]);
        const e = fichaCom(c('enjoado', 3)); restaurarAcoes(e, { comEstados: true });
        expect(['padrao', 'bonus', 'reacao'].map(t => e.acoes[t].atual)).toEqual([2, 1, 2]);
        const ch = fichaCom(c('emchoque')); restaurarAcoes(ch, { comEstados: true });
        expect(['padrao', 'bonus', 'reacao'].map(t => ch.acoes[t].atual)).toEqual([2, 2, 0]);
    });
    it('sem estados de acao nada muda, e o maximo calculado nao e tocado', () => {
        const ficha = fichaCom(c('caido'), c('lento'));
        restaurarAcoes(ficha, { comEstados: true });
        expect(['padrao', 'bonus', 'reacao'].map(t => ficha.acoes[t].atual)).toEqual([2, 2, 2]);
        expect(calcularMaximoAcoes(fichaCom(c('paralisado')))).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
    });
});

describe('estados novos - prompts e declaracoes (fonte unica ESTADOS)', () => {
    it('importador de habilidades, de tecnicas e a Sexta-Feira listam os 37 ids', () => {
        const pI = montarPromptImportacao('texto');
        const pT = montarPromptTecnicas('texto', [], 'Fogo');
        const decl = JSON.stringify(DECLARACOES_CRIACAO);
        ESTADOS.forEach((e) => {
            expect(pI).toContain(e.id);
            expect(pT).toContain(e.id);
            expect(decl).toContain(`"${e.id}"`);
        });
        NOVOS.forEach(id => expect(pI).toContain(id));
    });
});
