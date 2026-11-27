import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore from '../stores/useStore';
import { coletarEfeitosDeInimigos, efeitosDeInimigosDaMesa, LIMITE_PENALIDADE_INIMIGOS } from './efeitosDeInimigos';
import { existeEstadoEmCena, existeEstadoEmCampoDaMesa } from './estadoEmCampo';
import { coletarEfeitos, passaQuando, somarEfeitosBase } from './efeitosCondicionais';
import { defesaEfetivaDoAlvo } from './alvoCombate';
import { calcularCA } from './engine';
import { reduzirComBonus } from './utils';

const POS = { c1: { x: 1, y: 1 } };
const ficha = (extra = {}) => ({ bio: {}, posicoes: { ...POS }, poderes: [], ...extra });
const npc = (extra = {}) => ficha({ isNPC: true, ...extra });
const efPen = (extra = {}) => ({ atributo: 'evasiva', propriedade: 'base', valor: '-5', valeParaInimigos: true, quando: '', ...extra });
const poder = (nome, efeitos, extra = {}) => ({ id: nome, nome, ativa: true, efeitos, efeitosPassivos: [], ...extra });
const comPresa = (extra = {}) => ({ condicoes: [{ id: 'presa', stacks: 1 }], ...extra });
const mesa = (personagens, extra = {}) => useStore.setState({
    personagens, cenario: { ativa: 'c1' }, isMestre: false, meuNome: 'Logado', minhaFicha: null, ...extra,
});
const soma = (lista, atr) => lista.filter(e => e.atributo === atr).reduce((s, e) => s + parseFloat(e.valor), 0);
const doInimigo = (f, nome) => coletarEfeitos(f, nome).filter(e => e.__x === undefined && e.valeParaInimigos === undefined && e.atributo === 'evasiva');

beforeEach(() => { mesa({}); });

describe('estado_em_campo (core/estadoEmCampo.js)', () => {
    const base = { personagens: { A: ficha(comPresa()) }, cenaId: 'c1', estadoId: 'presa' };
    it('true quando um personagem posicionado na cena ativa tem o estado', () => {
        expect(existeEstadoEmCena(base)).toBe(true);
    });
    it('so devolve boolean (nunca nome)', () => {
        expect(typeof existeEstadoEmCena(base)).toBe('boolean');
        expect(existeEstadoEmCena({ ...base, estadoId: 'cego' })).toBe(false);
    });
    it('falha fechada sem estado, sem cena ou sem mesa', () => {
        expect(existeEstadoEmCena({ ...base, estadoId: '' })).toBe(false);
        expect(existeEstadoEmCena({ ...base, cenaId: '' })).toBe(false);
        expect(existeEstadoEmCena({ cenaId: 'c1', estadoId: 'presa' })).toBe(false);
        expect(existeEstadoEmCena({})).toBe(false);
        expect(existeEstadoEmCena({ ...base, personagens: null })).toBe(false);
    });
    it('personagem em outra cena ou sem posicao nao conta', () => {
        expect(existeEstadoEmCena({ ...base, personagens: { A: ficha(comPresa({ posicoes: { c2: { x: 1, y: 1 } } })) } })).toBe(false);
        expect(existeEstadoEmCena({ ...base, personagens: { A: ficha(comPresa({ posicoes: {} })) } })).toBe(false);
    });
    it('entradas nulas/lixo na mesa nao quebram', () => {
        expect(existeEstadoEmCena({ ...base, personagens: { A: null, B: 'x', C: ficha() } })).toBe(false);
    });
    it('estado com stacks 0 ou id invalido nao conta', () => {
        expect(existeEstadoEmCena({ ...base, personagens: { A: ficha({ condicoes: [{ id: 'presa', stacks: 0 }] }) } })).toBe(false);
        expect(existeEstadoEmCena({ ...base, personagens: { A: ficha({ condicoes: [{ id: 'nao_existe', stacks: 1 }] }) }, estadoId: 'nao_existe' })).toBe(false);
    });
    it('lê a mesa e invalida o cache ao mudar personagens e cenario', () => {
        mesa({ A: ficha() });
        expect(existeEstadoEmCampoDaMesa('presa')).toBe(false);
        mesa({ A: ficha(comPresa()) });
        expect(existeEstadoEmCampoDaMesa('presa')).toBe(true);
        useStore.setState({ cenario: { ativa: 'c2' } });
        expect(existeEstadoEmCampoDaMesa('presa')).toBe(false);
    });
    it('passaQuando falha fechada sem contexto e so aceita true estrito', () => {
        const e = { atributo: 'evasiva', propriedade: 'base', valor: '-1', quando: 'estado_em_campo:presa' };
        expect(passaQuando(e, {})).toBe(false);
        expect(passaQuando(e, null)).toBe(false);
        expect(passaQuando(e, { temEstadoEmCampo: 'sim' })).toBe(false);
        expect(passaQuando(e, { temEstadoEmCampo: () => 1 })).toBe(false);
        expect(passaQuando(e, { temEstadoEmCampo: () => true })).toBe(true);
        expect(passaQuando({ ...e, quando: 'estado_em_campo:xyz' }, { temEstadoEmCampo: () => true })).toBe(false);
    });
    it('temEstadoEmCampo lança nao propaga: erro no store devolve false', () => {
        const spy = vi.spyOn(useStore, 'getState').mockImplementation(() => { throw new Error('x'); });
        try { expect(existeEstadoEmCampoDaMesa('presa')).toBe(false); } finally { spy.mockRestore(); }
    });
});

describe('penalidade a inimigos: personagem defensor (coletarEfeitos)', () => {
    const cenario = (extra = {}) => {
        const p = {
            Defensor: ficha(),
            Portador: npc({ poderes: [poder('Poder X', [efPen({ quando: 'estado_em_campo:presa' })])], ...comPresa() }),
            ...extra,
        };
        mesa(p);
        return p;
    };

    it('hostil na cena ativa recebe a penalidade, sem `quando` e sem a marca', () => {
        const p = cenario();
        const r = coletarEfeitos(p.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva');
        expect(r).toHaveLength(1);
        expect(r[0].valor).toBe('-5');
        expect(r[0].quando).toBe('');
        expect(somarEfeitosBase(p.Defensor, 'evasiva', {})).toBe(-5);
    });
    it('condicao falsa (ninguem com Presa) = sem penalidade', () => {
        const p = cenario();
        mesa({ ...p, Portador: { ...p.Portador, condicoes: [] } });
        const f = useStore.getState().personagens;
        expect(coletarEfeitos(f.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('Presa em outro personagem da cena satisfaz a condicao', () => {
        const p = cenario();
        mesa({ ...p, Portador: { ...p.Portador, condicoes: [] }, Alvo: ficha(comPresa()) });
        expect(coletarEfeitos(useStore.getState().personagens.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva')).toHaveLength(1);
    });
    it('NAO vaza para o proprio portador', () => {
        const p = cenario();
        expect(coletarEfeitos(p.Portador, 'Portador').filter(e => e.valeParaInimigos !== undefined || (e.atributo === 'evasiva'))).toHaveLength(0);
    });
    it('NAO vaza para aliado do portador (mesma equipe)', () => {
        const p = cenario({ Aliado: npc() });
        expect(coletarEfeitos(p.Aliado, 'Aliado').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('neutro nao e afetado', () => {
        const p = cenario({ Neutro: ficha({ combate: { equipe: 'neutros' } }) });
        expect(coletarEfeitos(p.Neutro, 'Neutro').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('portador em outra cena (so posicao em c2) nao conta', () => {
        const p = cenario();
        mesa({ ...p, Portador: { ...p.Portador, posicoes: { c2: { x: 1, y: 1 } } } });
        expect(coletarEfeitos(useStore.getState().personagens.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('mudar a cena ativa muda quem conta', () => {
        const p = cenario();
        mesa({ ...p, Portador: { ...p.Portador, posicoes: { c2: { x: 1, y: 1 } } }, Defensor: { ...p.Defensor, posicoes: { c1: { x: 1, y: 1 }, c2: { x: 1, y: 1 } } } });
        useStore.setState({ cenario: { ativa: 'c2' } });
        expect(coletarEfeitos(useStore.getState().personagens.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva')).toHaveLength(1);
        useStore.setState({ cenario: { ativa: 'c1' } });
        expect(coletarEfeitos(useStore.getState().personagens.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('cenario com relacao personalizada: equipes aliadas nao sao hostis; hostil customizada e', () => {
        const p = cenario({ Outro: ficha({ combate: { equipe: 'x' } }) });
        useStore.setState({ cenario: { ativa: 'c1', equipes: [{ id: 'aliados', nome: 'A' }, { id: 'inimigos', nome: 'I' }, { id: 'x', nome: 'X' }], relacoes: { 'inimigos|x': 'hostil' } } });
        expect(coletarEfeitos(p.Outro, 'Outro').filter(e => e.atributo === 'evasiva')).toHaveLength(1);
        useStore.setState({ cenario: { ativa: 'c1', equipes: [{ id: 'aliados', nome: 'A' }, { id: 'inimigos', nome: 'I' }, { id: 'x', nome: 'X' }], relacoes: { 'inimigos|x': 'aliada' } } });
        expect(coletarEfeitos(p.Outro, 'Outro').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('descarta valeParaInimigos na coleta propria mesmo sem mesa', () => {
        mesa({});
        const f = ficha({ poderes: [poder('Poder X', [efPen()])] });
        expect(coletarEfeitos(f, 'Eu').filter(e => e.atributo === 'evasiva')).toHaveLength(0);
    });
    it('efeitos ativos exigem Poder ativo; passivos valem sempre', () => {
        const p = { Defensor: ficha(), Portador: npc({ poderes: [poder('Ativo', [efPen()], { ativa: false }), poder('Passivo', [], { ativa: false, efeitosPassivos: [efPen({ atributo: 'acerto', valor: '-2' })] })] }) };
        mesa(p);
        const r = coletarEfeitos(p.Defensor, 'Defensor');
        expect(r.filter(e => e.atributo === 'evasiva')).toHaveLength(0);
        expect(soma(r, 'acerto')).toBe(-2);
    });
    it('so evasiva/resistencia/acerto, so negativo, so base', () => {
        const ruins = [
            efPen({ atributo: 'forca' }), efPen({ atributo: 'dano_dados', valor: '-1' }), efPen({ valor: '5' }), efPen({ valor: '0' }),
            efPen({ valor: 'abc' }), efPen({ valor: '' }), efPen({ propriedade: 'mgeral' }), efPen({ propriedade: 'mbase' }), efPen({ valeParaInimigos: 'true' }), efPen({ valeParaInimigos: 1 }),
            efPen({ valor: '-Infinity' }), efPen({ valor: 'NaN' }),
        ];
        const p = { Defensor: ficha(), Portador: npc({ poderes: ruins.map((e, i) => poder(`P${i}`, [e])) }) };
        mesa(p);
        const r = coletarEfeitos(p.Defensor, 'Defensor');
        expect(r.filter(e => ['evasiva', 'resistencia', 'acerto', 'forca', 'dano_dados'].includes(e.atributo))).toHaveLength(0);
    });
    it('aceita resistencia e acerto, e propriedade ausente = base', () => {
        const p = { Defensor: ficha(), Portador: npc({ poderes: [poder('R', [efPen({ atributo: 'resistencia', valor: '-3', propriedade: undefined })]), poder('A', [efPen({ atributo: 'acerto', valor: '-2' })])] }) };
        mesa(p);
        const r = coletarEfeitos(p.Defensor, 'Defensor');
        expect(soma(r, 'resistencia')).toBe(-3);
        expect(soma(r, 'acerto')).toBe(-2);
    });
    it('dedup so entre portadores: efeitos do MESMO Poder valem todos; Poder homonimo em outro portador nao soma', () => {
        const p = { Defensor: ficha(), P1: npc({ poderes: [poder('Poder X', [efPen({ valor: '-4' }), efPen({ valor: '-6' })])] }), P2: npc({ poderes: [poder('  PODER x ', [efPen({ valor: '-9' })])] }) };
        mesa(p);
        expect(soma(coletarEfeitos(p.Defensor, 'Defensor'), 'evasiva')).toBe(-10);
    });
    it('Poderes distintos acumulam, com teto de -20 por atributo', () => {
        const p = { Defensor: ficha(), Portador: npc({ poderes: [poder('A', [efPen({ valor: '-15' })]), poder('B', [efPen({ valor: '-15' })]), poder('C', [efPen({ valor: '-15' })]), poder('D', [efPen({ atributo: 'resistencia', valor: '-7' })])] }) };
        mesa(p);
        const r = coletarEfeitos(p.Defensor, 'Defensor');
        expect(soma(r, 'evasiva')).toBe(-LIMITE_PENALIDADE_INIMIGOS);
        expect(soma(r, 'resistencia')).toBe(-7);
    });
    it('valor unico gigante e cortado em -20', () => {
        const p = { Defensor: ficha(), Portador: npc({ poderes: [poder('A', [efPen({ valor: '-999999' })])] }) };
        mesa(p);
        expect(soma(coletarEfeitos(p.Defensor, 'Defensor'), 'evasiva')).toBe(-20);
    });
    it('a penalidade altera a CA calculada do personagem', () => {
        const forte = { destreza: { base: 5000 }, forca: { base: 5000 } };
        const p = { Defensor: ficha(forte), Portador: npc({ poderes: [poder('A', [efPen({ valor: '-10' })])] }) };
        mesa(p);
        const com = calcularCA(p.Defensor, 'evasiva');
        mesa({ Defensor: p.Defensor });
        const sem = calcularCA(p.Defensor, 'evasiva');
        expect(com).toBeLessThan(sem);
    });
    it('portador nao-objeto, sem poderes ou poder nulo nao quebra', () => {
        const p = { Defensor: ficha(), A: null, B: 'x', C: npc({ poderes: null }), D: npc({ poderes: [null, undefined, poder('Z', null)] }) };
        mesa(p);
        expect(() => coletarEfeitos(p.Defensor, 'Defensor')).not.toThrow();
    });
    it('privacidade: nenhum nome de portador sai nos efeitos devolvidos', () => {
        const p = { Defensor: ficha(), 'Portador Sombra': npc({ poderes: [poder('Poder X', [efPen()])] }) };
        mesa(p);
        const r = coletarEfeitos(p.Defensor, 'Defensor').filter(e => e.atributo === 'evasiva');
        expect(r).toHaveLength(1);
        expect(JSON.stringify(r)).not.toMatch(/Portador Sombra/);
    });
    it('portador sem o efeito nao chama avaliar (nao paga coleta)', () => {
        const avaliar = vi.fn(() => true);
        const p = { Defensor: ficha(), Comum: npc({ poderes: [poder('Normal', [{ atributo: 'forca', propriedade: 'base', valor: '5' }])] }), Outro: npc({ poderes: [] }) };
        mesa(p);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', avaliar)).toEqual([]);
        expect(avaliar).not.toHaveBeenCalled();
    });
    it('efeitosDeInimigosDaMesa: falha fechada (sem nome, sem ficha, avaliar invalido, avaliar que lanca)', () => {
        const p = { Defensor: ficha(), P: npc({ poderes: [poder('A', [efPen()])] }) };
        mesa(p);
        const ok = () => true;
        expect(efeitosDeInimigosDaMesa(p.Defensor, '', ok)).toEqual([]);
        expect(efeitosDeInimigosDaMesa(null, 'Defensor', ok)).toEqual([]);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', null)).toEqual([]);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', () => { throw new Error('x'); })).toEqual([]);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', () => false)).toEqual([]);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', () => 'true')).toEqual([]);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', ok)).toHaveLength(1);
    });
    it('cache: mesma referencia sem mudanca e recalcula quando personagens muda', () => {
        const p = { Defensor: ficha(), P: npc({ poderes: [poder('A', [efPen()])] }) };
        mesa(p);
        const ok = () => true;
        const a = efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', ok);
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', ok)).toBe(a);
        useStore.setState({ personagens: { Defensor: p.Defensor } });
        expect(efeitosDeInimigosDaMesa(p.Defensor, 'Defensor', ok)).toEqual([]);
    });
    it('Poder com Forma/Estagio com a marca tambem e achado (indice)', () => {
        const p = { Defensor: ficha(), P: npc({ poderes: [{ id: 'f', nome: 'Forma', ativa: true, efeitos: [], efeitosPassivos: [], formas: [{ id: 'f1', efeitos: [efPen({ valor: '-3' })] }] }] }) };
        mesa(p);
        expect(() => coletarEfeitos(p.Defensor, 'Defensor')).not.toThrow();
    });
    it('coletarEfeitosDeInimigos puro: sem defensor/cena/avaliar = []', () => {
        const personagens = { P: npc({ poderes: [poder('A', [efPen()])] }) };
        const args = { defensor: { dados: ficha(), nome: 'D' }, personagens, cenario: null, cenaId: 'c1', avaliar: () => true };
        expect(coletarEfeitosDeInimigos(args)).toHaveLength(1);
        expect(coletarEfeitosDeInimigos({ ...args, defensor: null })).toEqual([]);
        expect(coletarEfeitosDeInimigos({ ...args, defensor: { dados: null } })).toEqual([]);
        expect(coletarEfeitosDeInimigos({ ...args, cenaId: '' })).toEqual([]);
        expect(coletarEfeitosDeInimigos({ ...args, avaliar: null })).toEqual([]);
        expect(coletarEfeitosDeInimigos({ ...args, personagens: null })).toEqual([]);
    });
    it('defensor com mesmo nome do portador (sanitizado) e ignorado como portador', () => {
        const personagens = { 'Mago.1': npc({ poderes: [poder('A', [efPen()])] }) };
        const r = coletarEfeitosDeInimigos({ defensor: { dados: ficha(), nome: 'Mago_1' }, personagens, cenario: null, cenaId: 'c1', avaliar: () => true });
        expect(r).toEqual([]);
    });
});

describe('penalidade a inimigos: conversao e defesa do alvo', () => {
    const esperado = (v) => reduzirComBonus(0, v);

    it('mesma conversao do personagem: CA de personagem sem atributo = BASE + reduzirComBonus(0, soma)', () => {
        const alvo = ficha({ destreza: { base: 0 }, forca: { base: 0 } });
        const semNada = (mesa({}), calcularCA(alvo, 'evasiva'));
        mesa({ Defensor: alvo, P: npc({ poderes: [poder('A', [efPen({ valor: '-8' })])] }) });
        expect(calcularCA(alvo, 'evasiva') - semNada).toBe(esperado(-8));
    });
    it('defesaEfetivaDoAlvo: usa valorDefesa como esta; null = 0', () => {
        expect(defesaEfetivaDoAlvo(null)).toBe(0);
        expect(defesaEfetivaDoAlvo(undefined)).toBe(0);
        expect(defesaEfetivaDoAlvo({ isPersonagem: true, valorDefesa: 77 })).toBe(77);
        expect(defesaEfetivaDoAlvo({ isPersonagem: true, valorDefesa: '50' })).toBe(50);
    });
});
