import { describe, it, expect } from 'vitest';
import { DT, QID, qMul, qNorm, qInv, qSlerp, qIntegrar, simularLancamento, quadroEm, velocidadeDoGesto } from './fisicaDado';

const ARENA = { meiaLargura: 5, piso: -2, apoio: 1 };
const ALVO = qNorm([0.3, -0.5, 0.2, 0.8]);
const mesmaRotacao = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);

describe('quaternions', () => {
    it('qMul com a identidade devolve o mesmo quaternion', () => {
        const q = qNorm([0.1, 0.2, 0.3, 0.9]);
        qMul(q, QID).forEach((v, i) => expect(v).toBeCloseTo(q[i], 10));
        qMul(QID, q).forEach((v, i) => expect(v).toBeCloseTo(q[i], 10));
    });
    it('q * inverso = identidade', () => {
        const q = qNorm([0.4, -0.2, 0.7, 0.3]);
        const r = qMul(q, qInv(q));
        [0, 0, 0, 1].forEach((v, i) => expect(r[i]).toBeCloseTo(v, 10));
    });
    it('qNorm devolve comprimento 1 e nao quebra com zero', () => {
        const n = qNorm([2, 0, 0, 0]);
        expect(Math.hypot(...n)).toBeCloseTo(1, 10);
        expect(qNorm([0, 0, 0, 0]).every(Number.isFinite)).toBe(true);
    });
    it('qSlerp nas pontas devolve a e b', () => {
        const a = QID;
        const b = qNorm([0, Math.sin(0.5), 0, Math.cos(0.5)]);
        qSlerp(a, b, 0).forEach((v, i) => expect(v).toBeCloseTo(a[i], 10));
        qSlerp(a, b, 1).forEach((v, i) => expect(v).toBeCloseTo(b[i], 10));
    });
    it('qSlerp no meio gira metade do angulo', () => {
        const b = [0, Math.sin(0.5), 0, Math.cos(0.5)];
        const m = qSlerp(QID, b, 0.5);
        expect(m[1]).toBeCloseTo(Math.sin(0.25), 8);
        expect(m[3]).toBeCloseTo(Math.cos(0.25), 8);
    });
    it('qSlerp escolhe o caminho curto quando o produto escalar e negativo', () => {
        const m = qSlerp(QID, [0, 0, 0, -1], 0.5);
        expect(Math.abs(m[3])).toBeCloseTo(1, 8);
    });
    it('qSlerp com quaternions quase iguais nao gera NaN', () => {
        expect(qSlerp(QID, QID, 0.5).every(Number.isFinite)).toBe(true);
    });
    it('qIntegrar com velocidade zero devolve o mesmo q; com w gira em torno do eixo', () => {
        expect(qIntegrar(QID, [0, 0, 0], DT)).toBe(QID);
        const r = qIntegrar(QID, [0, Math.PI, 0], 1);
        expect(Math.abs(r[1])).toBeCloseTo(1, 8);
    });
});

describe('simularLancamento', () => {
    const lancar = (extra = {}) => simularLancamento({ arena: ARENA, alvo: ALVO, ...extra });

    it('termina exatamente no quaternion alvo', () => {
        const s = lancar();
        const ult = s.quadros[s.quadros.length - 1].q;
        ult.forEach((v, i) => expect(v).toBeCloseTo(ALVO[i], 10));
    });
    it('termina no alvo mesmo sem centrar e com outros alvos', () => {
        [[0, 0, 0, 1], qNorm([1, 0, 0, 1]), qNorm([0.2, 0.9, -0.4, 0.1])].forEach(alvo => {
            [true, false].forEach(centrar => {
                const s = simularLancamento({ arena: ARENA, alvo, centrar });
                expect(mesmaRotacao(s.quadros[s.quadros.length - 1].q, alvo)).toBeCloseTo(1, 10);
            });
        });
    });
    it('duracao menor que 4s e coerente com dt e numero de quadros', () => {
        const s = lancar();
        expect(s.duracao).toBeGreaterThan(0.5);
        expect(s.duracao).toBeLessThan(4);
        expect(s.dt).toBe(DT);
        expect(s.duracao).toBeCloseTo((s.quadros.length - 1) * DT, 10);
        expect(lancar({ centrar: false }).duracao).toBeLessThan(4.5);
    });
    it('tem pelo menos 2 impactos com forca decrescente', () => {
        const s = lancar();
        expect(s.impactos.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < s.impactos.length; i++) {
            expect(s.impactos[i].forca).toBeLessThan(s.impactos[i - 1].forca);
            expect(s.impactos[i].t).toBeGreaterThan(s.impactos[i - 1].t);
        }
    });
    it('centrar=true termina em x ~ 0', () => {
        const s = lancar();
        expect(Math.abs(s.pouso[0])).toBeLessThan(0.05);
    });
    it('centrar=true respeita xFinal diferente de 0', () => {
        const s = lancar({ xFinal: 1.5 });
        expect(s.pouso[0]).toBeCloseTo(1.5, 1);
    });
    it('centrar=false termina em x = 0 depois do deslize e o deslize e mais longo', () => {
        const s = lancar({ centrar: false });
        expect(s.pouso[0]).toBeCloseTo(0, 10);
        expect(s.duracao).toBeGreaterThan(lancar().duracao - 1e-9);
    });
    it('paredes limitam x a +-meiaLargura', () => {
        const arena = { meiaLargura: 2, piso: -2, apoio: 1 };
        [[40, 6], [-40, 6]].forEach(velocidade => {
            const s = simularLancamento({ arena, alvo: ALVO, velocidade, centrar: false, inicio: [0, 1] });
            s.quadros.forEach(f => expect(Math.abs(f.p[0])).toBeLessThanOrEqual(2 + 1e-9));
        });
    });
    it('o dado nunca afunda abaixo do chao (piso + apoio)', () => {
        const s = lancar();
        s.quadros.forEach(f => expect(f.p[1]).toBeGreaterThanOrEqual(-1 - 1e-9));
        expect(s.pouso[1]).toBeCloseTo(-1, 10);
    });
    it('inicio abaixo do chao e levantado para o chao', () => {
        const s = lancar({ inicio: [0, -10] });
        expect(s.quadros[0].p[1]).toBeGreaterThanOrEqual(-1 - 1e-9);
    });
    it('deterministico: mesmo input, mesmo resultado', () => {
        expect(lancar()).toEqual(lancar());
        expect(lancar({ centrar: false })).toEqual(lancar({ centrar: false }));
    });
    it('todos os quaternions sao unitarios e finitos', () => {
        lancar().quadros.forEach(f => {
            expect(f.q.every(Number.isFinite)).toBe(true);
            expect(Math.hypot(...f.q)).toBeCloseTo(1, 6);
        });
    });
    it('sem alvo usa a identidade', () => {
        const s = simularLancamento({ arena: ARENA });
        s.quadros[s.quadros.length - 1].q.forEach((v, i) => expect(v).toBeCloseTo(QID[i], 10));
    });
    it('sem arena lanca erro (parametro obrigatorio)', () => {
        expect(() => simularLancamento({ alvo: ALVO })).toThrow();
    });
    it('lancamento parado (velocidade 0) ainda termina e cai', () => {
        const s = lancar({ velocidade: [0, 0], centrar: false });
        expect(s.duracao).toBeLessThan(4.5);
        expect(s.impactos.length).toBeGreaterThanOrEqual(1);
    });
});

describe('quadroEm', () => {
    const sim = simularLancamento({ arena: ARENA, alvo: ALVO });
    it('t=0 e o primeiro quadro', () => {
        const f = quadroEm(sim, 0);
        expect(f.p).toEqual([sim.quadros[0].p[0], sim.quadros[0].p[1], 0]);
    });
    it('interpola a posicao entre dois quadros', () => {
        const a = sim.quadros[3], b = sim.quadros[4];
        const f = quadroEm(sim, 3.5 * sim.dt);
        expect(f.p[0]).toBeCloseTo((a.p[0] + b.p[0]) / 2, 8);
        expect(f.p[1]).toBeCloseTo((a.p[1] + b.p[1]) / 2, 8);
    });
    it('limita t: negativo vai ao inicio, acima da duracao vai ao fim', () => {
        expect(quadroEm(sim, -5).p[0]).toBeCloseTo(sim.quadros[0].p[0], 10);
        const fim = sim.quadros[sim.quadros.length - 1];
        const f = quadroEm(sim, 999);
        expect(f.p[0]).toBeCloseTo(fim.p[0], 10);
        f.q.forEach((v, i) => expect(v).toBeCloseTo(fim.q[i], 8));
    });
    it('rotacao no fim e o alvo', () => {
        expect(mesmaRotacao(quadroEm(sim, sim.duracao).q, ALVO)).toBeCloseTo(1, 8);
    });
});

describe('velocidadeDoGesto', () => {
    it('retorna [0,0] com menos de 2 amostras ou entrada invalida', () => {
        expect(velocidadeDoGesto([])).toEqual([0, 0]);
        expect(velocidadeDoGesto([{ x: 1, y: 1, t: 0 }])).toEqual([0, 0]);
        expect(velocidadeDoGesto(null)).toEqual([0, 0]);
        expect(velocidadeDoGesto(undefined)).toEqual([0, 0]);
    });
    it('calcula a velocidade pela janela recente', () => {
        const v = velocidadeDoGesto([{ x: 0, y: 0, t: 0 }, { x: 1, y: -2, t: 100 }], { maximo: 38 });
        expect(v[0]).toBeCloseTo(10, 8);
        expect(v[1]).toBeCloseTo(-20, 8);
    });
    it('limita ao maximo mantendo a direcao', () => {
        const v = velocidadeDoGesto([{ x: 0, y: 0, t: 0 }, { x: 300, y: 400, t: 100 }], { maximo: 38 });
        expect(Math.hypot(...v)).toBeCloseTo(38, 8);
        expect(v[1] / v[0]).toBeCloseTo(4 / 3, 8);
    });
    it('maximo padrao e 22', () => {
        const v = velocidadeDoGesto([{ x: 0, y: 0, t: 0 }, { x: 300, y: 400, t: 100 }]);
        expect(Math.hypot(...v)).toBeCloseTo(22, 8);
    });
    it('maximo customizado', () => {
        const v = velocidadeDoGesto([{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 100 }], { maximo: 5 });
        expect(v[0]).toBeCloseTo(5, 8);
    });
    it('amostras com o mesmo t nao dividem por zero', () => {
        const v = velocidadeDoGesto([{ x: 0, y: 0, t: 50 }, { x: 0.1, y: 0, t: 50 }]);
        expect(v.every(Number.isFinite)).toBe(true);
    });
    it('ignora amostras antigas fora da janela', () => {
        const v = velocidadeDoGesto([
            { x: -100, y: 0, t: 0 }, { x: 0, y: 0, t: 500 }, { x: 0.5, y: 0, t: 550 }, { x: 1, y: 0, t: 600 }
        ], { janelaMs: 90 });
        expect(v[0]).toBeCloseTo(10, 6);
    });
});
