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
});
