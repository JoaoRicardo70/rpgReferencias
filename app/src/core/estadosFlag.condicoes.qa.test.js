import { describe, it, expect } from 'vitest';
import { ESTADOS_NOVOS, IDS_ESTADOS_NOVOS } from './estadosNovos';
import { estadosEfetivos, modificadoresDeEstados, condicoesDaFicha } from './condicoes';
import {
    normalizarQuando, normalizarQuandoMultiplicador, passaQuando, passaQuandoMultiplicador, montarContextoDeCombate,
    temAcertoAutomatico, opcoesQuandoPara,
} from './efeitosCondicionais';

const FLAGS = ['presa', 'flanqueado', 'fintado', 'escondido', 'invisivel', 'escalando', 'correndo'];
const comEstado = (id, stacks = 1) => ({ condicoes: [{ id, stacks }] });
const ef = (atributo, valor, quando) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...(quando ? { quando } : {}) });
const passiva = (...efeitos) => ({ passivas: [{ id: 1, efeitos }] });

describe('7 estados-flag', () => {
    it('existem, total de estados novos esperado e definicoes completas', () => {
        FLAGS.forEach(id => {
            const d = ESTADOS_NOVOS.find(e => e.id === id);
            expect(d, id).toBeTruthy();
            expect(d.nome && d.icone && d.desc).toBeTruthy();
        });
        expect(new Set(IDS_ESTADOS_NOVOS).size).toBe(IDS_ESTADOS_NOVOS.length);
    });
    it('so flanqueado da vantagem a quem ataca', () => {
        FLAGS.forEach(id => {
            const v = ESTADOS_NOVOS.find(e => e.id === id).efeito(1).vantContra || 0;
            expect(v, id).toBe(id === 'flanqueado' ? 1 : 0);
        });
        expect(modificadoresDeEstados(comEstado('flanqueado')).vantagemContraEle).toBe(1);
        expect(modificadoresDeEstados(comEstado('escondido')).vantagemContraEle).toBe(0);
    });
    it('sao ids validos em condicoesDaFicha e nao alteram estados efetivos', () => {
        FLAGS.forEach(id => {
            expect(condicoesDaFicha(comEstado(id)).map(c => c.id)).toEqual([id]);
            const e = estadosEfetivos(comEstado(id));
            expect(e.imobilizado || e.incapacitado || e.lento || e.vulneravel).toBe(false);
        });
    });
});

describe('eu_com_estado', () => {
    it('normaliza ids validos e rejeita invalidos/vazios', () => {
        expect(normalizarQuando('eu_com_estado:escondido')).toBe('eu_com_estado:escondido');
        expect(normalizarQuando('eu_com_estado:xyz')).toBeNull();
        expect(normalizarQuando('eu_com_estado')).toBeNull();
    });
    it('verdadeiro, falso e sem contexto (= falso)', () => {
        const e = ef('acerto', 5, 'eu_com_estado:escondido');
        expect(passaQuando(e, montarContextoDeCombate(comEstado('escondido')))).toBe(true);
        expect(passaQuando(e, montarContextoDeCombate(comEstado('invisivel')))).toBe(false);
        expect(passaQuando(e, montarContextoDeCombate({}))).toBe(false);
        expect(passaQuando(e, {})).toBe(false);
        expect(passaQuando(e)).toBe(false);
    });
    it('vale em multiplicador (e nao exige alvo); alvo_com_estado continua invalido', () => {
        expect(normalizarQuandoMultiplicador('eu_com_estado:escondido')).toBe('eu_com_estado:escondido');
        const m = { quando: 'eu_com_estado:correndo' };
        expect(passaQuandoMultiplicador(m, montarContextoDeCombate(comEstado('correndo')))).toBe(true);
        expect(passaQuandoMultiplicador(m, montarContextoDeCombate(comEstado('escalando')))).toBe(false);
        expect(passaQuandoMultiplicador(m, {})).toBe(false);
        expect(normalizarQuandoMultiplicador('alvo_com_estado:escondido')).toBeNull();
        expect(opcoesQuandoPara('mbase').map(o => o.id)).toContain('eu_com_estado');
        expect(opcoesQuandoPara('mbase').map(o => o.id)).not.toContain('alvo_defende_com');
    });
});

describe('alvo_defende_com', () => {
    it('normaliza evasiva/resistencia (com acento e caixa) e rejeita outros', () => {
        expect(normalizarQuando('alvo_defende_com:evasiva')).toBe('alvo_defende_com:evasiva');
        expect(normalizarQuando('alvo_defende_com:Resistência')).toBe('alvo_defende_com:resistencia');
        expect(normalizarQuando('alvo_defende_com:xx')).toBeNull();
        expect(normalizarQuando('alvo_defende_com')).toBeNull();
    });
    it('verdadeiro/falso conforme tipoDefesa do alvo', () => {
        const ev = ef('acerto', 1, 'alvo_defende_com:evasiva');
        expect(passaQuando(ev, montarContextoDeCombate({}, { tipoDefesa: 'evasiva' }))).toBe(true);
        expect(passaQuando(ev, montarContextoDeCombate({}, { tipoDefesa: 'resistencia' }))).toBe(false);
        expect(passaQuando(ef('acerto', 1, 'alvo_defende_com:resistencia'), montarContextoDeCombate({}, { tipoDefesa: 'Resistência' }))).toBe(true);
    });
    it('sem alvo ou golpe em area (sem tipoDefesa) = falso; sem contexto fecha', () => {
        const ev = ef('acerto', 1, 'alvo_defende_com:evasiva');
        expect(passaQuando(ev, montarContextoDeCombate({}))).toBe(false);
        expect(passaQuando(ev, montarContextoDeCombate({}, {}))).toBe(false);
        expect(passaQuando(ev, montarContextoDeCombate({}, { tipoDefesa: null }))).toBe(false);
        expect(passaQuando(ev, {})).toBe(false);
    });
    it('invalida em multiplicador', () => {
        expect(normalizarQuandoMultiplicador('alvo_defende_com:evasiva')).toBeNull();
        expect(passaQuandoMultiplicador({ quando: 'alvo_defende_com:evasiva' }, { alvoDefesa: 'evasiva' })).toBe(false);
    });
});

describe('acerto_automatico condicional (Indesviavel / Imbloqueavel)', () => {
    const atacante = (quando) => passiva(ef('acerto_automatico', 1, quando));
    it('Indesviavel: vale contra quem defende com evasiva, nao com resistencia', () => {
        const f = atacante('alvo_defende_com:evasiva');
        expect(temAcertoAutomatico(f, { tipoDefesa: 'evasiva' })).toBe(true);
        expect(temAcertoAutomatico(f, { tipoDefesa: 'resistencia' })).toBe(false);
    });
    it('Imbloqueavel: vale contra resistencia, nao contra evasiva', () => {
        const f = atacante('alvo_defende_com:resistencia');
        expect(temAcertoAutomatico(f, { tipoDefesa: 'resistencia' })).toBe(true);
        expect(temAcertoAutomatico(f, { tipoDefesa: 'evasiva' })).toBe(false);
    });
    it('sem alvo (ou area) nao vale; sem condicao vale sempre', () => {
        expect(temAcertoAutomatico(atacante('alvo_defende_com:evasiva'))).toBe(false);
        expect(temAcertoAutomatico(atacante('alvo_defende_com:evasiva'), { nome: 'sem defesa' })).toBe(false);
        expect(temAcertoAutomatico(atacante(''), { tipoDefesa: 'evasiva' })).toBe(true);
    });
    it('alvo personagem com ficha: usa tipoDefesa do wrapper', () => {
        const f = atacante('alvo_defende_com:evasiva');
        expect(temAcertoAutomatico(f, { isPersonagem: true, ficha: {}, tipoDefesa: 'evasiva' })).toBe(true);
    });
});
