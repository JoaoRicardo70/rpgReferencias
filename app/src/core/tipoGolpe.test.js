import { describe, it, expect } from 'vitest';
import { tipoDoGolpeDaFicha, normalizarTipoGolpe, TIPOS_GOLPE } from './tipoGolpe';
import { getPassosReducaoDano, aplicarReducoesSequenciais, alternarAlvoReducao, getAlvosReducao } from './reducaoDano';
import { reduzirDanoNoAlvo } from './alvoCombate';
import { normalizarGatilhos, descreverGatilho, EVENTOS_GATILHO } from './gatilhos';
import { dispararEventoNaFicha } from './gatilhosAplicar';

const arma = (extra = {}) => ({ id: 'a', tipo: 'arma', equipado: true, armaTipo: 'espada', ...extra });

describe('M11 tipoDoGolpeDaFicha', () => {
    it('arma de distancia equipada = projetil', () => {
        ['arco', 'arma de fogo', 'Arco', 'besta'].forEach(t => expect(tipoDoGolpeDaFicha({ inventario: [arma({ armaTipo: t })] })).toBe('projetil'));
    });
    it('espada/corpo a corpo ou sem arma = golpe', () => {
        expect(tipoDoGolpeDaFicha({ inventario: [arma()] })).toBe('golpe');
        expect(tipoDoGolpeDaFicha({})).toBe('golpe');
        expect(tipoDoGolpeDaFicha({ inventario: [] })).toBe('golpe');
    });
    it('alcance declarado > 1 = projetil; = 1 = golpe', () => {
        expect(tipoDoGolpeDaFicha({ inventario: [arma({ alcance: 5 })] })).toBe('projetil');
        expect(tipoDoGolpeDaFicha({ inventario: [arma({ alcance: 1 })] })).toBe('golpe');
        expect(tipoDoGolpeDaFicha({ inventario: [arma({ alcance: 2 })] })).toBe('projetil');
    });
    it('alcance de Poder ativo conta; de poder desligado nao', () => {
        expect(tipoDoGolpeDaFicha({ poderes: [{ ativa: true, alcance: 6 }] })).toBe('projetil');
        expect(tipoDoGolpeDaFicha({ poderes: [{ ativa: false, alcance: 6 }] })).toBe('golpe');
    });
    it('arma de distancia NAO equipada e ignorada', () => {
        expect(tipoDoGolpeDaFicha({ inventario: [arma({ armaTipo: 'arco', equipado: false })] })).toBe('golpe');
        expect(tipoDoGolpeDaFicha({ inventario: [arma({ armaTipo: 'arco', tipo: 'armadura' })] })).toBe('golpe');
    });
    it('ficha invalida = "" (sem informacao)', () => {
        expect(tipoDoGolpeDaFicha(null)).toBe('');
        expect(tipoDoGolpeDaFicha(undefined)).toBe('');
        expect(tipoDoGolpeDaFicha('x')).toBe('');
    });
    it('inventario com itens nulos nao lanca', () => {
        expect(tipoDoGolpeDaFicha({ inventario: [null, undefined, arma()] })).toBe('golpe');
    });
    it('normalizarTipoGolpe', () => {
        expect(normalizarTipoGolpe(' PROJETIL ')).toBe('projetil');
        expect(normalizarTipoGolpe('golpe')).toBe('golpe');
        ['', null, undefined, 'x', 5, {}].forEach(v => expect(normalizarTipoGolpe(v)).toBe(''));
        expect(TIPOS_GOLPE).toEqual(['golpe', 'projetil']);
    });
});

describe('M11 reducao por tipo de golpe', () => {
    const red = (elemento, percentual = 50, extra = {}) => ({ id: 'r', nome: 'Escudo', percentual, elemento, ...extra });
    const fichaCom = (...reducoes) => ({ reducoesDano: reducoes });

    it('tipo:projetil so vale contra projetil', () => {
        const f = fichaCom(red('tipo:projetil'));
        expect(getPassosReducaoDano(f, null, undefined, 'projetil')).toHaveLength(1);
        expect(getPassosReducaoDano(f, null, undefined, 'golpe')).toHaveLength(0);
    });
    it('tipo:golpe so vale contra golpe', () => {
        const f = fichaCom(red('tipo:golpe'));
        expect(getPassosReducaoDano(f, null, undefined, 'golpe')).toHaveLength(1);
        expect(getPassosReducaoDano(f, null, undefined, 'projetil')).toHaveLength(0);
    });
    it('sem tipo informado a reducao por tipo NAO vale (falha fechada)', () => {
        const f = fichaCom(red('tipo:projetil'), red('tipo:golpe'));
        [undefined, '', null, 'invalido'].forEach(t => expect(getPassosReducaoDano(f, null, undefined, t)).toHaveLength(0));
        expect(getPassosReducaoDano(f, null)).toHaveLength(0);
    });
    it('tipo aceita caixa diferente no valor guardado e no informado', () => {
        expect(getPassosReducaoDano(fichaCom(red('tipo:PROJETIL')), null, undefined, ' Projetil ')).toHaveLength(1);
    });
    it('tipo desconhecido guardado nunca casa', () => {
        expect(getPassosReducaoDano(fichaCom(red('tipo:xyz')), null, undefined, 'golpe')).toHaveLength(0);
        expect(getPassosReducaoDano(fichaCom(red('tipo:')), null, undefined, 'golpe')).toHaveLength(0);
    });
    it('alvo misto ["tipo:projetil","fogo"] e OR', () => {
        const f = fichaCom(red(undefined, 50, { elementos: ['tipo:projetil', 'fogo'] }));
        expect(getPassosReducaoDano(f, 'fogo', undefined, 'golpe')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'agua', undefined, 'projetil')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'fogo', undefined, 'projetil')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'agua', undefined, 'golpe')).toHaveLength(0);
        expect(getPassosReducaoDano(f, 'agua')).toHaveLength(0);
    });
    it('dados antigos sem tipo seguem iguais (todos / fisico / elemento)', () => {
        const f = fichaCom(red('todos', 10), red('fogo', 20), red('fisico', 30));
        [undefined, '', 'golpe', 'projetil'].forEach((t) => {
            expect(getPassosReducaoDano(f, 'fogo', undefined, t).map(p => p.percentual)).toEqual([10, 20]);
            expect(getPassosReducaoDano(f, null, undefined, t).map(p => p.percentual)).toEqual([10, 30]);
        });
    });
    it('reducao passiva de tipo respeita tipo e ligada/desligada', () => {
        const f = fichaCom(red('tipo:projetil', 50, { tipo: 'passiva' }), red('tipo:projetil', 40, { ativa: false }));
        const p = getPassosReducaoDano(f, null, undefined, 'projetil');
        expect(p.map(x => x.percentual)).toEqual([50]);
    });
    it('reducao por tipo aplica o percentual no dano', () => {
        const f = fichaCom(red('tipo:projetil', 50));
        const r = aplicarReducoesSequenciais(100, getPassosReducaoDano(f, null, undefined, 'projetil'));
        expect(r.final ?? r).toBe(50);
    });
    it('dano verdadeiro ignora reducao por tipo', () => {
        expect(getPassosReducaoDano(fichaCom(red('tipo:golpe')), true, undefined, 'golpe')).toEqual([]);
    });
    it('alternarAlvoReducao nao funde tipo:projetil com tipo:golpe nem com elementos', () => {
        let a = alternarAlvoReducao([], 'tipo:projetil', true);
        a = alternarAlvoReducao(a, 'tipo:golpe', true);
        a = alternarAlvoReducao(a, 'fogo', true);
        expect(a).toEqual(['tipo:projetil', 'tipo:golpe', 'fogo']);
        expect(alternarAlvoReducao(a, 'tipo:golpe', false)).toEqual(['tipo:projetil', 'fogo']);
        expect(alternarAlvoReducao(a, 'todos', true)).toEqual(['todos']);
    });
    it('reduzirDanoNoAlvo repassa tipoGolpe', () => {
        const alvo = { ficha: fichaCom(red('tipo:projetil', 50)), isPersonagem: true };
        const com = reduzirDanoNoAlvo(alvo, 100, null, { tipoGolpe: 'projetil' });
        const sem = reduzirDanoNoAlvo(alvo, 100, null, {});
        expect(com.final).toBeLessThan(sem.final);
        expect(sem.final).toBe(100);
        expect(reduzirDanoNoAlvo(alvo, 100, null, { tipoGolpe: 'golpe' }).final).toBe(100);
    });
});

describe('Evento de gatilho armaTrocada', () => {
    const ficha = (gatilhos, extra = {}) => ({ vida: { atual: 1000 }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos }], inventario: [], passivas: [], contadores: [{ id: 'k', nome: 'Estancia', valor: 0 }], ...extra });
    const G = (evento = { tipo: 'armaTrocada' }, acoes = [{ tipo: 'mensagem', texto: 'Trocou!' }]) => ({ nome: 'Troca', evento, acoes });

    it('esta na lista de eventos e e aceito pela validacao', () => {
        expect(EVENTOS_GATILHO.find(e => e.id === 'armaTrocada')).toBeTruthy();
        const r = normalizarGatilhos([G()]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0].evento).toEqual({ tipo: 'armaTrocada' });
        expect(descreverGatilho(r.gatilhos[0])).toMatch(/equipar uma arma/);
    });
    it('armaTipo e normalizado sem acento/caixa e limitado a 40', () => {
        const r = normalizarGatilhos([G({ tipo: 'armaTrocada', armaTipo: ' LANÇA ' }), G({ tipo: 'armaTrocada', armaTipo: 'a'.repeat(80) }), G({ tipo: 'armaTrocada', armaTipo: '   ' })]);
        expect(r.gatilhos[0].evento).toEqual({ tipo: 'armaTrocada', armaTipo: 'lanca' });
        expect(r.gatilhos[1].evento.armaTipo).toHaveLength(40);
        expect(r.gatilhos[2].evento).toEqual({ tipo: 'armaTrocada' });
        expect(descreverGatilho(r.gatilhos[0])).toMatch(/lanca/);
    });
    it('dispara ao equipar qualquer arma (sem filtro)', () => {
        const f = ficha(normalizarGatilhos([G()]).gatilhos);
        const r = dispararEventoNaFicha(f, { tipo: 'armaTrocada', armaTipo: 'espada' }, { cenaId: 'c1', nome: 'Eu' });
        expect(r.disparou).toBe(true);
        expect(r.textos.join(' ')).toContain('Trocou!');
    });
    it('filtro por armaTipo: casa so a arma certa (sem acento/caixa)', () => {
        const gs = normalizarGatilhos([G({ tipo: 'armaTrocada', armaTipo: 'Lança' })]).gatilhos;
        expect(dispararEventoNaFicha(ficha(gs), { tipo: 'armaTrocada', armaTipo: 'LANCA' }, { cenaId: 'c1', nome: 'Eu' }).textos.join(' ')).toContain('Trocou!');
        expect(dispararEventoNaFicha(ficha(gs), { tipo: 'armaTrocada', armaTipo: 'espada' }, { cenaId: 'c1', nome: 'Eu' }).textos.join(' ')).not.toContain('Trocou!');
        expect(dispararEventoNaFicha(ficha(gs), { tipo: 'armaTrocada', armaTipo: '' }, { cenaId: 'c1', nome: 'Eu' }).textos.join(' ')).not.toContain('Trocou!');
        expect(dispararEventoNaFicha(ficha(gs), { tipo: 'armaTrocada' }, { cenaId: 'c1', nome: 'Eu' }).textos.join(' ')).not.toContain('Trocou!');
    });
    it('nao dispara com outros eventos', () => {
        const f = ficha(normalizarGatilhos([G()]).gatilhos);
        expect(dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' }).textos.join(' ')).not.toContain('Trocou!');
    });
    it('alimenta contador (estancia por arma)', () => {
        const gs = normalizarGatilhos([G({ tipo: 'armaTrocada', armaTipo: 'espada' }, [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }])]).gatilhos;
        const f = ficha(gs);
        dispararEventoNaFicha(f, { tipo: 'armaTrocada', armaTipo: 'espada' }, { cenaId: 'c1', nome: 'Eu' });
        expect(f.contadores[0].valor).toBe(1);
        dispararEventoNaFicha(f, { tipo: 'armaTrocada', armaTipo: 'arco' }, { cenaId: 'c1', nome: 'Eu' });
        expect(f.contadores[0].valor).toBe(1);
    });
    it('contador inexistente e ignorado em silencio', () => {
        const gs = normalizarGatilhos([G({ tipo: 'armaTrocada' }, [{ tipo: 'contador', id: 'nao', op: 'somar', valor: 1 }])]).gatilhos;
        const f = ficha(gs);
        expect(() => dispararEventoNaFicha(f, { tipo: 'armaTrocada', armaTipo: 'espada' }, { cenaId: 'c1', nome: 'Eu' })).not.toThrow();
        expect(f.contadores[0].valor).toBe(0);
    });
});
