import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(), enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import * as fb from './firebase-sync';
import useStore from '../stores/useStore';
import { planejarUsoSuporte, descreverUsoSuporte } from './suporte';
import { absorverEmPersonagem, gravarDanoEmPersonagem, gravarVidaDoAlvo } from './danoAlvo';
import { criarPosGolpe } from './posGolpe';
import { normalizarSuporte, normalizarEscudoSuporte, calcularEscudoSuporte } from '../core/suporte';
import { LIMITE_VALOR_ESCUDO, LIMITE_ESCUDOS } from '../core/escudos';
import { getVidaMaxExibidaFicha } from '../core/danoProporcional';

const vitalBase = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
const ficha = (extra = {}) => ({ vida: vitalBase(50_000_000), poderes: [], inventario: [], passivas: [], combate: {}, ...extra });
const VMAX = getVidaMaxExibidaFicha(ficha());
const item = (suporte, extra = {}) => ({ id: 'it1', nome: 'Barreira X', suporte: { modo: 'uso', alvos: 'ambos', maxAlvos: 5, ...suporte }, ...extra });

beforeEach(() => { vi.clearAllMocks(); useStore.setState({ personagens: {}, cenario: { ativa: 'default' } }); });

describe('normalizarSuporte com escudo', () => {
    it('so escudo valido (sem cura e sem buffs) e suporte valido', () => {
        const s = normalizarSuporte({ escudo: { valor: 100, tipo: 'escudo' } });
        expect(s).not.toBeNull();
        expect(s.escudo).toEqual({ valor: 100, percVida: 0, tipo: 'escudo' });
        expect(s.buffs).toEqual([]);
        expect(s.cura).toBeUndefined();
    });
    it('fixo + percVida, tipo vidaTemporaria; tipo desconhecido vira escudo', () => {
        expect(normalizarSuporte({ escudo: { valor: 10, percVida: 20, tipo: 'vidaTemporaria' } }).escudo).toEqual({ valor: 10, percVida: 20, tipo: 'vidaTemporaria' });
        expect(normalizarSuporte({ escudo: { valor: 10, tipo: 'xyz' } }).escudo.tipo).toBe('escudo');
        expect(normalizarSuporte({ escudo: { valor: 10, tipo: '__proto__' } }).escudo.tipo).toBe('escudo');
    });
    it('escudo zerado/hostil: suporte vira null se nao ha mais nada', () => {
        [{ valor: 0 }, { valor: -5 }, { valor: NaN }, { valor: 'abc' }, {}, null, 'x', 5, [], { percVida: -3 }, { valor: undefined, percVida: NaN }]
            .forEach((e, i) => expect(normalizarSuporte({ escudo: e }), `caso ${i}`).toBeNull());
    });
    it('teto 1e15 no valor fixo e 1000 no percentual; Infinity limitado', () => {
        expect(normalizarEscudoSuporte({ valor: 1e30 }).valor).toBe(LIMITE_VALOR_ESCUDO);
        expect(normalizarEscudoSuporte({ valor: Infinity })).toBeNull(); // nao finito = descartado
        expect(normalizarEscudoSuporte({ percVida: 99999 }).percVida).toBe(1000);
    });
    it('escudo + cura + buffs coexistem', () => {
        const s = normalizarSuporte({ cura: { fixo: 5 }, buffs: [{ atributo: 'forca', propriedade: 'base', valor: 3 }], escudo: { valor: 7 } });
        expect(s.cura).toBeDefined(); expect(s.buffs).toHaveLength(1); expect(s.escudo.valor).toBe(7);
    });
    it('modo passivo descarta o escudo (so no uso ativo)', () => {
        expect(normalizarSuporte({ modo: 'passivo', escudo: { valor: 50 } })).toBeNull();
        const s = normalizarSuporte({ modo: 'passivo', cura: { fixo: 5 }, escudo: { valor: 50 } });
        expect(s.escudo).toBeUndefined();
        expect(s.cura).toBeDefined();
    });
    it('suporte antigo sem escudo fica intacto (sem chave escudo)', () => {
        const s = normalizarSuporte({ cura: { fixo: 10 }, duracao: 2 });
        expect('escudo' in s).toBe(false);
        expect(normalizarSuporte({ buffs: [] })).toBeNull();
    });
    it('idempotente: normalizar o normalizado nao muda', () => {
        const s = normalizarSuporte({ escudo: { valor: 10, percVida: 5.5, tipo: 'vidaTemporaria' } });
        expect(normalizarSuporte(s)).toEqual(s);
    });
});

describe('calcularEscudoSuporte', () => {
    it('fixo + % da Vida maxima exibida do alvo', () => {
        const r = calcularEscudoSuporte({ escudo: { valor: 100, percVida: 10 } }, 2000);
        expect(r.total).toBe(300);
        expect(r.tipo).toBe('escudo');
        expect(r.detalhe).toMatch(/100 \+ 10% da Vida = 200/);
    });
    it('vida maxima 0/NaN/negativa/Infinity: so o fixo (percentual nao quebra)', () => {
        [0, NaN, -50, undefined, null, 'x'].forEach(v => expect(calcularEscudoSuporte({ escudo: { valor: 100, percVida: 50 } }, v).total).toBe(100));
        expect(calcularEscudoSuporte({ escudo: { percVida: 50 } }, 0).total).toBe(0);
    });
    it('teto 1e15 mesmo com vida gigante', () => {
        expect(calcularEscudoSuporte({ escudo: { valor: 1e15, percVida: 1000 } }, 1e20).total).toBe(LIMITE_VALOR_ESCUDO);
        expect(Number.isFinite(calcularEscudoSuporte({ escudo: { percVida: 1000 } }, Infinity).total)).toBe(true);
    });
    it('suporte sem escudo = 0', () => {
        expect(calcularEscudoSuporte({ cura: { fixo: 1 } }, 100)).toEqual({ total: 0, tipo: 'escudo', detalhe: '' });
        expect(calcularEscudoSuporte(null, 100).total).toBe(0);
    });
    it('vidaTemporaria preserva o tipo', () => {
        expect(calcularEscudoSuporte({ escudo: { valor: 5, tipo: 'vidaTemporaria' } }, 0).tipo).toBe('vidaTemporaria');
    });
});

describe('planejarUsoSuporte com escudo', () => {
    it('so escudo: cada destinatario ganha o escudo e id esc_sup_<caster>_<item>', () => {
        const fichas = { 'Mago A': ficha(), 'Aliado B': ficha() };
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 150 } }), meuNome: 'Mago A', fichas, aliados: ['Aliado B'], agora: 1 });
        expect(p.erro).toBeUndefined();
        expect(p.receptores.map(r => r.nome)).toEqual(['Mago A', 'Aliado B']);
        p.receptores.forEach((r) => {
            expect(r.escudo.total).toBe(150);
            expect(r.escudosNovos).toHaveLength(1);
            expect(r.escudosNovos[0]).toMatchObject({ id: 'esc_sup_Mago A_it1', valor: 150, tipo: 'escudo', nome: 'Barreira X' });
            expect(r.vidaNova).toBeNull(); expect(r.buffsNovos).toBeNull();
        });
    });
    it('percVida usa a Vida maxima DE CADA alvo', () => {
        const forte = ficha({ vida: { ...vitalBase(1), base: 400000000 } });
        const fichas = { 'Mago A': ficha(), 'Tanque': forte };
        const p = planejarUsoSuporte({ item: item({ escudo: { percVida: 10 } }), meuNome: 'Mago A', fichas, aliados: ['Tanque'] });
        const a = p.receptores.find(r => r.nome === 'Mago A').escudo.total;
        const b = p.receptores.find(r => r.nome === 'Tanque').escudo.total;
        expect(a).toBe(Math.floor(VMAX * 0.1));
        expect(b).toBe(Math.floor(getVidaMaxExibidaFicha(forte) * 0.1));
        expect(b).toBeGreaterThan(a);
    });
    it('vida maxima 0 (ficha sem vida): so o fixo, sem NaN', () => {
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 40, percVida: 50 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': { poderes: [] } } });
        expect(p.receptores[0].escudo.total).toBe(40);
    });
    it('so percVida e vida maxima 0: nada de escudo (sem criar escudo vazio)', () => {
        const p = planejarUsoSuporte({ item: item({ escudo: { percVida: 50 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': { poderes: [] } } });
        expect(p.receptores[0].escudo).toBeNull();
        expect(p.receptores[0].escudosNovos).toBeNull();
    });
    it('vidaTemporaria grava tipo vidaTemporaria', () => {
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 30, tipo: 'vidaTemporaria' }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p.receptores[0].escudosNovos[0].tipo).toBe('vidaTemporaria');
        expect(descreverUsoSuporte(p, 'Barreira X', 'Mago A')).toMatch(/Vida temporária de 30/);
    });
    it('teto 1e15 respeitado no plano', () => {
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 1e30 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p.receptores[0].escudosNovos[0].valor).toBe(LIMITE_VALOR_ESCUDO);
    });
    it('usar de novo RENOVA o mesmo id (nao soma)', () => {
        const f = ficha({ escudos: [{ id: 'esc_sup_Mago A_it1', nome: 'Barreira X', valor: 5, tipo: 'escudo' }] });
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 100 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': f } });
        expect(p.receptores[0].escudosNovos).toHaveLength(1);
        expect(p.receptores[0].escudosNovos[0].valor).toBe(100);
    });
    it('sem colisao entre casters diferentes (mesmo item)', () => {
        const f = ficha();
        const a = planejarUsoSuporte({ item: item({ escudo: { valor: 10 } }), meuNome: 'Mago A', fichas: { 'Mago A': f, Alvo: f }, aliados: ['Alvo'] });
        const alvoDepoisDeA = { ...f, escudos: a.receptores.find(r => r.nome === 'Alvo').escudosNovos };
        const b = planejarUsoSuporte({ item: item({ escudo: { valor: 20 } }), meuNome: 'Mago B', fichas: { 'Mago B': f, Alvo: alvoDepoisDeA }, aliados: ['Alvo'] });
        const lista = b.receptores.find(r => r.nome === 'Alvo').escudosNovos;
        expect(lista.map(e => e.id).sort()).toEqual(['esc_sup_Mago A_it1', 'esc_sup_Mago B_it1']);
    });
    it('nome do caster com . # $ [ ] / e sanitizado no id', () => {
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 10 }, alvos: 'si' }), meuNome: 'Mago.X/[1]', fichas: { 'Mago.X/[1]': ficha() } });
        expect(p.receptores[0].escudosNovos[0].id).toBe('esc_sup_Mago_X__1__it1');
        expect(p.receptores[0].escudosNovos[0].id).not.toMatch(/[.#$[\]/]/);
    });
    it('limite de 12 escudos: semEspaco e a lista nao muda', () => {
        const cheia = Array.from({ length: LIMITE_ESCUDOS }, (_, i) => ({ id: `o${i}`, nome: 'O', valor: 1, tipo: 'escudo' }));
        const f = ficha({ escudos: cheia });
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 10 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': f } });
        expect(p.receptores[0].escudo.semEspaco).toBe(true);
        expect(p.receptores[0].escudosNovos).toBeNull();
        expect(f.escudos).toHaveLength(12);
        expect(descreverUsoSuporte(p, 'Barreira X', 'Mago A')).toMatch(/sem espaço para o escudo/);
    });
    it('lista com 12 mas contendo o proprio id: renova (cabe)', () => {
        const cheia = Array.from({ length: LIMITE_ESCUDOS - 1 }, (_, i) => ({ id: `o${i}`, nome: 'O', valor: 1, tipo: 'escudo' }));
        cheia.push({ id: 'esc_sup_Mago A_it1', nome: 'B', valor: 1, tipo: 'escudo' });
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 10 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': ficha({ escudos: cheia }) } });
        expect(p.receptores[0].escudo.semEspaco).toBeUndefined();
        expect(p.receptores[0].escudosNovos).toHaveLength(12);
    });
    it('NAO muda a ficha original (clone)', () => {
        const f = ficha({ escudos: [{ id: 'x', nome: 'X', valor: 5, tipo: 'escudo' }] });
        const antes = JSON.stringify(f);
        planejarUsoSuporte({ item: item({ escudo: { valor: 10 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': f } });
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('suporte passivo com escudo continua passivo (erro de uso) e sem escudo', () => {
        const p = planejarUsoSuporte({ item: { id: 'i', nome: 'N', suporte: { modo: 'passivo', cura: { fixo: 5 }, escudo: { valor: 9 } } }, meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p.erro).toMatch(/passivo/);
    });
    it('suporte so de escudo passivo e invalido (sem cura/buffs/escudo)', () => {
        const p = planejarUsoSuporte({ item: { id: 'i', nome: 'N', suporte: { modo: 'passivo', escudo: { valor: 9 } } }, meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p.erro).toMatch(/não tem Cura nem Buffs/);
    });
    it('imunidade total do alvo NAO impede ganhar escudo', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } });
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 50 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': f } });
        expect(p.receptores[0].escudo.total).toBe(50);
        expect(p.receptores[0].escudosNovos).toHaveLength(1);
    });
    it('suporte antigo (so cura) intacto: escudo/escudosNovos nulos', () => {
        const p = planejarUsoSuporte({ item: item({ cura: { fixo: 100 }, alvos: 'si' }), meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p.receptores[0].escudo).toBeNull();
        expect(p.receptores[0].escudosNovos).toBeNull();
        expect(p.receptores[0].cura).not.toBeNull();
        expect(descreverUsoSuporte(p, 'Barreira X', 'Mago A')).not.toMatch(/escudo/i);
    });
    it('destinatario sem ficha e ignorado sem quebrar', () => {
        const p = planejarUsoSuporte({ item: item({ escudo: { valor: 5 } }), meuNome: 'Mago A', fichas: { 'Mago A': ficha() }, aliados: ['Fantasma'] });
        expect(p.receptores.map(r => r.nome)).toEqual(['Mago A']);
    });
    it('item sem suporte / sem destinatario avisam erro', () => {
        expect(planejarUsoSuporte({ item: {}, meuNome: 'Mago A', fichas: {} }).erro).toBeTruthy();
        expect(planejarUsoSuporte({ item: item({ escudo: { valor: 5 }, alvos: 'aliados' }), meuNome: 'Mago A', fichas: { 'Mago A': ficha() }, aliados: [] }).erro).toMatch(/aliado/);
    });
    it('nome do item vazio usa "Escudo" e corta em 40 chars', () => {
        const p1 = planejarUsoSuporte({ item: { id: 'i', suporte: { escudo: { valor: 5 }, alvos: 'si' } }, meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p1.receptores[0].escudosNovos[0].nome).toBe('Escudo');
        const p2 = planejarUsoSuporte({ item: { id: 'i', nome: 'N'.repeat(100), suporte: { escudo: { valor: 5 }, alvos: 'si' } }, meuNome: 'Mago A', fichas: { 'Mago A': ficha() } });
        expect(p2.receptores[0].escudosNovos[0].nome.length).toBeLessThanOrEqual(40);
    });
});

describe('danoAlvo/posGolpe com fichaFixa (reusos)', () => {
    const alvoComEscudo = (valor = 100) => ficha({ escudos: [{ id: 'e1', nome: 'Domo', valor, tipo: 'escudo' }] });

    it('absorverEmPersonagem fixa=true usa a ficha dada e NAO le o store', () => {
        useStore.setState({ personagens: { 'Alvo A': ficha() } }); // store sem escudo
        const r = absorverEmPersonagem('Alvo A', alvoComEscudo(100), 30, 'Alvo A', true);
        expect(r.absorvido).toBe(30);
        expect(r.restante).toBe(0);
        expect(r.escudosNovos[0].valor).toBe(70);
        expect(fb.salvarCamposPersonagem).toHaveBeenCalledWith('Alvo A', { escudos: expect.any(Array) });
    });
    it('absorverEmPersonagem fixa=false (padrao) continua lendo o store', () => {
        useStore.setState({ personagens: { 'Alvo A': ficha() } });
        const r = absorverEmPersonagem('Alvo A', alvoComEscudo(100), 30, 'Alvo A');
        expect(r.absorvido).toBe(0);
        expect(r.restante).toBe(30);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('escudo absorve uma vez so: segundo golpe do laco parte dos escudos ja consumidos', () => {
        useStore.setState({ personagens: { 'Alvo A': alvoComEscudo(100) } }); // store continua com o escudo cheio (desatualizado)
        let alvo = { isPersonagem: true, personagemNome: 'Alvo A', nome: 'Alvo A', ficha: alvoComEscudo(100), fichaFixa: true };
        const totais = [];
        for (let i = 0; i < 3; i++) {
            const pg = criarPosGolpe({ danoOriginal: 60 });
            const dano = pg.aplicar('t1', alvo, 60);
            totais.push(dano);
            const para = pg.alvoParaGravar('t1', alvo);
            alvo = { ...alvo, ficha: { ...alvo.ficha, escudos: para.escudosNovos || alvo.ficha.escudos } };
            if (!para.escudosNovos) alvo.ficha = { ...alvo.ficha, escudos: undefined };
        }
        // 100 de escudo: golpe1 absorve 60 (dano 0), golpe2 absorve 40 (dano 20), golpe3 nada (dano 60)
        expect(totais).toEqual([0, 20, 60]);
    });
    it('sem fichaFixa o mesmo laco reabsorveria do store desatualizado (comportamento antigo preservado)', () => {
        useStore.setState({ personagens: { 'Alvo A': alvoComEscudo(100) } });
        const alvo = { isPersonagem: true, personagemNome: 'Alvo A', nome: 'Alvo A', ficha: alvoComEscudo(30) };
        const pg = criarPosGolpe({ danoOriginal: 60 });
        expect(pg.aplicar('t1', alvo, 60)).toBe(0); // le o store (100)
    });
    it('fichaFixa so vale com === true (truthy nao basta)', () => {
        useStore.setState({ personagens: { 'Alvo A': ficha() } });
        const alvo = { isPersonagem: true, personagemNome: 'Alvo A', nome: 'Alvo A', ficha: alvoComEscudo(100), fichaFixa: 'sim' };
        const pg = criarPosGolpe({ danoOriginal: 30 });
        expect(pg.aplicar('t1', alvo, 30)).toBe(30); // le o store (sem escudo)
    });
    it('gravarDanoEmPersonagem fichaFixa=true: Vida carregada, nao le o store', () => {
        useStore.setState({ personagens: { 'Alvo A': ficha({ vida: vitalBase(40_000_000) }) } }); // store "antigo"
        const fixa = ficha({ vida: vitalBase(30_000_000) });
        gravarDanoEmPersonagem('Alvo A', fixa, 20_000_000, { nomeNoFeed: 'Alvo A', fichaFixa: true });
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Alvo A', 20_000_000);
    });
    it('gravarVidaDoAlvo repassa alvo.fichaFixa', () => {
        useStore.setState({ personagens: { 'Alvo A': ficha({ vida: vitalBase(40_000_000), combate: { imunidadeTotal: { turnosRestantes: 1 } } }) } });
        const alvo = { isPersonagem: true, personagemNome: 'Alvo A', nome: 'Alvo A', ficha: ficha({ vida: vitalBase(30_000_000) }), fichaFixa: true };
        const r = gravarVidaDoAlvo('t1', alvo, 20_000_000, {});
        // a ficha fixa NAO tem imunidade: o dano grava (o store tem, mas nao deve ser lido)
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Alvo A', 20_000_000);
        expect(r.vidaFinalBruta).toBe(20_000_000);
        // contraprova: sem fichaFixa le o store (imune) e a Vida nao cai para 20M
        vi.clearAllMocks();
        gravarVidaDoAlvo('t1', { ...alvo, fichaFixa: false }, 20_000_000, {});
        expect(fb.aplicarDanoDireto).not.toHaveBeenCalledWith('Alvo A', 20_000_000);
    });
    it('imunidade total na ficha fixa: nada absorvido e dano 0', () => {
        const f = alvoComEscudo(100); f.combate = { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } };
        const r = absorverEmPersonagem('Alvo A', f, 50, 'Alvo A', true);
        expect(r.imune).toBe(true); expect(r.restante).toBe(0);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('dano 0, NaN e negativo com fichaFixa nao quebram nem gravam', () => {
        [0, NaN, -10].forEach(d => {
            const r = absorverEmPersonagem('Alvo A', alvoComEscudo(100), d, 'Alvo A', true);
            expect(r.absorvido).toBe(0);
        });
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('escudo consumido por completo grava escudos: null', () => {
        absorverEmPersonagem('Alvo A', alvoComEscudo(10), 50, 'Alvo A', true);
        expect(fb.salvarCamposPersonagem).toHaveBeenCalledWith('Alvo A', { escudos: null });
    });
});
