import { describe, it, expect } from 'vitest';
import { detalharRegeneracao } from './regeneracaoFontes';
import { aplicarRegeneracaoDeTurno, FATOR_EXIBICAO_VITAIS } from './vitals';

function fichaBase(extra = {}) {
    return {
        vida: { base: 1000000, atual: 0 }, mana: { base: 1000000, atual: 0 }, aura: { base: 1000000, atual: 0 },
        chakra: { base: 1000000, atual: 0 }, corpo: { base: 1000000, atual: 0 },
        bio: {}, poderes: [], inventario: [], passivas: [], seresSelados: [],
        ...extra
    };
}
const ef = (atributo, valor) => ({ propriedade: 'regeneracao', atributo, valor });

describe('detalharRegeneracao', () => {
    it('lista fontes por nome e soma manual + buffs', () => {
        const f = fichaBase({
            vida: { base: 1000000, atual: 0, regeneracaoPct: 2 },
            poderes: [{ nome: 'Cura Lunar', ativa: true, efeitos: [ef('vida', 3)], efeitosPassivos: [] }, { nome: 'Desligado', ativa: false, efeitos: [ef('vida', 9)] }],
            inventario: [{ nome: 'Anel', equipado: true, efeitos: [], efeitosPassivos: [ef('todas_energias', 1)] }],
            passivas: [{ nome: 'Vigor', efeitos: [ef('geral', 1)] }]
        });
        const d = detalharRegeneracao(f);
        expect(d.vida.manualPct).toBe(2);
        expect(d.vida.fontes.map(x => x.nome).sort()).toEqual(['Cura Lunar', 'Vigor']);
        expect(d.vida.pctTotal).toBe(6);
        expect(d.mana.fontes.map(x => x.nome).sort()).toEqual(['Anel', 'Vigor']);
        expect(d.mana.pctTotal).toBe(2);
    });

    it('limita a 100% e negativos reduzem o saldo', () => {
        const f = fichaBase({ passivas: [{ nome: 'Mega', efeitos: [ef('mana', 150)] }, { nome: 'Ruim', efeitos: [ef('mana', -5)] }] });
        const d = detalharRegeneracao(f).mana;
        expect(d.pctBruto).toBe(145);
        expect(d.cortes.map(x => x.nome)).toEqual(['Ruim']);
        expect(d.pctTotal).toBe(100);
        expect(d.avisos.length).toBe(1);
    });

    it('estados cortam só a Vida', () => {
        const f = fichaBase({ vida: { base: 1000000, atual: 0, regeneracaoPct: 10 }, mana: { base: 1000000, atual: 0, regeneracaoPct: 10 }, condicoes: [{ id: 'sangrando', stacks: 1 }] });
        const d = detalharRegeneracao(f);
        expect(d.vida.corteEstados.mult).toBe(0.5);
        expect(d.vida.corteEstados.estados[0].id).toBe('sangrando');
        expect(d.vida.pontosPorTurno).toBeCloseTo(d.mana.pontosPorTurno / 2);
        expect(d.mana.corteEstados).toBeNull();
    });

    it('bate com a cura real de aplicarRegeneracaoDeTurno', () => {
        const f = fichaBase({
            vida: { base: 1000000, atual: 0, regeneracaoPct: 4 },
            mana: { base: 1000000, atual: 0, regeneracaoPct: 7 },
            poderes: [{ nome: 'P', ativa: true, efeitos: [ef('todas_energias', 2), ef('vida', 1)] }],
            condicoes: [{ id: 'queimado', stacks: 2 }]
        });
        const d = detalharRegeneracao(f);
        const real = JSON.parse(JSON.stringify(f));
        aplicarRegeneracaoDeTurno(real);
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach((k) => {
            expect(real[k].atual / FATOR_EXIBICAO_VITAIS).toBeCloseTo(d[k].pontosPorTurno, 4);
        });
    });

    it('cura passiva soma na cura TOTAL em % do teto, junto da Regeneração', () => {
        const f = fichaBase({
            vida: { base: 1000000, atual: 0, regeneracaoPct: 5 },
            poderes: [{ nome: 'Benção', ativa: true, efeitos: [], suporte: { modo: 'passivo', cura: { fixo: 1000 } } }]
        });
        const v = detalharRegeneracao(f).vida;
        expect(v.pctTotal).toBe(5);
        expect(v.curaPassiva.total).toBe(1000);
        expect(v.pctCuraPassiva).toBeCloseTo((1000 / v.tetoExibido) * 100, 1);
        expect(v.pctTotalComCura).toBeCloseTo(5 + (1000 / v.tetoExibido) * 100, 1);
        expect(v.totalPontos).toBeCloseTo(v.pontosPorTurno + 1000, 4);
    });
    it('com estado cortando a cura, Regeneração (cortada) + cura passiva = total', () => {
        const f = fichaBase({
            vida: { base: 1000000, atual: 0, regeneracaoPct: 10 },
            poderes: [{ nome: 'Benção', ativa: true, efeitos: [], suporte: { modo: 'passivo', cura: { fixo: 1000 } } }],
            condicoes: [{ id: 'sangrando', stacks: 1 }]
        });
        const v = detalharRegeneracao(f).vida;
        expect(v.pctRegenCortada).toBeCloseTo(5, 1);
        expect(v.pctTotalComCura).toBeCloseTo(v.pctRegenCortada + v.pctCuraPassiva, 1);
    });
    it('teto 0: cura total 0, sem divisão por zero', () => {
        const v = detalharRegeneracao(fichaBase({ vida: { base: 0, atual: 0 } })).vida;
        expect(v.pctTotalComCura).toBe(0);
    });
    it('sem cura passiva a cura total é só a Regeneração', () => {
        const v = detalharRegeneracao(fichaBase({ vida: { base: 1000000, atual: 0, regeneracaoPct: 4 } })).vida;
        expect(v.pctTotalComCura).toBeCloseTo(4, 1);
        expect(v.pctCuraPassiva).toBe(0);
    });
});

describe('detalharRegeneracao: cura passiva de energias', () => {
    it('energia ganha % do suporte passivo no total e nos pontos; Vida nao muda', () => {
        const f = fichaBase({
            mana: { base: 1000000, atual: 0, regeneracaoPct: 2 },
            poderes: [{ nome: 'Fonte', ativa: true, efeitos: [], suporte: { modo: 'passivo', cura: { energias: { mana: 5 } } } }]
        });
        const d = detalharRegeneracao(f);
        expect(d.mana.pctCuraPassiva).toBeCloseTo(5, 1);
        expect(d.mana.curaPassiva.partes.map(p => p.nome)).toEqual(['Fonte']);
        expect(d.mana.pctTotalComCura).toBeCloseTo(7, 1);
        expect(d.mana.totalPontos).toBeCloseTo(d.mana.pontosPorTurno + d.mana.curaPassiva.total, 4);
        expect(d.aura.pctCuraPassiva).toBe(0);
        expect(d.vida.curaPassiva.total).toBe(0);
    });
});
