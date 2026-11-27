import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import {
    chaveDoGolpe, dadosParaRerolar, rolarDeflexao, resolverAtacanteParaDeflexao, registrarDeflexao, deflexaoJaUsada, deflexoesPendentes,
    consumirDeflexaoPendente, ultimoAcertoTs, acharDanoDoGolpe, deflexoesExpiradas, expirarDeflexao,
    VALIDADE_DEFLEXAO_MS, MEMORIA_DEFLEXAO_MS, LIMITE_DEFLEXOES_GUARDADAS,
} from './deflexao';
import { opcoesDeReacao, EFEITOS_REACAO, normalizarEfeito, getReacoesDosEfeitos, efeitoUsaValor } from './reacoes';
import { PROPRIEDADES_REACAO, getPropriedadesDoAtributo } from './efeitos-constants';
import { calcularAcerto } from './engine';

const T0 = 1_700_000_000_000;
const MIN = 60 * 1000;
const fichaPj = (extra = {}) => ({
    bio: {}, vida: { base: 1000000, atual: 1000000 },
    forca: { base: 500 }, destreza: { base: 500 }, inteligencia: { base: 500 }, sabedoria: { base: 500 },
    energiaEsp: { base: 500 }, carisma: { base: 500 }, stamina: { base: 500 }, constituicao: { base: 500 }, divisores: {}, ...extra,
});
const mesa = (personagens) => useStore.setState({ personagens, cenario: { ativa: 'c1' }, isMestre: false, meuNome: 'Logado', minhaFicha: null });

beforeEach(() => { mesa({}); });

describe('chaveDoGolpe', () => {
    it('ts + atacante', () => expect(chaveDoGolpe({ ts: 123, nome: 'Mago' })).toBe('123|Mago'));
    it('vazio quando falta ts, nome ou feed', () => {
        [null, undefined, {}, { ts: 1 }, { nome: 'Mago' }, { ts: 0, nome: 'Mago' }, { ts: 1, nome: '' }].forEach(f => expect(chaveDoGolpe(f)).toBe(''));
    });
});

describe('dadosParaRerolar', () => {
    it('le bonus e dados gravados', () => {
        expect(dadosParaRerolar({ acertoBonus: 15, acertoDados: { qtd: 2, faces: 6 } })).toEqual({ bonus: 15, qtd: 2, faces: 6 });
    });
    it('sem acertoDados assume 1d20', () => {
        expect(dadosParaRerolar({ acertoBonus: 7 })).toEqual({ bonus: 7, qtd: 1, faces: 20 });
    });
    it('bonus 0 e negativo sao validos; texto numerico convertido', () => {
        expect(dadosParaRerolar({ acertoBonus: 0 })).toEqual({ bonus: 0, qtd: 1, faces: 20 });
        expect(dadosParaRerolar({ acertoBonus: -4 }).bonus).toBe(-4);
        expect(dadosParaRerolar({ acertoBonus: '9' }).bonus).toBe(9);
    });
    it('feed antigo sem acertoBonus = null (undefined, null, vazio)', () => {
        [{}, { acertoTotal: 20 }, { acertoBonus: undefined }, { acertoBonus: null }, { acertoBonus: '' }, null, undefined, 'x'].forEach(f => expect(dadosParaRerolar(f)).toBeNull());
    });
    it('bonus invalido = null (NaN, Infinity, texto, gigante)', () => {
        ['abc', NaN, Infinity, -Infinity, 1e13, {}].forEach(b => expect(dadosParaRerolar({ acertoBonus: b })).toBeNull());
    });
    it('dados fora dos limites = null', () => {
        [{ qtd: 0, faces: 20 }, { qtd: 21, faces: 20 }, { qtd: 1, faces: 1 }, { qtd: 1, faces: 1001 }, { qtd: 1.5, faces: 6 }, { qtd: 'x', faces: 6 }, { qtd: 1 }].forEach(d => expect(dadosParaRerolar({ acertoBonus: 1, acertoDados: d })).toBeNull());
        expect(dadosParaRerolar({ acertoBonus: 1, acertoDados: { qtd: 20, faces: 1000 } })).toEqual({ bonus: 1, qtd: 20, faces: 1000 });
    });
});

describe('rolarDeflexao', () => {
    const rng = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
    it('acerta quando total >= defesa (rng 0.5 em d20 = 11)', () => {
        const r = rolarDeflexao({ bonus: 9, qtd: 1, faces: 20, defesa: 20 }, rng(0.5));
        expect(r).toMatchObject({ soma: 11, total: 20, natural: null, acertou: true });
    });
    it('erra quando total < defesa', () => {
        expect(rolarDeflexao({ bonus: 8, qtd: 1, faces: 20, defesa: 20 }, rng(0.5)).acertou).toBe(false);
    });
    it('20 natural acerta mesmo abaixo da CA; 1 natural erra mesmo acima', () => {
        expect(rolarDeflexao({ bonus: -100, qtd: 1, faces: 20, defesa: 50 }, rng(0.99)).acertou).toBe(true);
        expect(rolarDeflexao({ bonus: 1000, qtd: 1, faces: 20, defesa: 5 }, rng(0)).acertou).toBe(false);
        expect(rolarDeflexao({ bonus: 1000, qtd: 1, faces: 20, defesa: 5 }, rng(0)).natural).toBe(1);
    });
    it('naturais so valem com exatamente 1d20', () => {
        const r = rolarDeflexao({ bonus: 0, qtd: 2, faces: 10, defesa: 100 }, rng(0.99)); // 10 + 10 = 20
        expect(r.natural).toBeNull();
        expect(r.acertou).toBe(false);
        expect(rolarDeflexao({ bonus: 0, qtd: 1, faces: 6, defesa: 2 }, rng(0)).acertou).toBe(false); // 1 total < 2
    });
    it('soma varios dados e usa rng injetado', () => {
        expect(rolarDeflexao({ bonus: 0, qtd: 3, faces: 6, defesa: 1 }, rng(0, 0.5, 0.99)).soma).toBe(1 + 4 + 6);
    });
    it('defesa invalida (NaN/undefined) nunca acerta pelo total', () => {
        expect(rolarDeflexao({ bonus: 5, qtd: 1, faces: 6, defesa: undefined }, rng(0.5)).acertou).toBe(false);
    });
    it('sem rng injetado devolve valores dentro do intervalo', () => {
        for (let i = 0; i < 50; i++) { const r = rolarDeflexao({ bonus: 0, qtd: 1, faces: 20, defesa: 10 }); expect(r.soma).toBeGreaterThanOrEqual(1); expect(r.soma).toBeLessThanOrEqual(20); }
    });
    it('total usa floor com bonus fracionado', () => {
        expect(rolarDeflexao({ bonus: 2.7, qtd: 1, faces: 20, defesa: 1 }, rng(0.25)).total).toBe(Math.floor(6 + 2.7));
    });
});

describe('resolverAtacanteParaDeflexao', () => {
    it('personagem: id pj:, alvo e CA > 0', () => {
        const r = resolverAtacanteParaDeflexao('Mago', { personagens: { Mago: fichaPj() } });
        expect(r.id).toBe('pj:Mago');
        expect(r.defesa).toBeGreaterThan(0);
        expect(r.alvo.isPersonagem).toBe(true);
    });
    it('falha fechada: ausente, vazio, nulo, sem mesa', () => {
        expect(resolverAtacanteParaDeflexao('Fantasma', { personagens: { Mago: fichaPj() } })).toBeNull();
        [undefined, null, '', '   '].forEach(n => expect(resolverAtacanteParaDeflexao(n, { personagens: { Mago: fichaPj() } })).toBeNull());
        expect(resolverAtacanteParaDeflexao('Mago')).toBeNull();
        expect(resolverAtacanteParaDeflexao('Mago', {})).toBeNull();
        expect(resolverAtacanteParaDeflexao('Mago', { personagens: null })).toBeNull();
    });
    it('PJ exige chave exata', () => {
        expect(resolverAtacanteParaDeflexao('mago', { personagens: { Mago: fichaPj() } })).toBeNull();
    });
    it('chave de personagem com valor nulo = null', () => {
        expect(resolverAtacanteParaDeflexao('Mago', { personagens: { Mago: null } })).toBeNull();
    });
});

describe('registro de Deflexao na ficha (idempotencia)', () => {
    it('registra uma vez por golpe; segunda tentativa false', () => {
        const f = {};
        expect(registrarDeflexao(f, { chave: 'k1', atacante: 'Mago', acertou: true, golpeTs: 5 }, T0)).toBe(true);
        expect(registrarDeflexao(f, { chave: 'k1', atacante: 'Mago', acertou: false, golpeTs: 5 }, T0 + 1)).toBe(false);
        expect(f.combate.deflexoes).toHaveLength(1);
        expect(f.combate.deflexoes[0]).toMatchObject({ chave: 'k1', estado: 'pendente', golpeTs: 5, atacante: 'Mago', criadoEm: T0 });
        expect(deflexaoJaUsada(f, 'k1')).toBe(true);
        expect(deflexaoJaUsada(f, 'k2')).toBe(false);
    });
    it('errou grava estado errou (nunca fica pendente)', () => {
        const f = {};
        registrarDeflexao(f, { chave: 'k', atacante: 'Mago', acertou: false, golpeTs: 5 }, T0);
        expect(f.combate.deflexoes[0].estado).toBe('errou');
        expect(deflexoesPendentes(f, T0)).toEqual([]);
    });
    it('ficha sem combate/deflexoes (antiga) funciona; ficha invalida/chave vazia = false', () => {
        expect(deflexaoJaUsada({}, 'k')).toBe(false);
        expect(deflexaoJaUsada({ combate: {} }, 'k')).toBe(false);
        expect(deflexaoJaUsada(null, 'k')).toBe(false);
        expect(deflexaoJaUsada({}, '')).toBe(false);
        expect(deflexoesPendentes({})).toEqual([]);
        expect(deflexoesPendentes(null)).toEqual([]);
        expect(deflexoesExpiradas({})).toEqual([]);
        expect(registrarDeflexao(null, { chave: 'k' })).toBe(false);
        expect(registrarDeflexao('x', { chave: 'k' })).toBe(false);
        expect(registrarDeflexao({}, { chave: '' })).toBe(false);
        expect(registrarDeflexao({ combate: 'quebrado' }, { chave: 'k', atacante: 'A', acertou: true, golpeTs: 1 }, T0)).toBe(true);
    });
    it('combate.deflexoes que nao e array e tratado como vazio', () => {
        const f = { combate: { deflexoes: 'lixo' } };
        expect(deflexoesPendentes(f)).toEqual([]);
        expect(registrarDeflexao(f, { chave: 'k', atacante: 'A', acertou: true, golpeTs: 1 }, T0)).toBe(true);
    });
    it('guarda no maximo 20 (as mais recentes)', () => {
        const f = {};
        for (let i = 0; i < 25; i++) registrarDeflexao(f, { chave: `k${i}`, atacante: 'A', acertou: false, golpeTs: i + 1 }, T0 + i);
        expect(f.combate.deflexoes).toHaveLength(LIMITE_DEFLEXOES_GUARDADAS);
        expect(f.combate.deflexoes[0].chave).toBe('k5');
        expect(f.combate.deflexoes[19].chave).toBe('k24');
    });
    it('descarta entradas com mais de 60 min ao registrar uma nova', () => {
        const f = {};
        registrarDeflexao(f, { chave: 'velha', atacante: 'A', acertou: false, golpeTs: 1 }, T0);
        registrarDeflexao(f, { chave: 'quase', atacante: 'A', acertou: false, golpeTs: 2 }, T0 + 2);
        registrarDeflexao(f, { chave: 'nova', atacante: 'A', acertou: false, golpeTs: 3 }, T0 + MEMORIA_DEFLEXAO_MS + 1);
        expect(f.combate.deflexoes.map(d => d.chave)).toEqual(['quase', 'nova']);
    });
    it('entrada com criadoEm no limite exato de 60 min e mantida', () => {
        const f = {};
        registrarDeflexao(f, { chave: 'a', atacante: 'A', acertou: false, golpeTs: 1 }, T0);
        registrarDeflexao(f, { chave: 'b', atacante: 'A', acertou: false, golpeTs: 2 }, T0 + MEMORIA_DEFLEXAO_MS);
        expect(f.combate.deflexoes.map(d => d.chave)).toEqual(['a', 'b']);
    });
    it('atacante muito longo e truncado em 80; golpeTs invalido vira 0', () => {
        const f = {};
        registrarDeflexao(f, { chave: 'k', atacante: 'x'.repeat(300), acertou: true, golpeTs: 'abc' }, T0);
        expect(f.combate.deflexoes[0].atacante).toHaveLength(80);
        expect(f.combate.deflexoes[0].golpeTs).toBe(0);
    });
    it('atacante unicode e nulo', () => {
        const f = {};
        registrarDeflexao(f, { chave: 'k', atacante: undefined, acertou: true, golpeTs: 1 }, T0);
        expect(f.combate.deflexoes[0].atacante).toBe('');
        registrarDeflexao(f, { chave: 'k2', atacante: 'Mágo ✨日本', acertou: true, golpeTs: 2 }, T0);
        expect(f.combate.deflexoes[1].atacante).toBe('Mágo ✨日本');
    });
});

describe('pendencia, consumo e expiracao', () => {
    const nova = () => { const f = {}; registrarDeflexao(f, { chave: 'k', atacante: 'Mago', acertou: true, golpeTs: 9 }, T0); return f; };
    it('pendente dentro de 10 min; vence depois', () => {
        const f = nova();
        expect(deflexoesPendentes(f, T0 + VALIDADE_DEFLEXAO_MS)).toHaveLength(1);
        expect(deflexoesPendentes(f, T0 + VALIDADE_DEFLEXAO_MS + 1)).toHaveLength(0);
        expect(deflexoesExpiradas(f, T0 + VALIDADE_DEFLEXAO_MS)).toHaveLength(0);
        expect(deflexoesExpiradas(f, T0 + VALIDADE_DEFLEXAO_MS + 1)).toHaveLength(1);
    });
    it('consumir: true uma vez e estado vira aplicada; segunda vez false (nao reaplica)', () => {
        const f = nova();
        expect(consumirDeflexaoPendente(f, 'k', T0 + 1000)).toBe(true);
        expect(f.combate.deflexoes[0].estado).toBe('aplicada');
        expect(consumirDeflexaoPendente(f, 'k', T0 + 1000)).toBe(false);
        expect(deflexoesPendentes(f, T0 + 1000)).toEqual([]);
    });
    it('consumir vencida = false e permanece pendente (para expirar com aviso)', () => {
        const f = nova();
        expect(consumirDeflexaoPendente(f, 'k', T0 + VALIDADE_DEFLEXAO_MS + 1)).toBe(false);
        expect(f.combate.deflexoes[0].estado).toBe('pendente');
    });
    it('consumir chave inexistente, ficha sem deflexoes ou deflexao que errou = false', () => {
        expect(consumirDeflexaoPendente(nova(), 'outra', T0)).toBe(false);
        expect(consumirDeflexaoPendente({}, 'k', T0)).toBe(false);
        expect(consumirDeflexaoPendente(null, 'k', T0)).toBe(false);
        const f = {}; registrarDeflexao(f, { chave: 'e', atacante: 'A', acertou: false, golpeTs: 1 }, T0);
        expect(consumirDeflexaoPendente(f, 'e', T0)).toBe(false);
    });
    it('expirar: so se pendente e vencida; vira expirada; avisa uma vez', () => {
        const f = nova();
        expect(expirarDeflexao(f, 'k', T0 + 1000)).toBe(false);
        expect(f.combate.deflexoes[0].estado).toBe('pendente');
        expect(expirarDeflexao(f, 'k', T0 + VALIDADE_DEFLEXAO_MS + 1)).toBe(true);
        expect(f.combate.deflexoes[0].estado).toBe('expirada');
        expect(expirarDeflexao(f, 'k', T0 + VALIDADE_DEFLEXAO_MS + 5)).toBe(false);
        expect(deflexoesExpiradas(f, T0 + VALIDADE_DEFLEXAO_MS + 5)).toEqual([]);
        expect(expirarDeflexao({}, 'k')).toBe(false);
    });
    it('expirada nao pode mais ser consumida (dano tardio nao aplica)', () => {
        const f = nova();
        expirarDeflexao(f, 'k', T0 + VALIDADE_DEFLEXAO_MS + 1);
        expect(consumirDeflexaoPendente(f, 'k', T0 + VALIDADE_DEFLEXAO_MS + 2)).toBe(false);
    });
    it('entrada com criadoEm invalido conta como muito antiga (venceu)', () => {
        const f = { combate: { deflexoes: [{ chave: 'k', estado: 'pendente', atacante: 'A', golpeTs: 1 }] } };
        expect(deflexoesPendentes(f, T0)).toEqual([]);
        expect(deflexoesExpiradas(f, T0)).toHaveLength(1);
    });
    it('entradas nulas na lista nao quebram', () => {
        const f = { combate: { deflexoes: [null, undefined, { chave: 'k', estado: 'pendente', criadoEm: T0 }] } };
        expect(deflexoesPendentes(f, T0)).toHaveLength(1);
        expect(consumirDeflexaoPendente(f, 'k', T0)).toBe(true);
    });
});

describe('ultimoAcertoTs e acharDanoDoGolpe', () => {
    const feed = [
        { tipo: 'acerto', nome: 'Mago', ts: 100 },
        { tipo: 'acerto', nome: 'Outro', ts: 150 },
        { tipo: 'acerto', nome: 'Mago', ts: 300 },
        { tipo: 'dano', nome: 'Mago', ts: 310, dano: 40, golpeAcertoTs: 300 },
    ];
    it('ultimoAcertoTs pega o mais recente do atacante', () => {
        expect(ultimoAcertoTs(feed, 'Mago')).toBe(300);
        expect(ultimoAcertoTs(feed, 'Outro')).toBe(150);
    });
    it('0 sem acerto, feed invalido ou nome ausente', () => {
        expect(ultimoAcertoTs(feed, 'Ninguem')).toBe(0);
        expect(ultimoAcertoTs(null, 'Mago')).toBe(0);
        expect(ultimoAcertoTs(undefined, 'Mago')).toBe(0);
        expect(ultimoAcertoTs('x', 'Mago')).toBe(0);
        expect(ultimoAcertoTs([null, { tipo: 'acerto', nome: 'Mago', ts: 'x' }], 'Mago')).toBe(0);
    });
    it('acha o Dano cujo golpeAcertoTs = ts do acerto que errou', () => {
        expect(acharDanoDoGolpe(feed, { atacante: 'Mago', golpeTs: 300 }).dano).toBe(40);
    });
    it('Dano de OUTRO golpe (golpeAcertoTs diferente) nao conta', () => {
        expect(acharDanoDoGolpe(feed, { atacante: 'Mago', golpeTs: 100 })).toBeNull();
    });
    it('Dano sem marca (feed antigo / Dano livre) nao aplica', () => {
        const f = [{ tipo: 'dano', nome: 'Mago', ts: 310, dano: 40 }, { tipo: 'dano', nome: 'Mago', ts: 320, dano: 9, golpeAcertoTs: 0 }, { tipo: 'dano', nome: 'Mago', ts: 330, dano: 9, golpeAcertoTs: null }];
        expect(acharDanoDoGolpe(f, { atacante: 'Mago', golpeTs: 300 })).toBeNull();
        expect(acharDanoDoGolpe(f, { atacante: 'Mago', golpeTs: 0 })).toBeNull();
    });
    it('Dano de outro atacante, tipo diferente ou dano <= 0 nao conta', () => {
        const f = [
            { tipo: 'dano', nome: 'Outro', ts: 310, dano: 40, golpeAcertoTs: 300 },
            { tipo: 'acerto', nome: 'Mago', ts: 311, dano: 40, golpeAcertoTs: 300 },
            { tipo: 'dano', nome: 'Mago', ts: 312, dano: 0, golpeAcertoTs: 300 },
            { tipo: 'dano', nome: 'Mago', ts: 313, dano: -5, golpeAcertoTs: 300 },
            { tipo: 'dano', nome: 'Mago', ts: 314, dano: 'abc', golpeAcertoTs: 300 },
        ];
        expect(acharDanoDoGolpe(f, { atacante: 'Mago', golpeTs: 300 })).toBeNull();
    });
    it('varios Danos do mesmo golpe: pega o mais antigo', () => {
        const f = [{ tipo: 'dano', nome: 'Mago', ts: 330, dano: 3, golpeAcertoTs: 300 }, { tipo: 'dano', nome: 'Mago', ts: 310, dano: 7, golpeAcertoTs: 300 }];
        expect(acharDanoDoGolpe(f, { atacante: 'Mago', golpeTs: 300 }).dano).toBe(7);
    });
    it('entradas invalidas = null sem lancar', () => {
        expect(acharDanoDoGolpe(null, { atacante: 'Mago', golpeTs: 300 })).toBeNull();
        expect(acharDanoDoGolpe(feed, null)).toBeNull();
        expect(acharDanoDoGolpe(feed, {})).toBeNull();
        expect(acharDanoDoGolpe([null, undefined], { atacante: 'Mago', golpeTs: 300 })).toBeNull();
        expect(acharDanoDoGolpe('x', { atacante: 'Mago', golpeTs: 300 })).toBeNull();
    });
});

describe('efeito rerolar_ataque (reacoes + constantes)', () => {
    const fichaCom = (propriedade, atributo = 'reacao_errou', extra = {}) => ({ poderes: [{ id: 'p', nome: 'Poder X', ativa: true, efeitos: [], efeitosPassivos: [{ atributo, propriedade, valor: '0' }], ...extra }] });
    it('registrado como efeito e propriedade de reacao, sem valor', () => {
        expect(EFEITOS_REACAO.map(e => e.id)).toContain('rerolar_ataque');
        expect(PROPRIEDADES_REACAO).toContain('rerolar_ataque');
        expect(normalizarEfeito('rerolar_ataque')).toBe('rerolar_ataque');
        expect(efeitoUsaValor('rerolar_ataque')).toBe(false);
        expect(getPropriedadesDoAtributo('reacao_errou')).toContain('rerolar_ataque');
        expect(getReacoesDosEfeitos(fichaCom('rerolar_ataque').poderes[0])[0]).toMatchObject({ efeito: 'rerolar_ataque', gatilho: 'errou' });
    });
    it('oferecido quando o ataque ERRA o defensor (gatilho errou e sempre)', () => {
        const o = opcoesDeReacao(fichaCom('rerolar_ataque', 'reacao_errou'), { acertou: false, alvoEhAliado: false });
        expect(o.map(x => x.efeito)).toEqual(['rerolar_ataque']);
        const s = opcoesDeReacao(fichaCom('rerolar_ataque', 'reacao_sempre'), { acertou: false, alvoEhAliado: false });
        expect(s.map(x => x.efeito)).toEqual(['rerolar_ataque']);
    });
    it('NAO oferecido quando o ataque acerta (mesmo com gatilho sempre/acertou)', () => {
        ['reacao_sempre', 'reacao_acertou', 'reacao_errou'].forEach((g) => {
            const o = opcoesDeReacao(fichaCom('rerolar_ataque', g), { acertou: true, alvoEhAliado: false });
            expect(o.filter(x => x.efeito === 'rerolar_ataque')).toHaveLength(0);
        });
    });
    it('NAO oferecido quando o alvo e um aliado (gatilho aliado)', () => {
        const o = opcoesDeReacao(fichaCom('rerolar_ataque', 'reacao_aliado'), { acertou: false, alvoEhAliado: true });
        expect(o.filter(x => x.efeito === 'rerolar_ataque')).toHaveLength(0);
        const o2 = opcoesDeReacao(fichaCom('rerolar_ataque', 'reacao_aliado'), { acertou: true, alvoEhAliado: true });
        expect(o2.filter(x => x.efeito === 'rerolar_ataque')).toHaveLength(0);
    });
    it('Poder desligado (efeito ativo) nao oferece; passivo oferece', () => {
        const f = { poderes: [{ id: 'p', nome: 'Poder X', ativa: false, efeitosPassivos: [], efeitos: [{ atributo: 'reacao_errou', propriedade: 'rerolar_ataque', valor: '0' }] }] };
        expect(opcoesDeReacao(f, { acertou: false })).toHaveLength(0);
        f.poderes[0].ativa = true;
        expect(opcoesDeReacao(f, { acertou: false })).toHaveLength(1);
    });
    it('outros efeitos continuam sendo oferecidos como antes', () => {
        const f = fichaCom('reduzir_dano', 'reacao_acertou');
        const o = opcoesDeReacao(f, { acertou: true, alvoEhAliado: false });
        expect(o.map(x => x.efeito)).toContain('reduzir_dano');
        expect(o.map(x => x.efeito)).toContain('atacar_ataque'); // universal
    });
    it('ficha sem poderes / nula: nao quebra', () => {
        expect(opcoesDeReacao({}, { acertou: false })).toEqual([]);
        expect(opcoesDeReacao(null, { acertou: false })).toEqual([]);
    });
    it('Tecnica Elemental com reacaoEfeito rerolar_ataque tambem so no erro', () => {
        const f = { ataquesElementais: [{ id: 't', nome: 'Tecnica Y', equipado: true, tipoAcao: 'reacao', reacaoGatilho: 'sempre', reacaoEfeito: 'rerolar_ataque' }] };
        expect(opcoesDeReacao(f, { acertou: false }).map(x => x.efeito)).toEqual(['rerolar_ataque']);
        expect(opcoesDeReacao(f, { acertou: true }).filter(x => x.efeito === 'rerolar_ataque')).toHaveLength(0);
    });
});

describe('calcularAcerto grava acertoBonus/acertoDados sem quebrar campos antigos', () => {
    beforeEach(() => { useStore.getState().resetFicha(); });
    const base = (extra = {}) => ({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['destreza'], minhaFicha: fichaPj(), itensEquipados: [], ...extra });
    it('mantem acertoTotal e acrescenta bonus inteiro e dados', () => {
        const r = calcularAcerto(base());
        expect(typeof r.acertoTotal).toBe('number');
        expect(Number.isInteger(r.acertoBonus)).toBe(true);
        expect(r.acertoDados).toEqual({ qtd: 1, faces: 20 });
        const rolado = r.acertoTotal - r.acertoBonus;
        expect(rolado).toBeGreaterThanOrEqual(1);
        expect(rolado).toBeLessThanOrEqual(20);
    });
    it('dados diferentes sao refletidos (2d6)', () => {
        const r = calcularAcerto(base({ qD: 2, fD: 6 }));
        expect(r.acertoDados).toEqual({ qtd: 2, faces: 6 });
        const rolado = r.acertoTotal - r.acertoBonus;
        expect(rolado).toBeGreaterThanOrEqual(2);
        expect(rolado).toBeLessThanOrEqual(12);
    });
    it('bonus do acerto nao depende do dado (varias rolagens, mesmo acertoBonus)', () => {
        const bonus = new Set();
        for (let i = 0; i < 15; i++) bonus.add(calcularAcerto(base()).acertoBonus);
        expect(bonus.size).toBe(1);
    });
    it('bonus extra e proficiencia entram no acertoBonus', () => {
        const sem = calcularAcerto(base({ bonus: 0 })).acertoBonus;
        const com = calcularAcerto(base({ bonus: 10 })).acertoBonus;
        expect(com).toBeGreaterThan(sem);
        const comProf = calcularAcerto(base({ prof: 7, usarProf: true })).acertoBonus;
        expect(comProf).toBeGreaterThan(sem);
    });
    it('bonus de arma equipada (bonus_acerto) entra', () => {
        const arma = { id: 1, nome: 'Espada Z', tipo: 'arma', armaTipo: 'espada', equipado: true, bonusTipo: 'bonus_acerto', bonusValor: 25 };
        expect(calcularAcerto(base({ itensEquipados: [arma] })).acertoBonus - calcularAcerto(base()).acertoBonus).toBeGreaterThan(0);
    });
    it('o par gravado e aceito por dadosParaRerolar (ida e volta)', () => {
        const r = calcularAcerto(base({ qD: 3, fD: 8 }));
        expect(dadosParaRerolar(r)).toEqual({ bonus: r.acertoBonus, qtd: 3, faces: 8 });
    });
});
