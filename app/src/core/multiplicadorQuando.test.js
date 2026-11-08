import { describe, it, expect } from 'vitest';
import { getBuffs } from './attributes';
import { getPoderDiretoMultiplier, getGlobalMultipliers } from './poder';
import {
    ehPropriedadeMultiplicador, opcoesQuandoPara, normalizarQuandoMultiplicador, passaQuandoMultiplicador, OPCOES_QUANDO,
} from './efeitosCondicionais';
import { montarPromptImportacao, prepararItemImportado } from './importadorIA';
import { normalizarPoder } from './sextaFeiraCriacao';

const ef = (extra) => ({ nome: 'x', atributo: 'forca', propriedade: 'mgeral', valor: '2', ...extra });
const fichaCom = (efeitos, extra = {}) => ({
    forca: { base: 1000, nome: 'Força' }, iniciativa: 0, inventario: [],
    poderes: [{ id: 'p1', nome: 'P', ativa: true, efeitos }], ...extra,
});
const direto = (extra) => ({ nome: 'd', atributo: 'poder_direto', propriedade: 'mgeral', valor: '3', ...extra });

describe('helpers de multiplicador com quando', () => {
    it('reconhece as propriedades de multiplicador', () => {
        ['mbase', 'mgeral', 'mformas', 'mabs', 'munico', 'MGERAL'].forEach(p => expect(ehPropriedadeMultiplicador(p)).toBe(true));
        ['base', 'reducaocusto', '', undefined].forEach(p => expect(ehPropriedadeMultiplicador(p)).toBe(false));
    });
    it('opcoes: multiplicador so oferece Sempre, Em combate e Empunhando; as demais ficam inteiras', () => {
        expect(opcoesQuandoPara('mgeral').map(o => o.id)).toEqual(['sempre', 'em_combate', 'empunhando_arma']);
        expect(opcoesQuandoPara('base')).toBe(OPCOES_QUANDO);
    });
    it('normalizacao: aceita as permitidas e rejeita as de alvo', () => {
        expect(normalizarQuandoMultiplicador('')).toBe('');
        expect(normalizarQuandoMultiplicador('sempre')).toBe('');
        expect(normalizarQuandoMultiplicador('Em_Combate')).toBe('em_combate');
        expect(normalizarQuandoMultiplicador('empunhando_arma:Espada')).toBe('empunhando_arma:espada');
        expect(normalizarQuandoMultiplicador('alvo_com_estado:surpreso')).toBeNull();
        expect(normalizarQuandoMultiplicador('alvo_vida_abaixo:50')).toBeNull();
        expect(normalizarQuandoMultiplicador('lixo')).toBeNull();
    });
    it('passaQuandoMultiplicador: alvo nunca vale, mesmo com contexto de alvo', () => {
        const ctx = { emCombate: true, temArma: true, armaTipos: ['espada'], alvoEstados: ['surpreso'], alvoVidaPct: 10 };
        expect(passaQuandoMultiplicador({}, {})).toBe(true);
        expect(passaQuandoMultiplicador({ quando: 'em_combate' }, ctx)).toBe(true);
        expect(passaQuandoMultiplicador({ quando: 'em_combate' }, { emCombate: false })).toBe(false);
        expect(passaQuandoMultiplicador({ quando: 'empunhando_arma:espada' }, ctx)).toBe(true);
        expect(passaQuandoMultiplicador({ quando: 'empunhando_arma:lanca' }, ctx)).toBe(false);
        expect(passaQuandoMultiplicador({ quando: 'alvo_com_estado:surpreso' }, ctx)).toBe(false);
        expect(passaQuandoMultiplicador({ quando: 'alvo_vida_abaixo:50' }, ctx)).toBe(false);
    });
});

describe('getBuffs - multiplicador com quando', () => {
    it('REGRESSAO: sem quando (e com quando vazio/sempre) da exatamente os mesmos numeros', () => {
        const base = getBuffs(fichaCom([ef(), ef({ propriedade: 'mformas', valor: '1.5' }), ef({ propriedade: 'munico', valor: '2' })]), 'forca');
        expect(base.mgeral).toBe(2); expect(base.mformas).toBe(1.5); expect(base.munico).toEqual([2]);
        const com = getBuffs(fichaCom([ef({ quando: '' }), ef({ propriedade: 'mformas', valor: '1.5', quando: 'sempre' }), ef({ propriedade: 'munico', valor: '2' })]), 'forca');
        expect(com.mgeral).toBe(base.mgeral); expect(com.mformas).toBe(base.mformas); expect(com.munico).toEqual(base.munico);
        expect(com._hasBuff).toEqual(base._hasBuff);
    });
    it('em_combate: so vale com iniciativa ativa', () => {
        const efs = [ef({ quando: 'em_combate' })];
        expect(getBuffs(fichaCom(efs, { iniciativa: 0 }), 'forca')._hasBuff.mgeral).toBe(false);
        expect(getBuffs(fichaCom(efs, { iniciativa: 0 }), 'forca')._hasBuff.mgeral).toBe(false);
        const b = getBuffs(fichaCom(efs, { iniciativa: 12 }), 'forca');
        expect(b.mgeral).toBe(2); expect(b._hasBuff.mgeral).toBe(true);
    });
    it('empunhando_arma e empunhando_arma:tipo', () => {
        const arma = { equipado: true, tipo: 'arma', armaTipo: 'Espada', nome: 'E' };
        expect(getBuffs(fichaCom([ef({ quando: 'empunhando_arma' })]), 'forca')._hasBuff.mgeral).toBe(false);
        expect(getBuffs(fichaCom([ef({ quando: 'empunhando_arma' })], { inventario: [arma] }), 'forca').mgeral).toBe(2);
        expect(getBuffs(fichaCom([ef({ quando: 'empunhando_arma:espada' })], { inventario: [arma] }), 'forca').mgeral).toBe(2);
        expect(getBuffs(fichaCom([ef({ quando: 'empunhando_arma:lanca' })], { inventario: [arma] }), 'forca')._hasBuff.mgeral).toBe(false);
    });
    it('condicao de alvo ja salva NAO aplica o multiplicador', () => {
        const f = fichaCom([ef({ quando: 'alvo_com_estado:surpreso' }), ef({ propriedade: 'mabs', quando: 'alvo_vida_abaixo:50' })], { iniciativa: 5 });
        const b = getBuffs(f, 'forca');
        expect(b._hasBuff.mgeral).toBe(false); expect(b._hasBuff.mabs).toBe(false);
    });
    it('quando em efeito que NAO e multiplicador continua sem ser lido por getBuffs (comportamento antigo)', () => {
        const f = fichaCom([{ nome: 'b', atributo: 'forca', propriedade: 'base', valor: '10', quando: 'em_combate' }]);
        expect(getBuffs(f, 'forca').base).toBe(10);
    });
});

describe('getPoderDiretoMultiplier - multiplicador com quando', () => {
    it('REGRESSAO: sem quando = mesmo numero de sempre', () => {
        const f = fichaCom([direto(), direto({ propriedade: 'mabs', valor: '1' }), direto({ propriedade: 'munico', valor: '2' })]);
        expect(getPoderDiretoMultiplier(f)).toBe((1 + 3) * (1 + 1) * 2);
        expect(getPoderDiretoMultiplier(fichaCom([direto({ quando: 'sempre' })]))).toBe(4);
        expect(getPoderDiretoMultiplier({ poderes: [] })).toBe(1);
    });
    it('em_combate e arma', () => {
        expect(getPoderDiretoMultiplier(fichaCom([direto({ quando: 'em_combate' })], { iniciativa: 0 }))).toBe(1);
        expect(getPoderDiretoMultiplier(fichaCom([direto({ quando: 'em_combate' })], { iniciativa: 3 }))).toBe(4);
        const arma = { equipado: true, tipo: 'arma', armaTipo: 'espada', nome: 'E' };
        expect(getPoderDiretoMultiplier(fichaCom([direto({ quando: 'empunhando_arma:espada' })], { inventario: [arma] }))).toBe(4);
    });
    it('alvo ja salvo nao aplica', () => {
        expect(getPoderDiretoMultiplier(fichaCom([direto({ quando: 'alvo_com_estado:surpreso' })], { iniciativa: 3 }))).toBe(1);
    });
    it('Poder Calculado (getGlobalMultipliers) acompanha o getBuffs', () => {
        const comPassiva = (efs, extra) => ({ forca: { base: 1000 }, inventario: [], poderes: [], passivas: [{ nome: 'pa', efeitos: efs }], ...extra });
        const efD = (extra) => ({ nome: 'x', atributo: 'dano', propriedade: 'mgeral', valor: '2', ...extra });
        const fora = getGlobalMultipliers(comPassiva([efD({ quando: 'em_combate' })], { iniciativa: 0 }));
        const dentro = getGlobalMultipliers(comPassiva([efD({ quando: 'em_combate' })], { iniciativa: 4 }));
        const semQuando = getGlobalMultipliers(comPassiva([efD()], { iniciativa: 0 }));
        expect(dentro.totalDano).toBeGreaterThan(fora.totalDano);
        expect(semQuando.totalDano).toBe(dentro.totalDano);
    });
});

describe('importador / Sexta-Feira: quando em multiplicador', () => {
    it('o prompt explica a restricao', () => {
        const p = montarPromptImportacao('poder');
        expect(p).toMatch(/MULTIPLICADORES o "quando" só aceita "em_combate" e "empunhando_arma"/);
    });
    it('normalizarPoder: multiplicador aceita em_combate e descarta condicao de alvo com aviso', () => {
        const ok = normalizarPoder({ nome: 'P', efeitos: [{ nome: 'm', atributo: 'forca', propriedade: 'mgeral', valor: 2, quando: 'em_combate' }] });
        expect(ok.objeto.efeitos[0].quando).toBe('em_combate');
        const ruim = normalizarPoder({ nome: 'P', efeitos: [{ nome: 'm', atributo: 'forca', propriedade: 'mgeral', valor: 2, quando: 'alvo_com_estado:surpreso' }] });
        expect(ruim.objeto.efeitos || []).toHaveLength(0);
        expect(ruim.avisos.join(' ')).toMatch(/em_combate ou empunhando_arma/);
    });
    it('normalizarPoder: efeito sem quando continua igual', () => {
        const r = normalizarPoder({ nome: 'P', efeitos: [{ nome: 'm', atributo: 'forca', propriedade: 'mgeral', valor: 2 }] });
        expect('quando' in r.objeto.efeitos[0]).toBe(false);
    });
    it('prepararItemImportado: multiplicador pendente carrega o quando permitido; o de alvo vai para naoAplicado', () => {
        const r = prepararItemImportado({ nome: 'X', descricao: 'd', multiplicadores: [
            { nome: 'a', atributo: 'forca', valor: 2, tipo: 'geral', quando: 'empunhando_arma:espada' },
            { nome: 'b', atributo: 'forca', valor: 3, tipo: 'geral', quando: 'alvo_vida_abaixo:30' },
            { nome: 'c', atributo: 'forca', valor: 4, tipo: 'geral' },
        ] });
        const pend = r.objeto.efeitosIncertos;
        expect(pend).toHaveLength(2);
        expect(pend[0].quando).toBe('empunhando_arma:espada');
        expect('quando' in pend[1]).toBe(false);
        expect(r.naoAplicado.join(' ')).toMatch(/alvo_vida_abaixo/);
    });
});
