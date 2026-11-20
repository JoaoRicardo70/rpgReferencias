import { describe, it, expect, vi, afterEach } from 'vitest';
import { rolarDadosComVantagem, calcularAcerto } from '../core/engine';
import { LIMITE_DADOS_ROLAGEM, LIMITE_VANTAGENS_LIQUIDAS } from '../core/limiteDados';
import { getRawBase } from '../core/attributes';
import { contarDigitos } from '../core/utils';
import { normalizarGatilhos, coletarGatilhos, gatilhosDoCartao, achaGatilhoDoPoder, chaveDoGatilhoDeForma, chaveDoGatilhoDoPoder } from '../core/gatilhos';
import { forcarGatilhoNaFicha } from '../core/gatilhosAplicar';
import { lerGatilhosDaIA } from '../core/gatilhosImportacao';
import { prepararItemEnsinado } from '../core/ensinar';
import { sanitizarModelo } from '../core/bibliotecaRacial';
import { valorDoEfeitoParaCartao, resumirEfeitoParaCartao } from '../core/efeitoResumo';
import { iguaisProfundo, preservarReferenciasIguais } from '../core/estruturaCompartilhada';
import { coletarEfeitosDeInimigos } from '../core/efeitosDeInimigos';

afterEach(() => { vi.restoreAllMocks(); });

const sequencia = (valores) => { let i = 0; vi.spyOn(Math, 'random').mockImplementation(() => valores[i++ % valores.length]); };
const faceParaRandom = (face, faces) => (face - 0.5) / faces;

describe('Acerto - rolarDadosComVantagem (limites)', () => {
    it('feliz: 3d6 sem vantagem soma todos os dados', () => {
        sequencia([faceParaRandom(2, 6), faceParaRandom(4, 6), faceParaRandom(6, 6)]);
        const r = rolarDadosComVantagem(3, 6, 0, 0);
        expect(r.sD).toBe(12);
        expect(r.mantidos).toHaveLength(3);
    });
    it('vantagem 2 mantem os maiores', () => {
        sequencia([1, 5, 3, 6, 2].map(f => faceParaRandom(f, 6)));
        const r = rolarDadosComVantagem(3, 6, 2, 0);
        expect([...r.mantidos].sort()).toEqual([3, 5, 6]);
        expect(r.sD).toBe(14);
    });
    it('desvantagem 2 mantem os menores', () => {
        sequencia([1, 5, 3, 6, 2].map(f => faceParaRandom(f, 6)));
        const r = rolarDadosComVantagem(3, 6, 0, 2);
        expect([...r.mantidos].sort()).toEqual([1, 2, 3]);
        expect(r.sD).toBe(6);
    });
    it('valores repetidos: so conta quantos foram mantidos', () => {
        sequencia([6, 6, 6, 1].map(f => faceParaRandom(f, 6)));
        const r = rolarDadosComVantagem(2, 6, 2, 0);
        expect(r.sD).toBe(12);
    });
    it('1000 dados rapido e dentro do limite', () => {
        const t = Date.now();
        const r = rolarDadosComVantagem(1000, 1000, 0, 0);
        expect(Date.now() - t).toBeLessThan(2000);
        expect(r.mantidos).toHaveLength(1000);
    });
    it('acima de 1000 dados limita a 1000; faces acima de 1000 limitam a 1000', () => {
        const r = rolarDadosComVantagem(5000, 99999, 0, 0);
        expect(r.mantidos).toHaveLength(1000);
        expect(Math.max(...r.mantidos)).toBeLessThanOrEqual(1000);
    });
    it('vantagem liquida limitada a 20 (total sorteado = qtd+20)', () => {
        const spy = vi.spyOn(Math, 'random');
        const r = rolarDadosComVantagem(2, 6, 500, 0);
        expect(spy).toHaveBeenCalledTimes(22);
        expect(r.mantidos).toHaveLength(2);
        spy.mockClear();
        rolarDadosComVantagem(2, 6, 0, 500);
        expect(spy).toHaveBeenCalledTimes(22);
    });
    it('vantagens e desvantagens se anulam antes do teto', () => {
        const spy = vi.spyOn(Math, 'random');
        rolarDadosComVantagem(2, 6, 100, 100);
        expect(spy).toHaveBeenCalledTimes(2);
    });
    it('NaN/negativo/Infinity nao travam', () => {
        expect(rolarDadosComVantagem(NaN, NaN, NaN, NaN).sD).toBe(0);
        expect(rolarDadosComVantagem(-5, -5, 0, 0).sD).toBe(0);
        expect(rolarDadosComVantagem(Infinity, Infinity, Infinity, 0).mantidos).toHaveLength(1000);
        expect(rolarDadosComVantagem(-Infinity, 6, -Infinity, 0).sD).toBe(0);
        expect(rolarDadosComVantagem('abc', undefined, 'x', null).sD).toBe(0);
    });
    it('dados 0 = sem dado (soma 0)', () => {
        expect(rolarDadosComVantagem(0, 20, 0, 0).sD).toBe(0);
    });
    it('faces 0 ou negativas viram 1 (cada dado vale 1)', () => {
        expect(rolarDadosComVantagem(3, 0, 0, 0).sD).toBe(3);
        expect(rolarDadosComVantagem(3, -9, 0, 0).sD).toBe(3);
    });
    it('exporta os tetos esperados', () => {
        expect(LIMITE_DADOS_ROLAGEM).toBe(1000);
        expect(LIMITE_VANTAGENS_LIQUIDAS).toBe(20);
    });
});

describe('Acerto - calcularAcerto', () => {
    const ficha = (extra = {}) => ({ forca: { nome: 'Forca', base: 10 }, poderes: [], inventario: [], bio: {}, ...extra });
    const base = (o = {}) => ({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: [], minhaFicha: ficha(), itensEquipados: [], ...o });
    it('acertoDados do feed mostra o valor limitado', () => {
        const r = calcularAcerto(base({ qD: 5000, fD: 99999 }));
        expect(r.acertoDados).toEqual({ qtd: 1000, faces: 1000 });
        expect(calcularAcerto(base({ qD: -3, fD: NaN })).acertoDados).toEqual({ qtd: 0, faces: 1 });
    });
    it('dados 0 = total fixo (so bonus/prof)', () => {
        const r = calcularAcerto(base({ qD: 0, fD: 20, prof: 7 }));
        expect(r.acertoTotal).toBe(7);
        expect(r.acertoDados.qtd).toBe(0);
    });
    it('vantagem de efeito enorme limitada a 20 dados extra', () => {
        const f = ficha({ poderes: [{ id: 'p', nome: 'P', ativa: true, efeitos: [{ atributo: 'vantagem', propriedade: 'base', valor: '999', quando: '' }], efeitosPassivos: [] }] });
        const spy = vi.spyOn(Math, 'random');
        calcularAcerto(base({ minhaFicha: f }));
        expect(spy).toHaveBeenCalledTimes(1 + 20);
    });
    it('vantagem manual enorme tambem limitada', () => {
        const spy = vi.spyOn(Math, 'random');
        calcularAcerto(base({ vantagens: 5000 }));
        expect(spy).toHaveBeenCalledTimes(21);
    });
});

describe('sanitizarBaseNumerica (via getRawBase)', () => {
    const lerBase = (v) => getRawBase({ forca: { base: v } }, 'forca');
    it('notacao cientifica vira numero', () => {
        expect(lerBase('4.3e8')).toBe(430000000);
        expect(lerBase('1.5e0')).toBe(1.5);
        expect(lerBase('2E3')).toBe(2000);
    });
    it('milhar com ponto e preservado', () => {
        expect(lerBase('4.300')).toBe(4300);
        expect(lerBase('1.234.567')).toBe(1234567);
    });
    it('lixo, vazio e nulos viram 0', () => {
        expect(lerBase('abc')).toBe(0);
        expect(lerBase('')).toBe(0);
        expect(lerBase(null)).toBe(0);
        expect(lerBase(undefined)).toBe(0);
    });
    it('expoente enorme e sem mantissa sao seguros', () => {
        expect(lerBase('1e999')).toBe(0);
        expect(lerBase('e8')).toBe(0);
    });
});

describe('contarDigitos', () => {
    it('casos exatos', () => {
        expect(contarDigitos(999999999999999)).toBe(15);
        expect(contarDigitos(1e15)).toBe(16);
        expect(contarDigitos(1)).toBe(1);
        expect(contarDigitos(9)).toBe(1);
        expect(contarDigitos(10)).toBe(2);
        expect(contarDigitos(1000)).toBe(4);
    });
    it('zero, negativos, lixo', () => {
        expect(contarDigitos(0)).toBe(0);
        expect(contarDigitos(-100)).toBe(0);
        expect(contarDigitos(NaN)).toBe(0);
        expect(contarDigitos(undefined)).toBe(0);
        expect(contarDigitos('abc')).toBe(0);
    });
    it('fracao menor que 1 e muito grande', () => {
        expect(contarDigitos(0.5)).toBe(0);
        expect(contarDigitos(1e21)).toBe(22);
    });
});

describe('gatilhos - validarBuff', () => {
    const gat = (atributo, extra = {}) => ({ nome: 'G', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo, valor: 5, duracao: 2 }], ...extra });
    it('com validarBuff descarta atributo desconhecido e informa descartados', () => {
        const r = normalizarGatilhos([gat('defesa'), gat('acerto')], { validarBuff: true });
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0].acoes[0].atributo).toBe('acerto');
        expect(r.descartados).toHaveLength(1);
        expect(r.descartados[0].motivo).toMatch(/buff/i);
    });
    it('atributos conhecidos valem', () => {
        expect(normalizarGatilhos([gat('forca'), gat('vantagem')], { validarBuff: true }).gatilhos).toHaveLength(2);
    });
    it('SEM a opcao nao descarta (gatilho antigo intacto)', () => {
        const r = normalizarGatilhos([gat('defesa')]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0].acoes[0].atributo).toBe('defesa');
        expect(r.descartados).toEqual([]);
    });
    it('coletarGatilhos continua disparando a acao antiga', () => {
        const ficha = { poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [gat('defesa')] }] };
        const c = coletarGatilhos(ficha);
        expect(c).toHaveLength(1);
        expect(c[0].gatilho.acoes[0].atributo).toBe('defesa');
    });
    it('atributo vazio / lista invalida seguros', () => {
        expect(normalizarGatilhos([gat('')], { validarBuff: true }).gatilhos).toEqual([]);
        expect(normalizarGatilhos(null, { validarBuff: true })).toEqual({ gatilhos: [], descartados: [] });
        expect(normalizarGatilhos([null, 5, 'x'], { validarBuff: true }).gatilhos).toEqual([]);
    });
    it('importacao da IA valida buff', () => {
        const r = lerGatilhosDaIA([gat('defesa'), gat('acerto')]);
        const texto = JSON.stringify(r);
        expect(texto).toMatch(/Gatilho n/);
        expect(texto).not.toMatch(/"atributo":"defesa"/);
        expect(texto).toMatch(/"atributo":"acerto"/);
    });
});

describe('gatilhos de Forma / Configuracao', () => {
    const g = (id, nome) => ({ id, nome, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo: 'acerto', valor: 3, duracao: 2 }] });
    const poder = (extra = {}) => ({
        id: 'p1', nome: 'Poder', ativa: true, gatilhos: [g('gp', 'DoPoder')],
        formaAtivaId: 'f1',
        formas: [{ id: 'f1', nome: 'F', gatilhos: [g('gf', 'DaForma')], configs: [{ id: 'c1', nome: 'C', efeitos: [], gatilhos: [g('gc', 'DaConfig')] }] }],
        ...extra,
    });
    it('gatilhosDoCartao lista Poder, Forma ativa e Configuracao ativa', () => {
        const l = gatilhosDoCartao(poder());
        expect(l.map(x => x.g.id)).toEqual(['gp', 'gf', 'gc']);
        expect(l[0].formaId).toBeNull();
        expect(l[1].formaId).toBe('f1');
        expect(l[2]).toMatchObject({ formaId: 'f1', configId: 'c1' });
    });
    it('sem forma ativa so os do Poder; entradas invalidas seguras', () => {
        expect(gatilhosDoCartao(poder({ formaAtivaId: null })).map(x => x.g.id)).toEqual(['gp']);
        expect(gatilhosDoCartao(null)).toEqual([]);
        expect(gatilhosDoCartao({ gatilhos: [null], formaAtivaId: 'zzz', formas: [null] })).toEqual([]);
    });
    it('chaves de coletarGatilhos batem com chaveDoGatilhoDeForma', () => {
        const chaves = coletarGatilhos({ poderes: [poder()] }).map(x => x.chave);
        expect(chaves).toContain(chaveDoGatilhoDoPoder('p1', 'gp'));
        expect(chaves).toContain(chaveDoGatilhoDeForma('p1', 'f1', 'gf'));
        expect(chaves).toContain(chaveDoGatilhoDeForma('p1', 'f1', 'gc', 'c1'));
        expect(chaveDoGatilhoDeForma('p1', 'f1', 'gc', 'c1')).toBe('p1:forma:f1:cfg:c1:gc');
    });
    it('sem disparo duplicado: ids iguais em Poder e Forma geram chaves distintas, cada uma uma vez', () => {
        const p = poder({ gatilhos: [g('x', 'A')], formas: [{ id: 'f1', gatilhos: [g('x', 'A')], configs: [] }] });
        const chaves = coletarGatilhos({ poderes: [p] }).map(x => x.chave);
        expect(chaves).toHaveLength(2);
        expect(new Set(chaves).size).toBe(2);
    });
    it('achaGatilhoDoPoder acha por forma/config e devolve null para ausentes', () => {
        const p = poder();
        expect(achaGatilhoDoPoder(p, 'gp').id).toBe('gp');
        expect(achaGatilhoDoPoder(p, 'gf', 'f1').id).toBe('gf');
        expect(achaGatilhoDoPoder(p, 'gc', 'f1', 'c1').id).toBe('gc');
        expect(achaGatilhoDoPoder(p, 'gf')).toBeNull();
        expect(achaGatilhoDoPoder(p, 'gf', 'inexistente')).toBeNull();
        expect(achaGatilhoDoPoder(null, 'x')).toBeNull();
    });
    it('forcarGatilhoNaFicha dispara gatilho de Forma e de Configuracao com a chave certa', () => {
        const rng = () => 0.5;
        const f = { poderes: [poder()], combate: {} };
        expect(forcarGatilhoNaFicha(f, 'p1', 'gf', { formaId: 'f1', rng, nome: 'X' }).achou).toBe(true);
        expect(forcarGatilhoNaFicha(f, 'p1', 'gc', { formaId: 'f1', configId: 'c1', rng, nome: 'X' }).achou).toBe(true);
        const j = JSON.stringify(f);
        expect(j).toContain('p1:forma:f1:gf');
        expect(j).toContain('p1:forma:f1:cfg:c1:gc');
    });
    it('forcar gatilho de Forma sem formaId nao acha; inexistente nao acha', () => {
        const f = { poderes: [poder()], combate: {} };
        expect(forcarGatilhoNaFicha(f, 'p1', 'gf', {}).achou).toBe(false);
        expect(forcarGatilhoNaFicha(f, 'nao', 'gf', { formaId: 'f1' }).achou).toBe(false);
        expect(forcarGatilhoNaFicha(null, 'p1', 'gf', {}).achou).toBe(false);
    });
});

describe('prepararItemEnsinado / sanitizarModelo', () => {
    const gat = (extra) => ({ id: 'g', nome: 'G', evento: { tipo: 'turnoInicio' }, acoes: [], ...extra });
    const item = () => ({
        id: 'x', nome: 'Poder', descricao: 'texto', custo: 5, efeitos: [{ atributo: 'acerto', valor: '2' }],
        formaAtivaId: 'f1', configAtivaId: 'c1', estagioAtual: 2, recargaRestante: 3, usosRestantes: 1, armado: true, mestreDesligou: true,
        gatilhos: [gat({ armado: true, mestreDesligou: true, modo: 'opcional' })],
        formas: [{ id: 'f1', nome: 'F', gatilhos: [gat({ armado: true, mestreDesligou: true, prioridade: 4 })], configs: [] }],
    });
    it('limpa estado de instancia', () => {
        const c = prepararItemEnsinado(item());
        ['formaAtivaId', 'configAtivaId', 'estagioAtual', 'recargaRestante', 'usosRestantes', 'armado', 'id'].forEach(k => expect(c).not.toHaveProperty(k));
        expect(c.ativa).toBe(false);
    });
    it('limpa mestreDesligou do Poder (nivel raiz)', () => {
        expect(prepararItemEnsinado(item())).not.toHaveProperty('mestreDesligou');
    });
    it('limpa armado/mestreDesligou dos gatilhos do Poder e das Formas', () => {
        const c = prepararItemEnsinado(item());
        expect(c.gatilhos[0]).not.toHaveProperty('armado');
        expect(c.gatilhos[0]).not.toHaveProperty('mestreDesligou');
        expect(c.formas[0].gatilhos[0]).not.toHaveProperty('armado');
        expect(c.formas[0].gatilhos[0]).not.toHaveProperty('mestreDesligou');
    });
    it('nao apaga campos legitimos e nao muta o original', () => {
        const orig = item();
        const c = prepararItemEnsinado(orig);
        expect(c).toMatchObject({ nome: 'Poder', descricao: 'texto', custo: 5 });
        expect(c.gatilhos[0]).toMatchObject({ id: 'g', modo: 'opcional' });
        expect(c.formas[0].gatilhos[0].prioridade).toBe(4);
        expect(orig.gatilhos[0].armado).toBe(true);
        expect(orig.formaAtivaId).toBe('f1');
    });
    it('gatilhos nas Configuracoes das Formas tambem limpam armado', () => {
        const o = item();
        o.formas[0].configs = [{ id: 'c1', gatilhos: [gat({ armado: true, mestreDesligou: true })] }];
        const c = prepararItemEnsinado(o);
        expect(c.formas[0].configs[0].gatilhos[0]).not.toHaveProperty('armado');
        expect(c.formas[0].configs[0].gatilhos[0]).not.toHaveProperty('mestreDesligou');
    });
    it('entradas estranhas: null, gatilhos nao-array, null dentro da lista', () => {
        expect(prepararItemEnsinado(null)).toMatchObject({ ativa: false });
        expect(() => prepararItemEnsinado({ gatilhos: 'x', formas: [null, { gatilhos: [null, 3] }] })).not.toThrow();
        expect(prepararItemEnsinado({ formas: [{ gatilhos: [null, 3] }] }).formas[0].gatilhos).toEqual([null, 3]);
    });
    it('sanitizarModelo (biblioteca racial) tambem sai sem estado', () => {
        const m = sanitizarModelo(item());
        expect(m).not.toHaveProperty('formaAtivaId');
        expect(m).not.toHaveProperty('armado');
        expect(m.nome).toBe('Poder');
    });
});

describe('efeitoResumo', () => {
    it('sinal correto', () => {
        expect(valorDoEfeitoParaCartao({ atributo: 'forca', valor: '-4' })).toBe('-4');
        expect(valorDoEfeitoParaCartao({ atributo: 'forca', valor: -4 })).toBe('-4');
        expect(valorDoEfeitoParaCartao({ atributo: 'forca', valor: '4' })).toBe('+4');
        expect(valorDoEfeitoParaCartao({ atributo: 'forca', valor: 4 })).toBe('+4');
        expect(valorDoEfeitoParaCartao({ atributo: 'forca', valor: '+4' })).toBe('+4');
        expect(valorDoEfeitoParaCartao({ atributo: 'forca', valor: 0 })).toBe('+0');
    });
    it('nunca produz "+-"', () => {
        ['-4', -4, '-4.5', '-0,5', '- 4', '--4', '-abc'].forEach(v => expect(valorDoEfeitoParaCartao({ atributo: 'x', valor: v })).not.toMatch(/\+-/));
    });
    it('dano_dados mostra +20d6', () => {
        expect(valorDoEfeitoParaCartao({ atributo: 'dano_dados', valor: '20d6' })).toBe('+20d6');
        expect(valorDoEfeitoParaCartao({ atributo: 'dano_dados', valor: { qtd: 20, faces: 6 } })).toBe('+20d6');
    });
    it('resumo com alvo, condicao e escala', () => {
        const t = resumirEfeitoParaCartao({ atributo: 'evasiva', propriedade: 'base', valor: '-3', valeParaInimigos: true, quando: 'alvo_com_estado:presa', escalaContador: { contadorId: 'c', fator: 1 } });
        expect(t).toContain('[EVASIVA] BASE: -3');
        expect(t).toContain('inimigos');
        expect(t).toContain('quando alvo com estado presa');
        expect(t).toContain('escala com contador');
        expect(resumirEfeitoParaCartao({ atributo: 'acerto', propriedade: 'base', valor: 2, valeParaAliados: true, escalaAliados: { fator: 1 } })).toContain('aliados; escala com aliados');
        expect(resumirEfeitoParaCartao({ atributo: 'acerto', propriedade: 'base', valor: 2, quando: 'sempre' })).toBe('[ACERTO] BASE: +2');
    });
    it('prefixo e atributo com underscore', () => {
        expect(resumirEfeitoParaCartao({ atributo: 'piso_d20', propriedade: 'base', valor: 8 }, '- ')).toBe('- [PISO D20] BASE: +8');
    });
    it('valores estranhos e undefined seguros', () => {
        expect(resumirEfeitoParaCartao(null)).toBe('');
        expect(resumirEfeitoParaCartao(undefined)).toBe('');
        expect(resumirEfeitoParaCartao('x')).toBe('');
        expect(valorDoEfeitoParaCartao(undefined)).toBe('+0');
        expect(valorDoEfeitoParaCartao({})).toBe('+0');
        expect(valorDoEfeitoParaCartao({ valor: null })).toBe('+0');
        expect(valorDoEfeitoParaCartao({ valor: '   ' })).toBe('+0');
        expect(valorDoEfeitoParaCartao({ atributo: 'dano_dados' })).toBeTypeOf('string');
        expect(() => resumirEfeitoParaCartao({})).not.toThrow();
        expect(resumirEfeitoParaCartao({ valor: NaN })).not.toMatch(/undefined|null/);
    });
});

describe('estruturaCompartilhada', () => {
    const A = () => ({ nome: 'A', poderes: [{ id: 1, v: [1, 2] }], bio: { x: 1 } });
    it('identico mantem a MESMA referencia do personagem', () => {
        const locais = { a: A(), b: A() };
        expect(preservarReferenciasIguais(locais, { a: A(), b: A() })).toBe(locais);
        const r2 = preservarReferenciasIguais(locais, { a: A(), b: { ...A(), nome: 'B' } });
        expect(r2.a).toBe(locais.a);
        expect(r2.b).not.toBe(locais.b);
        expect(r2.b.nome).toBe('B');
        expect(r2).not.toBe(locais);
    });
    it('campo diferente devolve novo objeto', () => {
        const locais = { a: A() };
        const novo = A(); novo.bio.x = 2;
        const r = preservarReferenciasIguais(locais, { a: novo });
        expect(r.a).toBe(novo);
        expect(r.a.bio.x).toBe(2);
        expect(locais.a.bio.x).toBe(1);
    });
    it('ordem de chaves e irrelevante', () => {
        expect(iguaisProfundo({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    });
    it('undefined x ausente conta como diferente', () => {
        expect(iguaisProfundo({ a: 1, b: undefined }, { a: 1 })).toBe(false);
        expect(iguaisProfundo({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(iguaisProfundo({ a: undefined }, { b: undefined })).toBe(false);
        const locais = { a: { x: 1 } };
        expect(preservarReferenciasIguais(locais, { a: { x: 1, y: undefined } }).a).not.toBe(locais.a);
    });
    it('arrays: ordem, tamanho, array x objeto', () => {
        expect(iguaisProfundo([1, 2], [1, 2])).toBe(true);
        expect(iguaisProfundo([1, 2], [2, 1])).toBe(false);
        expect(iguaisProfundo([1], [1, 2])).toBe(false);
        expect(iguaisProfundo([], {})).toBe(false);
        expect(iguaisProfundo({ 0: 1 }, [1])).toBe(false);
    });
    it('nulos e primitivos', () => {
        expect(iguaisProfundo(null, null)).toBe(true);
        expect(iguaisProfundo(null, {})).toBe(false);
        expect(iguaisProfundo(undefined, null)).toBe(false);
        expect(iguaisProfundo(NaN, NaN)).toBe(true);
        expect(iguaisProfundo(1, '1')).toBe(false);
        expect(iguaisProfundo(0, -0)).toBe(true);
    });
    it('entradas nulas em preservarReferenciasIguais', () => {
        expect(preservarReferenciasIguais(null, { a: 1 })).toEqual({ a: 1 });
        expect(preservarReferenciasIguais({ a: 1 }, null)).toBeNull();
        expect(preservarReferenciasIguais(undefined, undefined)).toBeUndefined();
        const locais = { a: null };
        expect(preservarReferenciasIguais(locais, { a: null })).toBe(locais);
        expect(preservarReferenciasIguais({}, {})).toEqual({});
    });
    it('personagem removido ou adicionado muda o conjunto', () => {
        const locais = { a: A(), b: A() };
        const r = preservarReferenciasIguais(locais, { a: A() });
        expect(r).not.toBe(locais);
        expect(Object.keys(r)).toEqual(['a']);
        expect(r.a).toBe(locais.a);
        const r2 = preservarReferenciasIguais({ a: locais.a }, { a: A(), c: A() });
        expect(Object.keys(r2).sort()).toEqual(['a', 'c']);
    });
});

describe('dedup efeitosDeInimigos (mesmo Poder x portadores diferentes)', () => {
    const ef = (valor) => ({ atributo: 'evasiva', propriedade: 'base', valor, valeParaInimigos: true, quando: '' });
    const poder = (nome, efeitos) => ({ id: nome, nome, ativa: true, efeitos, efeitosPassivos: [] });
    const npc = (poderes) => ({ bio: {}, isNPC: true, posicoes: { c1: { x: 1, y: 1 } }, poderes });
    const args = (personagens) => ({ defensor: { dados: { bio: {}, posicoes: { c1: { x: 1, y: 1 } }, poderes: [] }, ehDummie: false, nome: 'Def' }, personagens, cenario: null, cenaId: 'c1', avaliar: () => true });
    const total = (l) => l.reduce((s, e) => s + parseFloat(e.valor), 0);
    it('dois efeitos do MESMO Poder valem os dois', () => {
        const r = coletarEfeitosDeInimigos(args({ P: npc([poder('Presa', [ef('-3'), ef('-4')])]) }));
        expect(r).toHaveLength(2);
        expect(total(r)).toBe(-7);
    });
    it('portadores diferentes com mesmo (Poder, atributo) contam um so', () => {
        const r = coletarEfeitosDeInimigos(args({ P1: npc([poder('Presa', [ef('-3')])]), P2: npc([poder('presa', [ef('-5')])]) }));
        expect(r).toHaveLength(1);
        expect(total(r)).toBe(-3);
    });
    it('portador diferente com Poder de outro nome soma', () => {
        const r = coletarEfeitosDeInimigos(args({ P1: npc([poder('A', [ef('-3')])]), P2: npc([poder('B', [ef('-5')])]) }));
        expect(total(r)).toBe(-8);
    });
    it('teto acumulado de -20 continua valendo', () => {
        const r = coletarEfeitosDeInimigos(args({ P1: npc([poder('A', [ef('-15'), ef('-15')])]) }));
        expect(total(r)).toBe(-20);
    });
    it('efeito positivo ou lixo ignorado', () => {
        const r = coletarEfeitosDeInimigos(args({ P1: npc([poder('A', [ef('5'), ef('abc'), null, ef('-2')])]) }));
        expect(total(r)).toBe(-2);
    });
});
