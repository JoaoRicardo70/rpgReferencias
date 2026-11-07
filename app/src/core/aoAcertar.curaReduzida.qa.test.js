import { describe, it, expect } from 'vitest';
import { normalizarAoAcertar, resolverAoAcertarNoAlvo, lerFatorCura } from './aoAcertar';
import { calcularEficaciaCura } from './engine';
import { menorFatorCuraReduzida, fatorDeBuffCura, passarTurnoDosBuffs, calcularCuraSuporte, buffsTemporariosDaFicha, removerBuffsDoCombate } from './suporte';
import { planejarUsoSuporte } from '../services/suporte';
import { aplicarRegeneracaoDeTurno } from './vitals';
import { getBuffs } from './attributes';

// QA (endurecimento) - cura reduzida: fatores estranhos, cura real de Poder (suporte), efeitos de cura, regeneracao e expiracao por turnos.
const red = (extra) => ({ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 1, origem: 'EA', ...extra });
const aplicar = (entrada, ficha = {}, opts = {}) => resolverAoAcertarNoAlvo(normalizarAoAcertar([entrada]), ficha, { agora: 1, nomeAtacante: 'Vegeta', ...opts });

describe('cura reduzida QA - lerFatorCura bordas', () => {
    it.each([
        [0.01, 0.01], [1, 1], ['0.5', 0.5], ['0,5', 0.5], [' 50 % ', 0.5], ['100%', 1], ['1%', 0.01], ['3/4', 0.75], ['1 / 2', 0.5], ['2/2', 1],
    ])('aceita %j', (entrada, esperado) => expect(lerFatorCura(entrada)).toBeCloseTo(esperado, 10));
    it.each([
        [0], [0.0099], [1.0001], [-0.5], ['0%'], ['101%'], ['3/2'], ['1/0'], ['0/5'], [''], ['  '], ['abc'], [NaN], [Infinity], [-Infinity], [{}], [[]], [true], [null], [undefined],
    ])('rejeita %j', (entrada) => expect(lerFatorCura(entrada)).toBeNull());
});

describe('cura reduzida QA - normalizacao e duracao', () => {
    it('duracao: 1..20, decimal trunca, texto numerico vale, invalida/negativa vira 1', () => {
        const dur = (d) => normalizarAoAcertar([red({ duracao: d })])[0].duracao;
        expect(dur(1)).toBe(1);
        expect(dur(20)).toBe(20);
        expect(dur(21)).toBe(20);
        expect(dur(2.9)).toBe(2);
        expect(dur('7')).toBe(7);
        expect(dur(-3)).toBe(1);
        expect(dur('abc')).toBe(1);
        expect(dur(NaN)).toBe(1);
        expect(dur(Infinity)).toBe(1);
        expect(dur(null)).toBe(1);
    });
    it('item sem o campo fator (so valor, como outros tipos) e descartado', () => {
        expect(normalizarAoAcertar([{ tipo: 'reduzirCuraAlvo', valor: 0.5, duracao: 2 }])).toEqual([]);
    });
    it('idempotente: normalizar o resultado de novo da o mesmo objeto', () => {
        const uma = normalizarAoAcertar([red({ fator: '1/3', duracao: '4', apenasCritico: true })]);
        expect(normalizarAoAcertar(uma)).toEqual(uma);
    });
    it('mistura de tipos validos e invalidos preserva so os validos e na ordem', () => {
        const r = normalizarAoAcertar([red({ fator: 5 }), { tipo: 'curarAtacante', modo: 'fixo', valor: 3 }, red({ fator: '25%' })]);
        expect(r.map(x => x.tipo)).toEqual(['curarAtacante', 'reduzirCuraAlvo']);
        expect(r[1].fator).toBe(0.25);
    });
    it('lista nao-array e entradas nulas nao quebram', () => {
        expect(normalizarAoAcertar(null)).toEqual([]);
        expect(normalizarAoAcertar(undefined)).toEqual([]);
        expect(normalizarAoAcertar('x')).toEqual([]);
        expect(normalizarAoAcertar([null, undefined, 5, red()])).toHaveLength(1);
    });
});

describe('cura reduzida QA - aplicacao no alvo', () => {
    it('sem nomeAtacante usa a origem; sem nada usa "Ao acertar" como fonte', () => {
        const base = normalizarAoAcertar([red()]);
        expect(resolverAoAcertarNoAlvo([{ ...base[0], origem: 'EA' }], {}, { agora: 1, nomeAtacante: '' }).buffs[0].fonte).toBe('EA');
        expect(resolverAoAcertarNoAlvo(base, {}, { agora: 1, nomeAtacante: '' }).buffs[0].fonte).toBe('Ao acertar');
    });
    it('duas aplicacoes seguidas da MESMA fonte renovam: 1 buff so, nunca multiplica (0.5 e 0.5 = 0.5, nao 0.25)', () => {
        let r = aplicar(red());
        r = aplicar(red(), { buffsTemporarios: r.buffs }, { agora: 2 });
        expect(r.buffs).toHaveLength(1);
        expect(menorFatorCuraReduzida({ buffsTemporarios: r.buffs })).toBe(0.5);
        expect(calcularEficaciaCura({ buffsTemporarios: r.buffs })).toBe(0.5);
    });
    it('fonte A fraca e fonte B forte: vale a forte; expirar a forte volta para a fraca', () => {
        let r = aplicar(red({ fator: 0.8, duracao: 3 }), {}, { nomeAtacante: 'A' });
        r = aplicar(red({ fator: 0.2, duracao: 1 }), { buffsTemporarios: r.buffs }, { nomeAtacante: 'B', agora: 2 });
        expect(menorFatorCuraReduzida({ buffsTemporarios: r.buffs })).toBe(0.2);
        const depois = passarTurnoDosBuffs({ buffsTemporarios: r.buffs });
        expect(depois.expirados).toEqual(['Cura reduzida']);
        expect(menorFatorCuraReduzida({ buffsTemporarios: depois.lista })).toBe(0.8);
    });
    it('golpe seguinte com fator MAIOR renova duracao mas mantem o menor fator; com fator MENOR aperta', () => {
        let r = aplicar(red({ fator: 0.4, duracao: 2 }));
        r = aplicar(red({ fator: 0.9, duracao: 6 }), { buffsTemporarios: r.buffs }, { agora: 2 });
        expect(fatorDeBuffCura(r.buffs[0])).toBe(0.4);
        expect(r.buffs[0].restantes).toBe(6);
        r = aplicar(red({ fator: 0.1, duracao: 1 }), { buffsTemporarios: r.buffs }, { agora: 3 });
        expect(fatorDeBuffCura(r.buffs[0])).toBe(0.1);
        expect(r.buffs[0].restantes).toBe(1);
    });
    it('fator 1 (sem reducao) nao altera a eficacia de cura', () => {
        const r = aplicar(red({ fator: 1 }));
        expect(calcularEficaciaCura({ buffsTemporarios: r.buffs })).toBe(1);
    });
    it('buff gravado com fator corrompido na ficha (0, NaN, 2, texto) e ignorado: eficacia nao vira 0 nem NaN', () => {
        [0, NaN, 2, -1, 'x', null, undefined].forEach((valor) => {
            const ficha = { buffsTemporarios: [{ id: 'b', nome: 'Cura reduzida', fonte: 'X', restantes: 3, efeitos: [{ atributo: 'cura', propriedade: 'cura_reduzida', valor }] }] };
            expect(calcularEficaciaCura(ficha)).toBe(1);
        });
    });
    it('buff com efeito de OUTRA propriedade nao afeta a cura', () => {
        const ficha = { buffsTemporarios: [{ id: 'b', nome: 'Forca', fonte: 'X', restantes: 3, efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 0.1 }] }] };
        expect(calcularEficaciaCura(ficha)).toBe(1);
    });
    it('o buff nao vaza para os atributos (getBuffs ignora a propriedade cura_reduzida)', () => {
        const r = aplicar(red());
        const ficha = { forca: { base: 10 }, buffsTemporarios: r.buffs };
        const antes = getBuffs({ forca: { base: 10 } }, 'forca');
        expect(getBuffs(ficha, 'forca')).toEqual(antes);
    });
});

describe('cura reduzida QA - efeitos de cura reais', () => {
    const buff = (fator, extra = {}) => ({ id: 'b', nome: 'Cura reduzida', fonte: 'V', restantes: 2, efeitos: [{ nome: 'Cura reduzida', atributo: 'cura', propriedade: 'cura_reduzida', valor: fator }], ...extra });
    it('efetividade_cura de Poder ativo, Passiva e item equipado multiplica junto com o fator', () => {
        const ficha = {
            buffsTemporarios: [buff(0.5)],
            poderes: [{ ativa: true, efeitos: [{ propriedade: 'efetividade_cura', valor: 0.5 }] }, { ativa: false, efeitos: [{ propriedade: 'efetividade_cura', valor: 100 }] }],
            passivas: [{ efeitos: [{ propriedade: 'efetividade_cura', valor: 0.5 }] }],
        };
        expect(calcularEficaciaCura(ficha)).toBeCloseTo(2 * 0.5, 10);
    });
    it('efetividade_cura NEGATIVA ate -100% (zera) multiplicada pelo fator continua 0, nao negativa', () => {
        const ficha = { buffsTemporarios: [buff(0.5)], poderes: [{ ativa: true, efeitos: [{ propriedade: 'efetividade_cura', valor: -1 }] }] };
        expect(calcularEficaciaCura(ficha)).toBeCloseTo(0, 10);
    });
    it('estado que corta a cura (Sangrando) soma com cura reduzida multiplicando, e cada fonte separada continua so menor fator', () => {
        const so = calcularEficaciaCura({ condicoes: [{ id: 'sangrando', stacks: 2 }] });
        const com = calcularEficaciaCura({ condicoes: [{ id: 'sangrando', stacks: 2 }], buffsTemporarios: [buff(0.5), buff(0.25, { id: 'c', fonte: 'W' })] });
        expect(com).toBeCloseTo(so * 0.25, 10);
    });
    it('cura de Poder (suporte): calcularCuraSuporte com a eficacia reduzida corta o total e anota o percentual', () => {
        const suporte = { cura: { fixo: 1000 }, alvos: 'si', modo: 'uso' };
        const cheia = calcularCuraSuporte(suporte, { eficacia: 1 });
        const reduzida = calcularCuraSuporte(suporte, { eficacia: calcularEficaciaCura({ buffsTemporarios: [buff(0.5)] }) });
        expect(cheia.total).toBe(1000);
        expect(reduzida.total).toBe(500);
        expect(reduzida.detalhe).toContain('cura 50%');
    });
    it('planejarUsoSuporte: o ALVO com cura reduzida recebe menos; quem nao tem recebe tudo (mesmo uso, dois alvos)', () => {
        const vital = { base: 100000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: 1000 };
        const item = { id: 'i', nome: 'Cura', suporte: { cura: { fixo: 100 }, alvos: 'aliados', modo: 'uso', maxAlvos: 3 } };
        const fichas = {
            Eu: { vida: { ...vital } },
            Ana: { vida: { ...vital }, buffsTemporarios: [buff(0.5)] },
            Bia: { vida: { ...vital } },
        };
        const plano = planejarUsoSuporte({ item, meuNome: 'Eu', fichas, aliados: ['Ana', 'Bia'], rolar: () => 1 });
        const por = Object.fromEntries(plano.receptores.map(r => [r.nome, r.cura.total]));
        expect(por.Ana).toBe(50);
        expect(por.Bia).toBe(100);
    });
    it('regeneracao dos vitais NAO-vida nao e afetada pela cura reduzida', () => {
        const vital = (atual) => ({ base: 100000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual, regeneracao: 10 });
        const a = { vida: vital(1), mana: vital(1), poderes: [], combate: {} };
        const b = { vida: vital(1), mana: vital(1), poderes: [], combate: {}, buffsTemporarios: [buff(0.1)] };
        aplicarRegeneracaoDeTurno(a); aplicarRegeneracaoDeTurno(b);
        expect(b.mana.atual).toBe(a.mana.atual);
    });
    // LACUNA documentada: Estados que cortam a cura (Sangrando etc.) cortam tambem a Regeneracao da Vida (vitals.js > aplicarRegeneracaoDeTurno usa
    // modificadoresDeEstados().curaMult), mas a Cura Reduzida so entra em calcularEficaciaCura: a Regeneracao da Vida NAO e cortada por ela.
    // `it.fails` passa enquanto a lacuna existir e vira vermelho quando for corrigida (ai troque para `it`).
    it('regeneracao da VIDA e cortada pela cura reduzida', () => {
        const vital = (atual) => ({ base: 100000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual, regeneracao: 10 });
        const a = { vida: vital(1), poderes: [], combate: {} };
        const b = { vida: vital(1), poderes: [], combate: {}, buffsTemporarios: [buff(0.5)] };
        aplicarRegeneracaoDeTurno(a); aplicarRegeneracaoDeTurno(b);
        expect(b.vida.atual - 1).toBeLessThan(a.vida.atual - 1);
    });
});

describe('cura reduzida QA - expiracao por turnos', () => {
    it('duracao N: continua por N-1 viradas e some na N-esima; a cura volta a 100%', () => {
        const r = aplicar(red({ duracao: 3 }));
        let ficha = { buffsTemporarios: r.buffs };
        const fatores = [];
        for (let i = 0; i < 4; i++) {
            fatores.push(calcularEficaciaCura(ficha));
            ficha = { buffsTemporarios: passarTurnoDosBuffs(ficha).lista };
        }
        expect(fatores).toEqual([0.5, 0.5, 0.5, 1]);
    });
    it('duracao 1: expira ja na primeira virada do turno do alvo', () => {
        const r = aplicar(red({ duracao: 1 }));
        const { lista, expirados } = passarTurnoDosBuffs({ buffsTemporarios: r.buffs });
        expect(lista).toEqual([]);
        expect(expirados).toEqual(['Cura reduzida']);
    });
    it('renovar antes de expirar recomeca a contagem', () => {
        let r = aplicar(red({ duracao: 2 }));
        r = { buffs: passarTurnoDosBuffs({ buffsTemporarios: r.buffs }).lista };
        expect(r.buffs[0].restantes).toBe(1);
        r = aplicar(red({ duracao: 2 }), { buffsTemporarios: r.buffs }, { agora: 5 });
        expect(r.buffs[0].restantes).toBe(2);
    });
    it('fim de combate NAO remove o buff por turnos (so os "ate o fim do combate")', () => {
        const r = aplicar(red({ duracao: 4 }));
        expect(removerBuffsDoCombate(r.buffs)).toHaveLength(1);
    });
    it('convive com outros buffs: expirar o de cura nao mexe nos demais', () => {
        const outro = { id: 'x', nome: 'Forca+', fonte: 'Aliado', restantes: 5, efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 3 }] };
        const r = aplicar(red({ duracao: 1 }), { buffsTemporarios: [outro] });
        expect(r.buffs).toHaveLength(2);
        const depois = passarTurnoDosBuffs({ buffsTemporarios: r.buffs });
        expect(depois.lista.map(b => b.id)).toEqual(['x']);
        expect(depois.lista[0].restantes).toBe(4);
        expect(buffsTemporariosDaFicha({ buffsTemporarios: depois.lista })).toHaveLength(1);
    });
});
