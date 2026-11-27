import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import {
    quadradosNoTurno, quadradosDoMovimento, registrarMovimento, zerarQuadradosNoTurno, normalizarEscalaMovimento, quadradosContados,
    efeitoAceitaEscalaMovimento, LIMITE_QUADRADOS_POR_MOVIMENTO, LIMITE_QUADRADOS_NO_TURNO, CAMINHO_QUADRADOS_NO_TURNO,
} from './movimentoNoTurno';
import { resumoDeMovimento, textoDeMovimento } from './movimentoInfo';
import { escalarEfeitosPorContador } from './efeitos-resolver';
import { montarEscalasDoEfeito, ESCALA_VAZIA } from './escalaEfeito';
import { normalizarPoder } from './sextaFeiraCriacao';
import { rascunhoVazio } from './rascunhoPoder';
import { normalizarQuando, ATRIBUTOS_COM_QUANDO } from './efeitosCondicionais';
import { dispararEventoNaFicha } from './gatilhosAplicar';
import { efeitoPodeValerParaInimigos } from './efeitosDeInimigos';

beforeEach(() => { useStore.setState({ personagens: {}, cenario: { ativa: 'c1' } }); });

const emCombate = (extra = {}) => ({ iniciativa: 10, combate: { quadradosNoTurno: 0 }, ...extra });
const A = { x: 0, y: 0, z: 0, cenaId: 'c1' };
const B = (x, y, z = 0, cenaId = 'c1') => ({ x, y, z, cenaId });

describe('movimentoNoTurno - leitura do contador', () => {
    it('ficha sem combate / sem campo / nula = 0', () => {
        expect(quadradosNoTurno({})).toBe(0);
        expect(quadradosNoTurno({ combate: {} })).toBe(0);
        expect(quadradosNoTurno(null)).toBe(0);
        expect(quadradosNoTurno(undefined)).toBe(0);
    });
    it('valores invalidos leem 0 (NaN, Infinity, negativo, texto)', () => {
        [NaN, Infinity, -Infinity, -3, 'abc', null, {}].forEach(v => expect(quadradosNoTurno({ combate: { quadradosNoTurno: v } })).toBe(0));
    });
    it('trunca fracao e limita em 1000', () => {
        expect(quadradosNoTurno({ combate: { quadradosNoTurno: 7.9 } })).toBe(7);
        expect(quadradosNoTurno({ combate: { quadradosNoTurno: 5000 } })).toBe(LIMITE_QUADRADOS_NO_TURNO);
    });
});

describe('movimentoNoTurno - quadradosDoMovimento / registrarMovimento', () => {
    it('mesmo quadrado conta 0', () => {
        const f = emCombate();
        expect(registrarMovimento(f, A, B(0, 0))).toBe(0);
        expect(f.combate.quadradosNoTurno).toBe(0);
    });
    it('usa a maior diferenca (diagonal conta como 1 por passo)', () => {
        expect(quadradosDoMovimento(A, B(3, 5))).toBe(5);
        expect(quadradosDoMovimento(A, B(-4, 2))).toBe(4);
    });
    it('altura z convertida pela escala da cena (padrao 1.5)', () => {
        expect(quadradosDoMovimento(A, B(0, 0, 9))).toBe(6);
        expect(quadradosDoMovimento(A, B(0, 0, 9), 3)).toBe(3);
        expect(quadradosDoMovimento(A, B(1, 1, 1))).toBe(1); // z/1.5 = 0, x=1
        expect(quadradosDoMovimento(A, B(0, 0, -9))).toBe(6); // descida tambem
    });
    it('escala invalida (0, negativa, NaN) cai em 1.5', () => {
        [0, -2, NaN, 'x'].forEach(e => expect(quadradosDoMovimento(A, B(0, 0, 3), e)).toBe(2));
    });
    it('ida e volta soma os dois trechos', () => {
        const f = emCombate();
        registrarMovimento(f, A, B(3, 0));
        registrarMovimento(f, B(3, 0), A);
        expect(f.combate.quadradosNoTurno).toBe(6);
    });
    it('teto de 30 por movimento (teleporte)', () => {
        const f = emCombate();
        expect(registrarMovimento(f, A, B(500, 0))).toBe(LIMITE_QUADRADOS_POR_MOVIMENTO);
        expect(f.combate.quadradosNoTurno).toBe(30);
    });
    it('contador total limitado a 1000', () => {
        const f = emCombate({ combate: { quadradosNoTurno: 990 } });
        registrarMovimento(f, A, B(30, 0));
        expect(f.combate.quadradosNoTurno).toBe(LIMITE_QUADRADOS_NO_TURNO);
    });
    it('so conta com iniciativa > 0 (0, negativa, ausente, NaN, texto)', () => {
        [0, -1, undefined, NaN, 'x'].forEach((ini) => {
            const f = { iniciativa: ini, combate: {} };
            expect(registrarMovimento(f, A, B(2, 0))).toBe(0);
            expect(f.combate.quadradosNoTurno).toBeUndefined();
        });
    });
    it('so conta na mesma cena (cenaId diferente = 0; ausente vale default)', () => {
        const f = emCombate();
        expect(registrarMovimento(f, A, B(2, 0, 0, 'c2'))).toBe(0);
        expect(registrarMovimento(f, { x: 0, y: 0 }, { x: 2, y: 0, cenaId: 'default' })).toBe(2);
        expect(f.combate.quadradosNoTurno).toBe(2);
    });
    it('cria ficha.combate se faltar (ficha antiga)', () => {
        const f = { iniciativa: 3 };
        expect(registrarMovimento(f, A, B(2, 0))).toBe(2);
        expect(f.combate.quadradosNoTurno).toBe(2);
    });
    it('entradas invalidas nao quebram: ficha/de/para nulos, combate nao-objeto', () => {
        expect(registrarMovimento(null, A, B(1, 0))).toBe(0);
        expect(registrarMovimento('x', A, B(1, 0))).toBe(0);
        expect(registrarMovimento(emCombate(), null, B(1, 0))).toBe(0);
        expect(registrarMovimento(emCombate(), A, undefined)).toBe(0);
        expect(quadradosDoMovimento(null, A)).toBe(0);
        const f = { iniciativa: 2, combate: 'quebrado' };
        expect(registrarMovimento(f, A, B(1, 0))).toBe(1);
    });
    it('coordenadas nao numericas viram 0', () => {
        expect(quadradosDoMovimento({ x: 'a', y: undefined }, B(2, 0))).toBe(2);
    });
});

describe('movimentoNoTurno - zerar e eventos', () => {
    it('zerar devolve true so quando havia algo; sem combate = false', () => {
        const f = emCombate({ combate: { quadradosNoTurno: 4 } });
        expect(zerarQuadradosNoTurno(f)).toBe(true);
        expect(f.combate.quadradosNoTurno).toBe(0);
        expect(zerarQuadradosNoTurno(f)).toBe(false);
        expect(zerarQuadradosNoTurno({})).toBe(false);
        expect(zerarQuadradosNoTurno(null)).toBe(false);
    });
    ['turnoInicio', 'inicioDeLuta', 'fimDeLuta'].forEach((tipo) => {
        it(`evento ${tipo} zera o contador e marca o caminho`, () => {
            const f = emCombate({ combate: { quadradosNoTurno: 12 }, poderes: [] });
            const r = dispararEventoNaFicha(f, { tipo }, { cenaId: 'c1' });
            expect(f.combate.quadradosNoTurno).toBe(0);
            expect(r.caminhos).toContain(CAMINHO_QUADRADOS_NO_TURNO);
        });
    });
    it('outro evento (turnoFim) nao zera', () => {
        const f = emCombate({ combate: { quadradosNoTurno: 12 }, poderes: [] });
        dispararEventoNaFicha(f, { tipo: 'turnoFim' }, { cenaId: 'c1' });
        expect(f.combate.quadradosNoTurno).toBe(12);
    });
    it('ficha antiga sem o campo nao gera caminho', () => {
        const f = { iniciativa: 2, combate: {}, poderes: [] };
        const r = dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1' });
        expect(r.caminhos).not.toContain(CAMINHO_QUADRADOS_NO_TURNO);
    });
});

describe('normalizarEscalaMovimento / quadradosContados', () => {
    it('valida fator e teto', () => {
        expect(normalizarEscalaMovimento({ fator: 2, max: 5 })).toEqual({ fator: 2, max: 5 });
        expect(normalizarEscalaMovimento({ fator: '1.5', max: '4' })).toEqual({ fator: 1.5, max: 4 });
        expect(normalizarEscalaMovimento({ fator: -2, max: 100 })).toEqual({ fator: -2, max: 100 });
    });
    it('sem max valido = null (ausente, 0, negativo, NaN, >100, fracao, Infinity)', () => {
        [undefined, 0, -1, NaN, 101, 2.5, Infinity, 'x', null].forEach(m => expect(normalizarEscalaMovimento({ fator: 2, max: m })).toBeNull());
    });
    it('fator invalido = null (0, NaN, Infinity, > 1e6, ausente)', () => {
        [0, NaN, Infinity, -Infinity, 1e7, undefined, 'abc'].forEach(fa => expect(normalizarEscalaMovimento({ fator: fa, max: 5 })).toBeNull());
        expect(normalizarEscalaMovimento({ fator: 1e6, max: 5 })).not.toBeNull();
    });
    it('entrada nao-objeto = null', () => {
        [null, undefined, 5, 'x'].forEach(v => expect(normalizarEscalaMovimento(v)).toBeNull());
    });
    it('quadradosContados: so em combate e limitado ao teto', () => {
        const f = emCombate({ combate: { quadradosNoTurno: 20 } });
        expect(quadradosContados(f, 5)).toBe(5);
        expect(quadradosContados(f, 50)).toBe(20);
        expect(quadradosContados({ ...f, iniciativa: 0 }, 5)).toBe(0);
        expect(quadradosContados(f, 0)).toBe(0);
        expect(quadradosContados(f, NaN)).toBe(0);
        expect(quadradosContados(f, 2.5)).toBe(0);
        expect(quadradosContados(null, 5)).toBe(0);
    });
    it('atributos aceitos', () => {
        ['dano_dados', 'acerto', 'evasiva', 'resistencia', 'dano', ' ACERTO '].forEach(a => expect(efeitoAceitaEscalaMovimento(a)).toBe(true));
        ['forca', 'movimento', '', null, undefined].forEach(a => expect(efeitoAceitaEscalaMovimento(a)).toBe(false));
    });
});

describe('escalaMovimento no resolver (escalarEfeitosPorContador)', () => {
    const fichaQ = (q, ini = 5) => ({ iniciativa: ini, combate: { quadradosNoTurno: q } });
    const num = (efeito, ficha) => Number(escalarEfeitosPorContador([efeito], [], ficha)[0].valor);
    const dano = (valor, esc, ficha) => escalarEfeitosPorContador([{ atributo: 'dano_dados', propriedade: 'base', valor, escalaMovimento: esc }], [], ficha)[0].valor;

    it('numerico: valor + fator x min(q, max)', () => {
        const e = { atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: 3, max: 5 } };
        expect(num(e, fichaQ(10))).toBe(17);
        expect(num(e, fichaQ(2))).toBe(8);
        expect(num(e, fichaQ(0))).toBe(2);
    });
    it('fator negativo reduz (evasiva)', () => {
        expect(num({ atributo: 'evasiva', propriedade: 'base', valor: '0', escalaMovimento: { fator: -2, max: 4 } }, fichaQ(9))).toBe(-8);
    });
    it('fora de combate (iniciativa 0) nao escala', () => {
        const e = { atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: 3, max: 5 } };
        expect(num(e, fichaQ(10, 0))).toBe(2);
    });
    it('sem ficha nao escala e nao quebra', () => {
        const r = escalarEfeitosPorContador([{ atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: 3, max: 5 } }], [], null);
        expect(Number(r[0].valor)).toBe(2);
    });
    it('sem max valido = sem escala (numerico)', () => {
        [undefined, 0, -3, NaN, 101, 'x'].forEach((m) => {
            expect(num({ atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: 3, max: m } }, fichaQ(10))).toBe(2);
        });
    });
    it('fator Infinity/NaN = sem escala, sem NaN no valor', () => {
        [Infinity, NaN, 0].forEach((fa) => {
            const v = num({ atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: fa, max: 5 } }, fichaQ(10));
            expect(v).toBe(2);
        });
    });
    it('contador corrompido (NaN/Infinity) conta 0', () => {
        expect(num({ atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: 3, max: 5 } }, fichaQ(NaN))).toBe(2);
        expect(num({ atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: { fator: 3, max: 5 } }, fichaQ(Infinity))).toBe(2);
    });
    it('dano_dados: N x fator x q dados', () => {
        expect(dano('2d6', { fator: 1, max: 10 }, fichaQ(4))).toBe('8d6');
        expect(dano('1d8', { fator: 2, max: 3 }, fichaQ(9))).toBe('6d8');
    });
    it('dano_dados: 0 quadrados = 0 dados', () => {
        expect(dano('1d6', { fator: 1, max: 5 }, fichaQ(0))).toBe('0d6');
        expect(dano('1d6', { fator: 1, max: 5 }, fichaQ(5, 0))).toBe('0d6');
        expect(dano('1d6', { fator: 1, max: 5 }, null)).toBe('0d6');
    });
    it('dano_dados: SEM max valido = 0 dados', () => {
        [undefined, 0, -1, NaN, 101, Infinity].forEach(m => expect(dano('1d6', { fator: 1, max: m }, fichaQ(10))).toBe('0d6'));
    });
    it('dano_dados: fator negativo, zero, Infinity, NaN = 0 dados', () => {
        [-1, 0, Infinity, NaN].forEach(fa => expect(dano('1d6', { fator: fa, max: 5 }, fichaQ(10))).toBe('0d6'));
    });
    it('dano_dados: limite de 1000 dados', () => {
        expect(dano('50d6', { fator: 1000, max: 100 }, fichaQ(100))).toBe('1000d6');
        expect(dano('1d6', { fator: 1e6, max: 100 }, fichaQ(100))).toBe('1000d6');
    });
    it('dano_dados: fator fracionario trunca para baixo', () => {
        expect(dano('1d6', { fator: 0.5, max: 5 }, fichaQ(3))).toBe('1d6');
        expect(dano('1d6', { fator: 0.5, max: 5 }, fichaQ(1))).toBe('0d6');
    });
    it('dano_dados com valor invalido nao quebra e passa intacto', () => {
        expect(dano('abc', { fator: 1, max: 5 }, fichaQ(3))).toBe('abc');
    });
    it('efeito sem escalaMovimento (poder antigo) passa intacto e mesma referencia da lista', () => {
        const lista = [{ atributo: 'acerto', propriedade: 'base', valor: '2' }];
        expect(escalarEfeitosPorContador(lista, [], fichaQ(5))).toBe(lista);
    });
    it('escalaMovimento nao-objeto e ignorado', () => {
        const lista = [{ atributo: 'acerto', propriedade: 'base', valor: '2', escalaMovimento: 'x' }];
        expect(escalarEfeitosPorContador(lista, [], fichaQ(5))).toBe(lista);
    });
    it('combina com escalaContador (soma)', () => {
        const e = { atributo: 'acerto', propriedade: 'base', valor: '1', escalaContador: { contadorId: 'c', fator: 2 }, escalaMovimento: { fator: 3, max: 5 } };
        const r = escalarEfeitosPorContador([e], [{ id: 'c', valor: 4 }], fichaQ(2));
        expect(Number(r[0].valor)).toBe(1 + 8 + 6);
    });
});

describe('escalaEfeito (editor) - escalaMovimento', () => {
    const form = (extra) => ({ ...ESCALA_VAZIA, ...extra });
    it('monta escalaMovimento valida', () => {
        const r = montarEscalasDoEfeito(form({ movFator: '2', movMax: '5' }), 'acerto');
        expect(r.erro).toBeUndefined();
        expect(r.campos.escalaMovimento).toEqual({ fator: 2, max: 5 });
    });
    it('sem teto = erro (nunca escala sem teto)', () => {
        const r = montarEscalasDoEfeito(form({ movFator: '2', movMax: '' }), 'acerto');
        expect(r.erro).toMatch(/TETO/);
        expect(r.campos.escalaMovimento).toBeUndefined();
    });
    it('teto invalido (0, 101, 2.5, texto) = erro', () => {
        ['0', '101', '2.5', 'x', '-1'].forEach(m => expect(montarEscalasDoEfeito(form({ movFator: '2', movMax: m }), 'acerto').erro).toBeTruthy());
    });
    it('fator zero/vazio/texto = erro', () => {
        ['0', '', 'abc'].forEach(fa => expect(montarEscalasDoEfeito(form({ movFator: fa, movMax: '5' }), 'acerto').erro).toBeTruthy());
    });
    it('dano_dados: fator negativo = erro; positivo ok', () => {
        expect(montarEscalasDoEfeito(form({ movFator: '-1', movMax: '5' }), 'dano_dados').erro).toBeTruthy();
        expect(montarEscalasDoEfeito(form({ movFator: '1', movMax: '5' }), 'dano_dados').campos.escalaMovimento).toEqual({ fator: 1, max: 5 });
    });
    it('atributo que nao aceita escala por movimento ignora os campos', () => {
        const r = montarEscalasDoEfeito(form({ movFator: '2', movMax: '5' }), 'forca');
        expect(r.erro).toBeUndefined();
        expect(r.campos.escalaMovimento).toBeUndefined();
    });
    it('form vazio / indefinido (poder antigo) = sem campos', () => {
        expect(montarEscalasDoEfeito(ESCALA_VAZIA, 'acerto').campos).toEqual({});
        expect(montarEscalasDoEfeito(undefined, 'acerto').campos).toEqual({});
        expect(montarEscalasDoEfeito({ contadorId: '', fator: '' }, 'acerto').campos).toEqual({});
    });
    it('paraInimigos so marca em evasiva/resistencia/acerto', () => {
        expect(montarEscalasDoEfeito(form({ paraInimigos: true }), 'evasiva').campos.valeParaInimigos).toBe(true);
        expect(montarEscalasDoEfeito(form({ paraInimigos: true }), 'forca').campos.valeParaInimigos).toBeUndefined();
        expect(montarEscalasDoEfeito(form({ paraInimigos: 'true' }), 'acerto').campos.valeParaInimigos).toBeUndefined();
        expect(efeitoPodeValerParaInimigos(' Resistencia ')).toBe(true);
        expect(efeitoPodeValerParaInimigos('dano')).toBe(false);
    });
    it('rascunhoVazio traz os campos novos', () => {
        const r = rascunhoVazio();
        [r.novoEscala, r.novoEscalaPassivo].forEach(e => expect(e).toMatchObject({ paraInimigos: false, movFator: '', movMax: '' }));
    });
});

describe('efeitos informativos movimento / velocidade_zero', () => {
    const poderCom = (efeitos) => ({ id: 'p', nome: 'Poder X', ativa: true, efeitos: [], efeitosPassivos: efeitos });
    const ef = (atributo, valor, extra = {}) => ({ atributo, propriedade: 'base', valor: String(valor), ...extra });

    it('ficha vazia / nula = neutro', () => {
        const n = { bonusQuadrados: 0, velocidadeZero: false, mult: 1, semMovimento: false, quadradosNoTurno: 0, emCombate: false };
        expect(resumoDeMovimento({})).toEqual(n);
        expect(resumoDeMovimento(null)).toEqual(n);
        expect(resumoDeMovimento('x')).toEqual(n);
        expect(textoDeMovimento(n)).toBe('');
        expect(textoDeMovimento(null)).toBe('');
    });
    it('movimento soma bonus em quadrados; texto mostra sinal', () => {
        const f = { poderes: [poderCom([ef('movimento', 3), ef('movimento', 2)])] };
        const r = resumoDeMovimento(f, 'Mago');
        expect(r.bonusQuadrados).toBe(5);
        expect(textoDeMovimento(r)).toContain('+5 quadrado(s)');
    });
    it('bonus negativo e limitado a +-1000', () => {
        expect(resumoDeMovimento({ poderes: [poderCom([ef('movimento', -4)])] }).bonusQuadrados).toBe(-4);
        expect(resumoDeMovimento({ poderes: [poderCom([ef('movimento', 99999)])] }).bonusQuadrados).toBe(1000);
        expect(resumoDeMovimento({ poderes: [poderCom([ef('movimento', -99999)])] }).bonusQuadrados).toBe(-1000);
    });
    it('valor invalido (texto) soma 0', () => {
        expect(resumoDeMovimento({ poderes: [poderCom([ef('movimento', 'abc')])] }).bonusQuadrados).toBe(0);
    });
    it('velocidade_zero > 0 zera; 0 ou negativo nao', () => {
        expect(resumoDeMovimento({ poderes: [poderCom([ef('velocidade_zero', 1)])] }).velocidadeZero).toBe(true);
        expect(resumoDeMovimento({ poderes: [poderCom([ef('velocidade_zero', 0)])] }).velocidadeZero).toBe(false);
        expect(resumoDeMovimento({ poderes: [poderCom([ef('velocidade_zero', -1)])] }).velocidadeZero).toBe(false);
        expect(textoDeMovimento(resumoDeMovimento({ poderes: [poderCom([ef('velocidade_zero', 1), ef('movimento', 4)])] }))).toBe('👣 velocidade 0');
    });
    it('aceitam `quando`: em_combate so vale com iniciativa', () => {
        const poderes = [poderCom([ef('movimento', 3, { quando: 'em_combate' })])];
        expect(resumoDeMovimento({ poderes, iniciativa: 0 }).bonusQuadrados).toBe(0);
        expect(resumoDeMovimento({ poderes, iniciativa: 4 }).bonusQuadrados).toBe(3);
    });
    it('quando estado_em_campo:presa e normalizado e aceito nesses atributos', () => {
        expect(normalizarQuando('estado_em_campo:presa')).toBe('estado_em_campo:presa');
        expect(normalizarQuando('estado_em_campo:inexistente')).toBeNull();
        expect(normalizarQuando('estado_em_campo')).toBeNull();
        expect(ATRIBUTOS_COM_QUANDO).toContain('movimento');
        expect(ATRIBUTOS_COM_QUANDO).toContain('velocidade_zero');
    });
    it('estados Imobilizado zera; Lento = x0.5; contador so em combate', () => {
        const imob = resumoDeMovimento({ condicoes: [{ id: 'imobilizado', stacks: 1 }] });
        expect(imob.semMovimento).toBe(true);
        expect(imob.velocidadeZero).toBe(true);
        expect(imob.mult).toBe(0);
        const lento = resumoDeMovimento({ condicoes: [{ id: 'lento', stacks: 1 }] });
        expect(lento.mult).toBe(0.5);
        expect(textoDeMovimento(lento)).toContain('x0.5');
        const em = resumoDeMovimento({ iniciativa: 3, combate: { quadradosNoTurno: 7 } });
        expect(em.quadradosNoTurno).toBe(7);
        expect(textoDeMovimento(em)).toContain('7 quadrado(s) percorridos');
        expect(resumoDeMovimento({ iniciativa: 0, combate: { quadradosNoTurno: 7 } }).quadradosNoTurno).toBe(0);
    });
});

describe('Sexta-Feira aceita escalaMovimento / valeParaInimigos', () => {
    const poder = (efeitos) => normalizarPoder({ nome: 'Poder X', categoria: 'habilidade', efeitos });
    const ef = (extra = {}) => ({ nome: 'E', atributo: 'acerto', propriedade: 'base', valor: 1, ...extra });

    it('escalaMovimento valida persiste; string numerica convertida', () => {
        expect(poder([ef({ escalaMovimento: { fator: 2, max: 5 } })]).objeto.efeitos[0].escalaMovimento).toEqual({ fator: 2, max: 5 });
        expect(poder([ef({ escalaMovimento: { fator: '2', max: '5' } })]).objeto.efeitos[0].escalaMovimento).toEqual({ fator: 2, max: 5 });
    });
    it('sem teto valido: descartada com aviso, efeito mantido', () => {
        [{ fator: 2 }, { fator: 2, max: 0 }, { fator: 2, max: 101 }, { fator: 2, max: -1 }, { fator: 2, max: NaN }, { fator: 0, max: 5 }].forEach((esc) => {
            const { objeto, avisos } = poder([ef({ escalaMovimento: esc })]);
            expect(objeto.efeitos).toHaveLength(1);
            expect('escalaMovimento' in objeto.efeitos[0]).toBe(false);
            expect(avisos.join(' ')).toMatch(/movimento/i);
        });
    });
    it('atributo que nao escala por movimento: ignorada com aviso', () => {
        const { objeto, avisos } = poder([ef({ atributo: 'forca', escalaMovimento: { fator: 2, max: 5 } })]);
        expect('escalaMovimento' in objeto.efeitos[0]).toBe(false);
        expect(avisos.join(' ')).toMatch(/n[aã]o escala por movimento/i);
    });
    it('dano_dados com fator negativo e ignorado', () => {
        const { objeto } = poder([ef({ atributo: 'dano_dados', valor: '1d6', escalaMovimento: { fator: -1, max: 5 } })]);
        expect('escalaMovimento' in objeto.efeitos[0]).toBe(false);
    });
    it('escalaMovimento nao-objeto e ignorada sem quebrar', () => {
        const { objeto } = poder([ef({ escalaMovimento: 'x' }), ef({ escalaMovimento: null })]);
        expect(objeto.efeitos).toHaveLength(2);
    });
    it('valeParaInimigos so com base, atributo permitido e valor negativo', () => {
        expect(poder([ef({ atributo: 'evasiva', valor: -3, valeParaInimigos: true })]).objeto.efeitos[0].valeParaInimigos).toBe(true);
        expect(poder([ef({ atributo: 'resistencia', valor: -3, valeParaInimigos: true })]).objeto.efeitos[0].valeParaInimigos).toBe(true);
        const nega = [
            ef({ atributo: 'evasiva', valor: 3, valeParaInimigos: true }),
            ef({ atributo: 'evasiva', valor: 0, valeParaInimigos: true }),
            ef({ atributo: 'forca', valor: -3, valeParaInimigos: true }),
            ef({ atributo: 'evasiva', propriedade: 'mgeral', valor: -3, valeParaInimigos: true }),
            ef({ atributo: 'evasiva', valor: -3, valeParaInimigos: 'true' }),
        ];
        nega.forEach((e) => {
            const r = poder([e]);
            expect(r.objeto.efeitos[0].valeParaInimigos).toBeUndefined();
        });
    });
    it('poder sem os campos novos permanece igual', () => {
        const { objeto } = poder([ef()]);
        expect('escalaMovimento' in objeto.efeitos[0]).toBe(false);
        expect('valeParaInimigos' in objeto.efeitos[0]).toBe(false);
    });
});
