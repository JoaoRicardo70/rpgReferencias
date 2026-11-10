import { describe, it, expect, vi } from 'vitest';
import { aplicarInicioDeTurno, encerrarDuracaoDeEstados } from './MapaFormContext';

// Estados novos (core/estadosNovos.js) no inicio do turno: dano por stack, Acoes perdidas e duracao.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(), salvarCenarioCompleto: vi.fn(), zerarIniciativaGlobal: vi.fn()
}));

function ficha(overrides = {}) {
    return {
        acoes: { padrao: { max: 2, atual: 0, extra: 0 }, bonus: { max: 2, atual: 0, extra: 0 }, reacao: { max: 2, atual: 0, extra: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 50000000, regeneracao: 0 },
        poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides
    };
}
const acoes = (f) => ['padrao', 'bonus', 'reacao'].map(t => f.acoes[t].atual);

describe('aplicarInicioDeTurno - estados novos', () => {
    it('sem estado de acao as Acoes voltam cheias (regressao)', () => {
        const f = ficha({ condicoes: [{ id: 'lento', stacks: 1 }, { id: 'caido', stacks: 1 }] });
        aplicarInicioDeTurno(f);
        expect(acoes(f)).toEqual([2, 2, 2]);
    });
    it('Paralisado tira todas as Acoes do turno; Atordoado tira Acao e Reacao', () => {
        const p = ficha({ condicoes: [{ id: 'paralisado', stacks: 1 }] });
        aplicarInicioDeTurno(p);
        expect(acoes(p)).toEqual([0, 0, 0]);
        const a = ficha({ condicoes: [{ id: 'atordoado', stacks: 1 }] });
        aplicarInicioDeTurno(a);
        expect(acoes(a)).toEqual([0, 2, 0]);
    });
    it('Eletrizado e Sufocado causam dano no turno e o texto cita os estados', () => {
        const f = ficha({ condicoes: [{ id: 'eletrizado', stacks: 1 }, { id: 'sufocado', stacks: 1 }] });
        const antes = f.vida.atual;
        const r = aplicarInicioDeTurno(f);
        expect(f.vida.atual).toBeLessThan(antes);
        expect(r.estados).toContain('Eletrizado');
        expect(r.estados).toContain('Sufocado');
    });
    it('Dummie tambem perde as Acoes e leva o dano', () => {
        const d = { nome: 'Alvo', hpAtual: 1000000, condicoes: [{ id: 'banido', stacks: 1 }, { id: 'eletrizado', stacks: 1 }] };
        const r = aplicarInicioDeTurno(d, true, 'Alvo');
        expect(acoes(d)).toEqual([0, 0, 0]);
        expect(d.hpAtual).toBeLessThan(1000000);
        expect(r.estados).toContain('Eletrizado');
    });
    it('a duracao dos novos desce no FIM do turno do portador e o estado sai', () => {
        const f = ficha({ condicoes: [{ id: 'paralisado', stacks: 1 }], duracaoEstados: { paralisado: 1 } });
        aplicarInicioDeTurno(f);
        expect(f.duracaoEstados).toEqual({ paralisado: 1 });
        const textos = encerrarDuracaoDeEstados({ nome: 'Heroi' }, { meuNome: 'Heroi', minhaFicha: f }, { updateFicha: (cb) => cb(f), isMestre: false });
        expect(textos).toEqual(['⚡ Paralisado terminou']);
        expect(f.condicoes).toBeUndefined();
    });
});
