import { describe, it, expect } from 'vitest';
import {
    calcularPendencias, aplicarDecisao, fotografarGanhos, lerFotoGanhos, lerGanhosPermanentes, descreverPendencias, iniciarFim, concluirFim,
    aprovarGanhosPermanentesLigado, cenarioComAprovacao, CAMINHO_FOTO_GANHOS,
} from './aprovacaoPermanente';
import { dispararEventoNaFicha } from './gatilhosAplicar';

const fichaCom = ({ soma = 0, turnos = 0, perm, foto, extra } = {}) => ({
    combate: { adaptacaoLigada: true, adaptacaoFator: 1.3, adaptacaoSoma: soma, adaptacaoTurnos: turnos, ...(foto ? { ganhosAntesDoCombate: foto } : {}) },
    ...(perm ? { ganhosPermanentes: perm } : {}),
    ...(extra || {}),
});

describe('foto dos ganhos permanentes', () => {
    it('copia ganhosPermanentes (0/1 se ausente) e nao altera os ganhos', () => {
        const f = fichaCom({ perm: { poderCalculado: 0.4, fatorPoder: 2 } });
        expect(fotografarGanhos(f)).toEqual({ poderCalculado: 0.4, fatorPoder: 2 });
        expect(f.combate.ganhosAntesDoCombate).toEqual({ poderCalculado: 0.4, fatorPoder: 2 });
        expect(f.ganhosPermanentes).toEqual({ poderCalculado: 0.4, fatorPoder: 2 });
        const g = {};
        fotografarGanhos(g);
        expect(g.combate.ganhosAntesDoCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
    });
    it('sanea valores invalidos', () => {
        expect(lerGanhosPermanentes({ ganhosPermanentes: { poderCalculado: -3, fatorPoder: 'x' } })).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(lerFotoGanhos({ combate: { ganhosAntesDoCombate: 'lixo' } })).toBeNull();
        expect(lerFotoGanhos({})).toBeNull();
    });
});

describe('calcularPendencias', () => {
    it('sem nada: sem pendencia', () => {
        expect(calcularPendencias({})).toEqual({ temPendencia: false, adaptacao: null, derivados: null });
        expect(calcularPendencias(fichaCom({ perm: { poderCalculado: 0.2 }, foto: { poderCalculado: 0.2, fatorPoder: 1 } })).temPendencia).toBe(false);
    });
    it('Adaptacao: media = soma / turnos', () => {
        const p = calcularPendencias(fichaCom({ soma: 30, turnos: 2 }));
        expect(p.temPendencia).toBe(true);
        expect(p.adaptacao).toEqual({ pct: 15, turnos: 2, soma: 30 });
        expect(p.derivados).toBeNull();
    });
    it('derivados: diferenca atual - foto (aditivo) e razao (fator); so com foto', () => {
        const p = calcularPendencias(fichaCom({ perm: { poderCalculado: 0.9, fatorPoder: 3 }, foto: { poderCalculado: 0.4, fatorPoder: 2 } }));
        expect(p.derivados.poderCalculado).toBeCloseTo(0.5, 9);
        expect(p.derivados.fatorPoder).toBeCloseTo(1.5, 9);
        const semFoto = calcularPendencias(fichaCom({ perm: { poderCalculado: 0.9, fatorPoder: 3 } }));
        expect(semFoto.derivados).toBeNull();
        expect(semFoto.temPendencia).toBe(false);
    });
    it('perda de Poder (atual < foto) nao e pendencia aditiva', () => {
        const p = calcularPendencias(fichaCom({ perm: { poderCalculado: 0.1 }, foto: { poderCalculado: 0.4, fatorPoder: 1 } }));
        expect(p.derivados).toBeNull();
    });
    it('respeita o clamp da media da Adaptacao', () => {
        const p = calcularPendencias(fichaCom({ soma: 5e9, turnos: 1 }));
        expect(p.adaptacao.pct).toBe(1e6);
    });
    it('descreve os valores', () => {
        const p = calcularPendencias(fichaCom({ soma: 30, turnos: 2, perm: { poderCalculado: 0.5 }, foto: { poderCalculado: 0, fatorPoder: 1 } }));
        expect(descreverPendencias(p)).toBe('+15% (Adaptação) · +50% (derivados)');
    });
});

describe('aplicarDecisao', () => {
    const base = () => fichaCom({ soma: 30, turnos: 2, perm: { poderCalculado: 0.9, fatorPoder: 3 }, foto: { poderCalculado: 0.4, fatorPoder: 2 } });

    it('liberar: converte a Adaptacao, mantem derivados e apaga a foto', () => {
        const f = base();
        const r = aplicarDecisao(f, 'liberar', { nome: 'Natsu' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(1.05, 9);
        expect(f.ganhosPermanentes.fatorPoder).toBe(3);
        expect(f.combate.adaptacaoFator).toBe(1);
        expect(f.combate.adaptacaoTurnos).toBe(0);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', CAMINHO_FOTO_GANHOS, 'combate/adaptacaoFator']));
        expect(r.textos[0]).toMatch(/^✅ Natsu: ganho permanente liberado: \+15% \(Adaptação\)/);
    });
    it('recusar: zera a Adaptacao sem converter e restaura a foto', () => {
        const f = base();
        const r = aplicarDecisao(f, 'recusar', { nome: 'Natsu' });
        expect(f.ganhosPermanentes).toEqual({ poderCalculado: 0.4, fatorPoder: 2 });
        expect(f.combate.adaptacaoFator).toBe(1);
        expect(f.combate.adaptacaoSoma).toBe(0);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'ganhosPermanentes/fatorPoder', CAMINHO_FOTO_GANHOS]));
        expect(r.textos[0]).toBe('❌ Natsu: o Mestre recusou os ganhos permanentes deste combate; Poder volta ao de antes');
    });
    it('recusar sem foto: so a Adaptacao e recusada, derivados ficam', () => {
        const f = fichaCom({ soma: 30, turnos: 2, perm: { poderCalculado: 0.9 } });
        aplicarDecisao(f, 'recusar');
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.9);
        expect(f.combate.adaptacaoTurnos).toBe(0);
    });
    it('sem pendencia: nao gera texto, mas apaga a foto', () => {
        const f = fichaCom({ foto: { poderCalculado: 0, fatorPoder: 1 } });
        const r = aplicarDecisao(f, 'recusar');
        expect(r.textos).toEqual([]);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
    });
    it('e idempotente (segunda chamada nao muda nada)', () => {
        const f = base();
        aplicarDecisao(f, 'recusar');
        const antes = JSON.stringify(f);
        const r = aplicarDecisao(f, 'recusar');
        expect(JSON.stringify(f)).toBe(antes);
        expect(r.caminhos).toEqual([]);
    });
    it('modo adiar nao toca em nada; limpar zera sem converter e apaga a foto', () => {
        const f = base();
        const antes = JSON.stringify(f);
        iniciarFim(f, 'adiar'); concluirFim(f, 'adiar');
        expect(JSON.stringify(f)).toBe(antes);
        iniciarFim(f, 'limpar'); concluirFim(f, 'limpar');
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.9);
        expect(f.combate.adaptacaoTurnos).toBe(0);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
    });
});

describe('fimDeLuta com ctx.permanente', () => {
    const fichaVerg = () => ({
        combate: { adaptacaoLigada: true, adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 2, ganhosAntesDoCombate: { poderCalculado: 0.1, fatorPoder: 1 } },
        ganhosPermanentes: { poderCalculado: 0.3, fatorPoder: 1 },
        poderes: [{ id: 'p1', nome: 'Ego', ativa: true, gatilhos: [{ id: 'g1', nome: 'Ego Superior', evento: { tipo: 'fimDeLuta' }, passivo: true, acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 50 }] }] }],
    });
    it('padrao (converter): como antes, e a foto some', () => {
        const f = fichaVerg();
        const r = dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { nome: 'X' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.3 + 0.5 + 0.1, 6);
        expect(f.combate.ganhosAntesDoCombate).toBeUndefined();
        expect(r.caminhos).toContain(CAMINHO_FOTO_GANHOS);
    });
    it('recusar desfaz inclusive o ganho que o gatilho de fimDeLuta deu', () => {
        const f = fichaVerg();
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { nome: 'X', permanente: 'recusar' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        expect(f.combate.adaptacaoTurnos).toBe(0);
    });
    it('liberar aplica tudo', () => {
        const f = fichaVerg();
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { nome: 'X', permanente: 'liberar' });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.3 + 0.5 + 0.1, 6);
    });
    it('adiar: nao converte, nao zera a Adaptacao e mantem a foto', () => {
        const f = fichaVerg();
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { nome: 'X', permanente: 'adiar' });
        expect(f.combate.adaptacaoTurnos).toBe(2);
        expect(f.combate.ganhosAntesDoCombate).toEqual({ poderCalculado: 0.1, fatorPoder: 1 });
    });
});

describe('opcao do Mestre', () => {
    it('ausente = ligada; so false desliga', () => {
        expect(aprovarGanhosPermanentesLigado(undefined)).toBe(true);
        expect(aprovarGanhosPermanentesLigado({})).toBe(true);
        expect(aprovarGanhosPermanentesLigado({ aprovarGanhosPermanentes: true })).toBe(true);
        expect(aprovarGanhosPermanentesLigado({ aprovarGanhosPermanentes: false })).toBe(false);
    });
    it('cenarioComAprovacao devolve copia', () => {
        const c = { ativa: 'a' };
        expect(cenarioComAprovacao(c, false).aprovarGanhosPermanentes).toBe(false);
        expect('aprovarGanhosPermanentes' in cenarioComAprovacao({ aprovarGanhosPermanentes: false }, true)).toBe(false);
        expect(c).toEqual({ ativa: 'a' });
    });
});
