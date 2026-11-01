import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    enviarParaFeed: vi.fn()
}));

import { planejarUsoSuporte, usarSuporte } from './suporte';
import { salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';

const buff = { atributo: 'evasiva', propriedade: 'base', valor: 7 };
const ficha = () => ({
    vida: { base: 1000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: 10 },
    acoes: { padrao: { max: 1, atual: 1 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } },
    buffsTemporarios: []
});

describe('planejarUsoSuporte / usarSuporte', () => {
    beforeEach(() => vi.clearAllMocks());

    it('recusa suporte passivo', () => {
        const item = { id: 'p', nome: 'Aura', suporte: { modo: 'passivo', buffs: [buff] } };
        const r = planejarUsoSuporte({ item, meuNome: 'Eu', fichas: { Eu: ficha() } });
        expect(r.erro).toMatch(/passivo/i);
        expect(r.receptores).toBeUndefined();
    });

    it('usarSuporte nao grava nada com suporte passivo', () => {
        const updateFicha = vi.fn();
        const salvarFichaSilencioso = vi.fn();
        const item = { id: 'p', nome: 'Aura', suporte: { modo: 'passivo', cura: { fixo: 100 } } };
        const r = usarSuporte({ item, aliados: [], ctx: { meuNome: 'Eu', minhaFicha: ficha(), personagens: {}, updateFicha, salvarFichaSilencioso } });
        expect(r.erro).toMatch(/passivo/i);
        expect(updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('recusa item sem suporte', () => {
        expect(planejarUsoSuporte({ item: { id: 'x', nome: 'x' }, meuNome: 'Eu', fichas: { Eu: ficha() } }).erro).toBeTruthy();
    });

    it.each([
        ['turnos', { duracao: 4 }, 4, undefined],
        ['combate', { duracao: 4 }, 0, true],
        ['permanente', { duracao: 4 }, 0, undefined]
    ])('grava duracaoModo %s no buff do receptor', (modo, extra, restantes, ate) => {
        const item = { id: 'u', nome: 'Bencao', suporte: { buffs: [buff], alvos: 'si', acao: 'nenhuma', duracaoModo: modo, ...extra } };
        const r = planejarUsoSuporte({ item, meuNome: 'Eu', fichas: { Eu: ficha() }, agora: 1 });
        expect(r.erro).toBeUndefined();
        expect(r.suporte.duracaoModo).toBe(modo);
        const b = r.receptores[0].buffsNovos[0];
        expect(b.restantes).toBe(restantes);
        expect(b.ateFimCombate).toBe(ate);
    });

    it('dados antigos (so duracao) viram buff por turnos / permanente', () => {
        const mk = (duracao) => planejarUsoSuporte({ item: { id: 'u', nome: 'B', suporte: { buffs: [buff], alvos: 'si', duracao } }, meuNome: 'Eu', fichas: { Eu: ficha() } });
        expect(mk(3).receptores[0].buffsNovos[0].restantes).toBe(3);
        expect(mk(0).receptores[0].buffsNovos[0].restantes).toBe(0);
        expect(mk(0).receptores[0].buffsNovos[0].ateFimCombate).toBeUndefined();
    });

    it('usarSuporte de uso aplica o buff com a flag ateFimCombate na ficha local', () => {
        const eu = ficha();
        const updateFicha = vi.fn((cb) => cb(eu));
        const item = { id: 'u', nome: 'Bencao', suporte: { buffs: [buff], alvos: 'si', acao: 'nenhuma', duracaoModo: 'combate' } };
        const r = usarSuporte({ item, aliados: [], ctx: { meuNome: 'Eu', minhaFicha: eu, personagens: {}, updateFicha, salvarFichaSilencioso: vi.fn() } });
        expect(r.erro).toBeUndefined();
        expect(eu.buffsTemporarios[0].ateFimCombate).toBe(true);
        expect(r.texto).toContain('até o fim do combate');
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });
});
