import { describe, it, expect } from 'vitest';
import { aplicarDanoNaVida } from './danoVida.js';
import { absorverNoRascunho } from './escudos.js';
import { danoExibidoParaBruto, descansarCompleto } from './vitals.js';
import { aplicarAcoesNoRascunho, passarTurnoDaImunidadeTotal, temImunidadeTotal, camposParaGravar, camposDeGatilhosAlterados } from './gatilhosAplicar.js';
import { normalizarGatilhos, normalizarAcaoGatilho, normalizarCondicaoGatilho, coletarGatilhos, avaliarGatilhos } from './gatilhos.js';

// QA do ponto unico de dano (Fase 1 de Gatilhos). Parte 1: regressao TRANSPARENTE por comparacao diferencial com a conta de antes
// (a conta antiga e reescrita aqui exatamente como estava no HEAD de cada caminho). Parte 2: o que o motor faz.

const F = 1000;
const MAX = 100000 * F;
const ser = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : v));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const CINZAS = [
    { id: 'vc1', nome: 'Cinzas 10%', evento: { tipo: 'vidaAbaixoDe', de: 10, ate: 10 }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 5000 }, { tipo: 'mensagem', texto: 'As cinzas se agitam' }] },
    { id: 'vc2', nome: 'Cinzas 9-6%', evento: { tipo: 'vidaAbaixoDe', de: 9, ate: 6 }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 20 }] },
    { id: 'vc3', nome: 'Cinzas 5-1%', evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'imunidadeTotal', duracaoTurnos: 1 }] },
    { id: 'vc0', nome: 'Cinzas 0%', evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', percMax: 1 }] },
];
const poder = (gatilhos, extra = {}) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos, ...extra });
const ficha = (extra = {}, vidaExibida = 100000) => ({ vida: { atual: vidaExibida * F }, iniciativa: 0, poderes: [], inventario: [], passivas: [], ...extra });
let n = 0;
const dano = (f, d, ctx = {}) => aplicarDanoNaVida(f, d, { nome: 'Eu', vidaMaxBruta: MAX, cenaId: 'c1', eventoId: `qa${++n}`, ...ctx });

// ======================================================================================================
// PRIORIDADE 1 - regressao transparente (diferencial contra a conta de antes)
// ======================================================================================================
const VIDAS = [0, 1, 999, 1000, 500000, 1e9, 123456789.5, '700000', null, undefined, NaN];
const DANOS = [0, -3, NaN, undefined, '25', 0.4, 33.7, 299, 300, 300.0001, 301, 1000, 1e6, 1e12, 1e20, Infinity];
const ESCUDOS = [
    undefined,
    [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }],
    [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }, { id: 'b', nome: 'Falsa', valor: 50, tipo: 'vidaTemporaria' }, { id: 'c', nome: 'Muro', valor: 40, tipo: 'escudo' }],
    [{ id: 'a', nome: 'Gigante', valor: 1e15, tipo: 'escudo' }],
    [{ id: 'a', nome: 'Fracao', valor: 0.5, tipo: 'vidaTemporaria' }],
];
const EXTRAS = [
    {},
    { poderes: [{ id: 'p', nome: 'P', ativa: true }] },
    { poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [] }] },
    { poderes: [{ id: 'p', nome: 'P', ativa: false, gatilhos: [NEGAR] }] }, // poder desligado
    { poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, mestreDesligou: true }] }] },
    { poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, modo: 'opcional' }] }] }, // entra no caminho "com gatilhos" mas nada dispara
    { poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ nome: 'lixo', evento: { tipo: 'zzz' }, acoes: [] }, null, 7] }] },
    { inventario: [{ id: 'i', nome: 'Espada', equipado: false, gatilhos: [NEGAR] }] },
    { inventario: [{ id: 'i', nome: 'Espada', equipado: true, efeitosAtivos: false, gatilhos: [NEGAR] }] },
    { combate: { imunidadeTotal: { turnosRestantes: 0, origem: 'x' } } }, // imunidade vencida nao conta
    { combate: { gatilhos: {}, usosPoderes: { velho: { n: 1, cena: 'x' } } }, condicoes: [{ id: 'sangrando', stacks: 2 }] },
];

// A conta de ANTES de cada caminho (copiada do HEAD).
// Defesa.sofrerDanoBruto, Zona (tick e pisar), Ataque Reflexo, estados no turno: absorver -> vida.atual = max(0, (atual||0) - bruto(restante)).
function antesAbsorveEGrava(f, d, nome) {
    const abs = absorverNoRascunho(f, d, nome);
    f.vida.atual = Math.max(0, (f.vida.atual || 0) - danoExibidoParaBruto(abs.restante));
    return abs.texto;
}
// Mapa > aplicarDanoRapido em mim: absorveu ? bruto(restante) : valorRaw (= bruto(valor)).
function antesRapidoEmMim(f, d, nome) {
    const abs = absorverNoRascunho(f, d, nome);
    f.vida.atual = Math.max(0, (f.vida.atual || 0) - (abs.absorvido > 0 ? danoExibidoParaBruto(abs.restante) : danoExibidoParaBruto(d)));
    return abs.texto;
}
const montar = (vida, escudos, extra) => JSON.parse(JSON.stringify({ vida: { atual: vida === undefined ? null : vida }, ...(escudos ? { escudos } : {}), ...extra }, (k, v) => (Number.isNaN(v) ? null : v)));

// JSON perde undefined/NaN; refaz os valores especiais depois do clone.
function fichaDoCaso(vida, escudos, extra) {
    const f = montar(0, escudos, extra);
    if (vida === undefined) delete f.vida.atual; else f.vida.atual = vida;
    return f;
}

describe('P1 - ponto unico de dano e IDENTICO ao de antes sem gatilhos e sem God Mode (matriz diferencial)', () => {
    let casos = 0;
    it.each([['Defesa/Zona/Reflexo/estados', antesAbsorveEGrava], ['Dano Rapido em mim', antesRapidoEmMim]])('%s: mesma Vida, mesmos escudos, mesmo texto, nenhuma chave nova', (_nome, antes) => {
        EXTRAS.forEach((extra) => ESCUDOS.forEach((escudos) => VIDAS.forEach((vida) => DANOS.forEach((d) => {
            const velha = fichaDoCaso(vida, escudos, extra);
            const nova = fichaDoCaso(vida, escudos, extra);
            const textoVelho = antes(velha, d, 'Eu');
            const r = aplicarDanoNaVida(nova, d, { nome: 'Eu', nomeEscudo: 'Eu', cenaId: 'c1', vidaMaxBruta: MAX });
            casos++;
            // o gatilho Negar morte so muda o resultado quando o golpe zeraria; nesses casos os extras relevantes estao ligados? nao: todos os EXTRAS acima sao inertes
            const rotulo = `vida=${String(vida)} dano=${String(d)} escudos=${escudos ? escudos.length : 0} extra=${EXTRAS.indexOf(extra)}`;
            expect(ser(nova), rotulo).toBe(ser(velha));
            expect(r.textoEscudo, rotulo).toBe(textoVelho);
            expect(r.imune).toBe(false);
            expect(r.textos).toEqual([]);
        }))));
        expect(casos).toBeGreaterThan(1000);
    });

    it('com Negar morte LIGADO e golpe que NAO zera: identico ao de antes (nada gravado a mais)', () => {
        const extra = { poderes: [poder([NEGAR])] };
        [[100000, 99999], [100000, 0], [100000, 1], [5, 4.999], [100000, NaN], [100000, -1]].forEach(([v, d]) => {
            const velha = fichaDoCaso(v * F, undefined, extra);
            const nova = fichaDoCaso(v * F, undefined, extra);
            antesAbsorveEGrava(velha, d, 'Eu');
            aplicarDanoNaVida(nova, d, { nome: 'Eu', vidaMaxBruta: MAX, cenaId: 'c1' });
            expect(ser(nova), `v=${v} d=${d}`).toBe(ser(velha));
            expect('combate' in nova).toBe(false);
        });
    });

    it('caso a caso a mao: dano menor / igual / maior que o escudo', () => {
        const e = () => [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }];
        let f = ficha({ escudos: e() }, 1000);
        let r = aplicarDanoNaVida(f, 200, { nome: 'Ana', nomeEscudo: 'Ana' });
        expect(f.vida.atual).toBe(1000 * F);
        expect(f.escudos[0].valor).toBe(100);
        expect(r.textoEscudo).toBe('Ana absorveu 200 (restam 100)');
        f = ficha({ escudos: e() }, 1000);
        r = aplicarDanoNaVida(f, 300, { nome: 'Ana', nomeEscudo: 'Ana' });
        expect(f.vida.atual).toBe(1000 * F);
        expect('escudos' in f).toBe(false);
        expect(r.textoEscudo).toBe('Ana absorveu 300 (restam 0)');
        f = ficha({ escudos: e() }, 1000);
        r = aplicarDanoNaVida(f, 350.5, { nome: 'Ana', nomeEscudo: 'Ana' });
        expect(f.vida.atual).toBe(1000 * F - 50.5 * F);
        expect('escudos' in f).toBe(false);
    });

    it('Vida atual 0 com dano continua 0; Vida maxima 0 (ctx) nao muda nada; dano fracionario e enorme', () => {
        let f = ficha({}, 0);
        aplicarDanoNaVida(f, 50, { vidaMaxBruta: 0 });
        expect(f.vida.atual).toBe(0);
        f = ficha({}, 10);
        aplicarDanoNaVida(f, 0.25, { vidaMaxBruta: 0 });
        expect(f.vida.atual).toBe(10 * F - 250);
        f = ficha({}, 10);
        aplicarDanoNaVida(f, 1e30);
        expect(f.vida.atual).toBe(0);
        f = ficha({}, 10);
        aplicarDanoNaVida(f, Infinity);
        expect(f.vida.atual).toBe(0);
    });

    it('Dano Verdadeiro (so um numero final aqui) cai igual: o motor nao distingue tipo de dano sem God Mode', () => {
        const f = ficha({}, 100);
        aplicarDanoNaVida(f, 40);
        expect(f.vida.atual).toBe(60 * F);
    });

    it('semEscudo (aoDesligar) e jaAbsorvido nao tocam nos escudos e dao a mesma Vida', () => {
        const esc = () => [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }];
        let f = ficha({ escudos: esc() }, 1000);
        aplicarDanoNaVida(f, 400, { semEscudo: true });
        expect(f.vida.atual).toBe(600 * F);
        expect(f.escudos).toEqual(esc());
        f = ficha({ escudos: esc() }, 1000);
        const r = aplicarDanoNaVida(f, 100, { jaAbsorvido: true });
        expect(f.vida.atual).toBe(900 * F);
        expect(f.escudos).toEqual(esc());
        expect(r.textoEscudo).toBe('');
    });

    it('DIFERENCA conhecida: ficha SEM `vida` nao absorve nem gasta escudo (o Dano Rapido em mim antigo absorvia mesmo assim)', () => {
        // Antes: Mapa > aplicarDanoRapido em mim chamava absorverNoRascunho ANTES de checar f.vida. Agora retorna cedo.
        // Defesa/Zona/Reflexo ja checavam `if (ficha.vida)` antes, entao la nada muda. Ficha real sempre tem `vida`.
        const velha = { escudos: [{ id: 'a', nome: 'D', valor: 30, tipo: 'escudo' }] };
        absorverNoRascunho(velha, 10, 'Eu');
        const nova = { escudos: [{ id: 'a', nome: 'D', valor: 30, tipo: 'escudo' }] };
        aplicarDanoNaVida(nova, 10, { nome: 'Eu' });
        expect(velha.escudos[0].valor).toBe(20);
        expect(nova.escudos[0].valor).toBe(30);
    });

    it('entradas invalidas: ficha null/sem vida nao quebram e devolvem resultado neutro', () => {
        expect(aplicarDanoNaVida(null, 5)).toMatchObject({ vidaNova: 0, imune: false, anulado: false, textos: [] });
        expect(aplicarDanoNaVida({}, 5)).toMatchObject({ vidaNova: 0 });
        expect(aplicarDanoNaVida(undefined)).toMatchObject({ textos: [] });
    });
});

// ======================================================================================================
// PRIORIDADE 2 - o que o motor faz
// ======================================================================================================
describe('Negar morte (danoQueZeraria + anularDano + definirVida 1, vida_maior_que:1, 1 por cena)', () => {
    const nova = (v = 100000) => ficha({ poderes: [poder([NEGAR])] }, v);
    it('golpe exato (Vida = dano) e golpe maior seguram em 1', () => {
        [100000, 100001, 1e12].forEach((d) => {
            const f = nova();
            const r = dano(f, d);
            expect(f.vida.atual, `d=${d}`).toBe(1 * F);
            expect(r.anulado).toBe(true);
            expect(r.textos.join(' ')).toContain('Negar morte segurou em 1 de vida');
            expect(r.caminhos.sort()).toEqual(['combate/gatilhos', 'combate/usosPoderes', 'vida/atual']);
            expect(semUndefined(f)).toBe(true);
        });
    });
    it('golpe que deixa Vida >0 nao dispara nem gasta o uso', () => {
        const f = nova();
        dano(f, 99999);
        expect(f.vida.atual).toBe(1 * F);
        expect('combate' in f).toBe(false);
    });
    it('em 1 de vida NAO segura; com 1,5 de vida segura', () => {
        const f = nova(1);
        const r = dano(f, 1);
        expect(f.vida.atual).toBe(0);
        expect(r.anulado).toBe(false);
        const g = nova(1.5);
        dano(g, 10);
        expect(g.vida.atual).toBe(1 * F);
    });
    it('segunda vez na mesma cena NAO segura; nova cena segura; descansar volta a valer na mesma cena', () => {
        const f = nova();
        dano(f, 1e6);
        expect(f.vida.atual).toBe(1 * F);
        f.vida.atual = 50 * F;
        dano(f, 1e6);
        expect(f.vida.atual).toBe(0);
        f.vida.atual = 50 * F;
        dano(f, 1e6, { cenaId: 'c2' });
        expect(f.vida.atual).toBe(1 * F);
        // c2 ja gastou: de novo na c2 morre
        f.vida.atual = 50 * F;
        dano(f, 1e6, { cenaId: 'c2' });
        expect(f.vida.atual).toBe(0);
        descansarCompleto(f);
        f.vida.atual = 50 * F;
        dano(f, 1e6, { cenaId: 'c2' });
        expect(f.vida.atual).toBe(1 * F);
    });
    it('voltar a uma cena antiga NAO restaura o uso (contador unico por gatilho sobrescrito pela cena nova)', () => {
        const f = nova();
        dano(f, 1e6, { cenaId: 'c1' });
        f.vida.atual = 50 * F; dano(f, 1e6, { cenaId: 'c2' });
        expect(f.vida.atual).toBe(1 * F);
        f.vida.atual = 50 * F; dano(f, 1e6, { cenaId: 'c1' }); // contador agora esta marcado c2: c1 conta como "cena nova" outra vez
        expect(f.vida.atual).toBe(1 * F);
    });
    it('escudo absorve antes: so conta o que sobra para zerar', () => {
        const f = nova(10); f.escudos = [{ id: 'a', nome: 'D', valor: 50, tipo: 'escudo' }];
        dano(f, 59);
        expect(f.vida.atual).toBe(1 * F);
        expect('combate' in f).toBe(false);
        expect(f.escudos).toBeUndefined();
        const g = nova(10); g.escudos = [{ id: 'a', nome: 'D', valor: 50, tipo: 'escudo' }];
        const r = dano(g, 60);
        expect(r.anulado).toBe(true);
        expect(g.vida.atual).toBe(1 * F);
        expect(g.escudos).toBeUndefined();
        expect(r.caminhos).toContain('escudos');
    });
    it('dano 0 / NaN / negativo nunca dispara', () => {
        [0, NaN, -5, undefined].forEach((d) => {
            const f = nova();
            dano(f, d);
            expect(f.vida.atual).toBe(100000 * F);
            expect('combate' in f).toBe(false);
        });
    });
    it('com Vida ja 0, dano nao dispara (nao ressuscita)', () => {
        const f = nova(0);
        dano(f, 10);
        expect(f.vida.atual).toBe(0);
    });
    it('definirVida maior que o maximo e cortada no maximo; cura nunca passa do maximo', () => {
        const f = ficha({ poderes: [poder([{ ...NEGAR, id: 'g', condicoes: [], acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 10_000_000 }] }])] }, 50);
        dano(f, 1e6);
        expect(f.vida.atual).toBe(MAX);
        const g = ficha({}, 99990);
        const acoes = [{ tipo: 'curar', modo: 'fixo', valor: 1e9, chave: 'k', gatilhoNome: 'C' }];
        aplicarAcoesNoRascunho(g, acoes, { vidaMaxBruta: MAX });
        expect(g.vida.atual).toBe(MAX);
        const h = ficha({}, 99990);
        aplicarAcoesNoRascunho(h, [{ tipo: 'curar', modo: 'percMax', valor: 1000 }], { vidaMaxBruta: MAX });
        expect(h.vida.atual).toBe(MAX);
        const i = ficha({}, 99990);
        aplicarAcoesNoRascunho(i, [{ tipo: 'curar', modo: 'percAtual', valor: 1000 }], { vidaMaxBruta: MAX });
        expect(i.vida.atual).toBe(MAX);
    });
    it('Vida ACIMA do maximo (buff expirado) nao e reduzida por cura', () => {
        const f = ficha({}, 150000);
        aplicarAcoesNoRascunho(f, [{ tipo: 'curar', modo: 'fixo', valor: 10 }], { vidaMaxBruta: MAX });
        expect(f.vida.atual).toBe(150000 * F);
    });
    it('Vida maxima desconhecida (0): definirVida percMax e ignorada (nunca grava Vida 0 por engano); o golpe continua anulado pelo anularDano', () => {
        const f = ficha({ poderes: [poder([{ id: 'z', nome: 'Z', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', percMax: 1 }] }])] }, 50);
        const r = aplicarDanoNaVida(f, 1e6, { cenaId: 'c', vidaMaxBruta: 0 }); // ficha minima: getVidaMaxBrutaNpc -> 0
        expect(r.anulado).toBe(true);
        expect(f.vida.atual).toBe(50 * F);
    });
});

describe('Volta das cinzas (10%, 9-6%, 5-1%, 0%)', () => {
    const nova = (v = 100000, extra = {}) => ficha({ poderes: [poder(CINZAS)], ...extra }, v);
    const texto = (r) => r.textos.join(' | ');
    it('cair para 10% (inclusive 10,001%): so a faixa 10%: escudo + mensagem', () => {
        [10000, 10001, 10000.9].forEach((alvo) => {
            const f = nova();
            const r = dano(f, 100000 - alvo);
            expect(texto(r), `alvo=${alvo}`).toContain('As cinzas se agitam');
            expect(f.escudos[0]).toMatchObject({ nome: 'Cinzas', valor: 5000 });
            expect(f.combate.imunidadeTotal).toBeUndefined();
        });
    });
    it('10% por baixo (9,9999%) cai na faixa 9-6%: cura 20% da maxima', () => {
        const f = nova();
        const r = dano(f, 100000 - 9999.9);
        expect(f.vida.atual).toBe((9999.9 + 20000) * F);
        expect(f.escudos).toBeUndefined();
        expect(texto(r)).toContain('curou 20.000');
    });
    it('5% e 1%: faixa 5-1% limpa condicoes e da God Mode de 1 turno', () => {
        [5000, 5000.9, 1000, 1500].forEach((alvo) => {
            const f = nova(100000, { condicoes: [{ id: 'sangrando', stacks: 1 }] });
            dano(f, 100000 - alvo);
            expect(f.condicoes, `alvo=${alvo}`).toBeUndefined();
            expect(f.combate.imunidadeTotal).toEqual({ turnosRestantes: 1, origem: 'Cinzas 5-1%' });
        });
    });
    it('0,6% (abaixo de 1%) NAO cai em nenhuma faixa por causa do arredondamento para baixo (lacuna de projeto)', () => {
        const f = nova(100000, { condicoes: [{ id: 'sangrando', stacks: 1 }] });
        dano(f, 100000 - 600);
        expect(f.vida.atual).toBe(600 * F);
        expect(f.condicoes).toHaveLength(1);
        expect('combate' in f).toBe(false);
    });
    it('0%: golpe fatal vira 1% da maxima e, como 1% esta na faixa 5-1%, a faixa tambem dispara (God Mode)', () => {
        const f = nova(100000, { condicoes: [{ id: 'sangrando', stacks: 1 }] });
        const r = dano(f, 1e9);
        expect(r.anulado).toBe(true);
        expect(f.vida.atual).toBe(1000 * F);
        expect(f.condicoes).toBeUndefined();
        expect(temImunidadeTotal(f)).toBe(true);
        expect(f.combate.usosPoderes['p1:vc0']).toBeTruthy();
        expect(f.combate.usosPoderes['p1:vc3']).toBeTruthy();
        expect(f.combate.usosPoderes['p1:vc1']).toBeUndefined();
    });
    it('golpe que cruza varias faixas dispara so a final (100% -> 3%)', () => {
        const f = nova();
        dano(f, 97000);
        expect(Object.keys(f.combate.usosPoderes)).toEqual(['p1:vc3']);
        expect(f.escudos).toBeUndefined();
    });
    it('golpe que mantem a Vida na mesma faixa nao repete (8% -> 7%)', () => {
        const f = nova(8000);
        dano(f, 1000);
        expect(f.vida.atual).toBe(7000 * F);
        expect('combate' in f).toBe(false);
    });
    it('descendo faixa a faixa em golpes seguidos: dispara cada uma uma vez', () => {
        const f = nova();
        dano(f, 90000); // 10%
        expect(Object.keys(f.combate.usosPoderes)).toEqual(['p1:vc1']);
        expect(f.escudos[0].valor).toBe(5000);
        dano(f, 1000);  // o escudo de 5000 da Cinzas 10% absorve o golpe inteiro: a Vida nem se mexe
        expect(f.vida.atual).toBe(10000 * F);
        expect(Object.keys(f.combate.usosPoderes)).toEqual(['p1:vc1']);
        delete f.escudos;
        dano(f, 1000);  // 9%
        expect(Object.keys(f.combate.usosPoderes).sort()).toEqual(['p1:vc1', 'p1:vc2']);
        expect(f.vida.atual).toBe((9000 + 20000) * F); // curou 20% da maxima
    });
    it('limite por descanso: re-entrar na faixa 5-1% sem descansar nao repete; descansar libera', () => {
        const f = nova();
        dano(f, 97000);
        expect(temImunidadeTotal(f)).toBe(true);
        passarTurnoDaImunidadeTotal(f);
        f.vida.atual = 50000 * F;
        dano(f, 47000);
        expect('imunidadeTotal' in f.combate).toBe(false);
        expect(f.vida.atual).toBe(3000 * F);
        descansarCompleto(f);
        f.vida.atual = 50000 * F;
        dano(f, 47000, { cenaId: 'c1' });
        expect(temImunidadeTotal(f)).toBe(true);
    });
    it('escudo do gatilho nao duplica ao disparar de novo (renova com o mesmo id)', () => {
        const f = nova();
        dano(f, 90000);
        expect(f.escudos).toHaveLength(1);
        descansarCompleto(f);
        f.escudos = undefined; delete f.escudos;
        f.vida.atual = 100000 * F; dano(f, 90000);
        expect(f.escudos).toHaveLength(1);
        // disparar de novo com o escudo do gatilho ainda la (parcialmente gasto): renova para 5000, sem segundo escudo
        const g = ficha({});
        const acao = { tipo: 'escudo', nome: 'Cinzas', valor: 5000, tipoEscudo: 'escudo', chave: 'p1:vc1', gatilhoNome: 'G' };
        aplicarAcoesNoRascunho(g, [acao], {});
        g.escudos[0].valor = 100;
        aplicarAcoesNoRascunho(g, [acao], {});
        expect(g.escudos).toHaveLength(1);
        expect(g.escudos[0].valor).toBe(5000);
    });
    it('escudo criado por gatilho de PODER leva poderId e some no descanso; o de item/passiva fica (como escudo manual)', () => {
        const f = nova();
        dano(f, 90000);
        expect(f.escudos).toHaveLength(1);
        expect(f.escudos[0].poderId).toBe('p1');
        descansarCompleto(f);
        expect(f.escudos).toBeUndefined();
        const g = ficha({ passivas: [{ id: 'ps', nome: 'Passiva', gatilhos: [CINZAS[0]] }] });
        dano(g, 90000);
        expect(g.escudos).toHaveLength(1);
        descansarCompleto(g);
        expect(g.escudos).toHaveLength(1);
    });
});

describe('God Mode (imunidadeTotal)', () => {
    const god = (turnos = 1) => ({ turnosRestantes: turnos, origem: 'Cinzas' });
    it('dano vira 0 mesmo enorme, nao gasta escudo, nao dispara gatilho nem grava chaves', () => {
        const f = ficha({ poderes: [poder([NEGAR, ...CINZAS])], combate: { imunidadeTotal: god() }, escudos: [{ id: 'a', nome: 'D', valor: 100, tipo: 'escudo' }] });
        const antes = JSON.stringify(f);
        [1, 99999, 1e30, Infinity].forEach((d) => {
            const r = dano(f, d);
            expect(r.imune).toBe(true);
            expect(r.caminhos).toEqual([]);
            expect(r.textos[0]).toContain('Imunidade total');
        });
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('dano 0 com God Mode nao gera frase no feed', () => {
        const f = ficha({ combate: { imunidadeTotal: god() } });
        expect(dano(f, 0).textos).toEqual([]);
        expect(dano(f, NaN).textos).toEqual([]);
    });
    it('turnosRestantes 0, negativo ou lixo nao e imunidade', () => {
        [0, -1, 'x', null, undefined, NaN].forEach((t) => {
            expect(temImunidadeTotal({ combate: { imunidadeTotal: { turnosRestantes: t } } })).toBe(false);
        });
        expect(temImunidadeTotal({ combate: { imunidadeTotal: { turnosRestantes: '2' } } })).toBe(true);
        expect(temImunidadeTotal(null)).toBe(false);
        expect(temImunidadeTotal({})).toBe(false);
    });
    it('duracao na pratica: N turnos = N viradas do turno do dono; com 1 protege so ate o INICIO do proximo turno dele', () => {
        const f = ficha({ combate: { imunidadeTotal: god(2) } });
        dano(f, 10);
        expect(f.vida.atual).toBe(100000 * F);
        let r = passarTurnoDaImunidadeTotal(f);
        expect(r).toEqual({ mudou: true, texto: '' });
        expect(f.combate.imunidadeTotal.turnosRestantes).toBe(1);
        dano(f, 10);
        expect(f.vida.atual).toBe(100000 * F);
        r = passarTurnoDaImunidadeTotal(f);
        expect(r.mudou).toBe(true);
        expect(r.texto).toContain('a Imunidade total terminou');
        expect('imunidadeTotal' in f.combate).toBe(false);
        dano(f, 10);
        expect(f.vida.atual).toBe(99990 * F);
        expect(passarTurnoDaImunidadeTotal(f)).toEqual({ mudou: false, texto: '' });
        expect(passarTurnoDaImunidadeTotal(null)).toEqual({ mudou: false, texto: '' });
    });
    it('passarTurno com turnosRestantes lixo apaga a chave sem undefined', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 'x' } } });
        passarTurnoDaImunidadeTotal(f);
        expect('imunidadeTotal' in f.combate).toBe(false);
        expect(semUndefined(f)).toBe(true);
    });
    it('descansarCompleto limpa imunidadeTotal e combate.gatilhos mesmo sem combate previo', () => {
        const f = ficha({});
        descansarCompleto(f);
        expect(f.combate.imunidadeTotal).toBeUndefined();
        expect(f.combate.gatilhos).toBeUndefined();
        const g = ficha({ combate: { gatilhos: { a: { ultimoEvento: 'e' } }, imunidadeTotal: god(3) } });
        descansarCompleto(g);
        expect('gatilhos' in g.combate).toBe(false);
        expect('imunidadeTotal' in g.combate).toBe(false);
    });
});

describe('Quais gatilhos valem (coletarGatilhos) e idempotencia / laco', () => {
    const base = (extra) => ficha(extra, 100000);
    it('poder DESLIGADO nao dispara, LIGADO dispara, passivo dispara mesmo desligado', () => {
        const off = base({ poderes: [poder([NEGAR], { ativa: false })] });
        dano(off, 1e9);
        expect(off.vida.atual).toBe(0);
        const on = base({ poderes: [poder([NEGAR])] });
        dano(on, 1e9);
        expect(on.vida.atual).toBe(1 * F);
        const pas = base({ poderes: [poder([{ ...NEGAR, passivo: true }], { ativa: false })] });
        dano(pas, 1e9);
        expect(pas.vida.atual).toBe(1 * F);
    });
    it('ligar o poder no meio muda o resultado do golpe seguinte', () => {
        const f = base({ poderes: [poder([NEGAR], { ativa: false })] });
        dano(f, 50000);
        f.poderes[0].ativa = true;
        dano(f, 1e9);
        expect(f.vida.atual).toBe(1 * F);
    });
    it('item equipado vale, guardado nao (nem passivo); efeitosAtivos:false so com passivo', () => {
        const item = (extra) => ({ id: 'i1', nome: 'Amuleto', equipado: true, gatilhos: [NEGAR], ...extra });
        const t = (inv) => { const f = base({ inventario: [inv] }); dano(f, 1e9); return f.vida.atual; };
        expect(t(item())).toBe(1 * F);
        expect(t(item({ equipado: false }))).toBe(0);
        expect(t(item({ equipado: false, gatilhos: [{ ...NEGAR, passivo: true }] }))).toBe(0);
        expect(t(item({ efeitosAtivos: false }))).toBe(0);
        expect(t(item({ efeitosAtivos: false, gatilhos: [{ ...NEGAR, passivo: true }] }))).toBe(1 * F);
        expect(coletarGatilhos(base({ inventario: [item()] }))[0].fonte).toMatchObject({ tipo: 'item', id: 'i1' });
    });
    it('passiva sempre vale; forma ativa vale, forma inativa nao', () => {
        const f = base({ passivas: [{ id: 'ps', nome: 'Passiva', gatilhos: [NEGAR] }] });
        dano(f, 1e9);
        expect(f.vida.atual).toBe(1 * F);
        const forma = (ativaId) => base({ poderes: [{ id: 'p1', nome: 'P', ativa: true, formaAtivaId: ativaId, formas: [{ id: 'fa', nome: 'A', gatilhos: [NEGAR] }, { id: 'fb', nome: 'B' }] }] });
        const a = forma('fa'); dano(a, 1e9); expect(a.vida.atual).toBe(1 * F);
        const b = forma('fb'); dano(b, 1e9); expect(b.vida.atual).toBe(0);
        const c = forma(''); dano(c, 1e9); expect(c.vida.atual).toBe(0);
        const d = forma('inexistente'); dano(d, 1e9); expect(d.vida.atual).toBe(0);
        expect(Object.keys(a.combate.usosPoderes)).toEqual(['p1:forma:fa:nm']);
    });
    it('mestreDesligou ignora o gatilho; religar volta a valer', () => {
        const f = base({ poderes: [poder([{ ...NEGAR, mestreDesligou: true }])] });
        dano(f, 1e9);
        expect(f.vida.atual).toBe(0);
        const g = base({ poderes: [poder([{ ...NEGAR, mestreDesligou: false }])] });
        dano(g, 1e9);
        expect(g.vida.atual).toBe(1 * F);
    });
    it('lixo em poderes/inventario/passivas (null, string, gatilhos nao-array) nao quebra', () => {
        const f = base({ poderes: [null, 5, { id: 'x', ativa: true, gatilhos: 'oi' }, { id: 'y', ativa: true, gatilhos: { a: 1 } }], inventario: [null, { equipado: true, gatilhos: 3 }], passivas: [undefined, { gatilhos: null }] });
        expect(coletarGatilhos(f)).toEqual([]);
        dano(f, 10);
        expect(f.vida.atual).toBe(99990 * F);
        expect(coletarGatilhos(null)).toEqual([]);
        expect(coletarGatilhos('x')).toEqual([]);
    });
    it('chave do gatilho nao tem caracteres proibidos do Firebase (id do poder com . # $ [ ] /)', () => {
        const f = base({ poderes: [{ id: 'a.b#c$d[e]f/g', nome: 'P', ativa: true, gatilhos: [NEGAR] }] });
        dano(f, 1e9);
        const chaves = Object.keys(f.combate.usosPoderes).concat(Object.keys(f.combate.gatilhos));
        chaves.forEach(c => expect(c).not.toMatch(/[.#$[\]/]/));
    });
    it('mesmo eventoId aplicado duas vezes: o segundo NAO duplica (idempotente); dois golpes com ids diferentes respeitam o limite', () => {
        const f = base({ poderes: [poder([{ ...NEGAR, limite: undefined }])] });
        dano(f, 1e9, { eventoId: 'E1' });
        expect(f.vida.atual).toBe(1 * F);
        dano(f, 1e9, { eventoId: 'E1' }); // reexecucao do mesmo golpe: gatilho bloqueado -> o golpe passa
        expect(f.vida.atual).toBe(0);
        const g = base({ poderes: [poder([NEGAR])] });
        dano(g, 1e9, { eventoId: 'E1' });
        dano(g, 1e9, { eventoId: 'E2' });
        expect(g.vida.atual).toBe(0);
    });
    it('sem eventoId informado (o que os 7 caminhos fazem hoje) o gatilho funciona mas NAO grava combate.gatilhos nem repete por idempotencia', () => {
        const f = base({ poderes: [poder([NEGAR])] });
        const r = aplicarDanoNaVida(f, 1e9, { vidaMaxBruta: MAX });
        expect(f.vida.atual).toBe(1 * F);
        expect(r.caminhos).not.toContain('combate/gatilhos');
        expect(f.combate.gatilhos).toBeUndefined();
        expect(f.combate.usosPoderes['p1:nm']).toBeTruthy();
    });
    it('profundidade maxima 3 bloqueia; jaDisparados bloqueia o mesmo gatilho na cadeia', () => {
        const f = base({ poderes: [poder([NEGAR])] });
        const ctx = { vidaAntes: 100 * F, vidaDepois: 0, vidaMaxBruta: MAX, cenaId: 'c' };
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx, profundidade: 3 }, f).bloqueados[0].motivo).toBe('profundidade máxima');
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx, profundidade: 2 }, f).disparados).toHaveLength(1);
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx, jaDisparados: ['p1:nm'] }, f).bloqueados[0].motivo).toBe('já disparou nesta cadeia');
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx, jaDisparados: new Set(['p1:nm']) }, f).disparados).toHaveLength(0);
    });
    it('laco: gatilho de faixa cuja acao cura para dentro da faixa nao dispara em cadeia dentro do mesmo golpe', () => {
        const laco = { id: 'l', nome: 'Laco', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 0 }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 5 }] };
        const f = base({ poderes: [poder([laco])] });
        const r = dano(f, 60000);
        expect(r.textos.filter(t => t.includes('curou'))).toHaveLength(1);
        expect(f.vida.atual).toBe(45000 * F);
    });
    it('eventos desconhecidos / ficha ausente nao disparam nem quebram', () => {
        const f = base({ poderes: [poder([NEGAR])] });
        expect(avaliarGatilhos({ tipo: 'xyz' }, {}, f).acoes).toEqual([]);
        expect(avaliarGatilhos(null, {}, f).acoes).toEqual([]);
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, {}, null).acoes).toEqual([]);
    });
    it('condicoes: vida_menor_que, em_combate e quando invalido', () => {
        const mk = (cond, extra = {}) => base({ poderes: [poder([{ ...NEGAR, condicoes: cond, limite: undefined }])], ...extra });
        let f = mk(['vida_menor_que:200000']); dano(f, 1e9); expect(f.vida.atual).toBe(1 * F);
        f = mk(['vida_menor_que:100000']); dano(f, 1e9); expect(f.vida.atual).toBe(0);
        f = mk(['em_combate']); dano(f, 1e9); expect(f.vida.atual).toBe(0);
        f = mk(['em_combate'], { iniciativa: 12 }); dano(f, 1e9); expect(f.vida.atual).toBe(1 * F);
        f = mk(['em_combate', 'vida_maior_que:5000'], { iniciativa: 12 }); dano(f, 1e9); expect(f.vida.atual).toBe(1 * F);
        f = mk(['em_combate', 'vida_maior_que:500000'], { iniciativa: 12 }); dano(f, 1e9); expect(f.vida.atual).toBe(0);
    });
    it('prioridade: gatilho de maior prioridade e executado primeiro', () => {
        const a = { id: 'a', nome: 'A', prioridade: 1, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'mensagem', texto: 'primeiro?' }] };
        const b = { id: 'b', nome: 'B', prioridade: 50, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'mensagem', texto: 'segundo?' }] };
        const f = base({ poderes: [poder([a, b])] });
        const r = dano(f, 1e9);
        expect(r.textos.findIndex(t => t.startsWith('B:'))).toBeLessThan(r.textos.findIndex(t => t.startsWith('A:')));
    });
    it('fase antes: um uso por golpe mesmo com dois danoQueZeraria; opcional nao dispara', () => {
        const f = base({ poderes: [poder([{ ...NEGAR, modo: 'opcional', armado: true }])] });
        dano(f, 1e9);
        expect(f.vida.atual).toBe(0);
    });
});

describe('Acoes: buff, limparCondicoes, escudo, mensagem', () => {
    it('limparCondicoes sem condicoes nao grava nada; com condicoes apaga e marca o caminho', () => {
        const f = ficha({});
        expect(aplicarAcoesNoRascunho(f, [{ tipo: 'limparCondicoes' }], {}).caminhos).toEqual([]);
        f.condicoes = [{ id: 'sangrando', stacks: 1 }];
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'limparCondicoes', gatilhoNome: 'X' }], {});
        expect(r.caminhos).toEqual(['condicoes']);
        expect(f.condicoes).toBeUndefined();
        expect(camposParaGravar(f, r.caminhos)).toEqual({ condicoes: null });
    });
    it('buff renova em vez de empilhar ao disparar de novo', () => {
        const f = ficha({});
        const acao = { tipo: 'buff', atributo: 'evasiva', valor: 5, duracao: 3, modo: 'turnos', chave: 'p1:g', gatilhoNome: 'B', fonte: { nome: 'Poder' } };
        aplicarAcoesNoRascunho(f, [acao], {});
        aplicarAcoesNoRascunho(f, [acao], {});
        expect(f.buffsTemporarios).toHaveLength(1);
        expect(semUndefined(f)).toBe(true);
    });
    it('escudo cheio (12) recusa com frase de aviso e nao quebra; id do escudo do gatilho e estavel', () => {
        const f = ficha({ escudos: Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, nome: 'E', valor: 5, tipo: 'escudo' })) });
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'escudo', nome: 'Novo', valor: 10, tipoEscudo: 'escudo', chave: 'p:g', gatilhoNome: 'G' }], {});
        expect(r.textos[0]).toContain('sem espaço');
        expect(f.escudos).toHaveLength(12);
    });
    it('acao desconhecida e ficha sem vida sao ignoradas', () => {
        const f = { poderes: [] };
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'xyz' }, { tipo: 'curar', modo: 'fixo', valor: 5 }, { tipo: 'definirVida', valor: 5 }], {});
        expect(r.textos).toEqual([]);
        expect(aplicarAcoesNoRascunho(null, [], {})).toEqual({ textos: [], anulado: false, caminhos: [] });
        expect(aplicarAcoesNoRascunho(f, null, {})).toEqual({ textos: [], anulado: false, caminhos: [] });
    });
    it('camposParaGravar le caminhos aninhados e devolve null para ausentes; camposDeGatilhosAlterados so lista o que mudou', () => {
        const a = ficha({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        const b = JSON.parse(JSON.stringify(a)); delete b.combate.imunidadeTotal;
        expect(camposDeGatilhosAlterados(a, b)).toEqual({ 'combate/imunidadeTotal': null });
        expect(camposDeGatilhosAlterados(a, a)).toEqual({});
        expect(camposParaGravar(a, ['combate/imunidadeTotal/turnosRestantes', 'x/y/z'])).toEqual({ 'combate/imunidadeTotal/turnosRestantes': 1, 'x/y/z': null });
        expect(camposParaGravar(a, null)).toEqual({});
    });
});

describe('normalizarGatilhos - valores invalidos e limites', () => {
    const ev = { tipo: 'danoQueZeraria' };
    const ok = [{ tipo: 'anularDano' }];
    const um = (g) => normalizarGatilhos([{ nome: 'T', evento: ev, acoes: ok, ...g }]);
    it('evento desconhecido, ausente ou faixa sem numero e descartado; faixa invertida/limitada/uma ponta so e corrigida', () => {
        expect(normalizarGatilhos([{ nome: 'a', acoes: ok }]).descartados[0].motivo).toBe('evento desconhecido');
        const msg = [{ tipo: 'mensagem', texto: 'oi' }];
        expect(normalizarGatilhos([{ nome: 'a', evento: { tipo: 'vidaAbaixoDe' }, acoes: msg }]).gatilhos).toEqual([]);
        expect(normalizarGatilhos([{ nome: 'a', evento: { tipo: 'vidaAbaixoDe', de: 'x', ate: 'y' }, acoes: msg }]).gatilhos).toEqual([]);
        const f = (de, ate) => normalizarGatilhos([{ nome: 'a', evento: { tipo: 'vidaAbaixoDe', de, ate }, acoes: msg }]).gatilhos[0].evento;
        expect(f(1, 5)).toEqual({ tipo: 'vidaAbaixoDe', de: 5, ate: 1 });
        expect(f(500, -9)).toEqual({ tipo: 'vidaAbaixoDe', de: 100, ate: 0 });
        expect(f(7, undefined)).toEqual({ tipo: 'vidaAbaixoDe', de: 7, ate: 7 });
        expect(f(undefined, '7,9')).toEqual({ tipo: 'vidaAbaixoDe', de: 7, ate: 7 });
        expect(f(9.9, 6.1)).toEqual({ tipo: 'vidaAbaixoDe', de: 9, ate: 6 });
        expect(f(Infinity, 3)).toEqual({ tipo: 'vidaAbaixoDe', de: 3, ate: 3 }); // Infinity nao e numero finito: so a outra ponta vale
    });
    it('mais de 8 gatilhos: os extras vao para descartados; ids repetidos viram ids unicos; id com caracteres proibidos e limpo', () => {
        const lista = Array.from({ length: 11 }, (_, i) => ({ id: 'mesmo', nome: `G${i}`, evento: ev, acoes: ok }));
        const r = normalizarGatilhos(lista);
        expect(r.gatilhos).toHaveLength(8);
        expect(r.descartados).toHaveLength(3);
        expect(r.descartados[0].motivo).toContain('mais de 8');
        expect(new Set(r.gatilhos.map(g => g.id)).size).toBe(8);
        const colide = normalizarGatilhos([{ id: 'a', evento: ev, acoes: ok }, { id: 'a', evento: ev, acoes: ok }, { id: 'g2', evento: ev, acoes: ok }]).gatilhos.map(g => g.id);
        expect(new Set(colide).size).toBe(3);
        expect(um({ id: 'a.b/c#d$e[f]' }).gatilhos[0].id).toBe('a_b_c_d_e_f_');
        expect(um({ id: '   ' }).gatilhos[0].id).toMatch(/^g_/);
        const sem = normalizarGatilhos([{ evento: ev, acoes: ok }, { evento: ev, acoes: ok }], { persistir: false }).gatilhos.map(g => g.id);
        expect(sem).toEqual(['g1', 'g2']); // leitura (persistir:false) e deterministica
    });
    it('mais de 6 acoes: trunca em 6 (as demais somem) e uma acao invalida dentro das 6 descarta o gatilho todo', () => {
        const sete = Array.from({ length: 7 }, () => ({ tipo: 'anularDano' }));
        expect(um({ acoes: sete }).gatilhos[0].acoes).toHaveLength(6);
        const r = um({ acoes: [{ tipo: 'anularDano' }, { tipo: 'curar', modo: 'fixo', valor: 0 }] });
        expect(r.gatilhos).toEqual([]);
        expect(r.descartados[0].motivo).toContain('inválida');
        expect(um({ acoes: [] }).descartados[0].motivo).toBe('sem ações');
        expect(um({ acoes: 'x' }).descartados[0].motivo).toBe('sem ações');
        expect(um({ acoes: undefined }).gatilhos).toEqual([]);
    });
    it('limite: periodo turno/luta descartado; max 0 ou invalido = sem limite; max cortado em 99', () => {
        expect(um({ limite: { max: 1, por: 'turno' } }).descartados[0].motivo).toContain('turno');
        expect(um({ limite: { max: 1, por: 'luta' } }).gatilhos).toEqual([]);
        expect(um({ limite: { max: 1 } }).gatilhos).toEqual([]);
        expect(um({ limite: { max: 0, por: 'turno' } }).gatilhos[0].limite).toBeUndefined();
        expect(um({ limite: { max: 'x', por: 'cena' } }).gatilhos[0].limite).toBeUndefined();
        expect(um({ limite: { max: -2, por: 'cena' } }).gatilhos[0].limite).toBeUndefined();
        expect(um({ limite: { max: 500, por: 'cena' } }).gatilhos[0].limite).toEqual({ max: 99, por: 'cena' });
        expect(um({ limite: { max: '2,9', por: 'descanso' } }).gatilhos[0].limite).toEqual({ max: 2, por: 'descanso' });
        expect(um({ limite: 'x' }).gatilhos[0].limite).toBeUndefined();
    });
    it('valores de acoes: invalidos descartam, extremos sao cortados, nada vira undefined', () => {
        const a = normalizarAcaoGatilho;
        expect(a(null)).toBeNull(); expect(a('x')).toBeNull(); expect(a({ tipo: 'zzz' })).toBeNull(); expect(a({})).toBeNull();
        expect(a({ tipo: 'definirVida' })).toBeNull();
        expect(a({ tipo: 'definirVida', valor: '', percMax: '' })).toBeNull();
        expect(a({ tipo: 'definirVida', valor: 'abc' })).toBeNull();
        expect(a({ tipo: 'definirVida', valor: '5,5' })).toEqual({ tipo: 'definirVida', valor: 5.5 });
        expect(a({ tipo: 'definirVida', valor: 1e20 })).toEqual({ tipo: 'definirVida', valor: 1e15 });
        expect(a({ tipo: 'definirVida', valor: -5 })).toEqual({ tipo: 'definirVida', valor: 0 });
        expect(a({ tipo: 'definirVida', percMax: 150 })).toEqual({ tipo: 'definirVida', percMax: 100 });
        expect(a({ tipo: 'definirVida', valor: null, percMax: 30 })).toEqual({ tipo: 'definirVida', percMax: 30 });
        expect(a({ tipo: 'curar', valor: 0 })).toBeNull();
        expect(a({ tipo: 'curar', valor: -3 })).toBeNull();
        expect(a({ tipo: 'curar', valor: NaN })).toBeNull();
        expect(a({ tipo: 'curar', valor: 5, modo: 'xyz' })).toEqual({ tipo: 'curar', modo: 'fixo', valor: 5 });
        expect(a({ tipo: 'curar', valor: 500, modo: 'percMax' }).valor).toBe(100);
        expect(a({ tipo: 'curar', valor: 5000, modo: 'percAtual' }).valor).toBe(1000);
        expect(a({ tipo: 'escudo', valor: 0 })).toBeNull();
        expect(a({ tipo: 'escudo', valor: 10 })).toEqual({ tipo: 'escudo', nome: 'Escudo', valor: 10, tipoEscudo: 'escudo' });
        expect(a({ tipo: 'escudo', valor: 10, tipoEscudo: 'vidaTemporaria', nome: 'x'.repeat(100) }).nome).toHaveLength(40);
        expect(a({ tipo: 'escudo', valor: 10, tipoEscudo: 'lixo' }).tipoEscudo).toBe('escudo');
        expect(a({ tipo: 'buff', atributo: '', valor: 3 })).toBeNull();
        expect(a({ tipo: 'buff', atributo: 'forca', valor: 'x' })).toBeNull();
        expect(a({ tipo: 'buff', atributo: 'forca', valor: 3, duracao: 999, modo: 'zzz' })).toEqual({ tipo: 'buff', atributo: 'forca', valor: 3, duracao: 20, modo: 'turnos' });
        expect(a({ tipo: 'buff', atributo: 'forca', valor: -3, duracao: 0 }).duracao).toBe(1);
        expect(a({ tipo: 'imunidadeTotal' })).toEqual({ tipo: 'imunidadeTotal', duracaoTurnos: 1 });
        expect(a({ tipo: 'imunidadeTotal', duracaoTurnos: 0 }).duracaoTurnos).toBe(1);
        expect(a({ tipo: 'imunidadeTotal', duracaoTurnos: 99 }).duracaoTurnos).toBe(10);
        expect(a({ tipo: 'imunidadeTotal', duracaoTurnos: 'x' }).duracaoTurnos).toBe(1);
        expect(a({ tipo: 'imunidadeTotal', duracaoTurnos: 2.9 }).duracaoTurnos).toBe(2);
        expect(a({ tipo: 'mensagem', texto: '   ' })).toBeNull();
        expect(a({ tipo: 'mensagem', texto: 'x'.repeat(500) }).texto).toHaveLength(300);
        expect(a({ tipo: 'mensagem', texto: 'Olá 🔥 日本語' }).texto).toBe('Olá 🔥 日本語');
        expect(semUndefined([a({ tipo: 'anularDano', lixo: undefined }), a({ tipo: 'limparCondicoes' })])).toBe(true);
    });
    it('BUG MENOR: escudo 0,9 passa na validacao (>0) mas vira valor 0 depois do floor', () => {
        const r = normalizarAcaoGatilho({ tipo: 'escudo', valor: 0.9 });
        // esperado ideal: null (nada a ganhar). Hoje devolve uma acao com valor 0, que adicionarEscudo recusa ("sem espaço") na hora de aplicar.
        expect(r === null || r.valor === 0).toBe(true);
        const f = ficha({});
        const out = aplicarAcoesNoRascunho(f, [{ ...(r || { tipo: 'escudo', nome: 'Escudo', valor: 0, tipoEscudo: 'escudo' }), chave: 'k', gatilhoNome: 'G' }], {});
        expect(f.escudos).toBeUndefined();
        expect(out.textos).toHaveLength(1);
    });
    it('condicoes: canonicas, vazias somem, invalidas descartam o gatilho todo', () => {
        const c = normalizarCondicaoGatilho;
        expect(c(' Vida_Maior_Que : 5 ')).toBe('vida_maior_que:5');
        expect(c('vida_menor_que:2,5')).toBe('vida_menor_que:2.5');
        expect(c('vida_maior_que:abc')).toBeNull();
        expect(c('vida_maior_que:-1')).toBeNull();
        expect(c('vida_maior_que:1e20')).toBeNull();
        expect(c('vida_maior_que:')).toBeNull();
        expect(c('')).toBe('');
        expect(c(null)).toBe('');
        expect(c('sempre')).toBe('');
        expect(c('Em_Combate')).toBe('em_combate');
        expect(c('alvo_com_estado:naoexiste')).toBeNull();
        expect(c('qualquer coisa')).toBeNull();
        const r = normalizarGatilhos([{ nome: 'a', evento: ev, acoes: ok, condicoes: ['em_combate', 'sempre', '', 'bobagem'] }]);
        expect(r.gatilhos).toEqual([]);
        expect(r.descartados[0].motivo).toContain('condição inválida');
        expect(normalizarGatilhos([{ nome: 'a', evento: ev, acoes: ok, condicoes: ['em_combate', 'sempre', ''] }]).gatilhos[0].condicoes).toEqual(['em_combate']);
        expect(normalizarGatilhos([{ nome: 'a', evento: ev, acoes: ok, condicoes: 'em_combate' }]).gatilhos[0].condicoes).toEqual([]);
    });
    it('modo, armado, prioridade, passivo, mestreDesligou, notas', () => {
        const g = um({ modo: 'zzz', armado: 'sim', prioridade: 'abc', passivo: 'sim', mestreDesligou: 1, notas: '  ' }).gatilhos[0];
        expect(g).toMatchObject({ modo: 'automatico', prioridade: 0 });
        expect('armado' in g).toBe(false); expect('passivo' in g).toBe(false); expect('mestreDesligou' in g).toBe(false); expect('notas' in g).toBe(false);
        const h = um({ modo: 'opcional', armado: false, prioridade: 500, passivo: true, mestreDesligou: true, notas: 'x'.repeat(400) }).gatilhos[0];
        expect(h).toMatchObject({ modo: 'opcional', armado: false, prioridade: 100, passivo: true, mestreDesligou: true });
        expect(h.notas).toHaveLength(300);
        expect(um({ prioridade: -500 }).gatilhos[0].prioridade).toBe(-100);
    });
    it('entradas nao-lista, null, strings e nomes enormes/unicode nao quebram; normalizar e idempotente', () => {
        [null, undefined, 'x', 5, {}, [null, undefined, 1, 'x', []]].forEach((e) => {
            const r = normalizarGatilhos(e);
            expect(Array.isArray(r.gatilhos)).toBe(true);
        });
        const r = normalizarGatilhos([{ nome: '日本語🔥'.repeat(50), evento: ev, acoes: ok, notas: 'ação' }]);
        expect(r.gatilhos[0].nome).toHaveLength(60);
        const base = normalizarGatilhos([NEGAR, ...CINZAS]).gatilhos;
        expect(normalizarGatilhos(base).gatilhos).toEqual(base);
        expect(semUndefined(base)).toBe(true);
    });
    it('fase e sempre derivada do evento (nao aceita o campo de fora)', () => {
        expect(um({ fase: 'depois' }).gatilhos[0].fase).toBe('antes');
        const v = normalizarGatilhos([{ nome: 'v', fase: 'antes', evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, acoes: [{ tipo: 'mensagem', texto: 'x' }] }]).gatilhos[0];
        // anularDano so faz sentido em danoQueZeraria: em faixa de Vida o gatilho inteiro e descartado
        expect(normalizarGatilhos([{ nome: 'v', evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, acoes: ok }]).descartados[0].motivo).toContain('anular o dano');
        expect(v.fase).toBe('depois');
    });
});
