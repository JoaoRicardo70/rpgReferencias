import { describe, it, expect } from 'vitest';
import { calcularAcerto } from './engine';
import {
    normalizarProficienciaPorEnergia, energiaDoGolpe, resolverProficienciaPorEnergia, atualizarProficienciaPorEnergia, rotuloEnergiaProficiencia,
} from './proficienciaEnergia';

const ficha = (extra = {}) => ({ forca: { base: 120000, nome: 'Força' }, mana: { base: 1000000 }, ...extra });
const acerto = (minhaFicha, extra = {}) => calcularAcerto({ qD: 0, fD: 20, prof: 2, bonus: 0, sels: ['forca'], minhaFicha, itensEquipados: [], ...extra });

describe('proficienciaPorEnergia - normalizacao', () => {
    it('mantem so energias validas com numero >= 0', () => {
        expect(normalizarProficienciaPorEnergia({ mana: '5', aura: 5, chakra: -1, corpo: '', fogo: 9, x: 1 })).toEqual({ mana: 5, aura: 5 });
        expect(normalizarProficienciaPorEnergia(null)).toEqual({});
        expect(normalizarProficienciaPorEnergia('abc')).toEqual({});
    });
    it('atualizar uma energia: define, apaga e some quando vazio', () => {
        expect(atualizarProficienciaPorEnergia(undefined, 'mana', '5')).toEqual({ mana: 5 });
        expect(atualizarProficienciaPorEnergia({ mana: 5, corpo: 2 }, 'mana', '')).toEqual({ corpo: 2 });
        expect(atualizarProficienciaPorEnergia({ mana: 5 }, 'mana', '')).toBeUndefined();
        expect(atualizarProficienciaPorEnergia({ mana: 5 }, 'fogo', '3')).toEqual({ mana: 5 });
    });
    it('aceita 0 como valor legitimo', () => {
        expect(atualizarProficienciaPorEnergia({}, 'corpo', '0')).toEqual({ corpo: 0 });
    });
});

describe('energiaDoGolpe', () => {
    it('explicita vence; invalida e ignorada', () => {
        expect(energiaDoGolpe(ficha(), 'AURA')).toBe('aura');
        expect(energiaDoGolpe(ficha(), 'fogo')).toBeNull();
    });
    it('arma com % de energia, depois poder ativo que gasta energia', () => {
        expect(energiaDoGolpe(ficha({ ataqueConfig: { armaPercEnergia: 10, armaEnergiaCombustao: 'chakra' } }))).toBe('chakra');
        expect(energiaDoGolpe(ficha({ ataqueConfig: { armaPercEnergia: 0, armaEnergiaCombustao: 'chakra' } }))).toBeNull();
        expect(energiaDoGolpe(ficha({ poderes: [{ ativa: true, custoPercentual: 5, energiaCombustao: 'aura' }] }))).toBe('aura');
        expect(energiaDoGolpe(ficha({ poderes: [{ ativa: false, custoPercentual: 5, energiaCombustao: 'aura' }] }))).toBeNull();
    });
});

describe('resolverProficienciaPorEnergia', () => {
    it('sem tabela ou sem energia conhecida: usa a base', () => {
        expect(resolverProficienciaPorEnergia(ficha(), 2, 'mana')).toEqual({ valor: 2, energia: null });
        expect(resolverProficienciaPorEnergia(ficha({ proficienciaPorEnergia: {} }), 2, 'mana')).toEqual({ valor: 2, energia: null });
        expect(resolverProficienciaPorEnergia(ficha({ proficienciaPorEnergia: { mana: 5 } }), 2)).toEqual({ valor: 2, energia: null });
        expect(resolverProficienciaPorEnergia(ficha({ proficienciaPorEnergia: { mana: 5 } }), 2, 'corpo')).toEqual({ valor: 2, energia: null });
    });
    it('energia presente na tabela vence a base', () => {
        expect(resolverProficienciaPorEnergia(ficha({ proficienciaPorEnergia: { mana: 5, corpo: 2 } }), 3, 'mana')).toEqual({ valor: 5, energia: 'mana' });
    });
    it('rotulo', () => expect(rotuloEnergiaProficiencia('mana')).toBe('Mana'));
});

describe('calcularAcerto com Proficiencia por energia', () => {
    it('REGRESSAO: sem o campo o resultado e identico ao antigo (texto e total)', () => {
        const r = acerto(ficha());
        expect(r.acertoTotal).toBe(22);
        expect(r.profBonusTexto).toContain('| Prof: +2');
        const comVazio = acerto(ficha({ proficienciaPorEnergia: {} }), { energia: 'mana' });
        expect(comVazio.acertoTotal).toBe(22);
        expect(comVazio.profBonusTexto).toBe(r.profBonusTexto);
    });
    it('com a energia na tabela troca a Prof e escreve "Prof (N, energia)"', () => {
        const f = ficha({ proficienciaPorEnergia: { mana: 5, corpo: 2 } });
        const r = acerto(f, { energia: 'mana' });
        expect(r.acertoTotal).toBe(25);
        expect(r.profBonusTexto).toContain('Prof (5, Mana)');
        expect(acerto(f, { energia: 'chakra' }).acertoTotal).toBe(22);
    });
    it('Proficiencia desligada (usarProf false / prof 0) nao ganha nada', () => {
        const f = ficha({ proficienciaPorEnergia: { mana: 5 } });
        expect(acerto(f, { prof: 0, usarProf: false, energia: 'mana' }).acertoTotal).toBe(20);
        expect(acerto(f, { prof: 0, energia: 'mana' }).acertoTotal).toBe(20);
    });
    it('usarProf true com base 0 aplica a da energia', () => {
        const f = ficha({ proficienciaPorEnergia: { mana: 5 } });
        expect(acerto(f, { prof: 0, usarProf: true, energia: 'mana' }).acertoTotal).toBe(25);
    });
    it('descobre a energia pelo ataque configurado quando nao e informada', () => {
        const f = ficha({ proficienciaPorEnergia: { aura: 7 }, poderes: [{ ativa: true, custoPercentual: 3, energiaCombustao: 'aura' }] });
        expect(acerto(f).acertoTotal).toBe(27);
    });
});
