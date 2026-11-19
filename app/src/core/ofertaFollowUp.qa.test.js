import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import {
    registrarOfertaFollowUp, ofertasValidas, removerOfertaFollowUp, limparOfertasFollowUp, semEncadeioAtivo, marcarSemEncadeio,
    reducaoCustoAtiva, fichaComReducaoDeCusto, definirReducaoCusto, limparReducaoCusto, limparSemEncadeio, localizarFollowUp,
    LIMITE_OFERTAS, OFERTA_VALIDADE_MS,
} from './ofertaFollowUp';
import { aceitarOfertaFollowUp } from '../components/combos/aplicarCombo';
import { normalizarGatilhos, normalizarAcaoGatilho, descreverAcaoGatilho, avaliarGatilhos } from './gatilhos';
import { dispararEventoNaFicha } from './gatilhosAplicar';
import { lerGatilhosDaIA } from './gatilhosImportacao';
import { rotuloAcaoGolpe } from './combos';
import { getAcoesExibicao } from './acoes';

const T0 = 1_700_000_000_000;
const MIN = 60 * 1000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const fu = (id, nome) => ({ id, nome, tipo: 'livre', acao: 'padrao' });
const fichaBase = (extra = {}) => ({ followUps: [fu('f1', 'Golpe Extra'), fu('f2', 'Contra-ataque')], combate: {}, poderes: [], inventario: [], passivas: [], ...extra });
const oferta = (ficha, o = {}) => registrarOfertaFollowUp(ficha, { chave: 'g1', referencia: 'f1', gatilhoNome: 'Gatilho X', agora: T0, ...o });

beforeEach(() => { useStore.setState({ cenario: { ativa: 'default' } }); });

describe('registrarOfertaFollowUp', () => {
    it('registra oferta por id e devolve texto e caminho', () => {
        const f = fichaBase();
        const r = oferta(f);
        expect(f.combate.ofertasFollowUp).toHaveLength(1);
        expect(f.combate.ofertasFollowUp[0]).toMatchObject({ id: 'g1|f1', followUpId: 'f1', gatilho: 'Gatilho X', ts: T0 });
        expect(r.caminhos).toEqual(['combate/ofertasFollowUp']);
        expect(r.texto).toMatch(/Golpe Extra/);
    });
    it('resolve por nome sem acento e sem diferenciar maiusculas', () => {
        const f = fichaBase();
        oferta(f, { referencia: 'CONTRA-ATAQUE' });
        expect(f.combate.ofertasFollowUp[0].followUpId).toBe('f2');
        expect(localizarFollowUp(f, 'golpe extra').id).toBe('f1');
    });
    it('Follow Up inexistente avisa e ignora (nao grava nada)', () => {
        const f = fichaBase();
        const r = oferta(f, { referencia: 'nao existe' });
        expect(r.caminhos).toEqual([]);
        expect(r.texto).toMatch(/não existe na ficha/);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
    });
    it('referencia vazia/undefined/ficha nula nao quebra', () => {
        const f = fichaBase();
        expect(oferta(f, { referencia: '' }).caminhos).toEqual([]);
        expect(oferta(f, { referencia: undefined }).caminhos).toEqual([]);
        expect(registrarOfertaFollowUp(null, { referencia: 'f1' })).toEqual({ texto: '', caminhos: [] });
        expect(f.combate.ofertasFollowUp).toBeUndefined();
    });
    it('mesma origem renova (merge por id) em vez de empilhar', () => {
        const f = fichaBase();
        oferta(f); oferta(f, { agora: T0 + 1000, custoReducaoPct: 50 });
        expect(f.combate.ofertasFollowUp).toHaveLength(1);
        expect(f.combate.ofertasFollowUp[0]).toMatchObject({ ts: T0 + 1000, custoReducaoPct: 50 });
    });
    it('no maximo 5 ofertas: a mais antiga sai', () => {
        const f = fichaBase();
        for (let i = 0; i < 7; i++) oferta(f, { chave: `g${i}`, agora: T0 + i });
        const ids = f.combate.ofertasFollowUp.map(o => o.id);
        expect(LIMITE_OFERTAS).toBe(5);
        expect(ids).toEqual(['g2|f1', 'g3|f1', 'g4|f1', 'g5|f1', 'g6|f1']);
    });
    it('poda ofertas vencidas ao registrar uma nova', () => {
        const f = fichaBase();
        oferta(f, { chave: 'velha', agora: T0 });
        oferta(f, { chave: 'nova', agora: T0 + OFERTA_VALIDADE_MS + 1 });
        expect(f.combate.ofertasFollowUp.map(o => o.id)).toEqual(['nova|f1']);
    });
    it('poda entradas malformadas (null, sem ts) ao registrar', () => {
        const f = fichaBase({ combate: { ofertasFollowUp: [null, { id: 'x', followUpId: 'f1' }, 'lixo'] } });
        oferta(f);
        expect(f.combate.ofertasFollowUp.map(o => o.id)).toEqual(['g1|f1']);
    });
    it('custoReducaoPct e limitado a 100 e 0/negativo some', () => {
        const f = fichaBase();
        oferta(f, { chave: 'a', custoReducaoPct: 250 });
        oferta(f, { chave: 'b', custoReducaoPct: 0 });
        oferta(f, { chave: 'c', custoReducaoPct: -5 });
        const [a, b, c] = f.combate.ofertasFollowUp;
        expect(a.custoReducaoPct).toBe(100);
        expect(b.custoReducaoPct).toBeUndefined();
        expect(c.custoReducaoPct).toBeUndefined();
    });
    it('marca semEncadeio ativa bloqueia novo registro', () => {
        const f = fichaBase();
        marcarSemEncadeio(f, T0);
        const r = oferta(f, { agora: T0 + 1000 });
        expect(r.caminhos).toEqual([]);
        expect(r.texto).toMatch(/não gera outro/);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
    });
});

describe('ofertasValidas / expiracao', () => {
    it('so devolve ofertas dentro de 30 min (limite inclusivo)', () => {
        const f = fichaBase();
        oferta(f);
        expect(ofertasValidas(f, T0 + OFERTA_VALIDADE_MS)).toHaveLength(1);
        expect(ofertasValidas(f, T0 + OFERTA_VALIDADE_MS + 1)).toHaveLength(0);
    });
    it('ignora lixo (null, sem id, ts invalido) e nao muda a ficha', () => {
        const f = fichaBase({ combate: { ofertasFollowUp: [null, { id: 'a', followUpId: 'f1', ts: 'x' }, { followUpId: 'f1', ts: T0 }, { id: 'ok', followUpId: 'f1', ts: T0 }] } });
        const antes = clone(f);
        expect(ofertasValidas(f, T0).map(o => o.id)).toEqual(['ok']);
        expect(f).toEqual(antes);
    });
    it('ficha sem combate / combate.ofertasFollowUp nao-array devolve []', () => {
        expect(ofertasValidas({}, T0)).toEqual([]);
        expect(ofertasValidas(null, T0)).toEqual([]);
        expect(ofertasValidas({ combate: { ofertasFollowUp: 'x' } }, T0)).toEqual([]);
    });
    it('limparOfertasFollowUp e removerOfertaFollowUp', () => {
        const f = fichaBase();
        oferta(f, { chave: 'a' }); oferta(f, { chave: 'b' });
        expect(removerOfertaFollowUp(f, 'inexistente')).toBe(false);
        expect(removerOfertaFollowUp(f, 'a|f1')).toBe(true);
        expect(f.combate.ofertasFollowUp).toHaveLength(1);
        expect(removerOfertaFollowUp(f, 'b|f1')).toBe(true);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
        expect(limparOfertasFollowUp(f)).toBe(false);
        oferta(f);
        expect(limparOfertasFollowUp(f)).toBe(true);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
    });
    it('semEncadeioAtivo respeita 30 min, ts invalido e ts<=1', () => {
        const f = fichaBase();
        expect(semEncadeioAtivo(f, T0)).toBe(false);
        marcarSemEncadeio(f, T0);
        expect(semEncadeioAtivo(f, T0 + OFERTA_VALIDADE_MS)).toBe(true);
        expect(semEncadeioAtivo(f, T0 + OFERTA_VALIDADE_MS + 1)).toBe(false);
        f.combate.semEncadeioFollowUp = true; expect(semEncadeioAtivo(f, T0)).toBe(false);
        f.combate.semEncadeioFollowUp = 'abc'; expect(semEncadeioAtivo(f, T0)).toBe(false);
        f.combate.semEncadeioFollowUp = NaN; expect(semEncadeioAtivo(f, T0)).toBe(false);
        expect(semEncadeioAtivo(null)).toBe(false);
    });
    it('expira no turnoInicio e no fimDeLuta (ofertas, semEncadeio e reducao)', () => {
        ['turnoInicio', 'fimDeLuta'].forEach((tipo) => {
            const f = fichaBase();
            oferta(f); marcarSemEncadeio(f, T0); definirReducaoCusto(f, 50, T0);
            const r = dispararEventoNaFicha(f, { tipo }, {});
            expect(f.combate.ofertasFollowUp).toBeUndefined();
            expect(f.combate.semEncadeioFollowUp).toBeUndefined();
            expect(f.combate.reducaoCustoFollowUp).toBeUndefined();
            expect(r.caminhos).toEqual(expect.arrayContaining(['combate/ofertasFollowUp', 'combate/semEncadeioFollowUp', 'combate/reducaoCustoFollowUp']));
        });
    });
});

describe('aceitarOfertaFollowUp', () => {
    const comOferta = (o = {}) => { const f = fichaBase(); oferta(f, o); return f; };
    it('aceita uma vez: registra uso, gasta a Acao e remove a oferta', () => {
        const f = comOferta();
        const antes = getAcoesExibicao(f).padrao.atual;
        const t = aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 + 1000 });
        expect(t).toMatch(/Follow Up "Golpe Extra"/);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
        expect(f.combate.comboEstado.followUps.f1.usos).toBe(1);
        expect(f.acoes.padrao.atual).toBe(Math.max(0, antes - 1));
    });
    it('clique duplo devolve "" e nao gasta/usa de novo', () => {
        const f = comOferta();
        aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 + 1 });
        const estado = clone(f);
        expect(aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 + 2 })).toBe('');
        expect(f).toEqual(estado);
        expect(f.combate.comboEstado.followUps.f1.usos).toBe(1);
    });
    it('oferta inexistente devolve "" sem mudar nada', () => {
        const f = comOferta();
        const antes = clone(f);
        expect(aceitarOfertaFollowUp(f, 'nada', { agora: T0 })).toBe('');
        expect(f).toEqual(antes);
    });
    it('oferta expirada devolve "", e e removida sem gastar Acao', () => {
        const f = comOferta();
        expect(aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 + OFERTA_VALIDADE_MS + 1 })).toBe('');
        expect(f.combate.ofertasFollowUp).toBeUndefined();
        expect(f.acoes).toBeUndefined();
        expect(f.combate.comboEstado).toBeUndefined();
    });
    it('Follow Up apagado da ficha depois da oferta: devolve "" e limpa a oferta', () => {
        const f = comOferta();
        f.followUps = [];
        expect(aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 })).toBe('');
        expect(f.combate.ofertasFollowUp).toBeUndefined();
    });
    it('nao rola nada (sem Math.random)', () => {
        const f = comOferta();
        const orig = Math.random; let chamou = 0; Math.random = () => { chamou++; return 0.5; };
        try { aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 }); } finally { Math.random = orig; }
        expect(chamou).toBe(0);
    });
    it('gastar=false nao desconta Acao (desmarcavel)', () => {
        const f = comOferta();
        const t = aceitarOfertaFollowUp(f, 'g1|f1', { gastar: false, agora: T0 });
        expect(t).not.toBe('');
        expect(f.acoes).toBeUndefined();
        expect(f.combate.comboEstado.followUps.f1.usos).toBe(1);
    });
    it('custo reacao gasta a Reacao e nomeia a Acao no texto', () => {
        const f = comOferta();
        const antes = getAcoesExibicao(f).reacao.atual;
        const t = aceitarOfertaFollowUp(f, 'g1|f1', { custo: 'reacao', agora: T0 });
        expect(t).toMatch(/Reação/);
        expect(f.acoes.reacao.atual).toBe(Math.max(0, antes - 1));
    });
    it('custoReducaoPct grava combate.reducaoCustoFollowUp {pct, ts} e NAO cria buff', () => {
        const f = comOferta({ custoReducaoPct: 40 });
        const t = aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 + 5 });
        expect(f.combate.reducaoCustoFollowUp).toEqual({ pct: 40, ts: T0 + 5 });
        expect(f.buffsTemporarios).toBeUndefined();
        expect(t).toMatch(/cai 40%/);
    });
    it('semCusto (100) grava pct 100 e texto "sem custo"', () => {
        const f = comOferta({ custoReducaoPct: 100 });
        const t = aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 });
        expect(f.combate.reducaoCustoFollowUp.pct).toBe(100);
        expect(t).toMatch(/sem custo/);
    });
    it('sem custoReducaoPct nao grava reducao', () => {
        const f = comOferta();
        aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 });
        expect(f.combate.reducaoCustoFollowUp).toBeUndefined();
    });
    it('naoGeraOutro marca semEncadeioFollowUp com timestamp e validade de 30 min', () => {
        const f = comOferta({ naoGeraOutro: true });
        aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 + 7 });
        expect(f.combate.semEncadeioFollowUp).toBe(T0 + 7);
        expect(semEncadeioAtivo(f, T0 + 7 + OFERTA_VALIDADE_MS)).toBe(true);
        expect(semEncadeioAtivo(f, T0 + 7 + OFERTA_VALIDADE_MS + 1)).toBe(false);
    });
    it('sem naoGeraOutro nao marca', () => {
        const f = comOferta();
        aceitarOfertaFollowUp(f, 'g1|f1', { agora: T0 });
        expect(f.combate.semEncadeioFollowUp).toBeUndefined();
    });
    it('recusar (removerOfertaFollowUp + limparSemEncadeio) limpa sem gastar nada', () => {
        const f = comOferta({ naoGeraOutro: true });
        marcarSemEncadeio(f, T0);
        removerOfertaFollowUp(f, 'g1|f1'); limparSemEncadeio(f);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
        expect(f.combate.semEncadeioFollowUp).toBeUndefined();
        expect(f.acoes).toBeUndefined();
    });
});

describe('definirReducaoCusto / reducaoCustoAtiva', () => {
    it('limita 0-100, NaN vira 0, expira em 30 min', () => {
        const f = fichaBase();
        definirReducaoCusto(f, 150, T0); expect(f.combate.reducaoCustoFollowUp.pct).toBe(100);
        definirReducaoCusto(f, -3, T0); expect(f.combate.reducaoCustoFollowUp.pct).toBe(0);
        definirReducaoCusto(f, 'abc', T0); expect(f.combate.reducaoCustoFollowUp.pct).toBe(0);
        definirReducaoCusto(f, 25, T0);
        expect(reducaoCustoAtiva(f, T0 + OFERTA_VALIDADE_MS)).toBe(25);
        expect(reducaoCustoAtiva(f, T0 + OFERTA_VALIDADE_MS + 1)).toBe(0);
    });
    it('dado hostil devolve 0', () => {
        expect(reducaoCustoAtiva({ combate: { reducaoCustoFollowUp: { pct: Infinity, ts: T0 } } }, T0)).toBe(100);
        expect(reducaoCustoAtiva({ combate: { reducaoCustoFollowUp: { pct: 50 } } }, T0)).toBe(0);
        expect(reducaoCustoAtiva({ combate: { reducaoCustoFollowUp: 'x' } }, T0)).toBe(0);
        expect(reducaoCustoAtiva(null, T0)).toBe(0);
    });
});

describe('fichaComReducaoDeCusto (copia rasa so para o dano do golpe)', () => {
    it('sem reducao devolve a MESMA ficha', () => {
        const f = fichaBase();
        expect(fichaComReducaoDeCusto(f, T0)).toBe(f);
    });
    it('com reducao devolve copia com buff reducaocusto nas 4 energias e NAO muda a ficha real', () => {
        const f = fichaBase({ buffsTemporarios: [{ id: 'b', nome: 'B', efeitos: [] }] });
        definirReducaoCusto(f, 60, T0);
        const antes = clone(f);
        const c = fichaComReducaoDeCusto(f, T0 + 1);
        expect(c).not.toBe(f);
        expect(f).toEqual(antes);
        expect(f.buffsTemporarios).toHaveLength(1);
        const buff = c.buffsTemporarios.find(b => b.id === 'fua_custo');
        expect(buff.efeitos.map(e => e.atributo).sort()).toEqual(['aura', 'chakra', 'corpo', 'mana']);
        expect(buff.efeitos.every(e => e.propriedade === 'reducaocusto' && e.valor === 60)).toBe(true);
    });
    it('buffsTemporarios nao-array nao quebra', () => {
        const f = fichaBase({ buffsTemporarios: 'x' });
        definirReducaoCusto(f, 10, T0);
        expect(fichaComReducaoDeCusto(f, T0).buffsTemporarios).toHaveLength(1);
    });
    it('o desconto nao vaza: a ficha real (usada por ligar poder, Tecnica, Suporte, defesa) nunca ve o buff', () => {
        const f = fichaBase();
        definirReducaoCusto(f, 100, T0);
        fichaComReducaoDeCusto(f, T0);
        expect(f.buffsTemporarios).toBeUndefined();
        expect(JSON.stringify(f)).not.toMatch(/fua_custo|Custo reduzido/);
    });
    it('sai: ao consumir (limparReducaoCusto), apos 30 min, turnoInicio e fim da luta', () => {
        const f = fichaBase();
        definirReducaoCusto(f, 50, T0);
        expect(limparReducaoCusto(f)).toBe(true);
        expect(fichaComReducaoDeCusto(f, T0)).toBe(f);
        expect(limparReducaoCusto(f)).toBe(false);
        definirReducaoCusto(f, 50, T0);
        expect(fichaComReducaoDeCusto(f, T0 + OFERTA_VALIDADE_MS + 1)).toBe(f);
        ['turnoInicio', 'fimDeLuta'].forEach((tipo) => {
            const g = fichaBase(); definirReducaoCusto(g, 50, T0);
            dispararEventoNaFicha(g, { tipo }, {});
            expect(fichaComReducaoDeCusto(g, T0)).toBe(g);
        });
    });
});

describe('core/gatilhos: acao oferecerFollowUp', () => {
    const ok = (b) => normalizarAcaoGatilho(b);
    it('valida: id basico, sem campos extras', () => {
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1' })).toEqual({ tipo: 'oferecerFollowUp', followUpId: 'f1' });
    });
    it('aceita nome como referencia, pct, naoGeraOutro', () => {
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: ' Golpe Extra ', custoReducaoPct: 50, naoGeraOutro: true })).toEqual({ tipo: 'oferecerFollowUp', followUpId: 'Golpe Extra', custoReducaoPct: 50, naoGeraOutro: true });
    });
    it('semCusto true = 100; pct 0 some; pct fora de 0-100 e limitado', () => {
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', semCusto: true }).custoReducaoPct).toBe(100);
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', custoReducaoPct: 0 }).custoReducaoPct).toBeUndefined();
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', custoReducaoPct: 500 }).custoReducaoPct).toBe(100);
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', custoReducaoPct: -20 }).custoReducaoPct).toBeUndefined();
    });
    it('NaN/texto nao numerico viram sem reducao (nao quebra)', () => {
        const a = ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', custoReducaoPct: NaN });
        expect(a).toEqual({ tipo: 'oferecerFollowUp', followUpId: 'f1' });
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', custoReducaoPct: 'abc' })).toEqual({ tipo: 'oferecerFollowUp', followUpId: 'f1' });
    });
    it('naoGeraOutro so vale com boolean true', () => {
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', naoGeraOutro: 'true' }).naoGeraOutro).toBeUndefined();
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: 'f1', semCusto: 'true' }).custoReducaoPct).toBeUndefined();
    });
    it('followUpId ausente/vazio/so espacos: invalida (null)', () => {
        expect(ok({ tipo: 'oferecerFollowUp' })).toBeNull();
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: '' })).toBeNull();
        expect(ok({ tipo: 'oferecerFollowUp', followUpId: '   ' })).toBeNull();
    });
    it('descreverAcaoGatilho usa nome do Follow Up e descreve custo', () => {
        const ctx = { followUps: [{ id: 'f1', nome: 'Golpe Extra' }] };
        expect(descreverAcaoGatilho({ tipo: 'oferecerFollowUp', followUpId: 'f1' }, ctx)).toBe('oferecer o Follow Up "Golpe Extra"');
        expect(descreverAcaoGatilho({ tipo: 'oferecerFollowUp', followUpId: 'f1', custoReducaoPct: 100, naoGeraOutro: true }, ctx)).toMatch(/sem custo de energia.*não gera outro/);
        expect(descreverAcaoGatilho({ tipo: 'oferecerFollowUp', followUpId: 'zzz', custoReducaoPct: 30 }, null)).toMatch(/"zzz" com custo -30%/);
    });
    it('gatilho antigo (sem a acao nova) continua normalizando igual', () => {
        const r = normalizarGatilhos([{ nome: 'Antigo', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] }], { persistir: false });
        expect(r.descartados).toEqual([]);
        expect(r.gatilhos[0].acoes).toEqual([{ tipo: 'mensagem', texto: 'oi' }]);
    });
    it('gatilho com a acao invalida e descartado inteiro', () => {
        const r = normalizarGatilhos([{ nome: 'Ruim', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'oferecerFollowUp' }] }], { persistir: false });
        expect(r.gatilhos).toHaveLength(0);
        expect(r.descartados[0].motivo).toMatch(/inválida/);
    });
});

describe('gatilhosImportacao com oferecerFollowUp', () => {
    const bruto = (acoes) => [{ nome: 'Reage', evento: { tipo: 'acertou' }, acoes }];
    it('aceita e lista o Follow Up como referencia para conferir', () => {
        const r = lerGatilhosDaIA(bruto([{ tipo: 'oferecerFollowUp', followUpId: 'Golpe Extra', custoReducaoPct: 50 }]));
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0].acoes[0]).toMatchObject({ tipo: 'oferecerFollowUp', followUpId: 'Golpe Extra', custoReducaoPct: 50 });
        expect(r.avisos.join(' ')).toMatch(/Follow Up "Golpe Extra".*confira se existe/);
    });
    it('sem followUpId: gatilho nao importado e vai para naoAplicado', () => {
        const r = lerGatilhosDaIA(bruto([{ tipo: 'oferecerFollowUp' }]));
        expect(r.gatilhos).toHaveLength(0);
        expect(r.naoAplicado.length).toBeGreaterThan(0);
    });
    it('entrada que nao e lista vai para naoAplicado', () => {
        expect(lerGatilhosDaIA('x').naoAplicado).toHaveLength(1);
    });
});

describe('Sexta-Feira e importador aceitam a acao', () => {
    it('ACOES_GATILHO inclui oferecerFollowUp e o prompt do importador a lista', async () => {
        const { ACOES_GATILHO } = await import('./gatilhos');
        expect(ACOES_GATILHO.some(a => a.id === 'oferecerFollowUp')).toBe(true);
        const { montarPromptImportacao } = await import('./importadorIA');
        const prompt = montarPromptImportacao('Texto do Poder X', 'habilidade', null);
        expect(prompt).toMatch(/oferecerFollowUp/);
        expect(prompt).toMatch(/reutilizacao/);
    });
    it('schema de criacao (DECLARACOES_CRIACAO) expoe followUpId/custoReducaoPct/semCusto/naoGeraOutro', async () => {
        const sx = await import('./sextaFeiraCriacao');
        const s = JSON.stringify(sx.DECLARACOES_CRIACAO);
        ['followUpId', 'custoReducaoPct', 'semCusto', 'naoGeraOutro'].forEach(k => expect(s).toContain(k));
    });
    it('normalizarPoder da Sexta-Feira mantem o gatilho com a acao e descarta o invalido', async () => {
        const sx = await import('./sextaFeiraCriacao');
        const r = sx.normalizarPoder({ nome: 'Poder X', gatilhos: [
            { nome: 'Bom', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'oferecerFollowUp', followUpId: 'Golpe Extra', semCusto: true }] },
            { nome: 'Mau', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'oferecerFollowUp' }] },
        ] });
        const obj = r.objeto || r;
        const gs = obj.gatilhos || [];
        expect(gs.map(g => g.nome)).toEqual(['Bom']);
        expect(gs[0].acoes[0].custoReducaoPct).toBe(100);
    });
});

// ---------- Integracao: gatilhos x marca semEncadeio ----------
const poderComGatilhos = (gatilhos) => ({ id: 'p1', nome: 'Poder X', ativa: true, efeitos: [], efeitosPassivos: [], gatilhos });
const gOferta = (extra = {}, acoes) => ({ id: 'g1', nome: 'Oferta', evento: { tipo: 'acertou' }, acoes: acoes || [{ tipo: 'oferecerFollowUp', followUpId: 'f1' }], ...extra });
const comPoder = (gatilhos) => fichaBase({ poderes: [poderComGatilhos(gatilhos)] });

describe('integracao: oferecerFollowUp via dispararEventoNaFicha', () => {
    it('acertou dispara e guarda a oferta sem rolar nada', () => {
        const f = comPoder([gOferta()]);
        const r = dispararEventoNaFicha(f, { tipo: 'acertou' }, { eventoId: 'e1' });
        expect(r.disparou).toBe(true);
        expect(f.combate.ofertasFollowUp).toHaveLength(1);
        expect(f.combate.ofertasFollowUp[0].followUpId).toBe('f1');
        expect(r.caminhos).toContain('combate/ofertasFollowUp');
    });
    it('Follow Up inexistente: avisa no texto e nao grava oferta', () => {
        const f = comPoder([gOferta({}, [{ tipo: 'oferecerFollowUp', followUpId: 'fantasma' }])]);
        const r = dispararEventoNaFicha(f, { tipo: 'acertou' }, { eventoId: 'e1' });
        expect(f.combate.ofertasFollowUp).toBeUndefined();
        expect(r.textos.join(' ')).toMatch(/não existe na ficha/);
    });
    it('em simulacao de perguntas (ctx.perguntas) nao grava', () => {
        const f = comPoder([gOferta()]);
        dispararEventoNaFicha(f, { tipo: 'acertou' }, { eventoId: 'e1', perguntas: [] });
        expect(f.combate.ofertasFollowUp).toBeUndefined();
    });
    it('com semEncadeio ativo: gatilho SO de oferta e bloqueado e NAO gasta o limite', () => {
        const f = comPoder([gOferta({ limite: { max: 1, por: 'turno' } })]);
        marcarSemEncadeio(f, Date.now());
        const av = avaliarGatilhos({ tipo: 'acertou' }, { eventoId: 'e1' }, f);
        expect(av.acoes).toHaveLength(0);
        expect(av.bloqueados.map(b => b.motivo)).toEqual(['o Follow Up em andamento não gera outro']);
        const r = dispararEventoNaFicha(f, { tipo: 'acertou' }, { eventoId: 'e2', mantemSemEncadeio: true });
        expect(r.disparou).toBe(false);
        expect(f.combate.usosPoderes).toBeUndefined();
        // limpa a marca e o gatilho ainda tem o uso do turno
        limparSemEncadeio(f);
        const r2 = dispararEventoNaFicha(f, { tipo: 'acertou' }, { eventoId: 'e3' });
        expect(r2.disparou).toBe(true);
    });
    it('gatilho misto roda as outras acoes, ignora a oferta e gasta o limite', () => {
        const f = comPoder([gOferta({ limite: { max: 1, por: 'turno' } }, [{ tipo: 'mensagem', texto: 'misto ok' }, { tipo: 'oferecerFollowUp', followUpId: 'f1' }])]);
        marcarSemEncadeio(f, Date.now());
        const r = dispararEventoNaFicha(f, { tipo: 'acertou' }, { eventoId: 'e1', mantemSemEncadeio: true });
        expect(r.disparou).toBe(true);
        expect(r.textos.join(' ')).toMatch(/misto ok/);
        expect(f.combate.ofertasFollowUp).toBeUndefined();
        expect(f.combate.usosPoderes).toBeDefined();
        expect(Object.values(f.combate.usosPoderes)[0].n).toBe(1);
    });
    it('acertou raiz limpa a marca; errou tambem', () => {
        ['acertou', 'errou'].forEach((tipo) => {
            const f = fichaBase(); marcarSemEncadeio(f, Date.now());
            const r = dispararEventoNaFicha(f, { tipo }, {});
            expect(f.combate.semEncadeioFollowUp).toBeUndefined();
            expect(r.caminhos).toContain('combate/semEncadeioFollowUp');
        });
    });
    it('mantemSemEncadeio:true (reusos) preserva a marca ate o fim do laco', () => {
        const f = fichaBase(); marcarSemEncadeio(f, Date.now());
        dispararEventoNaFicha(f, { tipo: 'acertou' }, { mantemSemEncadeio: true });
        dispararEventoNaFicha(f, { tipo: 'acertou' }, { mantemSemEncadeio: true });
        expect(f.combate.semEncadeioFollowUp).toBeDefined();
        // evento final sem a flag fecha a janela
        dispararEventoNaFicha(f, { tipo: 'acertou' }, {});
        expect(f.combate.semEncadeioFollowUp).toBeUndefined();
    });
    it('marca so cai em evento raiz (profundidade 0), nao em derivados', () => {
        const f = fichaBase(); marcarSemEncadeio(f, Date.now());
        dispararEventoNaFicha(f, { tipo: 'acertou' }, { profundidade: 1 });
        expect(f.combate.semEncadeioFollowUp).toBeDefined();
    });
    it('outros eventos (atingido) nao limpam a marca', () => {
        const f = fichaBase(); marcarSemEncadeio(f, Date.now());
        dispararEventoNaFicha(f, { tipo: 'atingido' }, {});
        expect(f.combate.semEncadeioFollowUp).toBeDefined();
    });
});

describe('ComboPrompt: rotuloAcaoGolpe (funcao pura)', () => {
    it('conhecidas e desconhecida cai em Acao', () => {
        expect(rotuloAcaoGolpe('padrao')).toBe('Ação');
        expect(rotuloAcaoGolpe('bonus')).toBe('Ação Bônus');
        expect(rotuloAcaoGolpe('reacao')).toBe('Reação');
        expect(rotuloAcaoGolpe('xyz')).toBe('Ação');
        expect(rotuloAcaoGolpe(undefined)).toBe('Ação');
    });
});
