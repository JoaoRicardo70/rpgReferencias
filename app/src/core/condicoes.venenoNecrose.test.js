import { describe, it, expect } from 'vitest';
import { danoDeEstadosNoTurno, resumoDosEstados, DANO_POR_TURNO, descreverDanoDeEstados } from './condicoes.js';

const um = () => 1;

describe('Envenenado e Necrosado: dano no começo do turno', () => {
    it('tabela de dados por stack', () => {
        expect(DANO_POR_TURNO.envenenado).toEqual({ qtd: 5, faces: 4 });
        expect(DANO_POR_TURNO.necrosado).toEqual({ qtd: 8, faces: 4 });
    });

    it('Envenenado 1 stack = 5d4', () => {
        const r = danoDeEstadosNoTurno({ condicoes: [{ id: 'envenenado', stacks: 1 }] }, um);
        expect(r.partes).toEqual([{ id: 'envenenado', stacks: 1, dado: '5d4', dano: 5 }]);
        expect(r.total).toBe(5);
    });

    it('Envenenado 3 stacks = 15d4', () => {
        const r = danoDeEstadosNoTurno({ condicoes: [{ id: 'envenenado', stacks: 3 }] }, um);
        expect(r.partes[0].dado).toBe('15d4');
        expect(r.total).toBe(15);
    });

    it('Necrosado 1 stack = 8d4 e 2 stacks = 16d4', () => {
        expect(danoDeEstadosNoTurno({ condicoes: [{ id: 'necrosado', stacks: 1 }] }, um).partes[0].dado).toBe('8d4');
        const r = danoDeEstadosNoTurno({ condicoes: [{ id: 'necrosado', stacks: 2 }] }, () => 4);
        expect(r.partes[0].dado).toBe('16d4');
        expect(r.total).toBe(64);
    });

    it('stacks acima do máximo são cortados em 6', () => {
        const r = danoDeEstadosNoTurno({ condicoes: [{ id: 'necrosado', stacks: 99 }] }, um);
        expect(r.partes[0].dado).toBe('48d4');
        expect(r.total).toBe(48);
    });

    it('rolar recebe 4 faces', () => {
        const faces = new Set();
        danoDeEstadosNoTurno({ condicoes: [{ id: 'envenenado', stacks: 1 }, { id: 'necrosado', stacks: 1 }] }, (f) => { faces.add(f); return 1; });
        expect([...faces]).toEqual([4]);
    });

    it('vários estados somam, junto com Queimado e Sangrando', () => {
        const r = danoDeEstadosNoTurno({ condicoes: [
            { id: 'envenenado', stacks: 2 }, { id: 'necrosado', stacks: 1 }, { id: 'queimado', stacks: 1 }, { id: 'lento', stacks: 2 }
        ] }, um);
        expect(r.partes.map(p => p.id)).toEqual(['envenenado', 'necrosado', 'queimado']);
        expect(r.total).toBe(10 + 8 + 8);
    });

    it('sem condições ou ids inválidos: total 0', () => {
        expect(danoDeEstadosNoTurno({}, um)).toEqual({ total: 0, partes: [] });
        expect(danoDeEstadosNoTurno(null, um)).toEqual({ total: 0, partes: [] });
        expect(danoDeEstadosNoTurno({ condicoes: [{ id: 'envenenado', stacks: 0 }, { id: 'inexistente', stacks: 2 }] }, um).total).toBe(0);
    });

    it('rolagem padrão (aleatória) fica dentro do intervalo', () => {
        const r = danoDeEstadosNoTurno({ condicoes: [{ id: 'envenenado', stacks: 2 }] });
        expect(r.total).toBeGreaterThanOrEqual(10);
        expect(r.total).toBeLessThanOrEqual(40);
    });

    it('descreverDanoDeEstados cita o estado e o dado', () => {
        const txt = descreverDanoDeEstados(danoDeEstadosNoTurno({ condicoes: [{ id: 'envenenado', stacks: 2 }] }, um));
        expect(txt).toContain('Envenenado');
        expect(txt).toContain('10d4');
    });
});

describe('Envenenado e Necrosado: resumoDosEstados', () => {
    it('Envenenado mostra 5d4 por stack', () => {
        const l = resumoDosEstados({ condicoes: [{ id: 'envenenado', stacks: 3 }] });
        expect(l.some(x => x.includes('Envenenado') && x.includes('15d4'))).toBe(true);
    });
    it('Necrosado mostra 8d4 por stack', () => {
        const l = resumoDosEstados({ condicoes: [{ id: 'necrosado', stacks: 2 }] });
        expect(l.some(x => x.includes('Necrosado') && x.includes('16d4'))).toBe(true);
    });
    it('ambos aparecem juntos', () => {
        const l = resumoDosEstados({ condicoes: [{ id: 'envenenado', stacks: 1 }, { id: 'necrosado', stacks: 1 }] });
        expect(l.some(x => x.includes('5d4'))).toBe(true);
        expect(l.some(x => x.includes('8d4'))).toBe(true);
    });
    it('sem os estados não há linha deles', () => {
        expect(resumoDosEstados({ condicoes: [{ id: 'lento', stacks: 1 }] }).some(x => /Envenenado|Necrosado/.test(x))).toBe(false);
        expect(resumoDosEstados({})).toEqual([]);
    });
});
