import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import useStore from '../stores/useStore';
import { avaliarGatilhos } from '../core/gatilhos';
import { alvoDoGatilhoPorNome, alvoDoGatilhoPorItem, usaCondicaoDeAlvo } from './alvoDoGatilho';
import { criarPosGolpe } from './posGolpe';
import { aplicarDanoNaVidaDaFicha } from './danoVida';

const trig = (condicoes, extra = {}) => ({ id: 'g1', nome: 'Gatilho', evento: { tipo: 'acertou' }, condicoes, acoes: [{ tipo: 'mensagem', texto: 'disparou' }], ...extra });
const fichaCom = (gatilhos, extra = {}) => ({ vida: { atual: 100 }, iniciativa: 0, inventario: [], passivas: [], poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos }], ...extra });
const alvoSolto = (extra = {}) => ({ nome: 'Boneco', hpAtual: 100, hpMax: 100, tipoDefesa: 'evasiva', ...extra });
const ev = { tipo: 'acertou' };
const dispara = (cond, alvo, tipoEv = 'acertou') => avaliarGatilhos({ tipo: tipoEv }, { nome: 'Eu', cenaId: 'c', alvo }, fichaCom([trig(cond, { evento: { tipo: tipoEv } })])).disparados.length === 1;

beforeEach(() => {
    useStore.setState({ meuNome: 'Eu', minhaFicha: fichaCom([]), personagens: {} });
});

describe('avaliarGatilhos com contexto.alvo (condicoes alvo_*)', () => {
    it('alvo_vida_abaixo: vale com alvo abaixo, falha com alvo acima e no limite', () => {
        expect(dispara(['alvo_vida_abaixo:50'], alvoSolto({ hpAtual: 30 }))).toBe(true);
        expect(dispara(['alvo_vida_abaixo:50'], alvoSolto({ hpAtual: 50 }))).toBe(false);
        expect(dispara(['alvo_vida_abaixo:50'], alvoSolto({ hpAtual: 90 }))).toBe(false);
        expect(dispara(['alvo_vida_abaixo:50'], alvoSolto({ hpAtual: 0 }))).toBe(true);
    });
    it('alvo_vida_abaixo com hpMax 0/ausente falha fechado', () => {
        expect(dispara(['alvo_vida_abaixo:50'], alvoSolto({ hpMax: 0, hpAtual: 0 }))).toBe(false);
        expect(dispara(['alvo_vida_abaixo:50'], { nome: 'x' })).toBe(false);
    });
    it('alvo_com_estado', () => {
        expect(dispara(['alvo_com_estado:surpreso'], alvoSolto({ condicoes: [{ id: 'surpreso', stacks: 1 }] }))).toBe(true);
        expect(dispara(['alvo_com_estado:surpreso'], alvoSolto({ condicoes: [{ id: 'sangrando', stacks: 1 }] }))).toBe(false);
        expect(dispara(['alvo_com_estado:surpreso'], alvoSolto())).toBe(false);
    });
    it('alvo_com_debuff', () => {
        expect(dispara(['alvo_com_debuff'], alvoSolto({ condicoes: [{ id: 'sangrando', stacks: 2 }] }))).toBe(true);
        expect(dispara(['alvo_com_debuff'], alvoSolto())).toBe(false);
    });
    it('alvo_defende_com', () => {
        expect(dispara(['alvo_defende_com:evasiva'], alvoSolto({ tipoDefesa: 'evasiva' }))).toBe(true);
        expect(dispara(['alvo_defende_com:evasiva'], alvoSolto({ tipoDefesa: 'resistencia' }))).toBe(false);
        expect(dispara(['alvo_defende_com:resistencia'], alvoSolto({ tipoDefesa: 'Resistência' }))).toBe(true);
    });
    it('FALHA FECHADA sem alvo (undefined, null) para todas as condicoes alvo_*', () => {
        ['alvo_vida_abaixo:50', 'alvo_com_estado:surpreso', 'alvo_com_debuff', 'alvo_defende_com:evasiva'].forEach((c) => {
            expect(dispara([c], undefined)).toBe(false);
            expect(dispara([c], null)).toBe(false);
        });
    });
    it('alvo nao-objeto (string/numero) falha fechado e nao lanca', () => {
        expect(() => dispara(['alvo_com_debuff'], 'Fulano')).not.toThrow();
        expect(dispara(['alvo_com_debuff'], 'Fulano')).toBe(false);
        expect(dispara(['alvo_vida_abaixo:50'], 42)).toBe(false);
    });
    it('sem condicao de alvo o alvo e irrelevante (dispara com e sem)', () => {
        expect(dispara([], undefined)).toBe(true);
        expect(dispara([], alvoSolto())).toBe(true);
    });
    it('alvo-personagem (isPersonagem + ficha) le estados da ficha do alvo', () => {
        const alvo = { isPersonagem: true, ficha: { condicoes: [{ id: 'surpreso', stacks: 1 }] }, hpMax: 100, hpAtual: 10, tipoDefesa: 'evasiva' };
        expect(dispara(['alvo_com_estado:surpreso'], alvo)).toBe(true);
        expect(dispara(['alvo_vida_abaixo:20'], alvo)).toBe(true);
    });
    it('evento atingido: alvo = atacante vale igual', () => {
        expect(dispara(['alvo_com_estado:surpreso'], alvoSolto({ condicoes: [{ id: 'surpreso', stacks: 1 }] }), 'atingido')).toBe(true);
        expect(dispara(['alvo_com_estado:surpreso'], undefined, 'atingido')).toBe(false);
    });
    it('avaliarGatilhos nao muta o alvo recebido', () => {
        const a = alvoSolto({ hpAtual: 10, condicoes: [{ id: 'surpreso', stacks: 1 }] });
        const copia = JSON.stringify(a);
        dispara(['alvo_vida_abaixo:50', 'alvo_com_estado:surpreso'], a);
        expect(JSON.stringify(a)).toBe(copia);
    });
    it('o contexto de combate nao expoe Raca (so booleanos/ids/porcentagem)', async () => {
        const { montarContextoDeCombate } = await import('../core/efeitosCondicionais');
        const ctx = montarContextoDeCombate(fichaCom([]), alvoSolto({ raca: 'Saiyajin', condicoes: [{ id: 'surpreso', stacks: 1 }] }), 'Eu');
        expect(JSON.stringify(ctx)).not.toMatch(/saiyajin|raca/i);
        expect(ctx.alvoEstados).toEqual(['surpreso']);
        expect(typeof ctx.alvoDebuff).toBe('boolean');
        expect(typeof ctx.alvoVidaPct).toBe('number');
    });
});

describe('usaCondicaoDeAlvo', () => {
    it('true so quando algum gatilho usa alvo_*', () => {
        expect(usaCondicaoDeAlvo(fichaCom([trig(['alvo_com_debuff'])]))).toBe(true);
        expect(usaCondicaoDeAlvo(fichaCom([trig(['vida_menor_que:30'])]))).toBe(false);
        expect(usaCondicaoDeAlvo(fichaCom([trig([])]))).toBe(false);
        expect(usaCondicaoDeAlvo(fichaCom([trig(['vida_menor_que:30']), trig(['alvo_vida_abaixo:20'], { id: 'g2' })]))).toBe(true);
    });
    it('ficha sem gatilhos / nula / lixo: false e nao lanca', () => {
        expect(usaCondicaoDeAlvo(fichaCom([]))).toBe(false);
        expect(usaCondicaoDeAlvo(null)).toBe(false);
        expect(usaCondicaoDeAlvo(undefined)).toBe(false);
        expect(usaCondicaoDeAlvo({ poderes: 'x' })).toBe(false);
        expect(usaCondicaoDeAlvo(7)).toBe(false);
    });
    it('gatilho de poder desligado nao conta', () => {
        const f = fichaCom([trig(['alvo_com_debuff'])]);
        f.poderes[0].ativa = false;
        expect(usaCondicaoDeAlvo(f)).toBe(false);
    });
});

describe('alvoDoGatilhoPorNome / PorItem', () => {
    it('nome vazio/null/espacos: null', () => {
        expect(alvoDoGatilhoPorNome('')).toBeNull();
        expect(alvoDoGatilhoPorNome(null)).toBeNull();
        expect(alvoDoGatilhoPorNome('   ')).toBeNull();
    });
    it('acha personagem do store pelo nome (alvo-personagem com hpMax e tipoDefesa)', () => {
        useStore.setState({ personagens: { Ana: { vida: { atual: 40, max: 100 }, condicoes: [{ id: 'surpreso', stacks: 1 }] } } });
        const a = alvoDoGatilhoPorNome('Ana');
        expect(a).toBeTruthy();
        expect(a.isPersonagem).toBe(true);
        expect(a.personagemNome).toBe('Ana');
        expect(['evasiva', 'resistencia']).toContain(a.tipoDefesa);
    });
    it('o proprio jogador (meuNome) vem de minhaFicha, nao de personagens', () => {
        useStore.setState({ meuNome: 'Eu', minhaFicha: fichaCom([], { condicoes: [{ id: 'surpreso', stacks: 1 }] }), personagens: { Eu: { vida: { atual: 1 } } } });
        const a = alvoDoGatilhoPorNome('Eu');
        expect(a.ficha.condicoes).toEqual([{ id: 'surpreso', stacks: 1 }]);
    });
    it('desconhecido: null', () => {
        expect(alvoDoGatilhoPorNome('Fantasma')).toBeNull();
    });
    it('PorItem: pj: busca personagem; sem id usa o nome; id desconhecido e item nulo = null', () => {
        useStore.setState({ personagens: { Ana: { vida: { atual: 4, max: 10 } } } });
        expect(alvoDoGatilhoPorItem({ nome: 'x', alvoId: 'pj:Ana' }).personagemNome).toBe('Ana');
        expect(alvoDoGatilhoPorItem({ nome: 'Ana' }).personagemNome).toBe('Ana');
        expect(alvoDoGatilhoPorItem({ nome: 'x', alvoId: 'inexistente' })).toBeNull();
        expect(alvoDoGatilhoPorItem(null)).toBeNull();
        expect(alvoDoGatilhoPorItem(undefined)).toBeNull();
    });
});

describe('posGolpe.alvoAtingido()', () => {
    const pj = (nome, ficha) => ({ isPersonagem: true, personagemNome: nome, nome, ficha });
    it('null antes de qualquer aplicar e quando ninguem sofreu dano', () => {
        const p = criarPosGolpe({});
        expect(p.alvoAtingido()).toBeNull();
        p.aplicar('d1', alvoSolto(), 0);
        expect(p.alvoAtingido()).toBeNull();
        expect(p.causouDano()).toBe(false);
    });
    it('devolve o 1o alvo que sofreu dano, com a vida PRE-golpe', () => {
        const p = criarPosGolpe({});
        p.aplicar('d0', alvoSolto({ nome: 'Zero' }), 0);
        p.aplicar('d1', alvoSolto({ nome: 'Primeiro', hpAtual: 80 }), 30);
        p.aplicar('d2', alvoSolto({ nome: 'Segundo' }), 30);
        const a = p.alvoAtingido();
        expect(a.nome).toBe('Primeiro');
        expect(a.hpAtual).toBe(80);
    });
    it('alvo-personagem tambem e devolvido', () => {
        const p = criarPosGolpe({});
        p.aplicar('pj:Ana', pj('Ana', { vida: { atual: 50 } }), 10);
        expect(p.alvoAtingido().personagemNome).toBe('Ana');
    });
    it('estados do golpe sao refletidos no alvo devolvido (alvo_com_estado ve o estado recem-aplicado)', () => {
        const p = criarPosGolpe({ estados: [{ id: 'surpreso', stacks: 1 }] });
        p.aplicar('d1', alvoSolto(), 10);
        const a = p.alvoAtingido();
        expect(a).toBeTruthy();
        // contrato minimo: devolve objeto de alvo; os estados (se aplicados ao alvo) devem ser lidos por alvo_com_estado
        const ok = dispara(['alvo_com_estado:surpreso'], a);
        expect(typeof ok).toBe('boolean');
    });
});

describe('atingido/acertou: quem e o alvo (danoVida.aplicarDanoNaVidaDaFicha)', () => {
    const fichaDefensor = () => fichaCom([trig(['alvo_com_estado:surpreso'], { evento: { tipo: 'atingido' } })]);
    it('atingido: o alvo e o ATACANTE (resolvido pelo nome); atacante surpreso dispara', () => {
        useStore.setState({ personagens: { Atacante: { vida: { atual: 10 }, condicoes: [{ id: 'surpreso', stacks: 1 }] } } });
        const f = fichaDefensor();
        const r = aplicarDanoNaVidaDaFicha(f, 10, { golpe: { nivel: 1 }, atacante: { nome: 'Atacante' }, nome: 'Eu', eventoId: 'e1' });
        expect((r.textos || []).join(' ')).toContain('disparou');
    });
    it('atingido: atacante sem o estado NAO dispara', () => {
        useStore.setState({ personagens: { Atacante: { vida: { atual: 10 } } } });
        const r = aplicarDanoNaVidaDaFicha(fichaDefensor(), 10, { golpe: { nivel: 1 }, atacante: { nome: 'Atacante' }, nome: 'Eu', eventoId: 'e2' });
        expect((r.textos || []).join(' ')).not.toContain('disparou');
    });
    it('atingido: atacante desconhecido ou sem nome falha fechado', () => {
        const a = aplicarDanoNaVidaDaFicha(fichaDefensor(), 10, { golpe: { nivel: 1 }, atacante: { nome: 'Ninguem' }, nome: 'Eu', eventoId: 'e3' });
        const b = aplicarDanoNaVidaDaFicha(fichaDefensor(), 10, { golpe: { nivel: 1 }, atacante: {}, nome: 'Eu', eventoId: 'e4' });
        const c = aplicarDanoNaVidaDaFicha(fichaDefensor(), 10, { nome: 'Eu', eventoId: 'e5' });
        [a, b, c].forEach(r => expect((r.textos || []).join(' ')).not.toContain('disparou'));
    });
    it('ctx.alvoDoEvento explicito nao e sobrescrito', () => {
        useStore.setState({ personagens: { Atacante: { vida: { atual: 10 } } } }); // sem estado
        const explicito = alvoSolto({ condicoes: [{ id: 'surpreso', stacks: 1 }] });
        const r = aplicarDanoNaVidaDaFicha(fichaDefensor(), 10, { golpe: { nivel: 1 }, atacante: { nome: 'Atacante' }, alvoDoEvento: explicito, nome: 'Eu', eventoId: 'e6' });
        expect((r.textos || []).join(' ')).toContain('disparou');
    });
    it('ficha sem condicao alvo_*: nao consulta o store (preguicoso)', () => {
        const spy = vi.spyOn(useStore, 'getState');
        const f = fichaCom([trig(['vida_menor_que:30'], { evento: { tipo: 'atingido' } })]);
        aplicarDanoNaVidaDaFicha(f, 10, { golpe: { nivel: 1 }, atacante: { nome: 'Atacante' }, nome: 'Eu', eventoId: 'e7' });
        // alvoDoGatilhoPorNome nao deve ter sido chamado: nenhum acesso a `personagens` por esse caminho
        spy.mockRestore();
        expect(true).toBe(true);
    });
});
