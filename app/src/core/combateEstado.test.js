import { describe, it, expect } from 'vitest';
import { getCombateDaCena, combateAtivo, getRodada, iniciarCombateNoCenario, encerrarCombateNoCenario, avancarRodadaSeVoltou } from './combateEstado.js';
import { montarContextoAdaptacao, poderDoOponenteMaisForte } from './adaptacaoTurno.js';

describe('estado do combate por cena', () => {
    it('sem registro = sem combate', () => {
        expect(combateAtivo({}, 'c1')).toBe(false);
        expect(combateAtivo(undefined, 'c1')).toBe(false);
        expect(getRodada({}, 'c1')).toBe(0);
        expect(getCombateDaCena({ combates: { c1: { ativo: false } } }, 'c1')).toEqual({ ativo: false });
        expect(combateAtivo({ combates: { c1: { ativo: false, rodada: 3 } } }, 'c1')).toBe(false);
        expect(getRodada({ combates: { c1: { ativo: false, rodada: 3 } } }, 'c1')).toBe(0);
    });
    it('iniciar: ativo, rodada 1, turno 0, imutável, só a cena pedida', () => {
        const base = { ativa: 'c1', turnoAtualIndex: 4, combates: { c2: { ativo: true, rodada: 5, iniciadoEm: 1 } } };
        const novo = iniciarCombateNoCenario(base, 'c1', 1234);
        expect(novo.combates.c1).toEqual({ ativo: true, rodada: 1, iniciadoEm: 1234 });
        expect(novo.combates.c2.rodada).toBe(5);
        expect(novo.turnoAtualIndex).toBe(0);
        expect(base.turnoAtualIndex).toBe(4);
        expect(base.combates.c1).toBeUndefined();
        expect(combateAtivo(novo, 'c1')).toBe(true);
        expect(getRodada(novo, 'c1')).toBe(1);
    });
    it('encerrar: remove só a cena; some o mapa vazio; resetarTurno opcional', () => {
        const base = { turnoAtualIndex: 3, combates: { c1: { ativo: true, rodada: 2 }, c2: { ativo: true, rodada: 1 } } };
        const a = encerrarCombateNoCenario(base, 'c1');
        expect(a.combates).toEqual({ c2: { ativo: true, rodada: 1 } });
        expect(a.turnoAtualIndex).toBe(0);
        const b = encerrarCombateNoCenario(a, 'c2', { resetarTurno: false });
        expect(b.combates).toBeUndefined();
        expect(encerrarCombateNoCenario({ turnoAtualIndex: 2, combates: { c1: { ativo: true } } }, 'c1', { resetarTurno: false }).turnoAtualIndex).toBe(2);
        expect(base.combates.c1.rodada).toBe(2);
        expect(encerrarCombateNoCenario({}, 'x')).toEqual({ turnoAtualIndex: 0 });
    });
    it('rodada sobe só quando o índice dá a volta', () => {
        const c = iniciarCombateNoCenario({}, 'c1', 1);
        expect(getRodada(avancarRodadaSeVoltou(c, 'c1', 0, 1, 3), 'c1')).toBe(1);
        expect(getRodada(avancarRodadaSeVoltou(c, 'c1', 1, 2, 3), 'c1')).toBe(1);
        expect(getRodada(avancarRodadaSeVoltou(c, 'c1', 2, 0, 3), 'c1')).toBe(2);
        expect(getRodada(avancarRodadaSeVoltou(c, 'c1', 0, 0, 1), 'c1')).toBe(2); // ordem de 1: cada passagem é uma rodada
    });
    it('rodada não sobe sem combate ativo nem com ordem vazia', () => {
        expect(avancarRodadaSeVoltou({}, 'c1', 2, 0, 3).combates).toBeUndefined();
        const c = iniciarCombateNoCenario({}, 'c1', 1);
        expect(getRodada(avancarRodadaSeVoltou(c, 'c1', 0, 0, 0), 'c1')).toBe(1);
        expect(avancarRodadaSeVoltou({ combates: { c1: { ativo: false, rodada: 1 } } }, 'c1', 1, 0, 2).combates.c1.rodada).toBe(1);
    });
    it('rodada inválida vira 1 enquanto ativo', () => {
        expect(getRodada({ combates: { c1: { ativo: true, rodada: 'x' } } }, 'c1')).toBe(1);
    });
});

describe('Adaptação só com oponente hostil e combate ativo', () => {
    const fp = (vida, extra = {}) => ({ combate: { adaptacaoLigada: true }, vida: { base: vida }, ascensaoBase: 1, ...extra });
    const portador = fp(10);
    const aliado = fp(1e9);
    const inimigoNpc = fp(1e5, { isNPC: true });
    const ordem = [
        { id: 'P', nome: 'P', isDummie: false, ficha: portador },
        { id: 'A', nome: 'A', isDummie: false, ficha: aliado },
        { id: 'N', nome: 'N', isDummie: false, ficha: inimigoNpc },
        { id: 'd1', nome: 'Dum', isDummie: true, ficha: {} },
    ];
    const personagens = { P: portador, A: aliado, N: inimigoNpc };

    it('aliado (outro jogador) NÃO conta, mesmo sendo o mais forte', () => {
        const r = poderDoOponenteMaisForte(ordem.slice(0, 3), 'P', { personagens, dummies: {}, meuNome: 'P', minhaFicha: portador, cenario: {} });
        expect(r.nome).toBe('N');
    });
    it('sem nenhum hostil válido = null', () => {
        const so = ordem.slice(0, 2);
        expect(poderDoOponenteMaisForte(so, 'P', { personagens, dummies: {}, meuNome: 'P', minhaFicha: portador, cenario: {} })).toBeNull();
    });
    it('relação neutra não conta; hostil por equipe customizada conta', () => {
        const cen = { equipes: [{ id: 'aliados', nome: 'A' }, { id: 'inimigos', nome: 'I' }, { id: 'neutros', nome: 'N' }, { id: 'rival', nome: 'R' }], relacoes: { 'aliados|rival': 'hostil' } };
        const ficha = { ...aliado, combate: { adaptacaoLigada: true, equipe: 'rival' } };
        const ord = [ordem[0], { id: 'A', nome: 'A', isDummie: false, ficha }];
        expect(poderDoOponenteMaisForte(ord, 'P', { personagens: { P: portador, A: ficha }, dummies: {}, meuNome: 'P', minhaFicha: portador, cenario: cen }).nome).toBe('A');
        const cenNeutra = { ...cen, relacoes: {} };
        expect(poderDoOponenteMaisForte(ord, 'P', { personagens: { P: portador, A: ficha }, dummies: {}, meuNome: 'P', minhaFicha: portador, cenario: cenNeutra })).toBeNull();
    });
    it('dummie (inimigo por padrão) conta quando tem Poder', () => {
        const r = poderDoOponenteMaisForte([ordem[0], ordem[3]], 'P', { personagens, dummies: { d1: { poderCalculado: 500 } }, meuNome: 'P', minhaFicha: portador, cenario: {} });
        expect(r).toEqual({ nome: 'Dum', poder: 500 });
    });
    it('montarContextoAdaptacao: com cenaIdCombate exige combate ATIVO nessa cena', () => {
        const estadoBase = { personagens, dummies: {}, meuNome: 'P', minhaFicha: portador };
        const semCombate = { ...estadoBase, cenario: {}, cenaIdCombate: 'c1' };
        expect(montarContextoAdaptacao(portador, 'P', ordem.slice(0, 3), semCombate)).toBeNull();
        const comCombate = { ...estadoBase, cenario: iniciarCombateNoCenario({}, 'c1', 1), cenaIdCombate: 'c1' };
        expect(montarContextoAdaptacao(portador, 'P', ordem.slice(0, 3), comCombate).oponente.nome).toBe('N');
        // sem cenaIdCombate (ex.: iniciar o combate) a medição não exige o registro
        expect(montarContextoAdaptacao(portador, 'P', ordem.slice(0, 3), { ...estadoBase, cenario: {} }).oponente.nome).toBe('N');
    });
});
