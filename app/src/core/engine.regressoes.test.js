import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcularAcerto, calcularReducao } from './engine';
import useStore from '../stores/useStore';

const fichaBase = () => ({
    forca: { base: 1000000, nome: 'Força' },
    mana: { base: 1000000, atual: 1000000 },
});

describe('engine - calcularAcerto com atributo ausente na ficha', () => {
    beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('não lança e usa a chave em maiúsculas como nome', () => {
        let r;
        expect(() => {
            r = calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['energiaEsp'], minhaFicha: fichaBase(), itensEquipados: [] });
        }).not.toThrow();
        expect(r.atributosUsados).toBe('ENERGIAESP');
    });

    it('mistura atributo existente (nome da ficha) e ausente', () => {
        const r = calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca', 'energiaEsp'], minhaFicha: fichaBase(), itensEquipados: [] });
        expect(r.atributosUsados).toBe('Força + ENERGIAESP');
    });
});

describe('engine - calcularReducao com energia ausente na ficha', () => {
    it('não lança com energia sem atual (retorna erro de energia)', () => {
        let r;
        expect(() => {
            r = calcularReducao({ energiaKey: 'energiaEsp', perc: 50, multBase: 1, minhaFicha: fichaBase(), itensEquipados: [], rE: 0 });
        }).not.toThrow();
        expect(r).toBeDefined();
    });

    it('com custo zero usa a chave em maiúsculas como nome', () => {
        let r;
        expect(() => {
            r = calcularReducao({ energiaKey: 'energiaEsp', perc: 0, multBase: 1, minhaFicha: fichaBase(), itensEquipados: [], rE: 0 });
        }).not.toThrow();
        expect(JSON.stringify(r)).toContain('ENERGIAESP');
    });
});

describe('engine - calcularAcerto: Maestria não duplica nome da arma', () => {
    const estadoOriginal = useStore.getState();
    beforeEach(() => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        useStore.setState({
            isMestre: true,
            minhaFicha: {
                ...estadoOriginal.minhaFicha,
                compendioOverrides: { classes: { guerreiro: { efeitosMatematicos: [
                    { propriedade: 'proficiencia_arma', atributo: 'Espada', valor: 3 },
                    { propriedade: 'proficiencia_arma', atributo: 'Espada', valor: 2 },
                ] } } },
            },
        });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        useStore.setState({ isMestre: estadoOriginal.isMestre, minhaFicha: estadoOriginal.minhaFicha });
    });

    it('dois efeitos para o mesmo tipo de arma somam o bônus mas listam o nome uma vez', () => {
        const ficha = { ...fichaBase(), bio: { classe: 'Guerreiro' } };
        const r = calcularAcerto({
            qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: ficha,
            itensEquipados: [{ tipo: 'arma', nome: 'Katana', armaTipo: 'Espada' }],
        });
        expect(r.profBonusTexto).toContain('Maestria (ESPADA): +5');
        expect(r.profBonusTexto).not.toContain('ESPADA, ESPADA');
    });
});
