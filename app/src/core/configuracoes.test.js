import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    CHAVE_CONFIG, CHAVE_VOLUME_MUSICA, PADROES_CONFIG, lerConfig, salvarConfig, restaurarConfig, assinarConfig,
    lerVolumeMusica, salvarVolumeMusica, assinarVolumeMusica, aplicarConfigVisual, fracaoVolumeVozes, fracaoVolumeSexta
} from './configuracoes';

beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.zoom = '';
    document.body.className = '';
});

describe('lerConfig', () => {
    it('sem nada salvo devolve os padroes (copia)', () => {
        const c = lerConfig();
        expect(c).toEqual(PADROES_CONFIG);
        c.volumeVozes = 1;
        expect(PADROES_CONFIG.volumeVozes).toBe(100);
    });
    it('JSON corrompido devolve padroes', () => {
        localStorage.setItem(CHAVE_CONFIG, '{quebrado');
        expect(lerConfig()).toEqual(PADROES_CONFIG);
    });
    it.each(['null', '"x"', '12', '[]'])('conteudo %s devolve padroes', (v) => {
        localStorage.setItem(CHAVE_CONFIG, v);
        expect(lerConfig()).toEqual(PADROES_CONFIG);
    });
    it('le valores validos', () => {
        localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ volumeVozes: 40, volumeSexta: 10, tamanhoInterface: 110, reduzirAnimacoes: true }));
        expect(lerConfig()).toEqual({ volumeVozes: 40, volumeSexta: 10, tamanhoInterface: 110, reduzirAnimacoes: true });
    });
    it('storage injetado', () => {
        expect(lerConfig({ getItem: () => JSON.stringify({ volumeVozes: 5 }) }).volumeVozes).toBe(5);
    });
});

describe('limites e normalizacao', () => {
    it('limita volume a 0-100 e tamanho a 80-130', () => {
        expect(salvarConfig({ volumeVozes: 500 }).volumeVozes).toBe(100);
        expect(salvarConfig({ volumeVozes: -20 }).volumeVozes).toBe(0);
        expect(salvarConfig({ volumeSexta: 101 }).volumeSexta).toBe(100);
        expect(salvarConfig({ tamanhoInterface: 10 }).tamanhoInterface).toBe(80);
        expect(salvarConfig({ tamanhoInterface: 999 }).tamanhoInterface).toBe(130);
    });
    it('valores nos limites exatos sao mantidos', () => {
        expect(salvarConfig({ tamanhoInterface: 80 }).tamanhoInterface).toBe(80);
        expect(salvarConfig({ tamanhoInterface: 130 }).tamanhoInterface).toBe(130);
        expect(salvarConfig({ volumeVozes: 0 }).volumeVozes).toBe(0);
    });
    it('arredonda decimais', () => {
        expect(salvarConfig({ volumeVozes: 33.6 }).volumeVozes).toBe(34);
    });
    it('aceita numero em texto', () => {
        expect(salvarConfig({ volumeVozes: '42' }).volumeVozes).toBe(42);
    });
    it.each([['abc'], [NaN], [Infinity], [null], [undefined], [''], [{}]])('valor ruim %s mantem o valor anterior', (ruim) => {
        salvarConfig({ volumeVozes: 30 });
        expect(salvarConfig({ volumeVozes: ruim }).volumeVozes).toBe(30);
    });
    it('reduzirAnimacoes so aceita booleano (outros tipos mantem o anterior)', () => {
        expect(salvarConfig({ reduzirAnimacoes: true }).reduzirAnimacoes).toBe(true);
        expect(salvarConfig({ reduzirAnimacoes: 'sim' }).reduzirAnimacoes).toBe(true);
        expect(salvarConfig({ reduzirAnimacoes: 0 }).reduzirAnimacoes).toBe(true);
        expect(salvarConfig({ reduzirAnimacoes: false }).reduzirAnimacoes).toBe(false);
        expect(salvarConfig({ reduzirAnimacoes: 'sim' }).reduzirAnimacoes).toBe(false);
    });
    it('valores ruins ja gravados sao normalizados na leitura', () => {
        localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ volumeVozes: 900, volumeSexta: 'lixo', tamanhoInterface: 1, reduzirAnimacoes: 'x' }));
        expect(lerConfig()).toEqual({ volumeVozes: 100, volumeSexta: 100, tamanhoInterface: 80, reduzirAnimacoes: false });
    });
    it('campos desconhecidos nao sao persistidos', () => {
        salvarConfig({ hack: 1 });
        expect(JSON.parse(localStorage.getItem(CHAVE_CONFIG))).toEqual(PADROES_CONFIG);
    });
});

describe('salvarConfig / restaurarConfig / ouvintes', () => {
    it('grava em rpg_config preservando outros campos', () => {
        salvarConfig({ volumeVozes: 20 });
        salvarConfig({ volumeSexta: 70 });
        expect(JSON.parse(localStorage.getItem('rpg_config'))).toEqual({ ...PADROES_CONFIG, volumeVozes: 20, volumeSexta: 70 });
    });
    it('notifica ouvintes com a config nova', () => {
        const fn = vi.fn();
        const sair = assinarConfig(fn);
        const nova = salvarConfig({ volumeVozes: 55 });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith(nova);
        sair();
    });
    it('notifica varios ouvintes', () => {
        const a = vi.fn(); const b = vi.fn();
        const sa = assinarConfig(a); const sb = assinarConfig(b);
        salvarConfig({ tamanhoInterface: 90 });
        expect(a).toHaveBeenCalled(); expect(b).toHaveBeenCalled();
        sa(); sb();
    });
    it('cancelar a assinatura para as notificacoes', () => {
        const fn = vi.fn();
        const sair = assinarConfig(fn);
        sair();
        salvarConfig({ volumeVozes: 1 });
        restaurarConfig();
        expect(fn).not.toHaveBeenCalled();
    });
    it('falha de storage nao lanca e ainda notifica', () => {
        const fn = vi.fn();
        const sair = assinarConfig(fn);
        const ruim = { getItem: () => null, setItem: () => { throw new Error('cheio'); } };
        expect(salvarConfig({ volumeVozes: 9 }, ruim).volumeVozes).toBe(9);
        expect(fn).toHaveBeenCalledTimes(1);
        sair();
    });
    it('restaurar remove a chave, devolve padroes e notifica', () => {
        salvarConfig({ volumeVozes: 5, reduzirAnimacoes: true });
        const fn = vi.fn();
        const sair = assinarConfig(fn);
        const r = restaurarConfig();
        expect(localStorage.getItem(CHAVE_CONFIG)).toBeNull();
        expect(r).toEqual(PADROES_CONFIG);
        expect(fn).toHaveBeenCalledWith(PADROES_CONFIG);
        expect(lerConfig()).toEqual(PADROES_CONFIG);
        sair();
    });
});

describe('fracoes de volume', () => {
    it('convertem para 0-1', () => {
        expect(fracaoVolumeVozes({ volumeVozes: 50 })).toBe(0.5);
        expect(fracaoVolumeSexta({ volumeSexta: 0 })).toBe(0);
    });
    it('sem argumento leem do storage', () => {
        salvarConfig({ volumeVozes: 25, volumeSexta: 75 });
        expect(fracaoVolumeVozes()).toBe(0.25);
        expect(fracaoVolumeSexta()).toBe(0.75);
    });
    it('padrao e 1', () => { expect(fracaoVolumeVozes()).toBe(1); });
});

describe('volume da musica', () => {
    it('padrao 60', () => { expect(lerVolumeMusica()).toBe(60); });
    it('salva e le, na chave rpg_volume_musica', () => {
        expect(salvarVolumeMusica(35)).toBe(35);
        expect(localStorage.getItem(CHAVE_VOLUME_MUSICA)).toBe('35');
        expect(lerVolumeMusica()).toBe(35);
    });
    it('limita 0-100 ao salvar', () => {
        expect(salvarVolumeMusica(250)).toBe(100);
        expect(salvarVolumeMusica(-5)).toBe(0);
        expect(lerVolumeMusica()).toBe(0);
    });
    it('valor ruim ao salvar vira 0', () => {
        expect(salvarVolumeMusica('abc')).toBe(0);
        expect(salvarVolumeMusica(undefined)).toBe(0);
    });
    it('arredonda ao salvar', () => { expect(salvarVolumeMusica(40.6)).toBe(41); });
    it('valor salvo fora da faixa e limitado na leitura', () => {
        localStorage.setItem(CHAVE_VOLUME_MUSICA, '900');
        expect(lerVolumeMusica()).toBe(100);
        localStorage.setItem(CHAVE_VOLUME_MUSICA, '-4');
        expect(lerVolumeMusica()).toBe(0);
    });
    it('valor salvo ilegivel cai em 60', () => {
        localStorage.setItem(CHAVE_VOLUME_MUSICA, 'lixo');
        expect(lerVolumeMusica()).toBe(60);
    });
    it('notifica ouvintes e permite cancelar', () => {
        const fn = vi.fn();
        const sair = assinarVolumeMusica(fn);
        salvarVolumeMusica(20);
        expect(fn).toHaveBeenCalledWith(20);
        sair();
        salvarVolumeMusica(30);
        expect(fn).toHaveBeenCalledTimes(1);
    });
    it('nao interfere nos ouvintes de config', () => {
        const fn = vi.fn();
        const sair = assinarConfig(fn);
        salvarVolumeMusica(20);
        expect(fn).not.toHaveBeenCalled();
        sair();
    });
});

describe('aplicarConfigVisual', () => {
    it('aplica zoom no documentElement', () => {
        aplicarConfigVisual({ tamanhoInterface: 120, reduzirAnimacoes: false });
        expect(document.documentElement.style.zoom).toBe('1.2');
    });
    it('zoom 80 vira 0.8', () => {
        aplicarConfigVisual({ tamanhoInterface: 80, reduzirAnimacoes: false });
        expect(document.documentElement.style.zoom).toBe('0.8');
    });
    it('100% limpa o zoom', () => {
        document.documentElement.style.zoom = '1.3';
        aplicarConfigVisual({ tamanhoInterface: 100, reduzirAnimacoes: false });
        expect(document.documentElement.style.zoom).toBe('');
    });
    it('liga e desliga a classe reduzir-animacoes no body preservando outras', () => {
        document.body.className = 'theme-cyber';
        aplicarConfigVisual({ tamanhoInterface: 100, reduzirAnimacoes: true });
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(true);
        expect(document.body.classList.contains('theme-cyber')).toBe(true);
        aplicarConfigVisual({ tamanhoInterface: 100, reduzirAnimacoes: false });
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(false);
        expect(document.body.classList.contains('theme-cyber')).toBe(true);
    });
    it('sem argumento le do storage', () => {
        salvarConfig({ tamanhoInterface: 110, reduzirAnimacoes: true });
        aplicarConfigVisual();
        expect(document.documentElement.style.zoom).toBe('1.1');
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(true);
    });
    it('restaurar e reaplicar volta ao normal', () => {
        salvarConfig({ tamanhoInterface: 110, reduzirAnimacoes: true });
        aplicarConfigVisual();
        aplicarConfigVisual(restaurarConfig());
        expect(document.documentElement.style.zoom).toBe('');
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(false);
    });
    it('aceita documento injetado e nao mexe no global', () => {
        const doc = document.implementation.createHTMLDocument('x');
        aplicarConfigVisual({ tamanhoInterface: 90, reduzirAnimacoes: true }, doc);
        expect(doc.documentElement.style.zoom).toBe('0.9');
        expect(doc.body.classList.contains('reduzir-animacoes')).toBe(true);
        expect(document.documentElement.style.zoom).toBe('');
    });
    it('documento sem body so aplica zoom; documento invalido nao lanca', () => {
        const doc = { documentElement: { style: {} }, body: null };
        aplicarConfigVisual({ tamanhoInterface: 90, reduzirAnimacoes: true }, doc);
        expect(doc.documentElement.style.zoom).toBe('0.9');
        expect(() => aplicarConfigVisual({ tamanhoInterface: 90 }, {})).not.toThrow();
    });
});
