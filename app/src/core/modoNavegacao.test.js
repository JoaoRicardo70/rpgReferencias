import { describe, it, expect } from 'vitest';
import {
    MODOS_NAVEGACAO, modoNavegacaoValido, lerModoNavegacao, salvarModoNavegacao, CHAVE_NAVEGACAO,
    LARGURAS_GAVETA, lerLarguraGaveta, proximaLarguraGaveta, cssLarguraGaveta, CHAVE_LARGURA_GAVETA,
    MODOS_HUB, modoHubDaAba
} from './modoNavegacao';
import { GRUPOS_NAVEGACAO } from './navegacao';

const storageFalso = (valor) => ({ getItem: () => valor, setItem: () => {} });
const storageQueLanca = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };

describe('modoNavegacaoValido', () => {
    it.each(['orbe', 'mesa', 'hub', 'barra'])('aceita %s', (id) => expect(modoNavegacaoValido(id)).toBe(true));
    it.each([undefined, null, '', 'ORBE', 'xyz', 0, {}, []])('rejeita %s', (id) => expect(modoNavegacaoValido(id)).toBe(false));
    it('lista 4 modos', () => expect(MODOS_NAVEGACAO.map(m => m.id)).toEqual(['orbe', 'mesa', 'hub', 'barra']));
});

describe('lerModoNavegacao', () => {
    it('padrao orbe sem nada salvo', () => expect(lerModoNavegacao(storageFalso(null))).toBe('orbe'));
    it('le o valor salvo', () => expect(lerModoNavegacao(storageFalso('hub'))).toBe('hub'));
    it('valor invalido cai no padrao', () => expect(lerModoNavegacao(storageFalso('lixo'))).toBe('orbe'));
    it('storage que lanca cai no padrao', () => expect(lerModoNavegacao(storageQueLanca)).toBe('orbe'));
    it('usa localStorage quando nao ha storage', () => {
        localStorage.clear();
        expect(lerModoNavegacao()).toBe('orbe');
        localStorage.setItem(CHAVE_NAVEGACAO, 'barra');
        expect(lerModoNavegacao()).toBe('barra');
        localStorage.clear();
    });
});

describe('salvarModoNavegacao', () => {
    it('invalido retorna false e nao grava', () => {
        localStorage.clear();
        expect(salvarModoNavegacao('xyz')).toBe(false);
        expect(localStorage.getItem(CHAVE_NAVEGACAO)).toBeNull();
    });
    it('valido grava e retorna true', () => {
        localStorage.clear();
        expect(salvarModoNavegacao('mesa')).toBe(true);
        expect(localStorage.getItem('rpg_navegacao')).toBe('mesa');
        localStorage.clear();
    });
    it('storage que lanca retorna false', () => expect(salvarModoNavegacao('hub', storageQueLanca)).toBe(false));
});

describe('largura da gaveta', () => {
    it('ler: padrao media, invalido e erro', () => {
        expect(lerLarguraGaveta(storageFalso(null))).toBe('media');
        expect(lerLarguraGaveta(storageFalso('gigante'))).toBe('media');
        expect(lerLarguraGaveta(storageQueLanca)).toBe('media');
        expect(lerLarguraGaveta(storageFalso('larga'))).toBe('larga');
        expect(CHAVE_LARGURA_GAVETA).toBe('rpg_mesa_gaveta');
    });
    it('proxima cicla estreita > media > larga > estreita', () => {
        expect(proximaLarguraGaveta('estreita')).toBe('media');
        expect(proximaLarguraGaveta('media')).toBe('larga');
        expect(proximaLarguraGaveta('larga')).toBe('estreita');
    });
    it('proxima de id desconhecido nao quebra', () => {
        expect(LARGURAS_GAVETA.map(l => l.id)).toContain(proximaLarguraGaveta('???'));
    });
    it('css por id e padrao media', () => {
        expect(cssLarguraGaveta('estreita')).toBe('380px');
        expect(cssLarguraGaveta('media')).toBe('52vw');
        expect(cssLarguraGaveta('larga')).toBe('66vw');
        expect(cssLarguraGaveta('zzz')).toBe('52vw');
        expect(cssLarguraGaveta(undefined)).toBe('52vw');
    });
});

describe('modoHubDaAba / MODOS_HUB', () => {
    it('acha o modo da aba', () => {
        expect(modoHubDaAba('aba-ataque')).toBeNull(); // abas removidas: moraram na Ficha (pagina 8)
        expect(modoHubDaAba('aba-combate').id).toBe('combate');
        expect(MODOS_HUB.find(m => m.id === 'combate').abas).toEqual(['aba-combate']);
        expect(modoHubDaAba('aba-grimorio').id).toBe('ficha');
        expect(modoHubDaAba('aba-log').id).toBe('social');
        expect(modoHubDaAba('aba-perfil').id).toBe('perfil');
    });
    it('aba desconhecida, hub e mestre retornam null', () => {
        expect(modoHubDaAba('aba-nada')).toBeNull();
        expect(modoHubDaAba('aba-hub')).toBeNull();
        expect(modoHubDaAba('aba-mestre')).toBeNull();
        expect(modoHubDaAba(undefined)).toBeNull();
    });
    it('os modos cobrem todas as abas de navegacao (sem repeticao)', () => {
        const todas = GRUPOS_NAVEGACAO.flatMap(g => g.abas.map(a => a.id));
        const cobertas = MODOS_HUB.flatMap(m => m.abas);
        todas.forEach(id => expect(cobertas, id).toContain(id));
        expect(new Set(cobertas).size).toBe(cobertas.length);
        cobertas.forEach(id => expect(todas, id).toContain(id));
    });
});
