import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    VOLUME_MAXIMO_VOZ, VOLUME_PADRAO_VOZ, lerVolumeVoz, salvarVolumeVoz, assinarVolumesVoz, idDeVoz
} from '../core/volumesVoz';

beforeEach(() => { localStorage.clear(); });

describe('volumesVoz - lerVolumeVoz', () => {
    it('constantes: padrao 2 e maximo 4', () => {
        expect(VOLUME_PADRAO_VOZ).toBe(2);
        expect(VOLUME_MAXIMO_VOZ).toBe(4);
    });

    it('retorna 2 quando nada foi salvo', () => {
        expect(lerVolumeVoz('Ana')).toBe(2);
    });

    it('le a chave rpg_vol2_<nome>', () => {
        localStorage.setItem('rpg_vol2_Ana', '3.5');
        expect(lerVolumeVoz('Ana')).toBe(3.5);
        expect(lerVolumeVoz('Outro')).toBe(2);
    });

    it('limita a [0, 4]', () => {
        localStorage.setItem('rpg_vol2_Ana', '9');
        expect(lerVolumeVoz('Ana')).toBe(4);
        localStorage.setItem('rpg_vol2_Ana', '-3');
        expect(lerVolumeVoz('Ana')).toBe(0);
    });

    it('aceita valores de fronteira 0 e 4', () => {
        localStorage.setItem('rpg_vol2_Ana', '0');
        expect(lerVolumeVoz('Ana')).toBe(0);
        localStorage.setItem('rpg_vol2_Ana', '4');
        expect(lerVolumeVoz('Ana')).toBe(4);
    });

    it('ignora a chave legada rpg_vol_<nome>', () => {
        localStorage.setItem('rpg_vol_Ana', '0.3');
        expect(lerVolumeVoz('Ana')).toBe(2);
    });

    it('valor salvo invalido volta ao padrao', () => {
        localStorage.setItem('rpg_vol2_Ana', 'abc');
        expect(lerVolumeVoz('Ana')).toBe(2);
        localStorage.setItem('rpg_vol2_Ana', '');
        expect(lerVolumeVoz('Ana')).toBe(2);
        localStorage.setItem('rpg_vol2_Ana', 'NaN');
        expect(lerVolumeVoz('Ana')).toBe(2);
    });

    it('Infinity salvo nao e finito e volta ao padrao', () => {
        localStorage.setItem('rpg_vol2_Ana', 'Infinity');
        expect(lerVolumeVoz('Ana')).toBe(2);
    });

    it('localStorage lancando erro retorna o padrao', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
        expect(lerVolumeVoz('Ana')).toBe(2);
        spy.mockRestore();
    });
});

describe('volumesVoz - salvarVolumeVoz / assinarVolumesVoz', () => {
    it('grava em rpg_vol2_<nome> e nao toca na chave legada', () => {
        salvarVolumeVoz('Ana', 1.5);
        expect(localStorage.getItem('rpg_vol2_Ana')).toBe('1.5');
        expect(localStorage.getItem('rpg_vol_Ana')).toBeNull();
        expect(lerVolumeVoz('Ana')).toBe(1.5);
    });

    it('notifica assinantes com (nome, volume)', () => {
        const fn = vi.fn();
        const cancelar = assinarVolumesVoz(fn);
        salvarVolumeVoz('Ana', 3);
        expect(fn).toHaveBeenCalledWith('Ana', 3);
        cancelar();
    });

    it('unsubscribe para de notificar', () => {
        const fn = vi.fn();
        const cancelar = assinarVolumesVoz(fn);
        salvarVolumeVoz('Ana', 1);
        cancelar();
        salvarVolumeVoz('Ana', 2);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('vários assinantes recebem a notificacao', () => {
        const a = vi.fn(); const b = vi.fn();
        const ca = assinarVolumesVoz(a); const cb = assinarVolumesVoz(b);
        salvarVolumeVoz('Zed', 0);
        expect(a).toHaveBeenCalledWith('Zed', 0);
        expect(b).toHaveBeenCalledWith('Zed', 0);
        ca(); cb();
    });

    it('ainda notifica se o localStorage falhar ao gravar', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
        const fn = vi.fn();
        const cancelar = assinarVolumesVoz(fn);
        expect(() => salvarVolumeVoz('Ana', 2)).not.toThrow();
        expect(fn).toHaveBeenCalledWith('Ana', 2);
        cancelar();
        spy.mockRestore();
    });
});

describe('volumesVoz - idDeVoz', () => {
    it('normaliza para minusculas alfanumericas com prefixo', () => {
        expect(idDeVoz('Heroi Teste')).toBe('anime-rpg-heroiteste');
        expect(idDeVoz('João_99!')).toBe('anime-rpg-joo99');
    });

    it('nome vazio/nulo/undefined gera apenas o prefixo', () => {
        expect(idDeVoz('')).toBe('anime-rpg-');
        expect(idDeVoz(null)).toBe('anime-rpg-');
        expect(idDeVoz(undefined)).toBe('anime-rpg-');
    });
});
