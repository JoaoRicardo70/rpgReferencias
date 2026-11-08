import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, avaliarGatilhos, coletarGatilhos, descreverGatilho, PROFUNDIDADE_MAX_GATILHOS } from './gatilhos.js';
import { aplicarAcoesNoRascunho, passarTurnoDaImunidadeTotal, temImunidadeTotal, camposParaGravar } from './gatilhosAplicar.js';
import { aplicarDanoNaVida } from './danoVida.js';
import { descansarCompleto } from './vitals.js';

const F = 1000;
const MAX = 100000 * F; // 100.000 exibidos
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

// Negar morte (A-25, F-49)
export const negarMorte = {
    id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'],
    limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }],
};
// Volta das cinzas B-20..B-22 (sem o 1d4 da Fase 3). Faixas inteiras sem sobreposição: 10%, 9-6%, 5-1%.
export const voltaDasCinzas = [
    { id: 'vc1', nome: 'Cinzas 10%', evento: { tipo: 'vidaAbaixoDe', de: 10, ate: 10 }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 5000 }, { tipo: 'mensagem', texto: 'As cinzas se agitam' }] },
    { id: 'vc2', nome: 'Cinzas 10-6%', evento: { tipo: 'vidaAbaixoDe', de: 9, ate: 6 }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 20 }] },
    { id: 'vc3', nome: 'Cinzas 5-1%', evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'imunidadeTotal', duracaoTurnos: 1 }] },
    { id: 'vc0', nome: 'Cinzas 0%', evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'descanso' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', percMax: 1 }] },
];

const ficha = (extra = {}, vidaExibida = 100000) => ({
    vida: { atual: vidaExibida * F }, iniciativa: 0, poderes: [], inventario: [], passivas: [], ...extra,
});
const poder = (gatilhos, extra = {}) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos, ...extra });
let contador = 0;
const dano = (f, n, ctx = {}) => aplicarDanoNaVida(f, n, { nome: 'Eu', vidaMaxBruta: MAX, cenaId: 'c1', eventoId: `e${++contador}`, ...ctx });

describe('normalizarGatilhos', () => {
    it('aceita um gatilho válido e não deixa undefined', () => {
        const { gatilhos, descartados } = normalizarGatilhos([negarMorte]);
        expect(descartados).toEqual([]);
        expect(gatilhos[0]).toMatchObject({ id: 'nm', fase: 'antes', modo: 'automatico', prioridade: 0, limite: { max: 1, por: 'cena' }, condicoes: ['vida_maior_que:1'] });
        expect(semUndefined(gatilhos)).toBe(true);
    });
    it('descarta evento ou ação desconhecida, condição inválida e período luta', () => {
        const r = normalizarGatilhos([
            { nome: 'a', evento: { tipo: 'xyz' }, acoes: [{ tipo: 'anularDano' }] },
            { nome: 'b', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'explodir' }] },
            { nome: 'c', evento: { tipo: 'danoQueZeraria' }, condicoes: ['lua_cheia'], acoes: [{ tipo: 'anularDano' }] },
            { nome: 'd', evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'luta' }, acoes: [{ tipo: 'anularDano' }] },
            { nome: 'e', evento: { tipo: 'danoQueZeraria' }, acoes: [] },
        ]);
        expect(r.gatilhos).toEqual([]);
        expect(r.descartados.map(d => d.nome)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
    it('trunca em 8 gatilhos e 6 ações, ids únicos, valores limitados', () => {
        const muitos = Array.from({ length: 12 }, () => ({ id: 'igual', nome: 'g', evento: { tipo: 'danoQueZeraria' }, acoes: Array.from({ length: 9 }, () => ({ tipo: 'curar', modo: 'percMax', valor: 5000 })) }));
        const r = normalizarGatilhos(muitos);
        expect(r.gatilhos).toHaveLength(8);
        expect(r.descartados).toHaveLength(4);
        expect(new Set(r.gatilhos.map(g => g.id)).size).toBe(8);
        expect(r.gatilhos[0].acoes).toHaveLength(6);
        expect(r.gatilhos[0].acoes[0].valor).toBe(100);
    });
    it('lixo, null e lista ausente não quebram', () => {
        expect(normalizarGatilhos(null)).toEqual({ gatilhos: [], descartados: [] });
        expect(normalizarGatilhos([null, 3]).gatilhos).toEqual([]);
    });
    it('modo e armado ficam no modelo', () => {
        const g = normalizarGatilhos([{ ...negarMorte, modo: 'opcional', armado: true }]).gatilhos[0];
        expect(g.modo).toBe('opcional'); expect(g.armado).toBe(true);
    });
});

describe('coletarGatilhos', () => {
    it('poder desligado só vale com gatilho passivo; item equipado e passiva também contam', () => {
        const f = ficha({
            poderes: [poder([negarMorte], { id: 'a', ativa: false }), poder([{ ...negarMorte, id: 'x', passivo: true }], { id: 'b', ativa: false })],
            inventario: [{ id: 'i1', nome: 'Amuleto', equipado: true, gatilhos: [negarMorte] }, { id: 'i2', equipado: false, gatilhos: [negarMorte] }],
            passivas: [{ id: 'ps', nome: 'Passiva', gatilhos: [negarMorte] }],
        });
        expect(coletarGatilhos(f).map(c => c.fonte.id).sort()).toEqual(['b', 'i1', 'ps']);
    });
    it('forma ativa traz os gatilhos dela; mestreDesligou ignora', () => {
        const f = ficha({ poderes: [poder([{ ...negarMorte, mestreDesligou: true }], { formas: [{ id: 'f1', gatilhos: [negarMorte] }], formaAtivaId: 'f1' })] });
        const c = coletarGatilhos(f);
        expect(c).toHaveLength(1);
        expect(c[0].fonte.id).toBe('p1');
        expect(c[0].chave).toBe('p1:forma:f1:nm');
    });
    it('ficha antiga sem o campo funciona', () => {
        expect(coletarGatilhos(ficha({ poderes: [{ id: 'z', ativa: true }] }))).toEqual([]);
        expect(coletarGatilhos(null)).toEqual([]);
    });
});

describe('avaliarGatilhos - danoQueZeraria (Negar morte)', () => {
    const f = () => ficha({ poderes: [poder([negarMorte])] });
    const ctx = (antes, depois) => ({ vidaAntes: antes * F, vidaDepois: depois * F, vidaMaxBruta: MAX, cenaId: 'c1' });
    it('dispara quando o golpe zeraria', () => {
        const r = avaliarGatilhos({ tipo: 'danoQueZeraria' }, ctx(500, -10), f());
        expect(r.acoes.map(a => a.tipo)).toEqual(['anularDano', 'definirVida']);
        expect(r.acoes[0].gatilhoNome).toBe('Negar morte');
    });
    it('não dispara se a Vida sobra ou se já estava em 1 (vida_maior_que:1)', () => {
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, ctx(500, 10), f()).acoes).toEqual([]);
        const r = avaliarGatilhos({ tipo: 'danoQueZeraria' }, ctx(1, -5), f());
        expect(r.acoes).toEqual([]);
        expect(r.bloqueados[0].motivo).toMatch(/condição/);
    });
    it('limite 1 por cena: segundo uso na mesma cena bloqueia, outra cena libera', () => {
        const ff = f();
        ff.combate = { usosPoderes: { 'p1:nm': { n: 1, cena: 'c1' } } };
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, ctx(500, -10), ff).bloqueados[0].motivo).toBe('sem usos');
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx(500, -10), cenaId: 'c2' }, ff).acoes.length).toBe(2);
    });
    it('idempotência por eventoId', () => {
        const ff = f();
        ff.combate = { gatilhos: { 'p1:nm': { ultimoEvento: 'E1' } } };
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx(500, -10), eventoId: 'E1' }, ff).acoes).toEqual([]);
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx(500, -10), eventoId: 'E2' }, ff).acoes.length).toBe(2);
    });
    it('anti-laço: profundidade máxima e mesmo gatilho na cadeia', () => {
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx(500, -10), profundidade: PROFUNDIDADE_MAX_GATILHOS }, f()).acoes).toEqual([]);
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { ...ctx(500, -10), jaDisparados: ['p1:nm'] }, f()).acoes).toEqual([]);
    });
    it('modo opcional não dispara na Fase 1', () => {
        const ff = ficha({ poderes: [poder([{ ...negarMorte, modo: 'opcional', armado: true }])] });
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, ctx(500, -10), ff).acoes).toEqual([]);
    });
});

describe('avaliarGatilhos - vidaAbaixoDe (faixas)', () => {
    const f = () => ficha({ poderes: [poder(voltaDasCinzas)] });
    const av = (antesPct, depoisPct) => avaliarGatilhos({ tipo: 'vidaAbaixoDe' }, { vidaAntes: MAX * antesPct / 100, vidaDepois: MAX * depoisPct / 100, vidaMaxBruta: MAX, cenaId: 'c1' }, f());
    it('só a faixa final dispara quando o golpe cruza várias', () => {
        expect(av(100, 3).disparados.map(d => d.chave)).toEqual(['p1:vc3']);
        expect(av(100, 7.5).disparados.map(d => d.chave)).toEqual(['p1:vc2']);
        expect(av(100, 10.4).disparados.map(d => d.chave)).toEqual(['p1:vc1']);
    });
    it('só na borda: já dentro da faixa antes do dano, não repete', () => {
        expect(av(4.5, 3).acoes).toEqual([]);
        expect(av(7, 6.5).acoes).toEqual([]);
        expect(av(7, 3).disparados.map(d => d.chave)).toEqual(['p1:vc3']);
    });
    it('cura ou dano nulo não dispara', () => {
        expect(av(3, 3).acoes).toEqual([]);
        expect(av(3, 8).acoes).toEqual([]);
    });
    it('sem Vida máxima conhecida não dispara', () => {
        const r = avaliarGatilhos({ tipo: 'vidaAbaixoDe' }, { vidaAntes: 10, vidaDepois: 5, vidaMaxBruta: 0 }, f());
        expect(r.acoes).toEqual([]);
    });
});

describe('aplicarAcoesNoRascunho', () => {
    const acao = (a) => ({ ...a, gatilhoId: 'g', gatilhoNome: 'Teste', chave: 'p1:g', fonte: { nome: 'Poder X' } });
    it('definirVida, curar (com cap), escudo, buff, limparCondicoes, imunidadeTotal, mensagem', () => {
        const f = ficha({ condicoes: [{ id: 'envenenado', stacks: 1 }] }, 10000);
        const r = aplicarAcoesNoRascunho(f, [
            acao({ tipo: 'definirVida', valor: 5 }), acao({ tipo: 'curar', modo: 'percMax', valor: 10 }),
            acao({ tipo: 'escudo', nome: 'Cinzas', valor: 300, tipoEscudo: 'escudo' }),
            acao({ tipo: 'buff', atributo: 'evasiva', valor: 3, duracao: 2, modo: 'turnos' }),
            acao({ tipo: 'limparCondicoes' }), acao({ tipo: 'imunidadeTotal', duracaoTurnos: 1 }), acao({ tipo: 'mensagem', texto: 'oi' }),
        ], { vidaMaxBruta: MAX });
        expect(f.vida.atual).toBe((5 + 10000) * F);
        expect(f.escudos[0]).toMatchObject({ nome: 'Cinzas', valor: 300 });
        expect(f.buffsTemporarios[0].efeitos[0]).toMatchObject({ atributo: 'evasiva', valor: 3 });
        expect(f.condicoes).toBeUndefined();
        expect(f.combate.imunidadeTotal).toEqual({ turnosRestantes: 1, origem: 'Teste' });
        expect(r.textos.join('|')).toContain('Teste segurou em 5 de vida');
        expect(r.textos).toContain('Teste: oi');
        expect(semUndefined(f)).toBe(true);
    });
    it('curar não passa do teto nem baixa quem está acima; percAtual', () => {
        const f = ficha({}, 99000);
        aplicarAcoesNoRascunho(f, [acao({ tipo: 'curar', modo: 'fixo', valor: 5000 })], { vidaMaxBruta: MAX });
        expect(f.vida.atual).toBe(MAX);
        const g = ficha({}, 200000);
        aplicarAcoesNoRascunho(g, [acao({ tipo: 'curar', modo: 'fixo', valor: 5 })], { vidaMaxBruta: MAX });
        expect(g.vida.atual).toBe(200000 * F);
        const h = ficha({}, 1000);
        aplicarAcoesNoRascunho(h, [acao({ tipo: 'curar', modo: 'percAtual', valor: 50 })], { vidaMaxBruta: MAX });
        expect(h.vida.atual).toBe(1500 * F);
    });
    it('escudo renova em vez de empilhar', () => {
        const f = ficha();
        const a = acao({ tipo: 'escudo', nome: 'Cinzas', valor: 10, tipoEscudo: 'escudo' });
        aplicarAcoesNoRascunho(f, [a, a], { vidaMaxBruta: MAX });
        expect(f.escudos).toHaveLength(1);
    });
    it('imunidade total conta turnos e a chave some ao zerar', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } });
        expect(temImunidadeTotal(f)).toBe(true);
        passarTurnoDaImunidadeTotal(f);
        expect(f.combate.imunidadeTotal.turnosRestantes).toBe(1);
        passarTurnoDaImunidadeTotal(f);
        expect('imunidadeTotal' in f.combate).toBe(false);
        expect(temImunidadeTotal(f)).toBe(false);
        expect(passarTurnoDaImunidadeTotal(f).mudou).toBe(false);
    });
    it('camposParaGravar: undefined vira null', () => {
        const f = ficha();
        expect(camposParaGravar(f, ['vida/atual', 'escudos', 'combate/imunidadeTotal'])).toEqual({ 'vida/atual': 100000 * F, escudos: null, 'combate/imunidadeTotal': null });
    });
});

describe('aplicarDanoNaVida - regressão transparente (sem gatilhos)', () => {
    it('igual à conta de antes: escudo -> Vida com piso 0, sem chaves novas', () => {
        const f = ficha({ escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }] }, 1000);
        const r = dano(f, 1000);
        expect(f.vida.atual).toBe(300 * F); expect(f.escudos).toBeUndefined();
        expect(r.textoEscudo).toContain('absorveu 300');
        expect(f.combate).toBeUndefined();
        const g = ficha({}, 5);
        dano(g, 1e9);
        expect(g.vida.atual).toBe(0);
        const h = ficha({}, 10);
        dano(h, 0);
        expect(h.vida.atual).toBe(10 * F);
    });
    it('semEscudo e jaAbsorvido não tocam nos escudos', () => {
        const f = ficha({ escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }] }, 1000);
        dano(f, 100, { semEscudo: true });
        expect(f.vida.atual).toBe(900 * F); expect(f.escudos[0].valor).toBe(300);
        dano(f, 100, { jaAbsorvido: true });
        expect(f.vida.atual).toBe(800 * F); expect(f.escudos[0].valor).toBe(300);
    });
    it('sem vida na ficha não faz nada', () => {
        expect(dano({}, 10).vidaNova).toBe(0);
    });
});

describe('aplicarDanoNaVida - Negar morte', () => {
    it('dano que zeraria fica em 1, gasta o uso, diz no feed; segundo golpe na mesma cena mata', () => {
        const f = ficha({ poderes: [poder([negarMorte])] }, 500);
        const r = dano(f, 99999);
        expect(f.vida.atual).toBe(1 * F);
        expect(r.textos.join(' ')).toContain('Negar morte segurou em 1 de vida');
        expect(f.combate.usosPoderes['p1:nm']).toEqual({ n: 1, cena: 'c1' });
        dano(f, 99999);
        expect(f.vida.atual).toBe(0);
        expect(semUndefined(f)).toBe(true);
    });
    it('em outra cena o gatilho volta; descansar limpa registros', () => {
        const f = ficha({ poderes: [poder([negarMorte])] }, 500);
        dano(f, 99999);
        f.vida.atual = 500 * F;
        dano(f, 99999, { cenaId: 'c2' });
        expect(f.vida.atual).toBe(1 * F);
        f.combate.imunidadeTotal = { turnosRestantes: 1, origem: 'x' };
        descansarCompleto(f);
        expect(f.combate.gatilhos).toBeUndefined();
        expect(f.combate.imunidadeTotal).toBeUndefined();
        expect(f.combate.usosPoderes).toBeUndefined();
    });
    it('já em 1 de vida: não segura (vida_maior_que:1)', () => {
        const f = ficha({ poderes: [poder([negarMorte])] }, 1);
        dano(f, 50);
        expect(f.vida.atual).toBe(0);
    });
    it('dano que não zera não gasta o uso', () => {
        const f = ficha({ poderes: [poder([negarMorte])] }, 500);
        dano(f, 100);
        expect(f.vida.atual).toBe(400 * F);
        expect(f.combate).toBeUndefined();
    });
    it('mesmo eventoId aplicado duas vezes só dispara uma', () => {
        const f = ficha({ poderes: [poder([{ ...negarMorte, limite: undefined }])] }, 500);
        dano(f, 99999, { eventoId: 'E' });
        const r2 = dano(f, 99999, { eventoId: 'E' });
        expect(r2.textos).toEqual([]);
        expect(f.vida.atual).toBe(0);
    });
});

describe('aplicarDanoNaVida - Volta das cinzas', () => {
    const base = (v) => ficha({ poderes: [poder(voltaDasCinzas)] }, v);
    it('cair para 10%: escudo e mensagem', () => {
        const f = base(100000);
        const r = dano(f, 89500); // 10.5% -> 10
        expect(f.escudos[0].valor).toBe(5000);
        expect(r.textos.join(' ')).toContain('As cinzas se agitam');
    });
    it('golpe 100% -> 3%: só a faixa 5-1% (limpa condições, imunidade total 1 turno) e depois God Mode', () => {
        const f = base(100000); f.condicoes = [{ id: 'queimado', stacks: 1 }];
        dano(f, 97000);
        expect(f.condicoes).toBeUndefined();
        expect(f.combate.imunidadeTotal.turnosRestantes).toBe(1);
        expect(f.escudos).toBeUndefined();
        expect(f.vida.atual).toBe(3000 * F);
        const r = dano(f, 5000);
        expect(f.vida.atual).toBe(3000 * F);
        expect(r.imune).toBe(true);
    });
    it('faixa 0%: dano que zeraria vira 1% da Vida máxima', () => {
        const f = ficha({ poderes: [poder([voltaDasCinzas[3]])] }, 100);
        dano(f, 5000);
        expect(f.vida.atual).toBe(1000 * F);
    });
    it('faixa 9-6%: já dentro da faixa não repete; vindo de fora cura 20% da máxima', () => {
        const f = base(8000);
        dano(f, 500);
        expect(f.vida.atual).toBe(7500 * F);
        const g = base(100000);
        dano(g, 92500);
        expect(g.vida.atual).toBe((7500 + 20000) * F);
    });
});

describe('God Mode vs Dano Verdadeiro e fontes', () => {
    it('imunidade total ignora tudo, não gasta escudo nem dispara gatilhos', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, escudos: [{ id: 'a', nome: 'D', valor: 100, tipo: 'escudo' }], poderes: [poder([negarMorte])] }, 500);
        const r = dano(f, 1e9); // o Dano Verdadeiro chega a este ponto já calculado: ainda assim vira 0
        expect(f.vida.atual).toBe(500 * F);
        expect(f.escudos[0].valor).toBe(100);
        expect(f.combate.usosPoderes).toBeUndefined();
        expect(r.imune).toBe(true);
        expect(r.textos[0]).toContain('Imunidade total');
    });
    it('Dano Verdadeiro NÃO ignora o gatilho de morte', () => {
        const f = ficha({ poderes: [poder([negarMorte])] }, 500);
        dano(f, 99999);
        expect(f.vida.atual).toBe(1 * F);
    });
    it('gatilho vindo de item equipado e de passiva também seguram', () => {
        const f = ficha({ inventario: [{ id: 'i', nome: 'Amuleto', equipado: true, gatilhos: [negarMorte] }] }, 500);
        dano(f, 99999);
        expect(f.vida.atual).toBe(1 * F);
        const g = ficha({ passivas: [{ id: 'ps', nome: 'P', gatilhos: [negarMorte] }] }, 500);
        dano(g, 99999);
        expect(g.vida.atual).toBe(1 * F);
    });
});

describe('descreverGatilho', () => {
    it('frase legível', () => {
        const g = normalizarGatilhos([{ ...negarMorte, acoes: [{ tipo: 'definirVida', valor: 1 }] }]).gatilhos[0];
        expect(descreverGatilho(g)).toBe('Quando um golpe me levaria a 0 e Vida maior que 1: ficar com 1 de vida (já anula o golpe) (1x por cena)');
    });
});

describe('Revisao Fase 1 - motor', () => {
    it('definirVida em danoQueZeraria JA anula o golpe (sem anularDano)', () => {
        const g = { id: 'x', nome: 'Seguro', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', valor: 1 }] };
        const f = ficha({ poderes: [poder([g])] }, 500);
        dano(f, 99999);
        expect(f.vida.atual).toBe(1 * F);
    });
    it('curar em danoQueZeraria cura ANTES; se ainda zerar nao salva', () => {
        const g = { id: 'c', nome: 'Cura', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 10 }] };
        const f = ficha({ poderes: [poder([g])] }, 5);
        dano(f, 99999);
        expect(f.vida.atual).toBe(0);
        const h = ficha({ poderes: [poder([g])] }, 5);
        dano(h, 12);
        expect(h.vida.atual).toBe(3 * F);
    });
    it('anularDano fora de danoQueZeraria e descartado', () => {
        const r = normalizarGatilhos([{ nome: 'z', evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, acoes: [{ tipo: 'anularDano' }] }]);
        expect(r.gatilhos).toEqual([]);
        expect(r.descartados[0].nome).toBe('z');
    });
    it('definirVida percMax sem Vida maxima conhecida e ignorada', () => {
        const g = { id: 'p', nome: 'P', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', percMax: 1 }] };
        const f = ficha({}, 100);
        aplicarAcoesNoRascunho(f, [{ ...g.acoes[0], gatilhoNome: 'P', chave: 'k', fase: 'antes', fonte: { tipo: 'poder', id: '1', nome: 'x' } }], { vidaMaxBruta: 0 });
        expect(f.vida.atual).toBe(100 * F);
    });
    it('sem eventoId nada e gravado em combate.gatilhos', () => {
        const f = ficha({ poderes: [poder([negarMorte])] }, 500);
        aplicarDanoNaVida(f, 99999, { nome: 'Eu', vidaMaxBruta: MAX, cenaId: 'c1' });
        expect(f.combate.gatilhos).toBeUndefined();
        expect(f.combate.usosPoderes['p1:nm']).toBeDefined();
    });
    it('escudo de gatilho leva poderId do Poder, some no descanso e a troca e atomica', () => {
        const g = { id: 'e', nome: 'Domo', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 0 }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 50 }] };
        const f = ficha({ poderes: [poder([g])] }, 100000);
        dano(f, 60000);
        expect(f.escudos[0]).toMatchObject({ poderId: 'p1', tipo: 'escudo' });
        descansarCompleto(f);
        expect(f.escudos).toBeUndefined();
        const cheio = ficha({ escudos: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, nome: 'm', valor: 1, tipo: 'escudo' })) });
        cheio.escudos[0] = { id: 'esc_g_p1:e', nome: 'Antigo', valor: 7, tipo: 'escudo' };
        aplicarAcoesNoRascunho(cheio, [{ tipo: 'escudo', nome: 'Novo', valor: 9, tipoEscudo: 'escudo', gatilhoNome: 'G', chave: 'p1:e', fonte: { tipo: 'poder', id: 'p1', nome: 'x' } }], { vidaMaxBruta: MAX });
        expect(cheio.escudos.some(e => e.nome === 'Antigo' || e.nome === 'Novo')).toBe(true);
        expect(cheio.escudos).toHaveLength(12);
    });
    it('ids: gatilho sem id ganha id estavel persistido; chave distingue forma/config/item', () => {
        const a = normalizarGatilhos([{ nome: 'a', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }]).gatilhos[0];
        expect(a.id).toMatch(/^g_/);
        const f = ficha({ poderes: [poder([{ nome: 'sem id', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }])], inventario: [{ id: 'p1', equipado: true, gatilhos: [negarMorte] }] });
        expect(coletarGatilhos(f).map(c => c.chave)).toEqual(coletarGatilhos(f).map(c => c.chave));
        const chaves = coletarGatilhos(ficha({ poderes: [poder([negarMorte])], inventario: [{ id: 'p1', equipado: true, gatilhos: [negarMorte] }] })).map(c => c.chave);
        expect(new Set(chaves).size).toBe(2);
    });
});
