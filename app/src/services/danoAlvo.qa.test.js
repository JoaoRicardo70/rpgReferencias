import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import * as fb from './firebase-sync';
import * as novo from './danoAlvo';
import { criarPosGolpe } from './posGolpe';
import useStore from '../stores/useStore';
// Copia do HEAD para o diferencial (git show HEAD:<arquivo> > danoAlvo.qaold.js[x]); sem ela os blocos P1 sao pulados.
const caminhoAntigo = './danoAlvo.qaold';
const velho = await import(/* @vite-ignore */ caminhoAntigo).catch(() => null);
const temAntigo = !!velho;

// QA: services/danoAlvo.js. Parte 1: diferencial contra o HEAD (sem gatilhos e sem God Mode, mesmas chamadas ao Firebase).
// Parte 2: alvo-personagem em outro cliente (grava so campos tocados, sem undefined), dois golpes seguidos, God Mode.

const F = 1000;
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const ficha = (extra = {}) => ({ vida: { atual: 500 * F, base: 1e9 }, combate: { fadigaExtra: 3 }, poderes: [], inventario: [], passivas: [], ...extra });
const GOD = { turnosRestantes: 1, origem: 'x' };
const mocks = ['salvarCamposPersonagem', 'salvarDummie', 'aplicarDanoDireto', 'aplicarFadigaDireta', 'aplicarElementoDireto', 'aplicarElementoNivelDireto'];
const chamadas = () => JSON.stringify(mocks.map(m => [m, fb[m].mock.calls]), (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : v));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
function rodar(fn) { vi.clearAllMocks(); const ret = fn(); return { ret, calls: chamadas() }; }
const clone = (o) => JSON.parse(JSON.stringify(o));

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {}, cenario: { ativa: 'cena1' } });
});

const FICHAS = {
    simples: () => ficha(),
    comEscudo: () => ficha({ escudos: [{ id: 'a', nome: 'Domo', valor: 30, tipo: 'escudo' }, { id: 'b', nome: 'Falsa', valor: 20, tipo: 'vidaTemporaria' }] }),
    vida0: () => ficha({ vida: { atual: 0, base: 1e9 } }),
    semVida: () => ({ poderes: [], inventario: [] }),
    poderDesligado: () => ficha({ poderes: [{ id: 'p', nome: 'P', ativa: false, gatilhos: [NEGAR] }] }),
    gatilhoOpcional: () => ficha({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, modo: 'opcional' }] }] }),
    imunidadeVencida: () => ficha({ combate: { fadigaExtra: 3, imunidadeTotal: { turnosRestantes: 0 } } }),
};
const VIDAS_FINAIS = [0, -5, 1, 499 * F, 500 * F, 800 * F, 1e20, NaN, 0.5];
const DANOS = [0, 10, 30, 50, 70, 100, 499.9, 500, 5000, 0.4, NaN, 1e12];

describe.skipIf(!temAntigo)('P1 - diferencial contra o HEAD (sem gatilhos, sem God Mode)', () => {
    it('gravarDanoEmPersonagem: mesmas chamadas ao Firebase (vida, fadiga, elemento) em todas as combinacoes', () => {
        let n = 0;
        Object.entries(FICHAS).forEach(([nome, mk]) => VIDAS_FINAIS.forEach((v) => [{}, { elemento: 'fogo' }, { elemento: 'agua', nivelOverride: 3 }, { nivelOverride: 0 }].forEach((opts) => {
            // store vazio e store com a mesma ficha
            [false, true].forEach((noStore) => {
                useStore.setState({ personagens: noStore ? { Ana: mk() } : {} });
                const a = rodar(() => velho.gravarDanoEmPersonagem('Ana', mk(), v, opts));
                const b = rodar(() => novo.gravarDanoEmPersonagem('Ana', mk(), v, opts));
                n++;
                expect(b.calls, `${nome} v=${v} ${JSON.stringify(opts)} store=${noStore}`).toBe(a.calls);
                expect(b.ret).toMatchObject({ textos: [] });
            });
        })));
        expect(n).toBeGreaterThan(100);
    });

    it('absorverEmPersonagem: mesmo retorno e mesmas gravacoes de escudo', () => {
        Object.entries(FICHAS).forEach(([nome, mk]) => DANOS.forEach((d) => [false, true].forEach((noStore) => {
            useStore.setState({ personagens: noStore ? { Ana: mk() } : {} });
            const a = rodar(() => velho.absorverEmPersonagem('Ana', mk(), d, 'Ana'));
            const b = rodar(() => novo.absorverEmPersonagem('Ana', mk(), d, 'Ana'));
            const { escudosNovos, ...semNovos } = b.ret; // `escudosNovos` e campo novo (usado pelos gatilhos); o resto igual ao HEAD
            expect(semNovos, `${nome} d=${d}`).toEqual(a.ret);
            expect(b.calls, `${nome} d=${d}`).toBe(a.calls);
        })));
    });

    it('gravarVidaDoAlvo: personagem e Dummie gravam o mesmo (retorno novo { textos: [] } em vez de undefined)', () => {
        const alvoP = (mk) => ({ isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: mk() });
        Object.entries(FICHAS).forEach(([nome, mk]) => VIDAS_FINAIS.forEach((v) => {
            const a = rodar(() => velho.gravarVidaDoAlvo('pj:Ana', alvoP(mk), v, { elemento: 'fogo' }));
            const b = rodar(() => novo.gravarVidaDoAlvo('pj:Ana', alvoP(mk), v, { elemento: 'fogo' }));
            expect(b.calls, `${nome} v=${v}`).toBe(a.calls);
            expect(b.ret).toMatchObject({ textos: [] });
        }));
        const d = { isDummie: true, nome: 'Boneco', hpAtual: 100, condicoes: [{ id: 'x', stacks: 1 }] };
        const a = rodar(() => velho.gravarVidaDoAlvo('d1', d, 40));
        const b = rodar(() => novo.gravarVidaDoAlvo('d1', d, 40));
        expect(b.calls).toBe(a.calls);
        expect(b.ret).toMatchObject({ textos: [] });
        expect(rodar(() => novo.gravarVidaDoAlvo('x', null, 1)).ret).toMatchObject({ textos: [] });
        expect(rodar(() => novo.gravarVidaDoAlvo('x', undefined, 1)).calls).toBe(rodar(() => velho.gravarVidaDoAlvo('x', undefined, 1)).calls);
    });

    it('Dano Rapido em outro jogador: aplicarDanoEmPersonagem == (absorverEmPersonagem + gravarDanoEmPersonagem) de antes, texto de escudo igual', () => {
        // a composicao exata que o MapaFormContext do HEAD fazia
        const antes = (nome, f, valor, valorRaw, o) => {
            const abs = velho.absorverEmPersonagem(nome, f, valor, nome);
            const rawFinal = abs.absorvido > 0 ? Math.max(0, Number(abs.restante) || 0) * F : valorRaw;
            velho.gravarDanoEmPersonagem(nome, f, Math.max(0, ((f && f.vida && f.vida.atual) || 0) - rawFinal), o);
            return abs.texto;
        };
        let n = 0;
        Object.entries(FICHAS).forEach(([nome, mk]) => DANOS.forEach((d) => [{}, { elemento: 'fogo', nivelOverride: 2 }].forEach((o) => {
            const valorRaw = (Number.isFinite(d) ? Math.max(0, d) * F : 0);
            const a = rodar(() => antes('Ana', mk(), d, valorRaw, o));
            const b = rodar(() => novo.aplicarDanoEmPersonagem('Ana', mk(), d, valorRaw, o));
            n++;
            expect(b.ret.texto, `${nome} d=${d}`).toBe(a.ret);
            expect(b.ret.textos).toEqual([]);
            expect(b.calls, `${nome} d=${d}`).toBe(a.calls);
        })));
        expect(n).toBeGreaterThan(100);
    });

    it('Ataque (posGolpe + gravarVidaDoAlvo) contra jogador sem gatilhos: mesmas gravacoes e mesmo resumo', () => {
        const fluxo = (mod) => {
            const alvo = { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: FICHAS.comEscudo() };
            useStore.setState({ personagens: { Ana: FICHAS.comEscudo() } });
            const pg = criarPosGolpe({ estados: [], danoOriginal: 80, nomeAtacante: 'Eu' });
            const dano = pg.aplicar('pj:Ana', alvo, 80);
            const r = mod.gravarVidaDoAlvo('pj:Ana', pg.alvoParaGravar('pj:Ana', alvo), Math.max(0, 500 * F - dano * F), { elemento: 'fogo' });
            if (pg.adicionarTextos) pg.adicionarTextos(r);
            return pg.resultado();
        };
        const a = rodar(() => fluxo(velho));
        const b = rodar(() => fluxo(novo));
        expect(b.ret).toEqual(a.ret);
        expect(b.calls).toBe(a.calls);
    });
});

describe('P2 - alvo-personagem em outro cliente com gatilhos (grava so campos tocados, nunca undefined)', () => {
    const comPoder = (gatilhos, extra = {}) => ficha({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos }], ...extra });
    const camposGravados = () => (fb.salvarCamposPersonagem.mock.calls[0] || [])[1];

    it('Negar morte: Vida via aplicarDanoDireto(1), campos so combate/*; jamais a ficha inteira nem vida/atual', () => {
        useStore.setState({ personagens: { Ana: comPoder([NEGAR]) } });
        const r = novo.gravarDanoEmPersonagem('Ana', ficha(), 0, { nomeNoFeed: 'Ana' });
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1 * F);
        expect(Object.keys(camposGravados())).toEqual(['combate/usosPoderes']); // sem eventoId real nao ha combate/gatilhos
        expect(semUndefined(camposGravados())).toBe(true);
        expect(fb.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(r.textos.join(' ')).toContain('Negar morte segurou em 1 de vida');
        expect(fb.aplicarFadigaDireta).toHaveBeenCalledTimes(1);
    });

    it('com eventoId do golpe: grava tambem combate/gatilhos e o mesmo evento nao repete', () => {
        useStore.setState({ personagens: { Ana: comPoder([{ ...NEGAR, limite: undefined }]) } });
        novo.gravarDanoEmPersonagem('Ana', ficha(), 0, { eventoId: 'golpe_1' });
        expect(Object.keys(camposGravados()).sort()).toEqual(['combate/gatilhos']);
        const f = comPoder([{ ...NEGAR, limite: undefined }], { combate: { gatilhos: { 'p1:nm': { ultimoEvento: 'golpe_1' } } } });
        useStore.setState({ personagens: { Ana: f } });
        vi.clearAllMocks();
        const r = novo.gravarDanoEmPersonagem('Ana', f, 0, { eventoId: 'golpe_1' });
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 0);
        expect(r.textos).toEqual([]);
    });

    it('cada tipo de acao grava so o seu caminho: escudos, condicoes (null), imunidade, buff', () => {
        const g = (acoes) => ({ id: 'x', nome: 'X', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }, ...acoes] });
        const rodarCom = (acoes, extra) => {
            vi.clearAllMocks();
            useStore.setState({ personagens: { Ana: comPoder([g(acoes)], extra) } });
            novo.gravarDanoEmPersonagem('Ana', ficha(), 0, {});
            return camposGravados();
        };
        let c = rodarCom([{ tipo: 'escudo', nome: 'Muro', valor: 50 }]);
        expect(c.escudos).toEqual([expect.objectContaining({ nome: 'Muro', valor: 50 })]);
        c = rodarCom([{ tipo: 'limparCondicoes' }], { condicoes: [{ id: 'sangrando', stacks: 1 }] });
        expect(c.condicoes).toBeNull();
        c = rodarCom([{ tipo: 'limparCondicoes' }]); // nada a limpar: nao grava o campo
        expect('condicoes' in (c || {})).toBe(false);
        c = rodarCom([{ tipo: 'imunidadeTotal', duracaoTurnos: 2 }]);
        expect(c['combate/imunidadeTotal']).toEqual({ turnosRestantes: 2, origem: 'X' });
        c = rodarCom([{ tipo: 'buff', atributo: 'evasiva', valor: 5, duracao: 2, modo: 'turnos' }]);
        expect(Array.isArray(c.buffsTemporarios)).toBe(true);
        [c].forEach(x => expect(semUndefined(x)).toBe(true));
        // vida/atual nunca vai em campos (vai por aplicarDanoDireto)
        expect(Object.keys(c).some(k => k.startsWith('vida'))).toBe(false);
    });

    it.skipIf(!temAntigo)('golpe que nao zera: nenhuma escrita extra, vida pelo caminho de sempre (igual ao HEAD)', () => {
        useStore.setState({ personagens: { Ana: comPoder([NEGAR]) } });
        const a = rodar(() => velho.gravarDanoEmPersonagem('Ana', ficha(), 400 * F, { elemento: 'fogo' }));
        const b = rodar(() => novo.gravarDanoEmPersonagem('Ana', ficha(), 400 * F, { elemento: 'fogo' }));
        expect(b.calls).toBe(a.calls);
    });

    it('usa a ficha mais fresca do store (nao a snapshot do clique): fresca sem o poder nao dispara', () => {
        useStore.setState({ personagens: { Ana: ficha() } });
        novo.gravarDanoEmPersonagem('Ana', comPoder([NEGAR]), 0, {});
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 0);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('dois golpes fatais seguidos: com o store ja atualizado o segundo NAO e segurado (limite 1 por cena)', () => {
        useStore.setState({ personagens: { Ana: comPoder([NEGAR]) } });
        novo.gravarDanoEmPersonagem('Ana', ficha(), 0, {});
        // simula o listener do Firebase devolvendo os campos gravados para o store
        const atual = clone(useStore.getState().personagens.Ana);
        Object.entries(camposGravados()).forEach(([caminho, v]) => {
            const partes = caminho.split('/'); let o = atual;
            partes.slice(0, -1).forEach(p => { o[p] = o[p] || {}; o = o[p]; });
            o[partes.at(-1)] = v;
        });
        atual.vida.atual = 500 * F;
        useStore.setState({ personagens: { Ana: atual } });
        vi.clearAllMocks();
        const r = novo.gravarDanoEmPersonagem('Ana', ficha(), 0, {});
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 0);
        expect(r.textos).toEqual([]);
    });

    it('CORRIDA conhecida: dois golpes antes do store atualizar (sem eventoId entre clientes) seguram os DOIS', () => {
        useStore.setState({ personagens: { Ana: comPoder([NEGAR]) } });
        novo.gravarDanoEmPersonagem('Ana', ficha(), 0, {});
        novo.gravarDanoEmPersonagem('Ana', ficha(), 0, {});
        expect(fb.aplicarDanoDireto.mock.calls.map(c => c[1])).toEqual([1 * F, 1 * F]);
    });

    it('God Mode no alvo: absorver nao consome escudo; gravar mantem a Vida; Ataque via posGolpe da dano 0', () => {
        const imune = () => ficha({ combate: { fadigaExtra: 3, imunidadeTotal: GOD }, escudos: [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }] });
        useStore.setState({ personagens: { Ana: imune() } });
        const alvo = { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana', ficha: imune() };
        const pg = criarPosGolpe({ estados: [], danoOriginal: 9999, nomeAtacante: 'Eu' });
        const dano = pg.aplicar('pj:Ana', alvo, 9999);
        expect(dano).toBe(0);
        pg.adicionarTextos(novo.gravarVidaDoAlvo('pj:Ana', alvo, Math.max(0, 500 * F - dano * F), {}));
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(pg.resultado().textos.join(' ')).toContain('Imunidade total');
    });

    it('God Mode: gravarDanoEmPersonagem com vidaFinal menor que a atual mantem a Vida atual e NAO dispara gatilhos', () => {
        useStore.setState({ personagens: { Ana: comPoder([NEGAR], { combate: { imunidadeTotal: GOD } }) } });
        const r = novo.gravarDanoEmPersonagem('Ana', ficha(), 0, { nomeNoFeed: 'Ana' });
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(r.textos.join(' ')).toContain('Imunidade total');
    });

    it('God Mode no Dano Rapido: valorRaw enorme e ignorado e o dano grava a Vida intacta', () => {
        useStore.setState({ personagens: { Ana: ficha({ combate: { imunidadeTotal: GOD } }) } });
        const r = novo.aplicarDanoEmPersonagem('Ana', ficha({ combate: { imunidadeTotal: GOD } }), 1e9, 1e9 * F, {});
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
        expect(r.texto).toContain('Imunidade total');
    });

    it('imunidade vencida (0 turnos) no store nao protege', () => {
        useStore.setState({ personagens: { Ana: ficha({ combate: { imunidadeTotal: { turnosRestantes: 0 } } }) } });
        novo.gravarDanoEmPersonagem('Ana', ficha(), 100 * F, {});
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 100 * F);
    });

    it('arredondamento: no caminho com gatilhos a Vida final difere do caminho antigo por no maximo 1e-3 bruto', () => {
        const fresca = comPoder([{ ...NEGAR, evento: { tipo: 'vidaAbaixoDe', de: 100, ate: 0 }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] }], { vida: { atual: 73276512882, base: 1e12 } });
        useStore.setState({ personagens: { Ana: fresca } });
        novo.gravarDanoEmPersonagem('Ana', fresca, 6058507899, {});
        const gravado = fb.aplicarDanoDireto.mock.calls[0][1];
        expect(Math.abs(gravado - 6058507899)).toBeLessThan(1e-3);
    });

    it('Vida do alvo >= vidaFinal (cura ou dano 0) nao entra no caminho de gatilhos', () => {
        useStore.setState({ personagens: { Ana: comPoder([NEGAR]) } });
        const r = novo.gravarDanoEmPersonagem('Ana', ficha(), 900 * F, {});
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 900 * F);
        expect(r).toMatchObject({ textos: [] });
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('alvo sem ficha no store e sem ficha no parametro nao quebra', () => {
        expect(() => novo.gravarDanoEmPersonagem('Fantasma', undefined, 10, {})).not.toThrow();
        expect(() => novo.gravarDanoEmPersonagem('Fantasma', null, 10, {})).not.toThrow();
        expect(() => novo.aplicarDanoEmPersonagem('Fantasma', undefined, 10, 10 * F, {})).not.toThrow();
        expect(() => novo.absorverEmPersonagem('Fantasma', undefined, 10, '')).not.toThrow();
    });
});
