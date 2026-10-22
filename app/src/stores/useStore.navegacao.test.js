import { describe, it, expect, beforeEach } from 'vitest';
import useStore from './useStore';

const st = () => useStore.getState();
beforeEach(() => {
    localStorage.clear();
    useStore.setState({ modoNavegacao: 'orbe', abaAtiva: 'aba-Ficha Def', larguraGaveta: 'media' });
});

describe('setModoNavegacao', () => {
    it('persiste em rpg_navegacao', () => {
        st().setModoNavegacao('barra');
        expect(st().modoNavegacao).toBe('barra');
        expect(localStorage.getItem('rpg_navegacao')).toBe('barra');
    });
    it('invalido nao muda nada', () => {
        st().setModoNavegacao('xyz');
        expect(st().modoNavegacao).toBe('orbe');
        expect(st().abaAtiva).toBe('aba-Ficha Def');
        expect(localStorage.getItem('rpg_navegacao')).toBeNull();
    });
    it('hub leva a aba-hub', () => {
        st().setModoNavegacao('hub');
        expect(st().abaAtiva).toBe('aba-hub');
    });
    it('mesa leva a aba-mapa', () => {
        st().setModoNavegacao('mesa');
        expect(st().abaAtiva).toBe('aba-mapa');
    });
    it('sair do hub estando em aba-hub vai pra Ficha Def', () => {
        st().setModoNavegacao('hub');
        st().setModoNavegacao('barra');
        expect(st().abaAtiva).toBe('aba-Ficha Def');
    });
    it('sair do hub em outra aba mantem a aba', () => {
        st().setModoNavegacao('hub');
        st().setAbaAtiva('aba-ataque');
        st().setModoNavegacao('orbe');
        expect(st().abaAtiva).toBe('aba-ataque');
    });
    it('mesmo modo nao mexe na aba', () => {
        useStore.setState({ modoNavegacao: 'hub', abaAtiva: 'aba-ataque' });
        st().setModoNavegacao('hub');
        expect(st().abaAtiva).toBe('aba-ataque');
        useStore.setState({ modoNavegacao: 'mesa', abaAtiva: 'aba-perfil' });
        st().setModoNavegacao('mesa');
        expect(st().abaAtiva).toBe('aba-perfil');
    });
    it('orbe/barra a partir de outra aba nao mexe na aba', () => {
        useStore.setState({ abaAtiva: 'aba-perfil' });
        st().setModoNavegacao('barra');
        expect(st().abaAtiva).toBe('aba-perfil');
    });
});

describe('setLarguraGaveta', () => {
    it('muda e persiste', () => {
        st().setLarguraGaveta('larga');
        expect(st().larguraGaveta).toBe('larga');
        expect(localStorage.getItem('rpg_mesa_gaveta')).toBe('larga');
    });
});

describe('setAbaAtiva e o Feed dentro do Combate', () => {
    it('aba-log e ignorado quando a aba ativa e aba-combate', () => {
        useStore.setState({ abaAtiva: 'aba-combate' });
        st().setAbaAtiva('aba-log');
        expect(st().abaAtiva).toBe('aba-combate');
    });
    it.each(['aba-Ficha Def', 'aba-ataque', 'aba-mapa', 'aba-hub'])('aba-log funciona partindo de %s', (de) => {
        useStore.setState({ abaAtiva: de });
        st().setAbaAtiva('aba-log');
        expect(st().abaAtiva).toBe('aba-log');
    });
    it('outras abas funcionam a partir de aba-combate', () => {
        useStore.setState({ abaAtiva: 'aba-combate' });
        st().setAbaAtiva('aba-mapa');
        expect(st().abaAtiva).toBe('aba-mapa');
    });
});
