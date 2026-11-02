import { describe, it, expect } from 'vitest';
import { getPoderDiretoMultiplier } from './poder.js';
import { getBuffs } from './attributes.js';
import { efeitosDaConfigAtiva } from './efeitosItem.js';
import { ATRIBUTOS_AGRUPADOS, ATRIBUTOS_AGRUPADOS_ITEM, getPropriedadesDoAtributo } from './efeitos-constants.js';

const pd = (propriedade, valor) => ({ nome: 'x', atributo: 'poder_direto', propriedade, valor });
const item = (extra) => ({ id: 1, nome: 'Anel', tipo: 'artefato', equipado: true, ...extra });
const ficha = (inventario = [], extra = {}) => ({ poderes: [], seresSelados: [], inventario, ...extra });

describe('opção Poder Direto no Arsenal', () => {
    it('só a lista de itens/formas tem poder_direto; a compartilhada (Combos/Suporte) não', () => {
        const plano = (l) => l.flatMap(g => g.options);
        expect(plano(ATRIBUTOS_AGRUPADOS_ITEM)).toContain('poder_direto');
        expect(plano(ATRIBUTOS_AGRUPADOS)).not.toContain('poder_direto');
    });
    it('aceita as propriedades de multiplicador', () => {
        const props = getPropriedadesDoAtributo('poder_direto');
        ['base', 'mbase', 'mgeral', 'mformas', 'mabs', 'munico'].forEach(p => expect(props).toContain(p));
    });
});

describe('getPoderDiretoMultiplier com itens', () => {
    it('item equipado: MFORMAS +400 e MGERAL +200 multiplicam (1+400)*(1+200)', () => {
        const f = ficha([item({ efeitos: [pd('mformas', 400), pd('mgeral', 200)] })]);
        expect(getPoderDiretoMultiplier(f)).toBe(401 * 201);
    });
    it('item não equipado não conta', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ equipado: false, efeitos: [pd('mgeral', 5)] })]))).toBe(1);
    });
    it('efeitos ativos respeitam o toggle; passivos sempre valem', () => {
        const base = { efeitos: [pd('mgeral', 2)], efeitosPassivos: [pd('mbase', 1)] };
        expect(getPoderDiretoMultiplier(ficha([item({ ...base, efeitosAtivos: false })]))).toBe(2);
        expect(getPoderDiretoMultiplier(ficha([item(base)]))).toBe(2 * 3);
    });
    it('munico de item multiplica', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ efeitos: [pd('munico', 3)] })]))).toBe(3);
    });
});

describe('Forma Mística (Susano\'o): ativar e desativar', () => {
    const formas = [{ id: 'f1', nome: "Susano'o (Fase 1)", acumulaFormaBase: true, efeitos: [], efeitosPassivos: [], configs: [
        { id: 'c1', nome: 'Padrão', efeitos: [pd('mformas', 9)], efeitosPassivos: [] },
        { id: 'c2', nome: 'Total', efeitos: [pd('mformas', 19)], efeitosPassivos: [] }
    ] }];

    it('Forma de item ativa entra; desativada (null) sai', () => {
        const ligada = ficha([item({ formas, formaAtivaId: 'f1', configAtivaId: 'c1' })]);
        expect(getPoderDiretoMultiplier(ligada)).toBe(10);
        const desligada = ficha([item({ formas, formaAtivaId: null, configAtivaId: null })]);
        expect(getPoderDiretoMultiplier(desligada)).toBe(1);
    });
    it('usa a configuração escolhida, ou a primeira se não houver', () => {
        expect(getPoderDiretoMultiplier(ficha([item({ formas, formaAtivaId: 'f1', configAtivaId: 'c2' })]))).toBe(20);
        expect(getPoderDiretoMultiplier(ficha([item({ formas, formaAtivaId: 'f1' })]))).toBe(10);
    });
    it('Forma de Poder: só vale ativa', () => {
        const poder = { id: 'p', nome: "Susano'o", formas, formaAtivaId: 'f1', configAtivaId: 'c1' };
        expect(getPoderDiretoMultiplier(ficha([], { poderes: [poder] }))).toBe(10);
        expect(getPoderDiretoMultiplier(ficha([], { poderes: [{ ...poder, formaAtivaId: null, configAtivaId: null }] }))).toBe(1);
    });
    it('Forma de Pacto sincronizado conta; Pacto desligado não', () => {
        const ser = { id: 's', nome: 'Pacto', ativo: true, formas, formaAtivaId: 'f1', configAtivaId: 'c1' };
        expect(getPoderDiretoMultiplier(ficha([], { seresSelados: [ser] }))).toBe(10);
        expect(getPoderDiretoMultiplier(ficha([], { seresSelados: [{ ...ser, ativo: false }] }))).toBe(1);
    });
    it('acumulaFormaBase=false esconde os efeitos base do item', () => {
        const f2 = [{ ...formas[0], acumulaFormaBase: false }];
        const f = ficha([item({ efeitos: [pd('mgeral', 99)], formas: f2, formaAtivaId: 'f1', configAtivaId: 'c1' })]);
        expect(getPoderDiretoMultiplier(f)).toBe(10);
    });
    it('efeitosDaConfigAtiva devolve null sem Forma ativa', () => {
        expect(efeitosDaConfigAtiva({ formas, formaAtivaId: null })).toBeNull();
        expect(efeitosDaConfigAtiva(null)).toBeNull();
    });
    it('getBuffs aplica a Config da Forma de um Poder e para ao desativar', () => {
        const formasForca = [{ id: 'f1', nome: 'F', configs: [{ id: 'c1', nome: 'P', efeitos: [{ nome: 'x', atributo: 'forca', propriedade: 'base', valor: 50 }], efeitosPassivos: [] }] }];
        const base = { poderes: [{ id: 'p', nome: 'P', formas: formasForca, formaAtivaId: 'f1', configAtivaId: 'c1' }], inventario: [] };
        expect(getBuffs(base, 'forca').base).toBe(50);
        const off = { poderes: [{ ...base.poderes[0], formaAtivaId: null, configAtivaId: null }], inventario: [] };
        expect(getBuffs(off, 'forca').base).toBe(0);
    });
});
