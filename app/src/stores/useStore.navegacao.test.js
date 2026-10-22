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
        st().setAbaAtiva('aba-combate');
        st().setModoNavegacao('orbe');
        expect(st().abaAtiva).toBe('aba-combate');
    });
    it('mesmo modo nao mexe na aba', () => {
        useStore.setState({ modoNavegacao: 'hub', abaAtiva: 'aba-combate' });
        st().setModoNavegacao('hub');
        expect(st().abaAtiva).toBe('aba-combate');
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

describe('setAbaAtiva e o Feed dentro do Combate (guard por combateNaTela)', () => {
    beforeEach(() => { useStore.setState({ combateNaTela: false, fichaPaginaPedida: null }); });
    it('aba-log e ignorado enquanto combateNaTela=true (o Feed ja esta na tela)', () => {
        useStore.setState({ abaAtiva: 'aba-combate', combateNaTela: true });
        st().setAbaAtiva('aba-log');
        expect(st().abaAtiva).toBe('aba-combate');
    });
    it('aba-log e ignorado com combateNaTela=true mesmo estando na Ficha Definitiva (pagina 8)', () => {
        useStore.setState({ abaAtiva: 'aba-Ficha Def', combateNaTela: true });
        st().setAbaAtiva('aba-log');
        expect(st().abaAtiva).toBe('aba-Ficha Def');
    });
    it('aba-combate sem a flag NAO bloqueia aba-log (guard nao e mais por aba)', () => {
        useStore.setState({ abaAtiva: 'aba-combate', combateNaTela: false });
        st().setAbaAtiva('aba-log');
        expect(st().abaAtiva).toBe('aba-log');
    });
    it.each(['aba-Ficha Def', 'aba-combate', 'aba-mapa', 'aba-hub'])('aba-log funciona partindo de %s (flag desligada)', (de) => {
        useStore.setState({ abaAtiva: de });
        st().setAbaAtiva('aba-log');
        expect(st().abaAtiva).toBe('aba-log');
    });
    it('outras abas funcionam mesmo com combateNaTela=true', () => {
        useStore.setState({ abaAtiva: 'aba-Ficha Def', combateNaTela: true });
        st().setAbaAtiva('aba-mapa');
        expect(st().abaAtiva).toBe('aba-mapa');
    });
});

describe('setCombateNaTela', () => {
    it('liga e desliga, convertendo para boolean', () => {
        useStore.setState({ combateNaTela: false });
        st().setCombateNaTela(true);
        expect(st().combateNaTela).toBe(true);
        st().setCombateNaTela(false);
        expect(st().combateNaTela).toBe(false);
        st().setCombateNaTela(1);
        expect(st().combateNaTela).toBe(true);
        st().setCombateNaTela(undefined);
        expect(st().combateNaTela).toBe(false);
    });
});

describe('abrirFichaNaPagina / limparFichaPaginaPedida', () => {
    beforeEach(() => { useStore.setState({ fichaPaginaPedida: null, abaAtiva: 'aba-mapa' }); });
    it('estado inicial sem pedido', () => {
        expect(st().fichaPaginaPedida).toBeNull();
    });
    it('seta o pedido (pagina + capitulo) e leva para a aba Ficha Def', () => {
        st().abrirFichaNaPagina(8, 'ataque');
        expect(st().fichaPaginaPedida).toEqual({ pagina: 8, capitulo: 'ataque' });
        expect(st().abaAtiva).toBe('aba-Ficha Def');
    });
    it('capitulo e opcional (null)', () => {
        st().abrirFichaNaPagina(3);
        expect(st().fichaPaginaPedida).toEqual({ pagina: 3, capitulo: null });
    });
    it('um novo pedido substitui o anterior', () => {
        st().abrirFichaNaPagina(8, 'defesa');
        st().abrirFichaNaPagina(2);
        expect(st().fichaPaginaPedida).toEqual({ pagina: 2, capitulo: null });
    });
    it('limpar zera o pedido e nao mexe na aba', () => {
        st().abrirFichaNaPagina(8, 'testes');
        useStore.setState({ abaAtiva: 'aba-mapa' });
        st().limparFichaPaginaPedida();
        expect(st().fichaPaginaPedida).toBeNull();
        expect(st().abaAtiva).toBe('aba-mapa');
    });
    it('limpar sem pedido e inofensivo', () => {
        expect(() => st().limparFichaPaginaPedida()).not.toThrow();
        expect(st().fichaPaginaPedida).toBeNull();
    });
});
