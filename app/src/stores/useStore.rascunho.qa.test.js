import { describe, it, expect, beforeEach } from 'vitest';
import useStore from './useStore';

describe('useStore — rascunhosPoder', () => {
    beforeEach(() => { useStore.setState({ rascunhosPoder: {} }); });

    it('começa como objeto vazio', () => {
        expect(useStore.getState().rascunhosPoder).toEqual({});
    });
    it('setRascunhoPoder grava por chave', () => {
        useStore.getState().setRascunhoPoder('A|forma', { nome: 'x' });
        expect(useStore.getState().rascunhosPoder['A|forma']).toEqual({ nome: 'x' });
    });
    it('chaves distintas não se misturam; sobrescrever mantém as outras', () => {
        const s = useStore.getState();
        s.setRascunhoPoder('A|forma', { nome: '1' });
        s.setRascunhoPoder('A|poder', { nome: '2' });
        s.setRascunhoPoder('A|forma', { nome: '3' });
        expect(useStore.getState().rascunhosPoder).toEqual({ 'A|forma': { nome: '3' }, 'A|poder': { nome: '2' } });
    });
    it('aceita string (chave da aba)', () => {
        useStore.getState().setRascunhoPoder('A|_aba', 'forma');
        expect(useStore.getState().rascunhosPoder['A|_aba']).toBe('forma');
    });
    it('limparRascunhoPoder remove só a chave pedida', () => {
        const s = useStore.getState();
        s.setRascunhoPoder('A|forma', { nome: '1' });
        s.setRascunhoPoder('A|poder', { nome: '2' });
        s.limparRascunhoPoder('A|forma');
        expect(Object.keys(useStore.getState().rascunhosPoder)).toEqual(['A|poder']);
    });
    it('limpar chave inexistente é no-op', () => {
        useStore.getState().setRascunhoPoder('A|poder', { nome: '2' });
        expect(() => useStore.getState().limparRascunhoPoder('nao-existe')).not.toThrow();
        expect(useStore.getState().rascunhosPoder).toEqual({ 'A|poder': { nome: '2' } });
    });
    it('funciona mesmo se rascunhosPoder estiver undefined', () => {
        useStore.setState({ rascunhosPoder: undefined });
        expect(() => useStore.getState().limparRascunhoPoder('x')).not.toThrow();
        useStore.getState().setRascunhoPoder('x', { a: 1 });
        expect(useStore.getState().rascunhosPoder.x).toEqual({ a: 1 });
    });
    it('chave vazia: após limpar, a chave não existe mais (nem fica undefined)', () => {
        useStore.getState().setRascunhoPoder('A|forma', { nome: 'x' });
        useStore.getState().limparRascunhoPoder('A|forma');
        expect('A|forma' in useStore.getState().rascunhosPoder).toBe(false);
    });
    it('rascunho não vaza para minhaFicha (só memória)', () => {
        useStore.getState().setRascunhoPoder('A|forma', { nome: 'x' });
        expect(JSON.stringify(useStore.getState().minhaFicha)).not.toContain('rascunhosPoder');
    });
});
