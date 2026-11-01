import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    enviarParaFeed: vi.fn()
}));

import { salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import { planejarUsoSuporte, usarSuporte, descreverUsoSuporte } from './suporte.js';
import { getVidaMaxBrutaNpc } from '../core/gavetaNpc.js';
import { getVitalMxDisplay } from '../core/vitals.js';

const vital = (base, atual) => ({ base, nome: 'v', atual, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });
const ficha = (extra = {}) => ({
    forca: vital(100), destreza: vital(80), vida: vital(1e9, 1e6), corpo: vital(500),
    mana: vital(1000, 1e9), aura: vital(1000, 1e9), chakra: vital(1000, 1e9),
    poderes: [], inventario: [], ataquesElementais: [], bio: {}, combate: {}, ...extra
});
const itemCura = (suporte = {}) => ({ id: 'it1', nome: 'Cura Divina', suporte: { cura: { fixo: 5 }, alvos: 'ambos', acao: 'nenhuma', ...suporte } });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('planejarUsoSuporte', () => {
    it('item sem suporte válido dá erro', () => {
        expect(planejarUsoSuporte({ item: { id: 'x', nome: 'N' }, meuNome: 'Eu', fichas: { Eu: ficha() } }).erro).toBeTruthy();
        expect(planejarUsoSuporte({ item: null, meuNome: 'Eu', fichas: {} }).erro).toBeTruthy();
        expect(planejarUsoSuporte({ item: { suporte: { cura: {} } }, meuNome: 'Eu', fichas: {} }).erro).toBeTruthy();
    });

    it('cura em mim (alvos si) soma na vida bruta (x1000)', () => {
        const eu = ficha();
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si' }), meuNome: 'Eu', fichas: { Eu: eu } });
        expect(p.erro).toBeUndefined();
        expect(p.receptores).toHaveLength(1);
        expect(p.receptores[0].nome).toBe('Eu');
        expect(p.receptores[0].cura.total).toBe(5);
        expect(p.receptores[0].vidaNova).toBe(Math.min(getVidaMaxBrutaNpc(eu), 1e6 + 5000));
    });

    it('cura em mim e em aliados (ambos)', () => {
        const fichas = { Eu: ficha(), Ana: ficha({ vida: vital(1e9, 2e6) }), Beto: ficha({ vida: vital(1e9, 3e6) }) };
        const p = planejarUsoSuporte({ item: itemCura(), meuNome: 'Eu', fichas, aliados: ['Ana', 'Beto'] });
        expect(p.receptores.map(r => r.nome)).toEqual(['Eu', 'Ana', 'Beto']);
        expect(p.receptores.every(r => r.cura.total === 5)).toBe(true);
        expect(p.receptores[1].vidaNova).toBe(2e6 + 5000);
        expect(p.receptores[2].vidaNova).toBe(3e6 + 5000);
    });

    it('modo aliados não cura quem usa', () => {
        const fichas = { Eu: ficha(), Ana: ficha() };
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'aliados' }), meuNome: 'Eu', fichas, aliados: ['Ana'] });
        expect(p.receptores.map(r => r.nome)).toEqual(['Ana']);
    });

    it('não duplica quem usa se ele aparece na lista de aliados, e ignora aliado sem ficha', () => {
        const fichas = { Eu: ficha() };
        const p = planejarUsoSuporte({ item: itemCura(), meuNome: 'Eu', fichas, aliados: ['Eu', 'Fantasma'] });
        expect(p.receptores.map(r => r.nome)).toEqual(['Eu']);
    });

    it('respeita maxAlvos', () => {
        const fichas = { Eu: ficha(), A: ficha(), B: ficha(), C: ficha() };
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'aliados', maxAlvos: 2 }), meuNome: 'Eu', fichas, aliados: ['A', 'B', 'C'] });
        expect(p.receptores.map(r => r.nome)).toEqual(['A', 'B']);
    });

    it('vida limitada ao máximo bruto', () => {
        const max = getVidaMaxBrutaNpc(ficha());
        expect(max).toBeGreaterThan(0);
        const quase = ficha({ vida: vital(1e9, max - 100) });
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si' }), meuNome: 'Eu', fichas: { Eu: quase } });
        expect(p.receptores[0].vidaNova).toBe(max);
    });

    it('cura cortada por Sangrando (50% por stack)', () => {
        const sangra = ficha({ condicoes: [{ id: 'sangrando', stacks: 1 }] });
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si', cura: { fixo: 100 } }), meuNome: 'Eu', fichas: { Eu: sangra } });
        expect(p.receptores[0].cura.total).toBe(50);
        expect(p.receptores[0].vidaNova).toBe(1e6 + 50 * 1000);
        const p2 = planejarUsoSuporte({ item: itemCura({ alvos: 'si', cura: { fixo: 100 } }), meuNome: 'Eu', fichas: { Eu: ficha({ condicoes: [{ id: 'sangrando', stacks: 2 }] }) } });
        expect(p2.receptores[0].cura.total).toBe(25);
    });

    it('rolar injetado entra na cura por dados', () => {
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si', cura: { dadosQtd: 2, dadosFaces: 6 } }), meuNome: 'Eu', fichas: { Eu: ficha() }, rolar: () => 3 });
        expect(p.receptores[0].cura.total).toBe(6);
    });

    it('buffs são somados em buffsTemporarios existentes (renova mesma origem+nome)', () => {
        const efeitos = [{ atributo: 'forca', propriedade: 'base', valor: 10 }];
        const antigo = [{ id: 'velho', nome: 'Cura Divina', fonte: 'Eu', efeitos, restantes: 1 }, { id: 'outro', nome: 'Outro', fonte: 'Z', efeitos, restantes: 4 }];
        const alvo = ficha({ buffsTemporarios: antigo });
        const item = { id: 'it1', nome: 'Cura Divina', suporte: { buffs: efeitos, alvos: 'aliados', duracao: 5 } };
        const p = planejarUsoSuporte({ item, meuNome: 'Eu', fichas: { Eu: ficha(), Ana: alvo }, aliados: ['Ana'], agora: 1000 });
        const r = p.receptores[0];
        expect(r.cura).toBeNull();
        expect(r.vidaNova).toBeNull();
        expect(r.buffsNovos).toHaveLength(2);
        const novo = r.buffsNovos.find(b => b.nome === 'Cura Divina');
        expect(novo.restantes).toBe(5);
        expect(novo.fonte).toBe('Eu');
        expect(novo.id).toBe('it1_1000_0');
        expect(r.buffsNovos.some(b => b.id === 'outro')).toBe(true);
        expect(alvo.buffsTemporarios).toBe(antigo); // não mutou
    });

    it('erro quando precisa de aliados e nenhum foi escolhido', () => {
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'aliados' }), meuNome: 'Eu', fichas: { Eu: ficha() }, aliados: [] });
        expect(p.erro).toMatch(/aliado/i);
        expect(planejarUsoSuporte({ item: itemCura({ alvos: 'aliados' }), meuNome: 'Eu', fichas: { Eu: ficha() } }).erro).toBeTruthy();
    });

    it('custo em energia: % do máximo exibido da energia escolhida', () => {
        const eu = ficha();
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si', custoPercentual: 10, energia: 'aura' }), meuNome: 'Eu', fichas: { Eu: eu } });
        expect(p.custo).toEqual({ energia: 'aura', valor: Math.floor(getVitalMxDisplay('aura', eu) * 0.1) });
        expect(p.custo.valor).toBeGreaterThan(0);
    });

    it('sem custo percentual o valor é 0', () => {
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si' }), meuNome: 'Eu', fichas: { Eu: ficha() } });
        expect(p.custo.valor).toBe(0);
    });

    it('vida atual inválida não gera vidaNova', () => {
        const p = planejarUsoSuporte({ item: itemCura({ alvos: 'si' }), meuNome: 'Eu', fichas: { Eu: ficha({ vida: vital(1e9, undefined) }) } });
        expect(p.receptores[0].vidaNova).toBeNull();
    });
});

describe('descreverUsoSuporte', () => {
    it('cita quem usou, o item, a cura e os buffs', () => {
        const efeitos = [{ atributo: 'forca', propriedade: 'base', valor: 10 }];
        const item = { id: 'i', nome: 'Hino', suporte: { cura: { fixo: 5 }, buffs: efeitos, alvos: 'si', duracao: 2 } };
        const plano = planejarUsoSuporte({ item, meuNome: 'Eu', fichas: { Eu: ficha() } });
        const txt = descreverUsoSuporte(plano, 'Hino', 'Eu');
        expect(txt).toContain('Eu usou Hino');
        expect(txt).toContain('curou 5');
        expect(txt).toContain('2 turno(s)');
    });
});

describe('usarSuporte', () => {
    const montarCtx = (eu, personagens = {}) => {
        const ref = { ficha: JSON.parse(JSON.stringify(eu)) };
        return {
            ref,
            ctx: {
                meuNome: 'Eu', minhaFicha: eu, personagens,
                updateFicha: vi.fn((fn) => fn(ref.ficha)),
                salvarFichaSilencioso: vi.fn()
            }
        };
    };

    it('aliados são gravados com salvarCamposPersonagem (vida/atual e buffsTemporarios)', () => {
        const efeitos = [{ atributo: 'forca', propriedade: 'base', valor: 10 }];
        const item = { id: 'i', nome: 'Hino', suporte: { cura: { fixo: 5 }, buffs: efeitos, alvos: 'aliados', acao: 'nenhuma' } };
        const { ctx } = montarCtx(ficha(), { Ana: ficha({ vida: vital(1e9, 2e6) }) });
        const r = usarSuporte({ item, aliados: ['Ana'], ctx });
        expect(r.erro).toBeUndefined();
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Ana');
        expect(campos['vida/atual']).toBe(2e6 + 5000);
        expect(campos.buffsTemporarios).toHaveLength(1);
        expect(campos.buffsTemporarios[0].efeitos).toEqual(efeitos);
        // aliado não usa updateFicha
        expect(ctx.updateFicha).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed.mock.calls[0][0]).toMatchObject({ tipo: 'sistema', nome: 'Eu' });
        expect(r.texto).toContain('Ana');
    });

    it('só grava os campos que mudam (cura sem buff não manda buffsTemporarios)', () => {
        const { ctx } = montarCtx(ficha(), { Ana: ficha() });
        usarSuporte({ item: itemCura({ alvos: 'aliados' }), aliados: ['Ana'], ctx });
        const campos = salvarCamposPersonagem.mock.calls[0][1];
        expect(Object.keys(campos)).toEqual(['vida/atual']);
    });

    it('em mim usa updateFicha (vida, buffs) e não chama salvarCamposPersonagem', () => {
        const efeitos = [{ atributo: 'forca', propriedade: 'base', valor: 10 }];
        const item = { id: 'i', nome: 'Hino', suporte: { cura: { fixo: 5 }, buffs: efeitos, alvos: 'si', acao: 'nenhuma', duracao: 4 } };
        const { ctx, ref } = montarCtx(ficha());
        const r = usarSuporte({ item, aliados: [], ctx });
        expect(r.erro).toBeUndefined();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(ctx.updateFicha).toHaveBeenCalledTimes(1);
        expect(ctx.salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(ref.ficha.vida.atual).toBe(1e6 + 5000);
        expect(ref.ficha.buffsTemporarios).toHaveLength(1);
        expect(ref.ficha.buffsTemporarios[0].restantes).toBe(4);
    });

    it('cobra o custo de energia', () => {
        const eu = ficha();
        const plano = planejarUsoSuporte({ item: itemCura({ alvos: 'si', custoPercentual: 10, energia: 'mana' }), meuNome: 'Eu', fichas: { Eu: eu } });
        const { ctx, ref } = montarCtx(eu);
        const r = usarSuporte({ item: itemCura({ alvos: 'si', custoPercentual: 10, energia: 'mana' }), aliados: [], ctx });
        expect(r.erro).toBeUndefined();
        expect(ref.ficha.mana.atual).toBe(1e9 - plano.custo.valor);
        expect(plano.custo.valor).toBeGreaterThan(0);
    });

    it('energia nunca fica negativa', () => {
        const eu = ficha();
        const custo = planejarUsoSuporte({ item: itemCura({ alvos: 'si', custoPercentual: 10 }), meuNome: 'Eu', fichas: { Eu: eu } }).custo.valor;
        const pobre = ficha({ mana: vital(1000, custo) });
        const { ctx, ref } = montarCtx(pobre);
        usarSuporte({ item: itemCura({ alvos: 'si', custoPercentual: 10 }), aliados: [], ctx });
        expect(ref.ficha.mana.atual).toBe(0);
    });

    it('erro sem energia suficiente: nada é gravado', () => {
        const pobre = ficha({ mana: vital(1000, 0) });
        const { ctx } = montarCtx(pobre, { Ana: ficha() });
        const r = usarSuporte({ item: itemCura({ custoPercentual: 10 }), aliados: ['Ana'], ctx });
        expect(r.erro).toMatch(/MANA/);
        expect(ctx.updateFicha).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ctx.salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('erro sem aliados escolhidos: nada é gravado', () => {
        const { ctx } = montarCtx(ficha());
        const r = usarSuporte({ item: itemCura({ alvos: 'aliados' }), aliados: [], ctx });
        expect(r.erro).toBeTruthy();
        expect(ctx.updateFicha).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('cobra a Ação (padrao) de quem usa', () => {
        const { ctx, ref } = montarCtx(ficha());
        const r = usarSuporte({ item: itemCura({ alvos: 'si', acao: 'padrao' }), aliados: [], ctx });
        expect(r.erro).toBeUndefined();
        expect(ref.ficha.acoes.padrao.atual).toBe(ref.ficha.acoes.padrao.max - 1);
    });

    it('acao nenhuma não cobra Ação', () => {
        const { ctx, ref } = montarCtx(ficha());
        usarSuporte({ item: itemCura({ alvos: 'si', acao: 'nenhuma' }), aliados: [], ctx });
        expect(ref.ficha.acoes).toBeUndefined();
    });

    it('Ação em falta pede confirmação; cancelar não grava nada', () => {
        window.confirm = vi.fn(() => false);
        const semAcao = ficha({ acoes: { padrao: { max: 2, atual: 0, extra: 0 }, bonus: { max: 2, atual: 0, extra: 0 }, reacao: { max: 2, atual: 0, extra: 0 } } });
        const { ctx } = montarCtx(semAcao);
        const r = usarSuporte({ item: itemCura({ alvos: 'si', acao: 'padrao' }), aliados: [], ctx });
        expect(window.confirm).toHaveBeenCalled();
        expect(r).toEqual({ cancelado: true });
        expect(ctx.updateFicha).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('Ação em falta e confirmado: usa mesmo assim, sem passar de 0', () => {
        window.confirm = vi.fn(() => true);
        const semAcao = ficha({ acoes: { padrao: { max: 2, atual: 0, extra: 0 }, bonus: { max: 2, atual: 0, extra: 0 }, reacao: { max: 2, atual: 0, extra: 0 } } });
        const { ctx, ref } = montarCtx(semAcao);
        const r = usarSuporte({ item: itemCura({ alvos: 'si', acao: 'padrao' }), aliados: [], ctx });
        expect(r.erro).toBeUndefined();
        expect(ref.ficha.acoes.padrao.atual).toBe(0);
    });

    it('ambos: aliado por salvarCamposPersonagem e eu por updateFicha', () => {
        const { ctx, ref } = montarCtx(ficha(), { Ana: ficha() });
        usarSuporte({ item: itemCura({ alvos: 'ambos' }), aliados: ['Ana'], ctx });
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem.mock.calls[0][0]).toBe('Ana');
        expect(ref.ficha.vida.atual).toBe(1e6 + 5000);
    });
});
