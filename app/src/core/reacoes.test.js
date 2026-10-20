import { describe, it, expect } from 'vitest';
import {
    GATILHOS_REACAO, EFEITOS_REACAO, OPCAO_UNIVERSAL, normalizarGatilho, normalizarEfeito, normalizarValorReacao,
    efeitoUsaValor, getRotuloEfeito, getReacaoDaTecnica, opcoesDeReacao, aplicarReacoesAoDano,
    VALIDADE_REACAO_MS, reacaoPendenteValida, reacoesPendentesValidas, reacaoAguardandoDano
} from './reacoes.js';

const tec = (id, nome, gatilho, efeito, valor, over = {}) => ({ id, nome, tipoAcao: 'reacao', reacaoGatilho: gatilho, reacaoEfeito: efeito, reacaoValor: valor, ...over });
const instintoSuperior = tec(1, 'Instinto Superior', 'errou', 'atacar_atacante', 0, { ativa: true });
const instintoBestial = tec(2, 'Instinto Bestial', 'acertou', 'contra_ataque', 0, { ativa: true });
const assassin = tec(3, 'Assassin', 'sempre', 'reduzir_dano', 50, { ativa: true });
const ajuda = tec(4, 'Proteger', 'aliado', 'aumentar_ca', 3, { ativa: true });

describe('normalizacao', () => {
    it('normalizarGatilho aceita ids conhecidos, resto vira vazio', () => {
        ['errou', 'acertou', 'sempre', 'aliado'].forEach(g => expect(normalizarGatilho(g)).toBe(g));
        expect(normalizarGatilho(' errou ')).toBe('errou');
        [undefined, null, '', 'xx', 5, {}].forEach(v => expect(normalizarGatilho(v)).toBe(''));
    });
    it('normalizarEfeito aceita ids conhecidos, resto vira vazio', () => {
        EFEITOS_REACAO.filter(e => e.id).forEach(e => expect(normalizarEfeito(e.id)).toBe(e.id));
        [undefined, null, '', 'lixo'].forEach(v => expect(normalizarEfeito(v)).toBe(''));
    });
    it('efeitoUsaValor so para reduzir_dano e aumentar_ca', () => {
        expect(efeitoUsaValor('reduzir_dano')).toBe(true);
        expect(efeitoUsaValor('aumentar_ca')).toBe(true);
        ['contra_ataque', 'atacar_atacante', 'atacar_ataque', '', 'x', undefined].forEach(e => expect(efeitoUsaValor(e)).toBe(false));
    });
    it('getRotuloEfeito devolve rotulo ou vazio', () => {
        expect(getRotuloEfeito('reduzir_dano')).toBe('Reduzir o Dano recebido (%)');
        expect(getRotuloEfeito('nada')).toBe('');
    });
    it('normalizarValorReacao: nunca negativo; reduzir_dano limitado a 100; invalido vira 0', () => {
        expect(normalizarValorReacao('reduzir_dano', 50)).toBe(50);
        expect(normalizarValorReacao('reduzir_dano', '150')).toBe(100);
        expect(normalizarValorReacao('reduzir_dano', -10)).toBe(0);
        expect(normalizarValorReacao('aumentar_ca', 250)).toBe(250);
        expect(normalizarValorReacao('aumentar_ca', 'abc')).toBe(0);
        expect(normalizarValorReacao('aumentar_ca', undefined)).toBe(0);
        expect(normalizarValorReacao('aumentar_ca', '2.5')).toBe(2.5);
    });
    it('listas expostas comecam com a opcao vazia', () => {
        expect(GATILHOS_REACAO[0].id).toBe('');
        expect(EFEITOS_REACAO[0].id).toBe('');
        expect(OPCAO_UNIVERSAL).toMatchObject({ efeito: 'atacar_ataque', gatilho: 'acertou' });
    });
});

describe('getReacaoDaTecnica', () => {
    it('devolve a configuracao completa', () => {
        expect(getReacaoDaTecnica(assassin)).toEqual({ gatilho: 'sempre', efeito: 'reduzir_dano', valor: 50 });
    });
    it('exige tipoAcao reacao, gatilho e efeito', () => {
        expect(getReacaoDaTecnica({ ...assassin, tipoAcao: 'acao' })).toBeNull();
        expect(getReacaoDaTecnica({ ...assassin, tipoAcao: undefined })).toBeNull();
        expect(getReacaoDaTecnica({ ...assassin, reacaoGatilho: '' })).toBeNull();
        expect(getReacaoDaTecnica({ ...assassin, reacaoEfeito: 'x' })).toBeNull();
        expect(getReacaoDaTecnica(null)).toBeNull();
        expect(getReacaoDaTecnica(undefined)).toBeNull();
    });
});

describe('opcoesDeReacao', () => {
    const ficha = { poderes: [instintoSuperior, instintoBestial, assassin, ajuda] };

    it('universal so se acertou e nao e aliado', () => {
        expect(opcoesDeReacao({}, { acertou: true }).map(o => o.id)).toEqual(['universal']);
        expect(opcoesDeReacao({}, { acertou: false })).toEqual([]);
        expect(opcoesDeReacao({}, { acertou: true, alvoEhAliado: true })).toEqual([]);
        expect(opcoesDeReacao({})).toEqual([]);
        expect(opcoesDeReacao(null, undefined)).toEqual([]);
    });
    it('universal devolvida e uma copia', () => {
        const o = opcoesDeReacao({}, { acertou: true })[0];
        o.nome = 'mudou';
        expect(OPCAO_UNIVERSAL.nome).toBe('Atacar o ataque');
    });
    it('errou: Instinto Superior (atacar_atacante) e Assassin (sempre), sem universal', () => {
        const ops = opcoesDeReacao(ficha, { acertou: false });
        expect(ops.map(o => o.nome)).toEqual(['Instinto Superior', 'Assassin']);
        expect(ops[0].efeito).toBe('atacar_atacante');
    });
    it('acertou: universal, Instinto Bestial (contra_ataque) e Assassin', () => {
        const ops = opcoesDeReacao(ficha, { acertou: true });
        expect(ops.map(o => o.nome)).toEqual(['Atacar o ataque', 'Instinto Bestial', 'Assassin']);
        expect(ops[1]).toMatchObject({ efeito: 'contra_ataque', origem: 'poder', id: 'poder:2' });
        expect(ops[2]).toMatchObject({ efeito: 'reduzir_dano', valor: 50 });
    });
    it('aliado: so tecnicas de gatilho aliado, sem universal', () => {
        expect(opcoesDeReacao(ficha, { acertou: true, alvoEhAliado: true }).map(o => o.nome)).toEqual(['Proteger']);
        expect(opcoesDeReacao(ficha, { acertou: false, alvoEhAliado: true }).map(o => o.nome)).toEqual(['Proteger']);
    });
    it('gatilho aliado nao aparece quando o alvo sou eu', () => {
        expect(opcoesDeReacao(ficha, { acertou: true }).map(o => o.nome)).not.toContain('Proteger');
    });
    it('tecnica desligada nao aparece (poder ativa !== true)', () => {
        const f = { poderes: [{ ...assassin, ativa: false }, { ...instintoBestial, ativa: undefined }, { ...instintoSuperior, ativa: 'true' }] };
        expect(opcoesDeReacao(f, { acertou: false })).toEqual([]);
    });
    it('tecnica elemental so se equipada', () => {
        const el = tec(9, 'Escudo Elemental', 'sempre', 'reduzir_dano', 30, { equipado: true });
        const off = tec(10, 'Off', 'sempre', 'reduzir_dano', 30, { equipado: false });
        const ops = opcoesDeReacao({ ataquesElementais: [el, off] }, { acertou: false });
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ id: 'tecnica:9', origem: 'tecnica', valor: 30 });
    });
    it('tecnica ligada mas sem tipoAcao reacao ou sem configuracao nao aparece', () => {
        const f = { poderes: [{ ...assassin, tipoAcao: 'bonus' }, { ...assassin, id: 5, reacaoEfeito: '' }] };
        expect(opcoesDeReacao(f, { acertou: true }).map(o => o.id)).toEqual(['universal']);
    });
    it('listas ausentes, nao-array ou entradas nulas nao quebram; sem nome vira "Sem nome"', () => {
        expect(opcoesDeReacao({ poderes: 'x', ataquesElementais: null }, { acertou: false })).toEqual([]);
        const f = { poderes: [null, undefined, { ...assassin, nome: '' }] };
        expect(opcoesDeReacao(f, { acertou: false })[0].nome).toBe('Sem nome');
    });
});

describe('aplicarReacoesAoDano', () => {
    it('sem reacoes devolve o dano', () => {
        expect(aplicarReacoesAoDano(60, [])).toEqual({ final: 60, detalhes: [], faltaDanoReacao: false });
        expect(aplicarReacoesAoDano(60, undefined).final).toBe(60);
        expect(aplicarReacoesAoDano(60, [null]).final).toBe(60);
    });
    it('atacar_ataque 100 de Dano vs 60 recebido = 0', () => {
        const r = aplicarReacoesAoDano(60, [{ efeito: 'atacar_ataque', danoReacao: 100, nome: 'U' }]);
        expect(r.final).toBe(0);
        expect(r.detalhes).toHaveLength(1);
        expect(r.detalhes[0]).toContain('100');
        expect(r.detalhes[0]).toContain('60');
    });
    it('atacar_ataque 40 vs 60 = 20', () => {
        expect(aplicarReacoesAoDano(60, [{ efeito: 'atacar_ataque', danoReacao: 40 }]).final).toBe(20);
    });
    it('atacar_ataque igual ao dano = 0', () => {
        expect(aplicarReacoesAoDano(60, [{ efeito: 'atacar_ataque', danoReacao: 60 }]).final).toBe(0);
    });
    it('combinado com reduzir_dano 50%: (60-40)=20 -> 10, independente da ordem na lista', () => {
        const a = { efeito: 'atacar_ataque', danoReacao: 40 };
        const b = { efeito: 'reduzir_dano', valor: 50 };
        expect(aplicarReacoesAoDano(60, [a, b]).final).toBe(10);
        expect(aplicarReacoesAoDano(60, [b, a]).final).toBe(10);
    });
    it('reduzir_dano sozinho: 50% de 101 = 50; 100% zera; acima de 100 e limitado; negativo nao aumenta', () => {
        expect(aplicarReacoesAoDano(101, [{ efeito: 'reduzir_dano', valor: 50 }]).final).toBe(50);
        expect(aplicarReacoesAoDano(100, [{ efeito: 'reduzir_dano', valor: 100 }]).final).toBe(0);
        expect(aplicarReacoesAoDano(100, [{ efeito: 'reduzir_dano', valor: 300 }]).final).toBe(0);
        expect(aplicarReacoesAoDano(100, [{ efeito: 'reduzir_dano', valor: -20 }]).final).toBe(100);
    });
    it('duas reducoes acumulam em sequencia (50% e 50% = 25)', () => {
        expect(aplicarReacoesAoDano(100, [{ efeito: 'reduzir_dano', valor: 50 }, { efeito: 'reduzir_dano', valor: 50 }]).final).toBe(25);
    });
    it('atacar_ataque sem danoReacao marca faltaDanoReacao e nao desconta', () => {
        const r = aplicarReacoesAoDano(60, [{ efeito: 'atacar_ataque' }]);
        expect(r.faltaDanoReacao).toBe(true);
        expect(r.final).toBe(60);
        expect(aplicarReacoesAoDano(60, [{ efeito: 'atacar_ataque', danoReacao: 'abc' }]).faltaDanoReacao).toBe(true);
    });
    it('dano invalido ou negativo vira 0', () => {
        expect(aplicarReacoesAoDano(-5, []).final).toBe(0);
        expect(aplicarReacoesAoDano('abc', []).final).toBe(0);
        expect(aplicarReacoesAoDano(null, []).final).toBe(0);
    });
    it('danoReacao negativo nao aumenta o dano; efeitos sem efeito no dano sao ignorados', () => {
        expect(aplicarReacoesAoDano(60, [{ efeito: 'atacar_ataque', danoReacao: -30 }]).final).toBe(60);
        expect(aplicarReacoesAoDano(60, [{ efeito: 'contra_ataque' }, { efeito: 'aumentar_ca', valor: 5 }]).final).toBe(60);
    });
    it('nao muta a lista de reacoes', () => {
        const lista = [{ efeito: 'atacar_ataque', danoReacao: 10 }];
        const copia = JSON.parse(JSON.stringify(lista));
        aplicarReacoesAoDano(60, lista);
        expect(lista).toEqual(copia);
    });
});

describe('validade das pendencias', () => {
    const agora = 1_000_000_000_000;
    it('VALIDADE_REACAO_MS e 10 minutos', () => { expect(VALIDADE_REACAO_MS).toBe(600000); });
    it('reacaoPendenteValida: recente vale, vencida nao, no limite vale, sem criadoEm vale, nula nao', () => {
        expect(reacaoPendenteValida({ criadoEm: agora - 1000 }, agora)).toBe(true);
        expect(reacaoPendenteValida({ criadoEm: agora - VALIDADE_REACAO_MS }, agora)).toBe(true);
        expect(reacaoPendenteValida({ criadoEm: agora - VALIDADE_REACAO_MS - 1 }, agora)).toBe(false);
        expect(reacaoPendenteValida({}, agora)).toBe(true);
        expect(reacaoPendenteValida(null, agora)).toBe(false);
    });
    it('reacoesPendentesValidas ignora vencidas e tolera ficha sem combate/lista', () => {
        const ficha = { combate: { reacoesPendentes: [{ id: 'a', criadoEm: agora - 1 }, { id: 'b', criadoEm: agora - VALIDADE_REACAO_MS - 5 }, null] } };
        expect(reacoesPendentesValidas(ficha, agora).map(r => r.id)).toEqual(['a']);
        expect(reacoesPendentesValidas({}, agora)).toEqual([]);
        expect(reacoesPendentesValidas(null, agora)).toEqual([]);
        expect(reacoesPendentesValidas({ combate: { reacoesPendentes: 'x' } }, agora)).toEqual([]);
    });
    it('reacaoAguardandoDano: acha atacar_ataque sem Dano; ignora com Dano, outros efeitos e vencidas', () => {
        const mk = (lista) => ({ combate: { reacoesPendentes: lista } });
        expect(reacaoAguardandoDano(mk([{ id: 'x', efeito: 'atacar_ataque', criadoEm: agora }]), agora).id).toBe('x');
        expect(reacaoAguardandoDano(mk([{ efeito: 'atacar_ataque', danoReacao: 10, criadoEm: agora }]), agora)).toBeNull();
        expect(reacaoAguardandoDano(mk([{ efeito: 'reduzir_dano', criadoEm: agora }]), agora)).toBeNull();
        expect(reacaoAguardandoDano(mk([{ efeito: 'atacar_ataque', criadoEm: agora - VALIDADE_REACAO_MS - 1 }]), agora)).toBeNull();
        expect(reacaoAguardandoDano({}, agora)).toBeNull();
    });
    it('danoReacao 0 conta como rolado (nao aguarda mais)', () => {
        expect(reacaoAguardandoDano({ combate: { reacoesPendentes: [{ efeito: 'atacar_ataque', danoReacao: 0, criadoEm: agora }] } }, agora)).toBeNull();
    });
});
