import { describe, it, expect } from 'vitest';
import {
    MODELOS, MODOS_GANHO, obterModelo, selecaoPadrao, paramsPadrao, normalizarParams, planejarModelo, aplicarModeloNaFicha, acharPoderDoModelo, temGanhoLegado,
} from './modelosPoder.js';
import { normalizarGatilhos } from './gatilhos.js';
import { dispararEventoNaFicha } from './gatilhosAplicar.js';
import { normalizarContador } from './contadores.js';

const EGO = 'egoSuperior';
const VERG = 'vergAvesta';
const m = (id) => obterModelo(id);
const construir = (id, sel, params = {}, ficha = { poderes: [], contadores: [] }, op = {}) => m(id).construir(sel ?? selecaoPadrao(m(id)), params, ficha, op);
const ganhos = (r) => (r.poder.gatilhos || []).flatMap(g => g.acoes.filter(a => a.tipo === 'ganhoPermanente').map(a => ({ g, a })));
const aplicarM = (ficha, id, params, sel) => aplicarModeloNaFicha(ficha, { isMestre: true, modeloId: id, selecao: sel ?? selecaoPadrao(m(id)), params, id: 'pid1' });

describe('modelos: Ego Superior em percentual', () => {
    it('MODOS_GANHO lista multiplicar e somar', () => {
        expect(MODOS_GANHO.map(x => x.id).sort()).toEqual(['multiplicar', 'somar']);
    });
    it('padrao: todas as acoes de ganho sao percentual + multiplicar', () => {
        const r = construir(EGO);
        const gs = ganhos(r);
        expect(gs).toHaveLength(5); // 3 por acerto + serie de criticos + fatal sofrido
        gs.forEach(({ a }) => { expect(a.unidade).toBe('percentual'); expect(a.modo).toBe('multiplicar'); });
        expect(gs.map(({ a }) => a.valor).sort()).toEqual([2, 2, 2, 3, 4]);
    });
    it('parametro Modo=somar nas duas partes', () => {
        const gs = ganhos(construir(EGO, null, { modoAcerto: 'somar', modoDanoSofrido: 'somar' }));
        gs.forEach(({ a }) => expect(a.modo).toBe('somar'));
    });
    it('Modo e independente por parte (acerto somar, dano sofrido multiplicar)', () => {
        const r = construir(EGO, null, { modoAcerto: 'somar', modoDanoSofrido: 'multiplicar' });
        const acerto = r.poder.gatilhos.filter(g => g.evento.tipo === 'acertou').flatMap(g => g.acoes);
        const sofrido = r.poder.gatilhos.filter(g => g.evento.tipo !== 'acertou').flatMap(g => g.acoes.filter(a => a.tipo === 'ganhoPermanente'));
        acerto.forEach(a => expect(a.modo).toBe('somar'));
        sofrido.forEach(a => expect(a.modo).toBe('multiplicar'));
    });
    it('params sem modo (antigos) caem no padrao da parte; modo invalido tambem', () => {
        [undefined, 'banana', 5, null, ''].forEach((lixo) => {
            const gs = ganhos(construir(EGO, null, { modoAcerto: lixo, modoDanoSofrido: lixo }));
            gs.forEach(({ a }) => expect(a.modo).toBe('multiplicar'));
        });
        const gsV = ganhos(construir(VERG, null, { modoAcumulo: 'lixo' }));
        gsV.forEach(({ a }) => expect(a.modo).toBe('somar'));
        // params antigos (sem nenhum modo) mantem os numeros
        const antigos = ganhos(construir(EGO, null, { ganhoNormal: 5, ganhoCritico: 6, ganhoFatal: 7 }));
        expect(antigos.map(({ a }) => a.valor)).toEqual(expect.arrayContaining([5, 6, 7]));
    });
    it('normalizarParams: modo valido preservado, invalido -> padrao, nao e preso como numero', () => {
        expect(normalizarParams(m(EGO), { modoAcerto: 'somar' }).modoAcerto).toBe('somar');
        expect(normalizarParams(m(EGO), { modoAcerto: 'x', modoDanoSofrido: 3 })).toMatchObject({ modoAcerto: 'multiplicar', modoDanoSofrido: 'multiplicar' });
        expect(normalizarParams(m(EGO), null).modoAcerto).toBe('multiplicar');
        expect(normalizarParams(m(VERG), { modoAcumulo: 'multiplicar' }).modoAcumulo).toBe('multiplicar');
    });
    it('nomes de gatilho informam % e modo', () => {
        const nomes = construir(EGO).poder.gatilhos.map(g => g.nome).join(' | ');
        expect(nomes).toContain('Ego: +2% por acerto normal (multiplica)');
        expect(nomes).toContain('Ego: +4% por acerto fatal (multiplica)');
        expect(nomes).toContain('Ego: +2% por fatal sofrido (multiplica)');
        const soma = construir(EGO, null, { modoAcerto: 'somar' }).poder.gatilhos.map(g => g.nome).join(' | ');
        expect(soma).toContain('(soma)');
    });
    it('ganho 0 nao gera gatilho', () => {
        const r = construir(EGO, null, { ganhoNormal: 0, ganhoCritico: 0, ganhoFatal: 0, ganhoPorCriticos: 0, ganhoPorFatal: 0 });
        expect(ganhos(r)).toHaveLength(0);
    });
    it('gatilhos gerados sobrevivem a normalizarGatilhos sem perder unidade/modo', () => {
        const r = construir(EGO);
        const n = normalizarGatilhos(r.poder.gatilhos).gatilhos;
        const a = n.flatMap(g => g.acoes).filter(x => x.tipo === 'ganhoPermanente');
        expect(a).toHaveLength(5);
        a.forEach(x => expect(x).toMatchObject({ unidade: 'percentual', modo: 'multiplicar' }));
    });
    it('efeito real: 50 acertos normais do Ego (+2% multiplica) = fator ~2,69 e NAO toca aditivo', () => {
        const f = { vida: { atual: 1e9 }, poderes: [], contadores: [], inventario: [], passivas: [] };
        expect(aplicarM(f, EGO, {}).ok).toBe(true);
        const p = f.poderes[0]; p.ativa = true;
        for (let i = 0; i < 50; i++) dispararEventoNaFicha(f, { tipo: 'acertou', nivel: 'normal' }, { cenaId: 'c1', nome: 'Ego' });
        expect(f.ganhosPermanentes.fatorPoder).toBeCloseTo(1.02 ** 50, 5);
        expect(f.ganhosPermanentes.poderCalculado).toBeUndefined();
    });
    it('efeito real: Ego em modo somar 50 acertos = +1 aditivo', () => {
        const f = { vida: { atual: 1e9 }, poderes: [], contadores: [], inventario: [], passivas: [] };
        aplicarM(f, EGO, { modoAcerto: 'somar', modoDanoSofrido: 'somar' });
        f.poderes[0].ativa = true;
        for (let i = 0; i < 50; i++) dispararEventoNaFicha(f, { tipo: 'acertou', nivel: 'normal' }, { cenaId: 'c1', nome: 'Ego' });
        expect(f.ganhosPermanentes.poderCalculado).toBe(1);
        expect(f.ganhosPermanentes.fatorPoder).toBeUndefined();
    });
});

describe('modelos: Verg Avesta em percentual', () => {
    const fimDeLuta = (r) => r.poder.gatilhos.find(g => g.evento.tipo === 'fimDeLuta');
    it('acumulo: deContador percentual somar, divisor 10 => fator 0.1 e zerar', () => {
        const a = fimDeLuta(construir(VERG)).acoes[0];
        expect(a).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', deContador: { id: expect.stringMatching(/^mp_/), fator: 0.1, zerar: true } });
    });
    it.each([[1, 1], [2, 0.5], [3, 0.333333], [6, 0.166667], [1000, 0.001]])('divisor %s => fator %s', (div, fator) => {
        expect(fimDeLuta(construir(VERG, null, { divisor: div })).acoes[0].deContador.fator).toBe(fator);
    });
    it('divisor fora da faixa e preso (0 vira 1, 5000 vira 1000)', () => {
        expect(fimDeLuta(construir(VERG, null, { divisor: 0 })).acoes[0].deContador.fator).toBe(1);
        expect(fimDeLuta(construir(VERG, null, { divisor: 5000 })).acoes[0].deContador.fator).toBe(0.001);
    });
    it('modo multiplicar opcional', () => {
        expect(fimDeLuta(construir(VERG, null, { modoAcumulo: 'multiplicar' })).acoes[0].modo).toBe('multiplicar');
    });
    it('descricao do gatilho cita o modo', () => {
        expect(fimDeLuta(construir(VERG)).nome).toContain('(soma)');
    });
    it('efeito real: 100 golpes, divisor 10 = +10% (0.1) ao fim da luta; contador zera', () => {
        const f = { vida: { atual: 1e9 }, poderes: [], contadores: [], inventario: [], passivas: [] };
        aplicarM(f, VERG, {});
        f.poderes[0].ativa = true;
        const c = f.contadores.find(x => x.id.startsWith('mp_'));
        const idx = f.contadores.indexOf(c);
        f.contadores[idx] = normalizarContador({ ...c, valor: 100 });
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { cenaId: 'c1', nome: 'Verg' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        expect(f.contadores[idx].valor).toBe(0);
    });
    it('1 golpe = 0,1% = 0.001 no aditivo', () => {
        const f = { vida: { atual: 1e9 }, poderes: [], contadores: [], inventario: [], passivas: [] };
        aplicarM(f, VERG, {});
        f.poderes[0].ativa = true;
        const idx = f.contadores.findIndex(x => x.id.startsWith('mp_'));
        f.contadores[idx] = normalizarContador({ ...f.contadores[idx], valor: 1 });
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { cenaId: 'c1', nome: 'Verg' });
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.001);
    });
});

describe('temGanhoLegado', () => {
    it('detecta ganho sem unidade (valor e deContador), inclusive de modelos antigos', () => {
        expect(temGanhoLegado({ gatilhos: [{ acoes: [{ tipo: 'ganhoPermanente', valor: 2 }] }] })).toBe(true);
        expect(temGanhoLegado({ gatilhos: [{ acoes: [{ tipo: 'mensagem' }, { tipo: 'ganhoPermanente', deContador: { id: 'a', fator: 1 } }] }] })).toBe(true);
    });
    it('percentual nao e legado', () => {
        expect(temGanhoLegado({ gatilhos: [{ acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 }] }] })).toBe(false);
    });
    it('sem gatilhos, sem acoes, nulos, lixo: false e sem excecao', () => {
        [null, undefined, {}, { gatilhos: null }, { gatilhos: [] }, { gatilhos: [null, {}, { acoes: null }, { acoes: [null] }] }, 'x', 5].forEach(p => expect(temGanhoLegado(p)).toBe(false));
    });
    it('outras acoes (contador) nao contam', () => {
        expect(temGanhoLegado({ gatilhos: [{ acoes: [{ tipo: 'contador', valor: 1 }] }] })).toBe(false);
    });
    it('poder gerado hoje pelos modelos nunca e legado', () => {
        MODELOS.forEach(mo => expect(temGanhoLegado(construir(mo.id).poder)).toBe(false));
    });
});

describe('Editar partes: regenera sem duplicar e migra legado', () => {
    const fichaNova = () => ({ vida: { atual: 1e9 }, poderes: [], contadores: [], inventario: [], passivas: [] });
    it('aplicar duas vezes (Ego) nao duplica poder, gatilhos nem contadores', () => {
        const f = fichaNova();
        aplicarM(f, EGO, {});
        const n1 = f.poderes[0].gatilhos.length; const c1 = f.contadores.length;
        const r2 = aplicarM(f, EGO, { modoAcerto: 'somar' });
        expect(r2.ok).toBe(true);
        expect(r2.modo).toBe('editar');
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0].gatilhos).toHaveLength(n1);
        expect(f.contadores).toHaveLength(c1);
        const acertos = f.poderes[0].gatilhos.filter(g => g.evento.tipo === 'acertou').flatMap(g => g.acoes);
        acertos.forEach(a => expect(a.modo).toBe('somar'));
    });
    it('trocar modo de somar para multiplicar e voltar nao deixa resto', () => {
        const f = fichaNova();
        aplicarM(f, VERG, { modoAcumulo: 'multiplicar' });
        aplicarM(f, VERG, { modoAcumulo: 'somar' });
        const g = f.poderes[0].gatilhos.filter(x => x.evento.tipo === 'fimDeLuta');
        expect(g).toHaveLength(1);
        expect(g[0].acoes[0].modo).toBe('somar');
        expect(f.poderes).toHaveLength(1);
    });
    it('poder legado (gatilho sem unidade) e substituido ao regenerar: nenhum ganho legado restante', () => {
        const f = fichaNova();
        aplicarM(f, EGO, {});
        // simula poder criado antes do diff: remove unidade/modo
        f.poderes[0].gatilhos.forEach(g => g.acoes.forEach((a) => { if (a.tipo === 'ganhoPermanente') { delete a.unidade; delete a.modo; } }));
        expect(temGanhoLegado(f.poderes[0])).toBe(true);
        const r = aplicarM(f, EGO, {});
        expect(r.ok).toBe(true);
        expect(temGanhoLegado(f.poderes[0])).toBe(false);
        expect(f.poderes).toHaveLength(1);
    });
    it('gatilho acrescentado a mao e preservado na regeneracao', () => {
        const f = fichaNova();
        aplicarM(f, EGO, {});
        f.poderes[0].gatilhos.push({ id: 'manual1', nome: 'Meu gatilho', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ganhoPermanente', valor: 1 }], modo: 'automatico', armado: true });
        aplicarM(f, EGO, { modoAcerto: 'somar' });
        expect(f.poderes[0].gatilhos.some(g => g.id === 'manual1')).toBe(true);
    });
    it('planejarModelo: ok e modo editar quando ja existe', () => {
        const f = fichaNova();
        aplicarM(f, EGO, {});
        const p = planejarModelo(EGO, selecaoPadrao(m(EGO)), paramsPadrao(m(EGO)), f);
        expect(p.ok).toBe(true);
        expect(p.modo).toBe('editar');
        expect(acharPoderDoModelo(f, EGO)).toBeTruthy();
    });
});
