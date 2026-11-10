import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    ESTADOS, MAX_STACKS, CUSTO_DEFESA_POR_STACK, ehEstadoValido, condicoesDaFicha, stacksDe, estadosEfetivos, modificadoresDeEstados,
    resumoDosEstados, somarEstado, tirarEstado, danoDeEstadosNoTurno, DANO_POR_TURNO, cortesDeCuraDosEstadosNovos
} from './condicoes';
import { ESTADOS_NOVOS, IDS_ESTADOS_NOVOS, somarEfeitosNovos, descreverEfeitoNovo, definicaoEstadoNovo } from './estadosNovos';
import { aplicarEstadoComDuracao, passarTurnoDosEstados, removerEstadoComDuracao, duracaoDe } from './duracaoEstados';
import { imuneAoEstado } from './efeitosCondicionais';
import { resolverEstadosNoAlvo, normalizarAplicaEstados, coletarEstadosDoGolpe, juntarAplicados } from './estadosGolpe';
import { normalizarAcaoGatilho } from './gatilhos';
import { aplicarAcoesNoRascunho } from './gatilhosAplicar';
import { lerGatilhosDaIA } from './gatilhosImportacao';
import { calcularCA, calcularEficaciaCura } from './engine';
import { restaurarAcoes, criarAcoesIniciais } from './acoes';
import { montarPromptImportacao } from './importadorIA';
import { normalizarPoder } from './sextaFeiraCriacao';
import { detalharRegeneracaoVital } from './regeneracaoFontes';
import { condicoesComEstados } from '../services/posGolpe';
import { aplicarInicioDeTurno, aplicarDanoDeEstadosNoTurno } from '../components/mapa/MapaFormContext';

vi.mock('../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(), salvarCenarioCompleto: vi.fn(), zerarIniciativaGlobal: vi.fn()
}));

const NOVOS = IDS_ESTADOS_NOVOS;
const ANTIGOS = ESTADOS.slice(0, 17).map(e => e.id);
const c = (id, stacks = 1) => ({ id, stacks });
const f = (...cs) => ({ condicoes: cs });
const mod = (id, s) => modificadoresDeEstados(f(c(id, s)));
const CAMPOS_NUM = ['evasivaMult', 'resistenciaMult', 'movimentoMult', 'curaMult', 'custoDefesaMult', 'desvTestes', 'desvAtaque', 'vantagemContraEle', 'nivelExaustao'];
const aqui = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// Oraculo: as contas ANTIGAS de modificadoresDeEstados (copiadas do codigo antes dos estados novos).
// ---------------------------------------------------------------------------------------------
function modificadoresAntigos(ficha) {
    const s = (id) => stacksDe(ficha, id);
    const nivelExaustao = Math.min(MAX_STACKS, s('exausto') + Math.floor(s('sangrando') / 3));
    const pet = s('petrificado');
    const petrificadoTotal = pet >= 4;
    const imobilizado = s('imobilizado') > 0 || nivelExaustao >= 5 || s('criogenia') >= 6 || pet >= 3;
    const incapacitado = s('incapacitado') > 0 || nivelExaustao >= 6 || petrificadoTotal;
    const lento = s('lento') > 0 || nivelExaustao >= 2 || s('criogenia') >= 3 || pet >= 1;
    const vulneravel = s('vulneravel') > 0 || s('queimado') >= 4 || pet >= 2;
    const cegosurdo = s('cegosurdo') > 0;
    const imovel = imobilizado || incapacitado;
    let cura = 1;
    ['sangrando', 'queimado', 'criogenia'].forEach((id) => { for (let i = 0; i < s(id); i++) cura *= 0.5; });
    if (nivelExaustao >= 4) cura *= 0.5;
    return {
        nivelExaustao, lento, imobilizado, incapacitado, vulneravel, petrificado: petrificadoTotal, cegosurdo,
        semMovimento: imovel,
        movimentoMult: imovel ? 0 : (lento ? 0.5 : 1),
        evasivaMult: imovel ? 0 : (lento ? 0.5 : 1),
        resistenciaMult: vulneravel ? 0.5 : 1,
        curaMult: cura,
        custoDefesaMult: 1 + CUSTO_DEFESA_POR_STACK * (s('queimado') + s('sangrando')),
        desvTestes: (nivelExaustao >= 1 ? 1 : 0) + (cegosurdo ? 1 : 0),
        desvAtaque: (nivelExaustao >= 3 ? 1 : 0) + (cegosurdo ? 2 : 0) + (incapacitado ? 1 : 0),
        desvPorAtributo: { forca: (imobilizado ? 1 : 0) + (vulneravel ? 1 : 0), destreza: (imobilizado ? 1 : 0) + (lento ? 1 : 0) },
        vantagemContraEle: incapacitado ? 2 : (imobilizado ? 1 : 0),
        perdeFormas: incapacitado
    };
}
const igualAoAntigo = (ficha, rotulo) => {
    const novo = modificadoresDeEstados(ficha);
    const velho = modificadoresAntigos(ficha);
    Object.keys(velho).forEach((k) => {
        if (typeof velho[k] === 'number') expect(novo[k], `${rotulo} ${k}`).toBeCloseTo(velho[k], 12);
        else expect(novo[k], `${rotulo} ${k}`).toEqual(velho[k]);
    });
    expect(novo.perdeTurno, rotulo).toBe(false);
    expect(novo.acoesPerdidas, rotulo).toEqual({ padrao: 0, bonus: 0, reacao: 0 });
};

describe('QA regressao - 17 estados antigos com numeros identicos', () => {
    it('cada antigo sozinho, stacks 0..6 (e lixo), bate com a conta antiga', () => {
        ANTIGOS.forEach((id) => {
            [0, 1, 2, 3, 4, 5, 6, 99, -1, NaN, '3', 2.9, null, undefined].forEach(s => igualAoAntigo(f(c(id, s)), `${id}/${String(s)}`));
        });
    });
    it('todos os pares de antigos (stacks 1, 3, 6) batem com a conta antiga', () => {
        for (let i = 0; i < ANTIGOS.length; i++) {
            for (let j = i + 1; j < ANTIGOS.length; j++) {
                [1, 3, 6].forEach(a => [1, 3, 6].forEach(b => igualAoAntigo(f(c(ANTIGOS[i], a), c(ANTIGOS[j], b)), `${ANTIGOS[i]}${a}+${ANTIGOS[j]}${b}`)));
            }
        }
    });
    it('todos os 17 antigos no maximo juntos batem com a conta antiga', () => {
        igualAoAntigo(f(...ANTIGOS.map(id => c(id, 6))), 'todos6');
        igualAoAntigo(f(...ANTIGOS.map(id => c(id, 1))), 'todos1');
    });
    it('cegosurdo: 1 desv testes, 2 desv ataque, sem vantagem contra, evasiva/mov intactos, cego+surdo true', () => {
        const m = mod('cegosurdo', 1);
        expect(m).toMatchObject({ desvTestes: 1, desvAtaque: 2, vantagemContraEle: 0, evasivaMult: 1, movimentoMult: 1, resistenciaMult: 1, curaMult: 1, cego: true, surdo: true, cegosurdo: true });
        expect(m.desvPorAtributo).toEqual({ forca: 0, destreza: 0 });
        // stacks nao escalam o cegosurdo
        expect(mod('cegosurdo', 6)).toMatchObject({ desvTestes: 1, desvAtaque: 2 });
    });
    it('cegosurdo + cego novo: soma (cego novo e um estado a parte), vantagem contra so do cego novo', () => {
        const m = modificadoresDeEstados(f(c('cegosurdo'), c('cego')));
        expect(m.desvAtaque).toBe(4);
        expect(m.desvTestes).toBe(2);
        expect(m.vantagemContraEle).toBe(1);
    });
    it('ficha vazia/nula/sem condicoes devolve neutro sem lancar', () => {
        [undefined, null, {}, { condicoes: null }, { condicoes: 'x' }, { condicoes: [null, 7, 'a', {}] }].forEach((fi) => {
            const m = modificadoresDeEstados(fi);
            expect(m).toMatchObject({ evasivaMult: 1, resistenciaMult: 1, movimentoMult: 1, curaMult: 1, custoDefesaMult: 1, desvTestes: 0, desvAtaque: 0, vantagemContraEle: 0, perdeTurno: false });
        });
    });
});

describe('QA bordas - cada um dos 20 estados novos x stacks 0/1/3/6/lixo', () => {
    const neutro = modificadoresDeEstados({});
    it('stacks 0, negativo, NaN, nulo, texto: estado ignorado (neutro, sem acoes perdidas)', () => {
        NOVOS.forEach((id) => {
            [0, -1, -99, NaN, null, 'abc', {}, [], Infinity * 0].forEach((s) => {
                const m = mod(id, s);
                CAMPOS_NUM.forEach(k => expect(m[k], `${id}/${String(s)}/${k}`).toBe(neutro[k]));
                expect(m.perdeTurno, id).toBe(false);
                expect(m.acoesPerdidas, id).toEqual({ padrao: 0, bonus: 0, reacao: 0 });
                expect(condicoesDaFicha(f(c(id, s)))).toEqual([]);
                expect(danoDeEstadosNoTurno(f(c(id, s)), () => 1).total).toBe(0);
            });
        });
    });
    it('stacks 99 e Infinity viram 6 (identico a 6); 2.9 vira 2; "3" vira 3', () => {
        NOVOS.forEach((id) => {
            expect(mod(id, 99)).toEqual(mod(id, 6));
            expect(mod(id, Infinity)).toEqual(mod(id, 6));
            expect(mod(id, 2.9)).toEqual(mod(id, 2));
            expect(mod(id, '3')).toEqual(mod(id, 3));
            expect(stacksDe(f(c(id, 99)), id)).toBe(6);
        });
    });
    it('stacks 1/3/6 sao finitos, nao negativos e dentro dos limites; resumo cita o nome', () => {
        ESTADOS_NOVOS.forEach((e) => {
            [1, 3, 6].forEach((s) => {
                const m = mod(e.id, s);
                CAMPOS_NUM.forEach(k => { expect(Number.isFinite(m[k]), `${e.id}/${s}/${k}`).toBe(true); expect(m[k]).toBeGreaterThanOrEqual(0); });
                expect(m.vantagemContraEle).toBeLessThanOrEqual(2);
                expect(m.nivelExaustao).toBeLessThanOrEqual(6);
                Object.values(m.desvPorAtributo).forEach(v => expect(Number.isFinite(v) && v >= 0).toBe(true));
                ['padrao', 'bonus', 'reacao'].forEach(t => expect(m.acoesPerdidas[t]).toBeGreaterThanOrEqual(0));
                expect(resumoDosEstados(f(c(e.id, s))).join('\n')).toContain(e.nome);
            });
        });
    });
    it('efeito() de cada novo e puro e monotono nos stacks (desvantagens e perdas nao diminuem; mults nao sobem)', () => {
        ESTADOS_NOVOS.forEach((e) => {
            let ant = null;
            for (let s = 1; s <= 6; s++) {
                const m = mod(e.id, s);
                expect(e.efeito(s)).toEqual(e.efeito(s));
                if (ant) {
                    ['desvTestes', 'desvAtaque', 'nivelExaustao', 'vantagemContraEle', 'custoDefesaMult'].forEach(k => expect(m[k], `${e.id} ${k} ${s}`).toBeGreaterThanOrEqual(ant[k]));
                    ['evasivaMult', 'resistenciaMult', 'movimentoMult', 'curaMult'].forEach(k => expect(m[k], `${e.id} ${k} ${s}`).toBeLessThanOrEqual(ant[k] + 1e-12));
                    ['padrao', 'bonus', 'reacao'].forEach(t => expect(m.acoesPerdidas[t]).toBeGreaterThanOrEqual(ant.acoesPerdidas[t]));
                }
                ant = m;
            }
        });
    });
    it('descreverEfeitoNovo com id inexistente/stacks lixo nao lanca', () => {
        expect(descreverEfeitoNovo('zzz', 3)).toBe('');
        expect(definicaoEstadoNovo('zzz')).toBeNull();
        expect(definicaoEstadoNovo('sangrando')).toBeNull();
        NOVOS.forEach(id => expect(() => descreverEfeitoNovo(id, NaN)).not.toThrow());
        expect(somarEfeitosNovos(undefined).evasiva).toBe(1);
        expect(somarEfeitosNovos([null && 1, { id: 'zzz', stacks: 2 }].filter(Boolean)).mov).toBe(1);
    });
    it('valores exatos por stack: debilitado, adoecido, dilacerante, sufocado, eletrizado, dolorido', () => {
        [1, 2, 3, 4, 5, 6].forEach((s) => {
            expect(mod('debilitado', s).resistenciaMult).toBeCloseTo(Math.max(0.25, 1 - 0.15 * s), 12);
            expect(mod('adoecido', s).curaMult).toBeCloseTo(Math.pow(0.75, s) * (Math.floor(s / 4) >= 4 ? 0.5 : 1), 12);
            expect(mod('dilacerante', s).resistenciaMult).toBeCloseTo(Math.max(0.5, 1 - 0.1 * s), 12);
            expect(mod('dilacerante', s).custoDefesaMult).toBeCloseTo(1 + 0.05 * s, 12);
            expect(mod('dolorido', s).custoDefesaMult).toBeCloseTo(1 + 0.1 * s, 12);
            expect(mod('sufocado', s).nivelExaustao).toBe(Math.floor(s / 2));
            expect(mod('adoecido', s).nivelExaustao).toBe(Math.floor(s / 4));
        });
        expect(mod('debilitado', 6).resistenciaMult).toBe(0.25);
        expect(mod('dilacerante', 6).resistenciaMult).toBe(0.5);
    });
});

describe('QA combinacoes - multiplicadores, teto 2, pisos', () => {
    it('todos os 20 novos em 6 stacks: nada de NaN/negativo, vantagem contra <= 2, exaustao <= 6', () => {
        const m = modificadoresDeEstados(f(...NOVOS.map(id => c(id, 6))));
        CAMPOS_NUM.forEach(k => { expect(Number.isFinite(m[k]), k).toBe(true); expect(m[k]).toBeGreaterThanOrEqual(0); });
        expect(m.vantagemContraEle).toBe(2);
        expect(m.nivelExaustao).toBe(4); // sufocado 6 (3) + adoecido 6 (1)
        expect(m.incapacitado).toBe(true); // por inconsciente
        expect(m.perdeTurno).toBe(true);
        expect(m.acoesPerdidas).toEqual({ padrao: 99, bonus: 99, reacao: 99 });
        expect(m.evasivaMult).toBe(0);
        expect(m.movimentoMult).toBe(0);
    });
    it('todos os 37 em 6 stacks continuam finitos', () => {
        const m = modificadoresDeEstados(f(...ESTADOS.map(e => c(e.id, 6))));
        CAMPOS_NUM.forEach(k => expect(Number.isFinite(m[k]), k).toBe(true));
        expect(m.vantagemContraEle).toBe(2);
    });
    it('teto 2 de vantagem contra: caido+cego+atordoado = 2 (nao 3); incapacitado antigo + caido = 2', () => {
        expect(modificadoresDeEstados(f(c('caido'), c('cego'), c('atordoado'))).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('incapacitado'), c('caido'))).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('incapacitado'), c('caido'), c('cego'), c('atordoado'), c('paralisado', 6))).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('imobilizado'), c('caido'))).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('imobilizado'), c('caido'), c('cego'))).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('caido'), c('cego'))).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('caido'))).vantagemContraEle).toBe(1);
    });
    it('paralisado 3+ (imobilizado=1 + 1) = 2 e nao passa de 2 com cego', () => {
        expect(mod('paralisado', 3).vantagemContraEle).toBe(2);
        expect(modificadoresDeEstados(f(c('paralisado', 6), c('cego'))).vantagemContraEle).toBe(2);
    });
    it('multiplicadores se multiplicam: evasiva, movimento e cura', () => {
        const m = modificadoresDeEstados(f(c('atordoado'), c('emchoque'), c('surdo', 2)));
        expect(m.evasivaMult).toBeCloseTo(0.5 * 0.75 * 0.75, 12);
        const mv = modificadoresDeEstados(f(c('caido'), c('impedido'), c('eletrizado')));
        expect(mv.movimentoMult).toBeCloseTo(0.5 * 0.25 * 0.75, 12);
        const cura = modificadoresDeEstados(f(c('adoecido', 2), c('dilacerante', 2), c('sangrando', 1)));
        expect(cura.curaMult).toBeCloseTo(0.5625 * 0.5625 * 0.5, 12);
    });
    it('Lento antigo + movimento novo multiplica; Lento + Caido nao zera', () => {
        const m = modificadoresDeEstados(f(c('lento'), c('caido')));
        expect(m.movimentoMult).toBe(0.25);
        expect(m.evasivaMult).toBe(0.5);
    });
    it('pisos de Resistencia: debilitado 0.25, dilacerante 0.5, juntos 0.125, com vulneravel 0.0625; nunca zera', () => {
        const j = modificadoresDeEstados(f(c('debilitado', 6), c('dilacerante', 6)));
        expect(j.resistenciaMult).toBeCloseTo(0.125, 12);
        expect(modificadoresDeEstados(f(c('debilitado', 6), c('dilacerante', 6), c('vulneravel'))).resistenciaMult).toBeCloseTo(0.0625, 12);
        expect(modificadoresDeEstados(f(c('debilitado', 6), c('dilacerante', 6), c('queimado', 6))).resistenciaMult).toBeGreaterThan(0);
    });
    it('desvantagens somam entre estados novos e antigos', () => {
        const m = modificadoresDeEstados(f(c('cego'), c('cegosurdo'), c('apavorado'), c('exausto', 3)));
        expect(m.desvAtaque).toBe(2 + 2 + 2 + 1);
        expect(m.desvTestes).toBe(1 + 1 + 1 + 1);
    });
    it('desvantagem por atributo: forca de fraco soma com imobilizado/vulneravel; atributos novos so aparecem quando ha algo', () => {
        const m = modificadoresDeEstados(f(c('fraco', 3), c('debilitado', 2), c('vulneravel'), c('imobilizado')));
        expect(m.desvPorAtributo.forca).toBe(2 + 1 + 1 + 1);
        expect(m.desvPorAtributo.constituicao).toBe(1);
        expect(mod('caido', 1).desvPorAtributo).toEqual({ forca: 0, destreza: 0 });
        expect(modificadoresDeEstados(f(c('adoecido', 1), c('sufocado', 1))).desvPorAtributo.constituicao).toBe(2);
        expect(mod('intimidado', 3).desvPorAtributo).toMatchObject({ carisma: 1, sabedoria: 1 });
        expect(mod('intimidado', 2).desvPorAtributo.sabedoria).toBeUndefined();
    });
    it('perda de acoes combina por MAXIMO (nao soma): enjoado3 (1 bonus) + atordoado2 (99 bonus) = 99; enjoado + enjoado nao existe duplicado', () => {
        expect(modificadoresDeEstados(f(c('enjoado', 3), c('atordoado', 2))).acoesPerdidas).toEqual({ padrao: 99, bonus: 99, reacao: 99 });
        expect(modificadoresDeEstados(f(c('enjoado', 3), c('dolorido', 4))).acoesPerdidas).toEqual({ padrao: 0, bonus: 1, reacao: 99 });
        expect(modificadoresDeEstados(f(c('enjoado', 3))).perdeTurno).toBe(false);
    });
    it('semMov (agarrado/banido) zera movimento mas Banido/Agarrado 1 nao zera a Evasiva por si', () => {
        expect(mod('banido', 1).evasivaMult).toBe(1);
        expect(mod('agarrado', 1).evasivaMult).toBe(0.5);
        expect(modificadoresDeEstados(f(c('agarrado'), c('caido'))).movimentoMult).toBe(0);
    });
    it('nao muta a ficha recebida nem a lista de condicoes', () => {
        const ficha = f(c('adoecido', 9), c('cego', 2), c('zzz', 1));
        const copia = JSON.parse(JSON.stringify(ficha));
        modificadoresDeEstados(ficha); resumoDosEstados(ficha); estadosEfetivos(ficha); danoDeEstadosNoTurno(ficha, () => 1); cortesDeCuraDosEstadosNovos(ficha);
        expect(ficha).toEqual(copia);
    });
});

describe('QA cadeias - Imobilizado e Exaustao sem laco', () => {
    it('agarrado so imobiliza com 3+, impedido com 4+, eletrizado com 6, paralisado sempre', () => {
        [[ 'agarrado', 3 ], [ 'impedido', 4 ], [ 'eletrizado', 6 ], [ 'paralisado', 1 ]].forEach(([id, lim]) => {
            for (let s = 1; s <= 6; s++) expect(estadosEfetivos(f(c(id, s))).imobilizado, `${id}${s}`).toBe(s >= lim);
        });
    });
    it('inconsciente = incapacitado (e por consequencia imobilizado/lento? nao puxa lento), sem nivel de exaustao', () => {
        const e = estadosEfetivos(f(c('inconsciente')));
        expect(e).toMatchObject({ incapacitado: true, nivelExaustao: 0 });
        expect(e.lento).toBe(false);
        expect(e.imobilizado).toBe(false);
        const m = mod('inconsciente', 1);
        expect(m.vantagemContraEle).toBe(2);
    });
    it('exaustao: sufocado 4 = nivel 2 (lento); sufocado 6 + sangrando 6 = 5 (imobilizado, nao incapacitado); + exausto 1 = 6 incapacitado', () => {
        expect(estadosEfetivos(f(c('sufocado', 4)))).toMatchObject({ nivelExaustao: 2, lento: true, imobilizado: false });
        expect(estadosEfetivos(f(c('sufocado', 6), c('sangrando', 6)))).toMatchObject({ nivelExaustao: 5, imobilizado: true, incapacitado: false });
        expect(estadosEfetivos(f(c('sufocado', 6), c('sangrando', 6), c('exausto', 1)))).toMatchObject({ nivelExaustao: 6, incapacitado: true });
    });
    it('exaustao total e travada em 6 mesmo somando tudo', () => {
        expect(estadosEfetivos(f(c('exausto', 6), c('sufocado', 6), c('adoecido', 6), c('sangrando', 6))).nivelExaustao).toBe(6);
    });
    it('exaustao vinda de novos aciona as mesmas consequencias antigas (cura x0.5 com 4+, desv testes 1, ataque 3+)', () => {
        const m = modificadoresDeEstados(f(c('sufocado', 6), c('adoecido', 4))); // 3 + 1 = 4
        expect(m.nivelExaustao).toBe(4);
        expect(m.curaMult).toBeCloseTo(0.5 * Math.pow(0.75, 4), 12);
        expect(m.desvAtaque).toBe(1);
        expect(m.lento).toBe(true);
    });
    it('cadeia nao se auto-alimenta: avaliar duas vezes da o mesmo resultado (sem laco)', () => {
        const ficha = f(...NOVOS.map(id => c(id, 6)));
        expect(modificadoresDeEstados(ficha)).toEqual(modificadoresDeEstados(ficha));
        expect(estadosEfetivos(ficha)).toEqual(estadosEfetivos(ficha));
    });
    it('vulneravel via implica (nenhum novo usa hoje, mas lento/imobilizado antigos continuam por exaustao)', () => {
        expect(estadosEfetivos(f(c('exausto', 2))).lento).toBe(true);
        expect(estadosEfetivos(f(c('exausto', 5))).imobilizado).toBe(true);
        expect(estadosEfetivos(f(c('exausto', 6))).incapacitado).toBe(true);
    });
});

describe('QA dano por stack - eletrizado e sufocado', () => {
    it('dado e total por stack 1..6 (rolar sempre 1 = qtd de dados; sempre faces = maximo)', () => {
        for (let s = 1; s <= 6; s++) {
            const e1 = danoDeEstadosNoTurno(f(c('eletrizado', s)), () => 1);
            expect(e1.partes[0]).toMatchObject({ id: 'eletrizado', stacks: s, dado: `${6 * s}d4`, dano: 6 * s });
            const e4 = danoDeEstadosNoTurno(f(c('eletrizado', s)), (faces) => faces);
            expect(e4.total).toBe(6 * s * 4);
            const s1 = danoDeEstadosNoTurno(f(c('sufocado', s)), () => 1);
            expect(s1.partes[0]).toMatchObject({ id: 'sufocado', dado: `${4 * s}d4`, dano: 4 * s });
        }
    });
    it('rolar e chamado exatamente qtd*stacks vezes com 4 faces; stacks 99 vira 6', () => {
        const r = vi.fn(() => 2);
        danoDeEstadosNoTurno(f(c('eletrizado', 99)), r);
        expect(r).toHaveBeenCalledTimes(36);
        r.mockClear();
        danoDeEstadosNoTurno(f(c('sufocado', 99)), r);
        expect(r).toHaveBeenCalledTimes(24);
        expect(r.mock.calls.every(a => a[0] === 4)).toBe(true);
    });
    it('somente eletrizado e sufocado causam dano; os outros 18 novos e os 12 antigos sem dano nao', () => {
        const comDano = Object.keys(DANO_POR_TURNO);
        expect(NOVOS.filter(id => comDano.includes(id)).sort()).toEqual(['eletrizado', 'sufocado']);
        expect(comDano).toEqual(expect.arrayContaining(['sangrando', 'queimado', 'criogenia', 'envenenado', 'necrosado']));
        NOVOS.filter(id => !['eletrizado', 'sufocado'].includes(id)).forEach(id => expect(danoDeEstadosNoTurno(f(c(id, 6)), () => 4).total).toBe(0));
    });
    it('dano dos antigos inalterado (5d4/8d4 por stack)', () => {
        expect(DANO_POR_TURNO.sangrando).toEqual({ qtd: 5, faces: 4 });
        expect(DANO_POR_TURNO.necrosado).toEqual({ qtd: 8, faces: 4 });
        expect(danoDeEstadosNoTurno(f(c('queimado', 2)), () => 1).partes[0].dado).toBe(`${DANO_POR_TURNO.queimado.qtd * 2}d4`);
        expect(DANO_POR_TURNO.queimado.qtd).toBe(8);
    });
    it('aplicarDanoDeEstadosNoTurno: dummie perde hp, ficha perde vida; paralisado sozinho nao causa dano e devolve texto vazio', () => {
        const d = { hpAtual: 1e9, condicoes: [c('sufocado', 2)] };
        expect(aplicarDanoDeEstadosNoTurno(d, true, 'X')).toContain('Sufocado');
        expect(d.hpAtual).toBeLessThan(1e9);
        const p = { hpAtual: 1e9, condicoes: [c('paralisado', 6)] };
        expect(aplicarDanoDeEstadosNoTurno(p, true, 'X')).toBe('');
        expect(p.hpAtual).toBe(1e9);
    });
    it('dummie com 1 de hp nao fica negativo', () => {
        const d = { hpAtual: 1, condicoes: [c('eletrizado', 6)] };
        aplicarDanoDeEstadosNoTurno(d, true, 'X');
        expect(d.hpAtual).toBe(0);
    });
});

describe('QA acoes - perda so em aplicarInicioDeTurno; restaurar manual nao perde', () => {
    const fichaAcoes = (cs, maximo = 2) => ({
        acoes: { padrao: { max: maximo, atual: 0, extra: 0 }, bonus: { max: maximo, atual: 0, extra: 0 }, reacao: { max: maximo, atual: 0, extra: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 50000000, regeneracao: 0 },
        poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5 }, condicoes: cs
    });
    const at = (fi) => ['padrao', 'bonus', 'reacao'].map(t => fi.acoes[t].atual);

    it('restaurarAcoes(ficha) e restaurarAcoes(ficha, {}) / {comEstados:false} devolvem tudo, para QUALQUER um dos 20 novos em 6 stacks', () => {
        NOVOS.forEach((id) => {
            [undefined, {}, { comEstados: false }, { comEstados: 0 }].forEach((op) => {
                const fi = { acoes: criarAcoesIniciais(), condicoes: [c(id, 6)] };
                fi.acoes.padrao.atual = 0; fi.acoes.bonus.atual = 0; fi.acoes.reacao.atual = 0;
                if (op === undefined) restaurarAcoes(fi); else restaurarAcoes(fi, op);
                expect(at(fi), id).toEqual([2, 2, 2]);
            });
        });
    });
    it('aplicarInicioDeTurno: perda correta para cada novo (em 6 stacks) - sem excesso nem falta', () => {
        const esperado = {
            paralisado: [0, 0, 0], atordoado: [0, 0, 0], emchoque: [2, 0, 0], caido: [2, 2, 2], agarrado: [2, 2, 2], impedido: [2, 2, 2],
            fraco: [2, 2, 2], debilitado: [2, 2, 2], adoecido: [2, 2, 2], enjoado: [2, 1, 2], sufocado: [2, 2, 2], eletrizado: [2, 2, 2],
            intimidado: [2, 2, 2], apavorado: [0, 0, 0], banido: [0, 0, 0], dilacerante: [2, 2, 2], dolorido: [2, 2, 0], inconsciente: [0, 0, 0],
            cego: [2, 2, 2], surdo: [2, 2, 2]
        };
        NOVOS.forEach((id) => {
            const fi = fichaAcoes([c(id, 6)]);
            aplicarInicioDeTurno(fi);
            expect(at(fi), id).toEqual(esperado[id]);
        });
    });
    it('1 stack: enjoado nao perde bonus; dolorido 3 nao perde reacao; emchoque 3 nao perde bonus; atordoado 1 mantem bonus', () => {
        const run = (id, s) => { const fi = fichaAcoes([c(id, s)]); aplicarInicioDeTurno(fi); return at(fi); };
        expect(run('enjoado', 2)).toEqual([2, 2, 2]);
        expect(run('dolorido', 3)).toEqual([2, 2, 2]);
        expect(run('emchoque', 3)).toEqual([2, 2, 0]);
        expect(run('atordoado', 1)).toEqual([0, 2, 0]);
    });
    it('maximo maior que 2 (ex.: 4): perda 99 zera, perda 1 tira so 1; nunca negativo; maximo nao e alterado', () => {
        const a = fichaAcoes([c('enjoado', 3)], 4);
        ['padrao', 'bonus', 'reacao'].forEach(t => { a.acoes[t].extra = 2; });
        restaurarAcoes(a, { comEstados: true });
        const mx = a.acoes.bonus.max;
        expect(mx).toBeGreaterThan(2);
        expect(at(a)).toEqual([a.acoes.padrao.max, mx - 1, a.acoes.reacao.max]);
        const b = fichaAcoes([c('paralisado')], 5);
        restaurarAcoes(b, { comEstados: true });
        expect(at(b)).toEqual([0, 0, 0]);
        expect(b.acoes.padrao.max).toBeGreaterThanOrEqual(2);
    });
    it('turno seguinte sem o estado: tudo volta; restaurar duas vezes e idempotente', () => {
        const fi = fichaAcoes([c('paralisado')]);
        aplicarInicioDeTurno(fi);
        expect(at(fi)).toEqual([0, 0, 0]);
        fi.condicoes = [];
        aplicarInicioDeTurno(fi);
        expect(at(fi)).toEqual([2, 2, 2]);
        restaurarAcoes(fi); restaurarAcoes(fi);
        expect(at(fi)).toEqual([2, 2, 2]);
    });
    it('restaurar manual depois de um turno perdido devolve as acoes (botao de restaurar nao perde)', () => {
        const fi = fichaAcoes([c('apavorado')]);
        aplicarInicioDeTurno(fi);
        expect(at(fi)).toEqual([0, 0, 0]);
        restaurarAcoes(fi);
        expect(at(fi)).toEqual([2, 2, 2]);
    });
    it('ficha sem acoes/nula: nao lanca e cria as acoes cheias', () => {
        expect(() => restaurarAcoes(null, { comEstados: true })).not.toThrow();
        expect(() => restaurarAcoes(undefined)).not.toThrow();
        const fi = { condicoes: [c('atordoado')] };
        restaurarAcoes(fi, { comEstados: true });
        expect(at(fi)).toEqual([0, 2, 0]);
        const cheio = {};
        restaurarAcoes(cheio);
        expect(at(cheio)).toEqual([2, 2, 2]);
    });
    it('estados antigos nunca tiram acao (incapacitado, petrificado, charmado, 17 em 6)', () => {
        const fi = fichaAcoes(ANTIGOS.map(id => c(id, 6)));
        restaurarAcoes(fi, { comEstados: true });
        expect(at(fi)).toEqual([2, 2, 2]);
    });
    it('os 3 botoes de restaurar (Ficha, Mapa, Status) chamam restaurarAcoes SEM comEstados; so MapaFormContext usa', () => {
        const ler = (rel) => readFileSync(resolve(aqui, rel), 'utf8');
        expect(ler('../components/Ficha Def/Marcados.jsx')).toMatch(/restaurarAcoes\(f\);/);
        expect(ler('../components/mapa/MapaCombate.jsx')).toMatch(/restaurarAcoes\(f\);/);
        expect(ler('../components/status/StatusFormContext.jsx')).toMatch(/restaurarAcoes\(f\);/);
        ['../components/Ficha Def/Marcados.jsx', '../components/mapa/MapaCombate.jsx', '../components/status/StatusFormContext.jsx'].forEach(p => expect(ler(p)).not.toContain('comEstados'));
        expect(ler('../components/mapa/MapaFormContext.jsx')).toContain('restaurarAcoes(ficha, { comEstados: true })');
        // e nenhum outro lugar do codigo (fora testes) liga o comEstados
        expect(ler('./acoes.js')).toContain('comEstados = false');
    });
});

describe('QA cura - adoecido/dilacerante em eficacia, regeneracao e cura passiva', () => {
    const fichaVida = (cs = []) => ({
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 10 },
        poderes: [], inventario: [], passivas: [], condicoes: cs
    });
    it('calcularEficaciaCura: stacks 1..6 de adoecido e dilacerante', () => {
        for (let s = 1; s <= 6; s++) {
            const a = calcularEficaciaCura(fichaVida([c('adoecido', s)]));
            expect(a).toBeCloseTo(Math.pow(0.75, s) * (Math.floor(s / 4) >= 4 ? 0.5 : 1), 10);
            expect(calcularEficaciaCura(fichaVida([c('dilacerante', s)]))).toBeCloseTo(Math.pow(0.75, s), 10);
        }
    });
    it('eficacia com stacks lixo continua 1; null continua 1', () => {
        [0, -3, NaN, 'x'].forEach(s => expect(calcularEficaciaCura(fichaVida([c('adoecido', s)]))).toBe(1));
        expect(calcularEficaciaCura(null)).toBe(1);
    });
    it('adoecido 4 + exaustao nova: soma o corte 0.5 de Exaustao 4+ uma unica vez (sufocado 6 + adoecido 4)', () => {
        expect(calcularEficaciaCura(fichaVida([c('sufocado', 6), c('adoecido', 4)]))).toBeCloseTo(0.5 * Math.pow(0.75, 4), 10);
    });
    it('cura antiga inalterada: sangrando 2 = 0.25, queimado+criogenia = 0.25, exausto 4 = 0.5', () => {
        expect(calcularEficaciaCura(fichaVida([c('sangrando', 2)]))).toBeCloseTo(0.25, 10);
        expect(calcularEficaciaCura(fichaVida([c('queimado'), c('criogenia')]))).toBeCloseTo(0.25, 10);
        expect(calcularEficaciaCura(fichaVida([c('exausto', 4)]))).toBeCloseTo(0.5, 10);
    });
    it('detalharRegeneracaoVital: corteEstados lista adoecido/dilacerante, mult e pontos por turno caem proporcionalmente', () => {
        const base = detalharRegeneracaoVital(fichaVida(), 'vida');
        const com = detalharRegeneracaoVital(fichaVida([c('adoecido', 2), c('dilacerante', 1)]), 'vida');
        expect(base.corteEstados.mult).toBe(1);
        expect(base.corteEstados.estados).toEqual([]);
        expect(com.corteEstados.mult).toBeCloseTo(0.5625 * 0.75, 10);
        expect(com.corteEstados.estados.map(e => e.id)).toEqual(['adoecido', 'dilacerante']);
        expect(com.corteEstados.estados.reduce((m, e) => m * e.mult, 1)).toBeCloseTo(com.corteEstados.mult, 10);
        expect(base.pontosPorTurno).toBeGreaterThan(0);
        expect(com.pontosPorTurno / base.pontosPorTurno).toBeCloseTo(com.corteEstados.mult, 8);
    });
    it('detalharRegeneracaoVital com sangrando + adoecido: antigos e novos aparecem juntos, produto fecha com o mult', () => {
        const r = detalharRegeneracaoVital(fichaVida([c('sangrando', 1), c('adoecido', 1)]), 'vida');
        expect(r.corteEstados.estados.map(e => e.id)).toEqual(['sangrando', 'adoecido']);
        expect(r.corteEstados.estados.reduce((m, e) => m * e.mult, 1)).toBeCloseTo(r.corteEstados.mult, 10);
    });
    it('exaustao 4+ vinda de sufocado+adoecido adiciona a linha "Exaustao 4+" no detalhe e o produto fecha', () => {
        const r = detalharRegeneracaoVital(fichaVida([c('sufocado', 6), c('adoecido', 4)]), 'vida');
        expect(r.corteEstados.estados.some(e => e.id === 'exaustao')).toBe(true);
        expect(r.corteEstados.estados.reduce((m, e) => m * e.mult, 1)).toBeCloseTo(r.corteEstados.mult, 10);
    });
    it('energias (mana) NAO sofrem corte de adoecido; paralisado/caido nao cortam cura', () => {
        const fi = { ...fichaVida([c('adoecido', 6)]), mana: { base: 100000000, atual: 1, regeneracao: 10 } };
        expect(detalharRegeneracaoVital(fi, 'mana').corteEstados).toBeNull();
        expect(cortesDeCuraDosEstadosNovos(f(c('paralisado', 6), c('caido'), c('debilitado', 6)))).toEqual([]);
    });
    it('cortesDeCuraDosEstadosNovos ignora lixo e junta apenas stacks validos', () => {
        expect(cortesDeCuraDosEstadosNovos(null)).toEqual([]);
        expect(cortesDeCuraDosEstadosNovos(f(c('adoecido', NaN), c('dilacerante', 0)))).toEqual([]);
        expect(cortesDeCuraDosEstadosNovos(f(c('adoecido', 99)))[0]).toMatchObject({ stacks: 6 });
    });
});

describe('QA duracao e imunidade com ids novos', () => {
    it('aplicar com id inexistente, stacks lixo ou duracao lixo nao grava nada/ nao lanca', () => {
        const ficha = {};
        aplicarEstadoComDuracao(ficha, 'zzinexistente', 1, '', 3);
        aplicarEstadoComDuracao(ficha, 'paralisado', NaN, '', 3);
        aplicarEstadoComDuracao(ficha, 'paralisado', -2, '', 3);
        expect(condicoesDaFicha(ficha)).toEqual([]);
        expect(duracaoDe(ficha, 'paralisado')).toBe(0); // (duracaoEstados cru pode guardar prazo orfao: ver relatorio)
        expect(() => aplicarEstadoComDuracao(null, 'paralisado', 1)).not.toThrow();
        expect(removerEstadoComDuracao({}, 'zzinexistente')).toBe(false);
        expect(removerEstadoComDuracao({}, 'paralisado')).toBe(false);
    });
    it('duracao lixo (0, -1, "abc", 500) em estado novo: permanente / limitada a 99', () => {
        ['paralisado', 'banido', 'cego'].forEach((id) => {
            const a = {}; aplicarEstadoComDuracao(a, id, 1, '', 0); expect(duracaoDe(a, id)).toBe(0);
            const b = {}; aplicarEstadoComDuracao(b, id, 1, '', 'abc'); expect(duracaoDe(b, id)).toBe(0);
            const d = {}; aplicarEstadoComDuracao(d, id, 1, '', 500); expect(duracaoDe(d, id)).toBe(99);
        });
    });
    it('reaplicar: duracao renova para o MAIOR; sem duracao vira permanente; stacks somam ate 6', () => {
        NOVOS.forEach((id) => {
            const fi = {};
            aplicarEstadoComDuracao(fi, id, 4, '', 2);
            aplicarEstadoComDuracao(fi, id, 4, '', 5);
            expect(duracaoDe(fi, id), id).toBe(5);
            expect(stacksDe(fi, id)).toBe(6);
            aplicarEstadoComDuracao(fi, id, 1, '', 1);
            expect(duracaoDe(fi, id)).toBe(5);
            aplicarEstadoComDuracao(fi, id, 1);
            expect(duracaoDe(fi, id)).toBe(0);
        });
    });
    it('passar turno com varios novos: expira so quem chegou a 0, outros ficam e descem', () => {
        const fi = {};
        aplicarEstadoComDuracao(fi, 'paralisado', 1, '', 1);
        aplicarEstadoComDuracao(fi, 'cego', 1, '', 3);
        aplicarEstadoComDuracao(fi, 'banido', 1);
        const r = passarTurnoDosEstados(fi);
        expect(r.expirados).toEqual(['paralisado']);
        expect(stacksDe(fi, 'paralisado')).toBe(0);
        expect(duracaoDe(fi, 'cego')).toBe(2);
        expect(stacksDe(fi, 'banido')).toBe(1);
    });
    it('imune_estado: escopo de um novo nao vale para outro novo; propriedade errada/valor 0 nao imuniza; poder inativo nao imuniza', () => {
        const mk = (escopo, extra = {}) => ({ poderes: [{ id: 'p', nome: 'P', ativa: true, efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo, ...extra }] }] });
        expect(imuneAoEstado(mk('paralisado'), 'atordoado')).toBe(false);
        expect(imuneAoEstado(mk('paralisado'), 'paralisado')).toBe(true);
        expect(imuneAoEstado(mk('paralisado', { valor: 0 }), 'paralisado')).toBe(false);
        const inativo = mk('paralisado'); inativo.poderes[0].ativa = false;
        expect(imuneAoEstado(inativo, 'paralisado')).toBe(false);
        expect(imuneAoEstado(null, 'paralisado')).toBe(false);
        expect(imuneAoEstado({}, 'paralisado')).toBe(false);
        expect(imuneAoEstado(mk('zzinexistente'), 'paralisado')).toBe(false);
    });
    it('imune a UM novo no golpe: aplica os outros, mantem o imune fora; teste de resistencia com ficha sem atributos nao lanca', () => {
        const alvo = { poderes: [{ id: 'p', nome: 'P', ativa: true, efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'cego' }] }] };
        const r = resolverEstadosNoAlvo([c('cego'), c('surdo'), { ...c('banido'), teste: { atributo: 'forca', cd: 1 } }], alvo, { rolar: () => 20 });
        expect(r.aplicados.map(a => a.id)).toEqual(['surdo']);
        expect(r.imunes.map(i => i.id)).toEqual(['cego']);
        expect(r.resistidos.map(x => x.id)).toEqual(['banido']);
    });
});

describe('QA golpes - aplicaEstados com estado novo', () => {
    it('normalizarAplicaEstados: novos entram; inexistentes/lixo saem; stacks 0/NaN/99/negativo', () => {
        const r = normalizarAplicaEstados([
            { id: 'paralisado', stacks: 0 }, { id: 'cego', stacks: NaN }, { id: 'banido', stacks: 99 }, { id: 'surdo', stacks: -4 },
            { id: 'zzinexistente', stacks: 1 }, null, { stacks: 1 }, { id: 42 }, { id: 'PARALISADO' }, 'cego'
        ]);
        expect(r).toEqual([
            { id: 'paralisado', stacks: 1 }, { id: 'cego', stacks: 1 }, { id: 'banido', stacks: 6 }, { id: 'surdo', stacks: 1 }
        ]);
        expect(normalizarAplicaEstados(undefined)).toEqual([]);
        expect(normalizarAplicaEstados('x')).toEqual([]);
    });
    it('limite de 8 por fonte vale tambem para novos; todos os 20 em lista unica ficam so 8', () => {
        expect(normalizarAplicaEstados(NOVOS.map(id => c(id)))).toHaveLength(8);
    });
    it('teste de resistencia (teste/cd) e apenasCritico funcionam com novos', () => {
        const r = normalizarAplicaEstados([{ id: 'atordoado', stacks: 2, teste: { atributo: 'constituicao', cd: 999 }, apenasCritico: true, duracao: 2 }]);
        expect(r).toEqual([{ id: 'atordoado', stacks: 2, teste: { atributo: 'constituicao', cd: 60 }, apenasCritico: true, duracao: 2 }]);
        expect(resolverEstadosNoAlvo(r, null).pulados).toBe(1);
        expect(resolverEstadosNoAlvo(r, null, { critico: true }).aplicados).toEqual([{ id: 'atordoado', stacks: 2, origem: '', duracao: 2 }]);
    });
    it('juntarAplicados soma stacks do mesmo novo ate 6 e usa a maior duracao; permanente vence', () => {
        expect(juntarAplicados([{ id: 'cego', stacks: 4, duracao: 2 }, { id: 'cego', stacks: 4, duracao: 5 }])).toEqual([{ id: 'cego', stacks: 6, duracao: 5 }]);
        expect(juntarAplicados([{ id: 'cego', stacks: 1, duracao: 2 }, { id: 'cego', stacks: 1 }])).toEqual([{ id: 'cego', stacks: 2 }]);
    });
    it('condicoesComEstados (posGolpe) soma novos no alvo, personagem e dummie, sem mutar', () => {
        const dummie = { condicoes: [c('cego', 2)] };
        const antes = JSON.stringify(dummie);
        const r = condicoesComEstados(dummie, [{ id: 'cego', stacks: 3 }, { id: 'paralisado', stacks: 1 }]);
        expect(r.find(x => x.id === 'cego').stacks).toBe(5);
        expect(r.find(x => x.id === 'paralisado').stacks).toBe(1);
        expect(JSON.stringify(dummie)).toBe(antes);
        const pers = { isPersonagem: true, ficha: { condicoes: [] } };
        expect(condicoesComEstados(pers, [{ id: 'banido', stacks: 9 }])).toEqual([{ id: 'banido', stacks: 6 }]);
    });
    it('coletarEstadosDoGolpe de varias fontes mantem origem e descarta ids inexistentes', () => {
        const r = coletarEstadosDoGolpe({ fontes: [{ nome: 'A', aplicaEstados: [c('cego'), c('zzz')] }, { nome: 'B', aplicaEstados: [c('surdo', 2)] }], extras: [c('banido')] });
        expect(r.map(x => x.id)).toEqual(['cego', 'surdo', 'banido']);
        expect(r[0].origem).toBe('A');
    });
});

describe('QA gatilhos - aplicarEstado/removerEstado com estado novo', () => {
    it('normalizarAcaoGatilho: stacks 0/NaN/99/negativo/texto; duracao lixo; id inexistente/maiusculo/nulo', () => {
        const a = (extra) => normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'apavorado', ...extra });
        expect(a({ stacks: 0 }).stacks).toBe(1);
        expect(a({ stacks: NaN }).stacks).toBe(1);
        expect(a({ stacks: -5 }).stacks).toBe(1);
        expect(a({ stacks: 99 }).stacks).toBe(6);
        expect(a({ stacks: '3' }).stacks).toBe(3);
        expect(a({ stacks: 2.8 }).stacks).toBe(2);
        expect(a({ duracao: 'abc' })).not.toHaveProperty('duracao');
        expect(a({ duracao: 0 })).not.toHaveProperty('duracao');
        expect(a({ duracao: '2d4+1' }).duracao).toBe('2d4+1');
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'APAVORADO' })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado' })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'removerEstado', estado: 'zzz' })).toBeNull();
        expect(normalizarAcaoGatilho({ tipo: 'removerEstado', estado: null })).toBeNull();
    });
    it('aplicarAcoesNoRascunho: aplica, soma stacks, grava duracao, respeita imunidade e remove (todos os 20)', () => {
        NOVOS.forEach((id) => {
            const fi = { condicoes: [] };
            const r = aplicarAcoesNoRascunho(fi, [{ tipo: 'aplicarEstado', estado: id, stacks: 2, duracao: 3, gatilhoNome: 'G' }], { rng: () => 0 });
            expect(stacksDe(fi, id), id).toBe(2);
            expect(duracaoDe(fi, id)).toBe(3);
            expect(r.caminhos).toEqual(expect.arrayContaining(['condicoes']));
            expect(r.textos.join(' ')).toContain('G aplicou 2x');
            aplicarAcoesNoRascunho(fi, [{ tipo: 'aplicarEstado', estado: id, stacks: 9 }], { rng: () => 0 });
            expect(stacksDe(fi, id)).toBe(6);
            const rm = aplicarAcoesNoRascunho(fi, [{ tipo: 'removerEstado', estado: id, gatilhoNome: 'G' }], {});
            expect(stacksDe(fi, id)).toBe(0);
            expect(duracaoDe(fi, id)).toBe(0);
            expect(rm.textos.join(' ')).toContain('removeu');
            // remover de novo nao faz nada
            const rm2 = aplicarAcoesNoRascunho(fi, [{ tipo: 'removerEstado', estado: id }], {});
            expect(rm2.textos).toEqual([]);
        });
    });
    it('aplicarEstado em ficha imune ao novo: nao entra e avisa', () => {
        const fi = { condicoes: [], poderes: [{ id: 'p', nome: 'P', ativa: true, efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'paralisado' }] }] };
        const r = aplicarAcoesNoRascunho(fi, [{ tipo: 'aplicarEstado', estado: 'paralisado', stacks: 1, gatilhoNome: 'G' }], {});
        expect(stacksDe(fi, 'paralisado')).toBe(0);
        expect(r.textos.join(' ')).toContain('imune');
    });
    it('duracao em dado e sorteada com o rng injetado para novo', () => {
        const fi = { condicoes: [] };
        aplicarAcoesNoRascunho(fi, [{ tipo: 'aplicarEstado', estado: 'banido', stacks: 1, duracao: '1d4+1', gatilhoNome: 'G' }], { rng: () => 0.999 });
        expect(duracaoDe(fi, 'banido')).toBe(5);
    });
    it('lerGatilhosDaIA aceita aplicarEstado/removerEstado de novos e descarta inexistentes sem lancar', () => {
        const bom = lerGatilhosDaIA([{ nome: 'Raio', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'aplicarEstado', estado: 'eletrizado', stacks: 2 }, { tipo: 'removerEstado', estado: 'caido' }] }]);
        expect(bom.gatilhos).toHaveLength(1);
        expect(bom.gatilhos[0].acoes.map(a => a.estado)).toEqual(['eletrizado', 'caido']);
        const ruim = lerGatilhosDaIA([{ nome: 'Ruim', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'aplicarEstado', estado: 'zzinexistente', stacks: 2 }] }]);
        expect(ruim.gatilhos).toEqual([]);
        expect(ruim.naoAplicado.length).toBeGreaterThan(0);
    });
});

describe('QA importador e Sexta-Feira - ids novos aceitos, inexistentes descartados', () => {
    it('prompt do importador lista todos os 37 ids e nao lista id inexistente', () => {
        const p = montarPromptImportacao('texto');
        ESTADOS.forEach(e => expect(p).toContain(e.id));
        expect(p).not.toContain('zzinexistente');
    });
    it('normalizarPoder (Sexta-Feira) mantem estados novos e avisa dos descartados', () => {
        const r = normalizarPoder({ nome: 'Raio', aplicaEstados: [{ id: 'paralisado', stacks: 2, duracao: 2 }, { id: 'zzinexistente', stacks: 1 }, { id: 'cego', stacks: 99 }] });
        const obj = r.objeto || r;
        expect(obj.aplicaEstados.map(e => e.id)).toEqual(['paralisado', 'cego']);
        expect(obj.aplicaEstados[1].stacks).toBe(6);
        expect(JSON.stringify(r.avisos || [])).toMatch(/descartad/);
    });
    it('normalizarPoder so com ids inexistentes: sem aplicaEstados e com aviso', () => {
        const r = normalizarPoder({ nome: 'X', aplicaEstados: [{ id: 'zzinexistente' }, { id: 'paralisadoo' }] });
        const obj = r.objeto || r;
        expect(obj.aplicaEstados).toBeUndefined();
        expect(JSON.stringify(r.avisos || [])).toMatch(/descartad/);
    });
});

describe('QA seletores - ESTADOS_NOVOS aparecem nas listas de UI', () => {
    const ler = (rel) => readFileSync(resolve(aqui, rel), 'utf8');
    it('os seletores de Ficha, Mapa, Mestre e Compendio importam e espalham ESTADOS_NOVOS', () => {
        ['../components/ficha/FichaFormContext.jsx', '../components/mestre/PainelMestreSandbox.jsx', '../components/compendio/CompendioFormContext.jsx'].forEach((p) => {
            const t = ler(p);
            expect(t, p).toMatch(/import \{ ESTADOS_NOVOS \} from '[./]+\/core\/estadosNovos(\.js)?'/);
            expect(t, p).toContain('...ESTADOS_NOVOS.map(');
        });
    });
    it('a lista de ESTADOS usada pelo seletor tem id unico, nome e icone para todos os 37', () => {
        expect(new Set(ESTADOS.map(e => e.id)).size).toBe(37);
        ESTADOS.forEach((e) => { expect(ehEstadoValido(e.id)).toBe(true); expect(e.nome).toBeTruthy(); expect(e.icone).toBeTruthy(); });
        ESTADOS_NOVOS.forEach(e => expect(e.cor).toMatch(/^#[0-9a-f]{6}$/i));
    });
    it('ehEstadoValido: ids em maiusculo, com espaco, nulos e nao-string sao invalidos', () => {
        ['PARALISADO', ' paralisado', 'em choque', 'zz', '', null, undefined, 3, {}, []].forEach(v => expect(ehEstadoValido(v)).toBe(false));
        expect(ehEstadoValido('emchoque')).toBe(true);
    });
});

describe('QA somar/tirar estados novos', () => {
    it('somar com stacks lixo nao altera; tirar mais que o existente remove; tirar com lixo nao altera', () => {
        NOVOS.forEach((id) => {
            expect(somarEstado([], id, NaN)).toEqual([]);
            expect(somarEstado([], id, -3)).toEqual([]);
            expect(somarEstado([], id, 0)).toEqual([]);
            expect(somarEstado([], id, 99)).toEqual([{ id, stacks: 6 }]);
            expect(tirarEstado([c(id, 2)], id, 50)).toEqual([]);
            expect(tirarEstado([c(id, 2)], id, NaN)).toEqual([c(id, 2)]);
            expect(tirarEstado([c(id, 2)], 'zzz', 1)).toEqual([c(id, 2)]);
        });
        expect(somarEstado([], 'zzinexistente', 1)).toEqual([]);
    });
    it('condicoes duplicadas do mesmo novo ficam com o MAIOR stack (nao somam)', () => {
        expect(condicoesDaFicha(f(c('cego', 2), c('cego', 5), c('cego', 3)))).toEqual([c('cego', 5)]);
    });
    it('fonte longa e cortada em 60 e o resumo de apavorado/intimidado cita a fonte', () => {
        const longa = 'x'.repeat(200);
        expect(somarEstado([], 'apavorado', 1, longa)[0].fonte).toHaveLength(60);
        expect(resumoDosEstados({ condicoes: [{ id: 'intimidado', stacks: 1, fonte: 'Zeus' }] }).join('\n')).toContain('Zeus');
    });
});

describe('QA defesa - calcularCA com novos nos limites', () => {
    const base = (cond) => ({ forca: { base: 1000000, nome: 'Força' }, destreza: { base: 1000000, nome: 'Destreza' }, ...(cond ? { condicoes: cond } : {}) });
    it('Evasiva zera com paralisado/inconsciente/agarrado 3+/eletrizado 6; Resistencia nunca chega a 0 com debilitado+dilacerante', () => {
        expect(calcularCA(base([c('agarrado', 3)]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('eletrizado', 6)]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('impedido', 4)]), 'evasiva')).toBe(0);
        expect(calcularCA(base([c('debilitado', 6), c('dilacerante', 6)]), 'resistencia')).toBeGreaterThan(0);
    });
    it('estados novos de ataque/testes nao mexem na CA', () => {
        const ev = calcularCA(base(), 'evasiva');
        const res = calcularCA(base(), 'resistencia');
        ['fraco', 'enjoado', 'intimidado', 'dolorido', 'cego', 'banido', 'caido'].forEach((id) => {
            expect(calcularCA(base([c(id, 6)]), 'evasiva'), id).toBe(ev);
            expect(calcularCA(base([c(id, 6)]), 'resistencia'), id).toBe(res);
        });
    });
});
