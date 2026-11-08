import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(), salvarFichaSilencioso: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import { salvarCamposPersonagem, salvarFichaSilencioso, aplicarDanoDireto } from './firebase-sync';
import useStore from '../stores/useStore';
import { perguntarGatilhosDeDano, aplicarDanoNaVidaDaFicha } from './danoVida';
import { aplicarExternosDeGatilhos } from './gatilhosEventos';
import { gravarDanoEmPersonagem, aplicarDanoEmPersonagem } from './danoAlvo';

// QA Fase 3 - services: perguntarGatilhosDeDano (window.confirm), aplicarExternosDeGatilhos (dano no atacante), dono offline (so armado).

const F = 1000;
const MAX = 100000 * F;
const ficha = (extra = {}, vidaExibida = 100000) => ({ vida: { base: 100000000, atual: vidaExibida * F, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' }, poderes: [], inventario: [], passivas: [], ...extra });
const poderCom = (...gs) => [{ id: 'p1', nome: 'Volta', ativa: true, gatilhos: gs }];
const NEGAR = (extra = {}) => ({ id: 'nm', nome: 'Negar morte', modo: 'opcional', armado: true, evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }], ...extra });
const FAIXA = (extra = {}) => ({ id: 'fx', nome: 'Faixa baixa', modo: 'opcional', armado: true, evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 40 }], ...extra });
const God = { turnosRestantes: 1, origem: 'x' };

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {}, cenario: { ativa: 'cena1' }, meuNome: 'Eu', minhaFicha: ficha() });
});
afterEach(() => { delete window.confirm; });

describe('perguntarGatilhosDeDano', () => {
    it('sem nenhum gatilho que pergunte: {} e nenhum prompt', () => {
        const c = vi.fn(() => true);
        expect(perguntarGatilhosDeDano(ficha(), 1e9, {}, c)).toEqual({});
        expect(perguntarGatilhosDeDano(ficha({ poderes: poderCom(NEGAR()) }), 1e9, { vidaMaxBruta: MAX }, c)).toEqual({}); // armado sem perguntar
        expect(c).not.toHaveBeenCalled();
    });
    it('uma pergunta: o texto traz nome e poder; Sim=true, Nao=false', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) });
        const c = vi.fn(() => true);
        expect(perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, c)).toEqual({ 'p1:nm': true });
        expect(c.mock.calls[0][0]).toContain('Usar Negar morte (Volta)?');
        expect(perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, () => false)).toEqual({ 'p1:nm': false });
    });
    it('cancelar/undefined/null/"true"/1 = Nao (so `true` estrito vale Sim)', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) });
        [undefined, null, 'true', 1, 'sim', 0].forEach(v => expect(perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, () => v), String(v)).toEqual({ 'p1:nm': false }));
    });
    it('usa window.confirm quando nao ha callback; sem window.confirm cai em Sim (afirma o comportamento atual)', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) });
        window.confirm = vi.fn(() => false);
        expect(perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX })).toEqual({ 'p1:nm': false });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        delete window.confirm;
        expect(perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX })).toEqual({ 'p1:nm': true });
    });
    it('callback que LANCA: nao propaga; devolve {} (a primeira pergunta falhou) -> vale armado (afirma comportamento)', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) });
        const lanca = () => { throw new Error('bloqueado'); };
        expect(() => perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, lanca)).not.toThrow();
        expect(perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, lanca)).toEqual({});
    });
    it('ficha null/sem vida: {} sem lancar', () => {
        expect(perguntarGatilhosDeDano(null, 100, {}, () => true)).toEqual({});
        expect(perguntarGatilhosDeDano({}, 100, {}, () => true)).toEqual({});
    });
    it('dano NaN/negativo/0 nao pergunta (nada zera)', () => {
        const c = vi.fn(() => true); const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) });
        [NaN, -5, 0, undefined].forEach(d => perguntarGatilhosDeDano(f, d, { vidaMaxBruta: MAX }, c));
        expect(c).not.toHaveBeenCalled();
    });
    it('dois gatilhos perguntam (0% e faixa) e cada um recebe a propria resposta (Sim em um, Nao no outro)', () => {
        const n = NEGAR({ perguntar: true, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', percMax: 2 }] });
        const fx = FAIXA({ perguntar: true });
        const f = ficha({ poderes: poderCom(n, fx) });
        const respostas = { 'Usar Negar morte': true, 'Usar Faixa baixa': false };
        const c = vi.fn((t) => Object.entries(respostas).find(([k]) => t.startsWith(k))[1]);
        const d = perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, c);
        expect(d).toEqual({ 'p1:nm': true, 'p1:fx': false });
        expect(c).toHaveBeenCalledTimes(2);
        const alvo = JSON.parse(JSON.stringify(f));
        aplicarDanoNaVidaDaFicha(alvo, 1e9, { nome: 'Eu', vidaMaxBruta: MAX, decisoes: d });
        expect(alvo.vida.atual).toBe(2000 * F); // so o Negar morte executou (2%); a faixa (Nao) nao curou
    });
    it('Sim nos dois: Negar morte deixa 2% e a faixa 5-1 reage a isso (cura 40%)', () => {
        const n = NEGAR({ perguntar: true, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', percMax: 2 }] });
        const f = ficha({ poderes: poderCom(n, FAIXA({ perguntar: true })) });
        const d = perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, () => true);
        aplicarDanoNaVidaDaFicha(f, 1e9, { nome: 'Eu', vidaMaxBruta: MAX, decisoes: d });
        expect(f.vida.atual).toBe(42000 * F);
    });
    it('nunca pergunta a mesma chave duas vezes (respostas ja dadas ficam de fora nas rodadas seguintes)', () => {
        const n = NEGAR({ perguntar: true, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', percMax: 2 }] });
        const f = ficha({ poderes: poderCom(n, FAIXA({ perguntar: true })) });
        const c = vi.fn(() => false);
        const d = perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, c);
        expect(Object.keys(d).sort()).toEqual(['p1:fx', 'p1:nm']);
        expect(c).toHaveBeenCalledTimes(2);
    });
    it('God Mode do dono: nenhuma pergunta', () => {
        const c = vi.fn(() => true);
        expect(perguntarGatilhosDeDano(ficha({ combate: { imunidadeTotal: God }, poderes: poderCom(NEGAR({ perguntar: true })) }), 1e9, { vidaMaxBruta: MAX }, c)).toEqual({});
        expect(c).not.toHaveBeenCalled();
    });
    it('gatilho desarmado ou automatico com `perguntar` nao pergunta', () => {
        const c = vi.fn(() => true);
        perguntarGatilhosDeDano(ficha({ poderes: poderCom(NEGAR({ perguntar: true, armado: false })) }), 1e9, { vidaMaxBruta: MAX }, c);
        perguntarGatilhosDeDano(ficha({ poderes: poderCom(NEGAR({ perguntar: true, modo: 'automatico' })) }), 1e9, { vidaMaxBruta: MAX }, c);
        expect(c).not.toHaveBeenCalled();
    });
    it('nao muda a ficha original (previsao e em copia)', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) }); const antes = JSON.stringify(f);
        perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, () => true);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('usa a cena da mesa (limite por cena): uso esgotado na cena atual nao pergunta; outra cena pergunta', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true })) });
        aplicarDanoNaVidaDaFicha(f, 1e9, { nome: 'Eu', vidaMaxBruta: MAX }); // gasta na cena1
        f.vida.atual = 100 * F;
        const c = vi.fn(() => true);
        perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, c); expect(c).not.toHaveBeenCalled();
        useStore.setState({ cenario: { ativa: 'cena2' } });
        perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, c); expect(c).toHaveBeenCalledTimes(1);
    });
    it('limite de rodadas: nao entra em laco infinito', () => {
        const f = ficha({ poderes: poderCom(NEGAR({ perguntar: true }), FAIXA({ perguntar: true })) });
        const c = vi.fn(() => true);
        expect(() => perguntarGatilhosDeDano(f, 1e9, { vidaMaxBruta: MAX }, c)).not.toThrow();
        expect(c.mock.calls.length).toBeLessThanOrEqual(8);
    });
});

describe('aplicarExternosDeGatilhos (dano no atacante)', () => {
    const ext = (nome, dano, extra = {}) => ({ tipo: 'danoNoAtacante', atacante: { nome }, dano, gatilhoNome: 'Cinzas 0%', ...extra });
    it('entrada invalida (undefined, nao-lista, itens lixo): [] sem lancar', () => {
        const lixo = [null, 3, 'a', {}, { tipo: 'outro' }, { tipo: 'danoNoAtacante' }, { tipo: 'danoNoAtacante', atacante: {}, dano: 5 }];
        [undefined, null, 'x', 5, {}, lixo].forEach(e => expect(aplicarExternosDeGatilhos(e)).toEqual([]));
    });
    it('dano 0, negativo, NaN ou texto: ignorado, nada gravado', () => {
        useStore.setState({ personagens: { Vilao: ficha() } });
        [0, -10, NaN, 'abc', undefined].forEach(d => expect(aplicarExternosDeGatilhos([ext('Vilao', d)])).toEqual([]));
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });
    it('atacante-personagem com ficha: dano pelo ponto unico dele (grava a Vida dele) e frase no feed', () => {
        useStore.setState({ personagens: { Vilao: ficha({}, 1000) } });
        const t = aplicarExternosDeGatilhos([ext('Vilao', 400)]);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 600 * F);
        expect(t.length).toBeGreaterThan(0);
    });
    it('atacante sem ficha / Dummie (nao esta em personagens): avisa e nao grava nada', () => {
        const t = aplicarExternosDeGatilhos([ext('Dummie 1', 400)]);
        expect(t[0]).toContain('não tem ficha'); expect(aplicarDanoDireto).not.toHaveBeenCalled();
        useStore.setState({ personagens: { SemVida: { poderes: [] } } });
        expect(aplicarExternosDeGatilhos([ext('SemVida', 5)])[0]).toContain('não tem ficha');
    });
    it('God Mode do atacante zera o dano devolvido (Vida inalterada)', () => {
        useStore.setState({ personagens: { Vilao: ficha({ combate: { imunidadeTotal: God } }, 1000) } });
        const t = aplicarExternosDeGatilhos([ext('Vilao', 400)]);
        const gravacoes = aplicarDanoDireto.mock.calls.filter(c => c[0] === 'Vilao');
        expect(gravacoes.every(c => c[1] === 1000 * F)).toBe(true);
        expect(t.join(' ')).toContain('Imunidade total');
    });
    it('escudo do atacante absorve antes da Vida dele', () => {
        useStore.setState({ personagens: { Vilao: ficha({ escudos: [{ id: 'e', nome: 'Domo', valor: 300, tipo: 'escudo' }] }, 1000) } });
        aplicarExternosDeGatilhos([ext('Vilao', 400)]);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 900 * F); // 400 - 300 de escudo = 100 de dano
    });
    it('atacante e o PROPRIO dono (auto-golpe): aplica na minha ficha pelo ponto unico, salva com debounce', () => {
        useStore.setState({ meuNome: 'Eu', minhaFicha: ficha({}, 1000) });
        const t = aplicarExternosDeGatilhos([ext('Eu', 250)]);
        expect(useStore.getState().minhaFicha.vida.atual).toBe(750 * F);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1); expect(t[0]).toContain('sofreu 250');
    });
    it('auto-golpe com God Mode meu: frase de imunidade e Vida intacta', () => {
        useStore.setState({ meuNome: 'Eu', minhaFicha: ficha({ combate: { imunidadeTotal: God } }, 1000) });
        const t = aplicarExternosDeGatilhos([ext('Eu', 250)]);
        expect(useStore.getState().minhaFicha.vida.atual).toBe(1000 * F); expect(t[0]).toContain('Imunidade total');
    });
    it('atacante com Negar morte armado: o gatilho DELE tambem roda no dano devolvido (ponto unico)', () => {
        useStore.setState({ personagens: { Vilao: ficha({ poderes: poderCom(NEGAR()) }, 100) } });
        const t = aplicarExternosDeGatilhos([ext('Vilao', 5000)]);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1 * F);
        expect(t.join(' ')).toContain('Negar morte segurou');
    });
    it('LACO: atacante que tambem tem contra-ataque nao devolve de volta (o dano devolvido nao carrega atacante)', () => {
        const contra = { id: 'ct', nome: 'Espinhos', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'danoNoAtacante', modo: 'fixo', valor: 999 }] };
        useStore.setState({ personagens: { Vilao: ficha({ poderes: poderCom(contra) }, 1000) }, meuNome: 'Eu', minhaFicha: ficha({}, 1000) });
        aplicarExternosDeGatilhos([ext('Vilao', 400)]);
        expect(aplicarDanoDireto.mock.calls.filter(c => c[0] === 'Eu')).toHaveLength(0);
        expect(useStore.getState().minhaFicha.vida.atual).toBe(1000 * F);
    });
    it('varios externos: cada um isolado (um atacante sem ficha nao impede o outro)', () => {
        useStore.setState({ personagens: { Vilao: ficha({}, 1000) } });
        const t = aplicarExternosDeGatilhos([ext('Fantasma', 10), ext('Vilao', 100)]);
        expect(t.some(x => x.includes('não tem ficha'))).toBe(true);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 900 * F);
    });
    it('dano fracionado/enorme: floor e finito', () => {
        useStore.setState({ personagens: { Vilao: ficha({}, 1000) } });
        aplicarExternosDeGatilhos([ext('Vilao', 10.9)]);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 990 * F);
        aplicarDanoDireto.mockClear();
        aplicarExternosDeGatilhos([ext('Vilao', 1e300)]);
        const v = aplicarDanoDireto.mock.calls.at(-1)[1]; expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0);
    });
});

describe('Dono offline / dano aplicado por OUTRO cliente: so `armado`, sem pergunta', () => {
    it('gravarDanoEmPersonagem: opcional armado + perguntar dispara sem chamar confirm; desarmado nao', () => {
        window.confirm = vi.fn(() => false);
        useStore.setState({ personagens: { Ana: ficha({ poderes: poderCom(NEGAR({ perguntar: true })) }, 500) } });
        gravarDanoEmPersonagem('Ana', ficha({}, 500), 0, { nomeNoFeed: 'Ana' });
        expect(window.confirm).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1 * F);
        aplicarDanoDireto.mockClear();
        useStore.setState({ personagens: { Ana: ficha({ poderes: poderCom(NEGAR({ perguntar: true, armado: false })) }, 500) } });
        gravarDanoEmPersonagem('Ana', ficha({}, 500), 0, { nomeNoFeed: 'Ana' });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 0);
    });
    it('Ataque/Dano Rapido em outro jogador com Volta das cinzas (rolarTabela): grava so os campos tocados, sem undefined; danoNoAtacante ignorado (atacante desconhecido neste caminho)', () => {
        const volta = { id: 'vc0', nome: 'Cinzas 0%', modo: 'opcional', armado: true, evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, texto: 'volta', acoes: [{ tipo: 'danoNoAtacante', valor: 100 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] }] }] };
        useStore.setState({ personagens: { Ana: ficha({ poderes: poderCom(volta) }, 500) } });
        const r = gravarDanoEmPersonagem('Ana', ficha({}, 500), 0, { nomeNoFeed: 'Ana' });
        expect(JSON.stringify(salvarCamposPersonagem.mock.calls)).not.toContain('undefined');
        expect(r.textos.join(' ')).toContain('dano no atacante ignorado');
        expect(aplicarDanoDireto).toHaveBeenCalledTimes(1);
        const campos = salvarCamposPersonagem.mock.calls[0][1];
        expect(Object.keys(campos)).toContain('combate/usosPoderes');
    });
    it('Dano Rapido (aplicarDanoEmPersonagem) em jogador com gatilho opcional armado: escudo -> gatilho -> Vida', () => {
        useStore.setState({ personagens: { Ana: ficha({ poderes: poderCom(NEGAR()), escudos: [{ id: 'e', nome: 'D', valor: 100, tipo: 'escudo' }] }, 500) } });
        const r = aplicarDanoEmPersonagem('Ana', useStore.getState().personagens.Ana, 1e9, 1e9 * F, {});
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1 * F);
        expect(r.textos.join(' ')).toContain('Negar morte segurou');
    });
});
