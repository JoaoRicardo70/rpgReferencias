import { describe, it, expect, vi } from 'vitest';
import { imuneAoEstado, ATRIBUTOS_COM_QUANDO } from './efeitosCondicionais.js';
import { resolverEstadosNoAlvo, descreverResolucao } from './estadosGolpe.js';
import { getPropriedadesDoAtributo, ATRIBUTOS_AGRUPADOS } from './efeitos-constants.js';

const imune = (valor = 1, extra = {}) => ({ nome: 'Nao surpreendido', atributo: 'imune_surpresa', propriedade: 'base', valor, ...extra });

describe('imune_surpresa: constantes', () => {
    it('so propriedade base, no grupo de rolagens, aceita quando', () => {
        expect(getPropriedadesDoAtributo('imune_surpresa')).toEqual(['base']);
        expect(ATRIBUTOS_AGRUPADOS.find(g => /ROLAGENS/.test(g.label)).options).toContain('imune_surpresa');
        expect(ATRIBUTOS_COM_QUANDO).toContain('imune_surpresa');
    });
});

describe('imuneAoEstado', () => {
    it('Poder ativo com efeito protege; inativo nao (so passivos)', () => {
        expect(imuneAoEstado({ poderes: [{ ativa: true, efeitos: [imune()] }] }, 'surpreso')).toBe(true);
        expect(imuneAoEstado({ poderes: [{ ativa: false, efeitos: [imune()] }] }, 'surpreso')).toBe(false);
        expect(imuneAoEstado({ poderes: [{ ativa: false, efeitosPassivos: [imune()] }] }, 'surpreso')).toBe(true);
    });
    it('Passiva protege', () => {
        expect(imuneAoEstado({ passivas: [{ efeitos: [imune()] }] }, 'surpreso')).toBe(true);
    });
    it('Item equipado protege; nao equipado nao', () => {
        expect(imuneAoEstado({ inventario: [{ equipado: true, efeitos: [imune()] }] }, 'surpreso')).toBe(true);
        expect(imuneAoEstado({ inventario: [{ equipado: false, efeitos: [imune()] }] }, 'surpreso')).toBe(false);
    });
    it('Pacto ativo protege; inativo nao', () => {
        expect(imuneAoEstado({ seresSelados: [{ ativo: true, efeitos: [imune()] }] }, 'surpreso')).toBe(true);
        expect(imuneAoEstado({ seresSelados: [{ ativo: false, efeitos: [imune()] }] }, 'surpreso')).toBe(false);
    });
    it('valor 0 ou negativo nao protege; soma que fica <= 0 nao protege', () => {
        expect(imuneAoEstado({ passivas: [{ efeitos: [imune(0)] }] }, 'surpreso')).toBe(false);
        expect(imuneAoEstado({ passivas: [{ efeitos: [imune(-1)] }] }, 'surpreso')).toBe(false);
        expect(imuneAoEstado({ passivas: [{ efeitos: [imune(1), imune(-1)] }] }, 'surpreso')).toBe(false);
    });
    it('efeito com quando nao satisfeito nao protege; satisfeito protege', () => {
        expect(imuneAoEstado({ iniciativa: 0, passivas: [{ efeitos: [imune(1, { quando: 'em_combate' })] }] }, 'surpreso')).toBe(false);
        expect(imuneAoEstado({ iniciativa: 10, passivas: [{ efeitos: [imune(1, { quando: 'em_combate' })] }] }, 'surpreso')).toBe(true);
        expect(imuneAoEstado({ passivas: [{ efeitos: [imune(1, { quando: 'alvo_com_estado:surpreso' })] }] }, 'surpreso')).toBe(false);
    });
    it('outro estado, estado inexistente ou sem id => false', () => {
        const f = { passivas: [{ efeitos: [imune()] }] };
        expect(imuneAoEstado(f, 'lento')).toBe(false);
        expect(imuneAoEstado(f, 'xyz')).toBe(false);
        expect(imuneAoEstado(f, undefined)).toBe(false);
    });
    it('ficha null/undefined/vazia => false', () => {
        expect(imuneAoEstado(null, 'surpreso')).toBe(false);
        expect(imuneAoEstado(undefined, 'surpreso')).toBe(false);
        expect(imuneAoEstado({}, 'surpreso')).toBe(false);
    });
});

describe('resolverEstadosNoAlvo com imunidade', () => {
    const alvoImune = { passivas: [{ efeitos: [imune()] }] };
    const rolar = () => { throw new Error('nao deveria rolar'); };

    it('surpreso bloqueado sem rolar teste, mesmo com teste definido', () => {
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1, origem: 'Golpe', teste: { atributo: 'forca', cd: 10 } }], alvoImune, { rolar });
        expect(r.aplicados).toEqual([]);
        expect(r.resistidos).toEqual([]);
        expect(r.imunes).toEqual([{ id: 'surpreso', origem: 'Golpe' }]);
    });
    it('bloqueado tambem com apenasCritico e critico', () => {
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1, apenasCritico: true }], alvoImune, { critico: true, rolar });
        expect(r.aplicados).toEqual([]);
        expect(r.imunes).toEqual([{ id: 'surpreso', origem: '' }]);
    });
    it('apenasCritico sem critico continua sendo pulado (nao vira imune)', () => {
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1, apenasCritico: true }], alvoImune, { critico: false, rolar });
        expect(r.pulados).toBe(1);
        expect(r.imunes).toBeUndefined();
    });
    it('outros estados do mesmo golpe continuam aplicando', () => {
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1 }, { id: 'lento', stacks: 2, origem: 'X' }], alvoImune);
        expect(r.aplicados).toEqual([{ id: 'lento', stacks: 2, origem: 'X' }]);
        expect(r.imunes).toHaveLength(1);
    });
    it('sem fichaAlvo (Dummie) aplica', () => {
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1 }], null);
        expect(r.aplicados).toHaveLength(1);
        expect(r.imunes).toBeUndefined();
    });
    it('alvo sem imunidade aplica e a chave imunes nao existe', () => {
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1 }], { passivas: [] });
        expect(r.aplicados).toHaveLength(1);
        expect('imunes' in r).toBe(false);
    });
    it('alvo imune: so o outro estado rola teste', () => {
        const rolar2 = vi.fn(() => 1);
        const r = resolverEstadosNoAlvo([{ id: 'surpreso', stacks: 1, teste: { atributo: 'forca', cd: 5 } }, { id: 'lento', stacks: 1, teste: { atributo: 'forca', cd: 5 } }], alvoImune, { rolar: rolar2 });
        expect(rolar2).toHaveBeenCalledTimes(1);
        expect(r.imunes).toHaveLength(1);
    });
});

describe('descreverResolucao com imunes', () => {
    it('acrescenta "é imune a 😲 Surpreso"', () => {
        const t = descreverResolucao({ aplicados: [], resistidos: [], pulados: 0, imunes: [{ id: 'surpreso', origem: '' }] }, 'Ana');
        expect(t).toContain('é imune a');
        expect(t).toContain('Surpreso');
        expect(t).toContain('😲');
    });
    it('junta com aplicados por " · " e sem imunes nao menciona', () => {
        const t = descreverResolucao({ aplicados: [{ id: 'lento', stacks: 1 }], resistidos: [], pulados: 0, imunes: [{ id: 'surpreso' }] }, 'Ana');
        expect(t).toMatch(/Ana ficou com.* · é imune a/);
        expect(descreverResolucao({ aplicados: [{ id: 'lento', stacks: 1 }], resistidos: [], pulados: 0 }, 'Ana')).not.toContain('imune');
    });
    it('so imunes: texto nao fica vazio', () => {
        expect(descreverResolucao({ aplicados: [], resistidos: [], pulados: 0, imunes: [{ id: 'surpreso' }] })).toMatch(/^é imune a/);
    });
});
