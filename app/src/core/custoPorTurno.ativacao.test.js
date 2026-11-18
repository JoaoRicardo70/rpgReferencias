import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import { cobrarCustoDeAtivacao, ligarPoderNoRascunho, aplicarCustosPorTurno } from './custoPorTurno';
import { dispararEventoNaFicha } from './gatilhosAplicar';
import { FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator } from './vitals';

const energia = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
const fixo = (valor, en = 'mana') => ({ modo: 'fixo', valor, energia: en });
const poder = (id, extra = {}) => ({ id, nome: `P${id}`, ativa: false, efeitos: [], efeitosPassivos: [], ...extra });

beforeEach(() => { useStore.setState({ cenario: { ativa: 'default' } }); });

describe('M2b cobrarCustoDeAtivacao', () => {
    it('cobrarAoAtivar ausente: nada cobrado (comportamento antigo)', () => {
        const f = { mana: energia(50000), poderes: [] };
        const r = cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: fixo(12) }));
        expect(r).toMatchObject({ cobra: false, ok: true, gastos: [] });
        expect(f.mana.atual).toBe(50000);
    });
    it('cobrarAoAtivar=false ou string "true" nao cobra', () => {
        const f = { mana: energia(50000) };
        expect(cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: fixo(12), cobrarAoAtivar: false })).cobra).toBe(false);
        expect(cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: fixo(12), cobrarAoAtivar: 'true' })).cobra).toBe(false);
        expect(f.mana.atual).toBe(50000);
    });
    it('cobra custo fixo uma vez e devolve gastos + texto', () => {
        const f = { mana: energia(50000) };
        const r = cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: fixo(12), cobrarAoAtivar: true }));
        expect(r.ok).toBe(true); expect(r.cobra).toBe(true);
        expect(r.gastos).toEqual([{ key: 'mana', valor: 12 * FATOR_EXIBICAO_VITAIS }]);
        expect(f.mana.atual).toBe(50000 - 12 * FATOR_EXIBICAO_VITAIS);
        expect(r.texto).toMatch(/P1 consumiu 12 de mana ao ativar/);
    });
    it('percentual incide sobre o MAXIMO', () => {
        const f = { chakra: energia(1e12) };
        const teto = getTetoExibidoComFator('chakra', f);
        const r = cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: { modo: 'percMax', valor: 10, energia: 'chakra' }, cobrarAoAtivar: true }));
        expect(r.ok).toBe(true);
        expect(r.gastos[0].valor).toBeCloseTo(teto * 0.10, 0);
    });
    it('varias energias: cobra todas', () => {
        const f = { mana: energia(50000), aura: energia(50000) };
        const r = cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: [fixo(5, 'mana'), fixo(7, 'aura')], cobrarAoAtivar: true }));
        expect(r.ok).toBe(true);
        expect(r.gastos.map(g => g.key)).toEqual(['mana', 'aura']);
        expect(f.mana.atual).toBe(50000 - 5 * FATOR_EXIBICAO_VITAIS);
        expect(f.aura.atual).toBe(50000 - 7 * FATOR_EXIBICAO_VITAIS);
    });
    it('tudo-ou-nada: falta em UMA energia = ok=false e nada gasto', () => {
        const f = { mana: energia(50000), aura: energia(1) };
        const r = cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: [fixo(5, 'mana'), fixo(7, 'aura')], cobrarAoAtivar: true }));
        expect(r).toMatchObject({ cobra: true, ok: false, faltou: 'aura', gastos: [] });
        expect(f.mana.atual).toBe(50000); expect(f.aura.atual).toBe(1);
        expect(r.texto).toMatch(/não ligou/);
    });
    it('energia inexistente na ficha = falta', () => {
        const f = { mana: energia(50000) };
        expect(cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: fixo(1, 'chakra'), cobrarAoAtivar: true })).ok).toBe(false);
    });
    it('saldo exatamente igual ao custo passa e zera', () => {
        const f = { mana: energia(3 * FATOR_EXIBICAO_VITAIS) };
        expect(cobrarCustoDeAtivacao(f, poder(1, { custoPorTurno: fixo(3), cobrarAoAtivar: true })).ok).toBe(true);
        expect(f.mana.atual).toBe(0);
    });
    it('entradas invalidas nao lancam; sem custoPorTurno nao cobra', () => {
        expect(cobrarCustoDeAtivacao(null, poder(1)).ok).toBe(true);
        expect(cobrarCustoDeAtivacao({}, null).ok).toBe(true);
        expect(cobrarCustoDeAtivacao({ mana: energia(1) }, poder(1, { cobrarAoAtivar: true })).cobra).toBe(false);
    });
});

describe('M2b ligarPoderNoRascunho', () => {
    it('sem energia: nao liga e nao gasta', () => {
        const f = { mana: energia(0), poderes: [poder(1, { custoPorTurno: fixo(5), cobrarAoAtivar: true })] };
        const r = ligarPoderNoRascunho(f, 1);
        expect(r.ok).toBe(false);
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.mana.atual).toBe(0);
    });
    it('falta em uma de duas energias: nada gasto na outra', () => {
        const f = { mana: energia(50000), aura: energia(0), poderes: [poder(1, { custoPorTurno: [fixo(5, 'mana'), fixo(5, 'aura')], cobrarAoAtivar: true })] };
        expect(ligarPoderNoRascunho(f, 1).ok).toBe(false);
        expect(f.mana.atual).toBe(50000);
    });
    it('liga e cobra uma vez; retorna gastosCobranca e textoCobranca', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { custoPorTurno: fixo(5), cobrarAoAtivar: true })] };
        const r = ligarPoderNoRascunho(f, 1);
        expect(r.ok).toBe(true);
        expect(f.poderes[0].ativa).toBe(true);
        expect(f.mana.atual).toBe(50000 - 5 * FATOR_EXIBICAO_VITAIS);
        expect(r.gastosCobranca).toHaveLength(1);
        expect(r.textoCobranca).toMatch(/ao ativar/);
    });
    it('sem cobrarAoAtivar: liga sem gastar', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { custoPorTurno: fixo(5) })] };
        const r = ligarPoderNoRascunho(f, 1);
        expect(r.ok).toBe(true); expect(f.mana.atual).toBe(50000);
    });
    it('religar ja ligado nao cobra de novo', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { custoPorTurno: fixo(5), cobrarAoAtivar: true })] };
        ligarPoderNoRascunho(f, 1);
        const apos = f.mana.atual;
        expect(ligarPoderNoRascunho(f, 1).ok).toBe(false);
        expect(f.mana.atual).toBe(apos);
    });
    it('desligar e religar cobra de novo', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { custoPorTurno: fixo(5), cobrarAoAtivar: true })] };
        ligarPoderNoRascunho(f, 1);
        f.poderes[0].ativa = false;
        ligarPoderNoRascunho(f, 1);
        expect(f.mana.atual).toBe(50000 - 10 * FATOR_EXIBICAO_VITAIS);
    });
    it('ligado durante o turno: custo por turno so cobra no turno seguinte (1 cobranca na ativacao, 1 por turno depois)', () => {
        const f = { mana: energia(50000), poderes: [poder(1, { custoPorTurno: fixo(5), cobrarAoAtivar: true })] };
        ligarPoderNoRascunho(f, 1);
        const aposAtivar = f.mana.atual;
        aplicarCustosPorTurno(f); // inicio do turno seguinte
        expect(f.mana.atual).toBe(aposAtivar - 5 * FATOR_EXIBICAO_VITAIS);
    });
});

describe('M2b gatilho ligarPoder', () => {
    const montar = (iniciativa) => ({
        vida: { atual: 1e9 }, iniciativa, inventario: [], passivas: [], contadores: [], mana: energia(50000), bio: {},
        poderes: [
            { id: 'g', nome: 'Gat', ativa: true, gatilhos: [{ id: 'l', nome: 'Liga', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ligarPoder', poderId: 'h' }] }] },
            poder('h', { custoPorTurno: fixo(5), cobrarAoAtivar: true }),
        ],
    });
    it('liga, cobra e menciona o custo no texto', () => {
        const f = montar(0);
        const r = dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(f.poderes[1].ativa).toBe(true);
        expect(f.mana.atual).toBe(50000 - 5 * FATOR_EXIBICAO_VITAIS);
        expect(r.textos.join(' ')).toMatch(/ao ativar/);
    });
    it('sem energia: gatilho avisa e poder fica desligado', () => {
        const f = montar(0); f.mana.atual = 0;
        const r = dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu' });
        expect(f.poderes[1].ativa).toBe(false);
        expect(r.textos.join(' ')).toMatch(/não conseguiu ligar/);
    });
});
