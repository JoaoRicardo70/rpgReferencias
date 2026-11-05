import { describe, it, expect } from 'vitest';
import {
    normalizarSuporte, destinatariosPermitidos, calcularCuraSuporte, buffsTemporariosDaFicha, efeitosDeBuffsTemporarios,
    somarBuffTemporario, passarTurnoDosBuffs, removerBuffTemporario, LIMITES_SUPORTE
} from './suporte.js';
import { getEfeitosDeClasse } from './attributes.js';
import { calcularCA } from './engine.js';

const buffOk = { atributo: 'forca', propriedade: 'base', valor: 10 };
const efeito = (atributo, propriedade, valor) => ({ atributo, propriedade, valor });

describe('normalizarSuporte', () => {
    it('entradas inválidas viram null', () => {
        expect(normalizarSuporte(null)).toBeNull();
        expect(normalizarSuporte(undefined)).toBeNull();
        expect(normalizarSuporte('x')).toBeNull();
        expect(normalizarSuporte(42)).toBeNull();
    });

    it('cura vazia e sem buffs = null', () => {
        expect(normalizarSuporte({})).toBeNull();
        expect(normalizarSuporte({ cura: { dadosQtd: 0, fixo: 0, percVida: 0 }, buffs: [] })).toBeNull();
        expect(normalizarSuporte({ cura: {} })).toBeNull();
    });

    it('cura vazia mas com buff válido mantém só os buffs (sem chave cura)', () => {
        const s = normalizarSuporte({ cura: { dadosQtd: 0 }, buffs: [buffOk] });
        expect(s).not.toBeNull();
        expect(s.cura).toBeUndefined();
        expect(s.buffs).toHaveLength(1);
    });

    it('aplica os padrões: alvos aliados, duracao 3, maxAlvos 3, mana, Ação', () => {
        const s = normalizarSuporte({ cura: { fixo: 10 } });
        expect(s.alvos).toBe('aliados');
        expect(s.duracao).toBe(3);
        expect(s.maxAlvos).toBe(3);
        expect(s.energia).toBe('mana');
        expect(s.acao).toBe('padrao');
        expect(s.custoPercentual).toBe(0);
        expect(s.cura.dadosFaces).toBe(20);
    });

    it('descarta buffs com atributo ou propriedade inválidos, ou valor não numérico', () => {
        const s = normalizarSuporte({
            buffs: [
                buffOk,
                { atributo: 'inexistente', propriedade: 'base', valor: 1 },
                { atributo: 'forca', propriedade: 'xyz', valor: 1 },
                { atributo: 'acao_padrao', propriedade: 'mbase', valor: 1 },
                { atributo: 'forca', propriedade: 'base', valor: 'abc' },
                { atributo: 'forca', valor: 1 },
                null, 'x'
            ]
        });
        expect(s.buffs).toEqual([{ atributo: 'forca', propriedade: 'base', valor: 10 }]);
    });

    it('só buffs inválidos e sem cura = null', () => {
        expect(normalizarSuporte({ buffs: [{ atributo: 'x', propriedade: 'base', valor: 1 }] })).toBeNull();
    });

    it('valor de buff em texto numérico vira número e nome é cortado em 60', () => {
        const s = normalizarSuporte({ buffs: [{ atributo: 'evasiva', propriedade: 'base', valor: '7.5', nome: 'n'.repeat(100) }] });
        expect(s.buffs[0].valor).toBe(7.5);
        expect(s.buffs[0].nome).toHaveLength(60);
    });

    it('respeita os limites', () => {
        const muitos = Array.from({ length: 50 }, () => buffOk);
        const s = normalizarSuporte({ buffs: muitos, duracao: 999, maxAlvos: 99, custoPercentual: 500, cura: { dadosQtd: 9999, dadosFaces: 99999, fixo: -5, percVida: 99999 } });
        expect(s.buffs).toHaveLength(LIMITES_SUPORTE.buffs);
        expect(s.duracao).toBe(LIMITES_SUPORTE.duracaoMax);
        expect(s.maxAlvos).toBe(LIMITES_SUPORTE.maxAlvos);
        expect(s.custoPercentual).toBe(100);
        expect(s.cura.dadosQtd).toBe(LIMITES_SUPORTE.dadosQtd);
        expect(s.cura.dadosFaces).toBe(LIMITES_SUPORTE.dadosFaces);
        expect(s.cura.fixo).toBe(0);
        expect(s.cura.percVida).toBe(1000);
    });

    it('limites mínimos: maxAlvos >= 1, duracao >= 0, faces >= 2', () => {
        const s = normalizarSuporte({ cura: { dadosQtd: 1, dadosFaces: 1 }, maxAlvos: -4, duracao: -2 });
        expect(s.maxAlvos).toBe(1);
        expect(s.duracao).toBe(0);
        expect(s.cura.dadosFaces).toBe(2);
    });

    it('duracao 0 é preservada (sem prazo) e valores inválidos de enum caem no padrão', () => {
        const s = normalizarSuporte({ cura: { fixo: 1 }, duracao: 0, alvos: 'todos', energia: 'vida', acao: 'xyz' });
        expect(s.duracao).toBe(0);
        expect(s.alvos).toBe('aliados');
        expect(s.energia).toBe('mana');
        expect(s.acao).toBe('padrao');
    });

    it('aceita alvos si/ambos, energias e ações válidas', () => {
        expect(normalizarSuporte({ cura: { fixo: 1 }, alvos: 'si' }).alvos).toBe('si');
        expect(normalizarSuporte({ cura: { fixo: 1 }, alvos: 'ambos' }).alvos).toBe('ambos');
        expect(normalizarSuporte({ cura: { fixo: 1 }, energia: 'chakra', acao: 'reacao' })).toMatchObject({ energia: 'chakra', acao: 'reacao' });
    });
});

describe('destinatariosPermitidos', () => {
    const base = { cura: { fixo: 5 }, maxAlvos: 2 };
    it('si: só eu, ignora aliados', () => {
        expect(destinatariosPermitidos({ ...base, alvos: 'si' }, ['A', 'B'])).toEqual({ eu: true, aliados: [] });
    });
    it('aliados: eu fora, corta em maxAlvos', () => {
        expect(destinatariosPermitidos({ ...base, alvos: 'aliados' }, ['A', 'B', 'C'])).toEqual({ eu: false, aliados: ['A', 'B'] });
    });
    it('ambos: eu e aliados limitados', () => {
        expect(destinatariosPermitidos({ ...base, alvos: 'ambos' }, ['A', 'B', 'C'])).toEqual({ eu: true, aliados: ['A', 'B'] });
    });
    it('filtra falsy e aceita undefined/null', () => {
        expect(destinatariosPermitidos({ ...base, alvos: 'aliados' }, ['', null, 'A'])).toEqual({ eu: false, aliados: ['A'] });
        expect(destinatariosPermitidos({ ...base, alvos: 'aliados' }, undefined)).toEqual({ eu: false, aliados: [] });
        expect(destinatariosPermitidos({ ...base, alvos: 'aliados' }, null)).toEqual({ eu: false, aliados: [] });
    });
    it('suporte inválido não dá destinatário', () => {
        expect(destinatariosPermitidos(null, ['A'])).toEqual({ eu: false, aliados: [] });
    });
});

describe('calcularCuraSuporte', () => {
    it('soma dados (rolar injetado) + fixo + % da Vida', () => {
        const r = calcularCuraSuporte({ cura: { dadosQtd: 3, dadosFaces: 6, fixo: 10, percVida: 10 } }, { vidaMaxExibida: 1000, rolar: () => 4 });
        expect(r.base).toBe(12 + 10 + 100);
        expect(r.total).toBe(122);
        expect(r.detalhe).toContain('3d6 = 12');
        expect(r.detalhe).toContain('+10');
        expect(r.detalhe).toContain('10% da Vida = 100');
    });

    it('rolar recebe o número de faces', () => {
        const faces = [];
        calcularCuraSuporte({ cura: { dadosQtd: 2, dadosFaces: 8 } }, { rolar: (f) => { faces.push(f); return 1; } });
        expect(faces).toEqual([8, 8]);
    });

    it('eficácia corta a cura (50%) e aparece no detalhe', () => {
        const r = calcularCuraSuporte({ cura: { fixo: 100 } }, { eficacia: 0.5 });
        expect(r.base).toBe(100);
        expect(r.total).toBe(50);
        expect(r.detalhe).toContain('cura 50%');
    });

    it('eficácia 0 ou negativa anula a cura; NaN cai em 1', () => {
        expect(calcularCuraSuporte({ cura: { fixo: 100 } }, { eficacia: 0 }).total).toBe(0);
        expect(calcularCuraSuporte({ cura: { fixo: 100 } }, { eficacia: -3 }).total).toBe(0);
        expect(calcularCuraSuporte({ cura: { fixo: 100 } }, { eficacia: NaN }).total).toBe(100);
    });

    it('sem cura ou suporte inválido = 0', () => {
        expect(calcularCuraSuporte({ buffs: [buffOk] })).toEqual({ total: 0, base: 0, detalhe: '' });
        expect(calcularCuraSuporte(null)).toEqual({ total: 0, base: 0, detalhe: '' });
    });

    it('% da Vida arredonda para baixo e ignora vida negativa/inválida', () => {
        expect(calcularCuraSuporte({ cura: { percVida: 33 } }, { vidaMaxExibida: 100 }).total).toBe(33);
        expect(calcularCuraSuporte({ cura: { percVida: 50 } }, { vidaMaxExibida: -100 }).total).toBe(0);
        expect(calcularCuraSuporte({ cura: { percVida: 50 } }, { vidaMaxExibida: 'x' }).total).toBe(0);
    });

    it('usa Math.random por padrão dentro das faces', () => {
        const r = calcularCuraSuporte({ cura: { dadosQtd: 5, dadosFaces: 4 } });
        expect(r.total).toBeGreaterThanOrEqual(5);
        expect(r.total).toBeLessThanOrEqual(20);
    });
});

describe('buffs temporários na ficha', () => {
    const ef = [efeito('forca', 'base', 5)];

    it('buffsTemporariosDaFicha limpa lixo e normaliza campos', () => {
        expect(buffsTemporariosDaFicha(null)).toEqual([]);
        expect(buffsTemporariosDaFicha({})).toEqual([]);
        expect(buffsTemporariosDaFicha({ buffsTemporarios: 'x' })).toEqual([]);
        const lista = buffsTemporariosDaFicha({ buffsTemporarios: [null, { id: 1 }, { id: 2, efeitos: [] }, { id: 3, efeitos: ef, restantes: '2' }, { id: 4, efeitos: ef, restantes: 'x' }] });
        expect(lista).toHaveLength(2);
        expect(lista[0]).toEqual({ id: '3', nome: 'Buff', fonte: '', efeitos: ef, restantes: 2 });
        expect(lista[1].restantes).toBe(0);
    });

    it('limita a quantidade de buffs ativos', () => {
        const muitos = Array.from({ length: 50 }, (_, i) => ({ id: i, efeitos: ef }));
        expect(buffsTemporariosDaFicha({ buffsTemporarios: muitos })).toHaveLength(LIMITES_SUPORTE.buffsAtivosPorFicha);
    });

    it('efeitosDeBuffsTemporarios achata os efeitos e herda o nome do buff', () => {
        const ficha = { buffsTemporarios: [{ id: 'a', nome: 'Bênção', efeitos: [efeito('forca', 'base', 5), { ...efeito('destreza', 'mbase', 2), nome: 'Própria' }] }] };
        expect(efeitosDeBuffsTemporarios(ficha)).toEqual([
            { atributo: 'forca', propriedade: 'base', valor: 5, nome: 'Bênção' },
            { atributo: 'destreza', propriedade: 'mbase', valor: 2, nome: 'Própria' }
        ]);
        expect(efeitosDeBuffsTemporarios(null)).toEqual([]);
        expect(efeitosDeBuffsTemporarios({ buffsTemporarios: [] })).toEqual([]);
    });

    it('somarBuffTemporario adiciona um novo', () => {
        const lista = somarBuffTemporario(undefined, { id: 'x1', nome: 'Escudo', fonte: 'Ana', efeitos: ef, duracao: 4 });
        expect(lista).toEqual([{ id: 'x1', nome: 'Escudo', fonte: 'Ana', efeitos: ef, restantes: 4 }]);
    });

    it('mesma origem + mesmo nome renova em vez de empilhar (sem mutar a lista de entrada)', () => {
        const l1 = somarBuffTemporario([], { id: 'a', nome: 'Escudo', fonte: 'Ana', efeitos: ef, duracao: 1 });
        const copia = JSON.parse(JSON.stringify(l1));
        const l2 = somarBuffTemporario(l1, { id: 'b', nome: 'Escudo', fonte: 'Ana', efeitos: ef, duracao: 5 });
        expect(l2).toHaveLength(1);
        expect(l2[0].id).toBe('b');
        expect(l2[0].restantes).toBe(5);
        expect(l1).toEqual(copia);
    });

    it('outra origem ou outro nome empilha', () => {
        let l = somarBuffTemporario([], { id: 'a', nome: 'Escudo', fonte: 'Ana', efeitos: ef, duracao: 2 });
        l = somarBuffTemporario(l, { id: 'b', nome: 'Escudo', fonte: 'Beto', efeitos: ef, duracao: 2 });
        l = somarBuffTemporario(l, { id: 'c', nome: 'Outro', fonte: 'Ana', efeitos: ef, duracao: 2 });
        expect(l).toHaveLength(3);
    });

    it('somar sem duracao usa 3; duracao 0 fica sem prazo; passa do máximo é cortada', () => {
        expect(somarBuffTemporario([], { id: 'a', nome: 'A', efeitos: ef })[0].restantes).toBe(3);
        expect(somarBuffTemporario([], { id: 'a', nome: 'A', efeitos: ef, duracao: 0 })[0].restantes).toBe(0);
        expect(somarBuffTemporario([], { id: 'a', nome: 'A', efeitos: ef, duracao: 999 })[0].restantes).toBe(LIMITES_SUPORTE.duracaoMax);
    });

    it('somar sem nome vira "Buff"', () => {
        expect(somarBuffTemporario([], { id: 'a', efeitos: ef })[0].nome).toBe('Buff');
    });

    it('passarTurnoDosBuffs: duracao 0 = sem prazo, decrementa os demais e expira ao chegar a 0', () => {
        const ficha = { buffsTemporarios: [
            { id: 'inf', nome: 'Eterno', efeitos: ef, restantes: 0 },
            { id: 'dois', nome: 'Dois', efeitos: ef, restantes: 2 },
            { id: 'um', nome: 'Um', efeitos: ef, restantes: 1 }
        ] };
        const r = passarTurnoDosBuffs(ficha);
        expect(r.expirados).toEqual(['Um']);
        expect(r.lista.map(b => [b.id, b.restantes])).toEqual([['inf', 0], ['dois', 1]]);
        // segunda passada
        const r2 = passarTurnoDosBuffs({ buffsTemporarios: r.lista });
        expect(r2.expirados).toEqual(['Dois']);
        expect(r2.lista.map(b => b.id)).toEqual(['inf']);
        // eterno nunca expira
        const r3 = passarTurnoDosBuffs({ buffsTemporarios: r2.lista });
        expect(r3.expirados).toEqual([]);
        expect(r3.lista).toHaveLength(1);
    });

    it('passarTurnoDosBuffs em ficha sem buffs', () => {
        expect(passarTurnoDosBuffs({})).toEqual({ lista: [], expirados: [] });
        expect(passarTurnoDosBuffs(null)).toEqual({ lista: [], expirados: [] });
    });

    it('passarTurnoDosBuffs não muta a ficha', () => {
        const ficha = { buffsTemporarios: [{ id: 'a', nome: 'A', efeitos: ef, restantes: 3 }] };
        passarTurnoDosBuffs(ficha);
        expect(ficha.buffsTemporarios[0].restantes).toBe(3);
    });

    it('removerBuffTemporario tira pelo id (aceita número) e ignora id inexistente', () => {
        const lista = [{ id: 'a', nome: 'A', efeitos: ef }, { id: '7', nome: 'B', efeitos: ef }];
        expect(removerBuffTemporario(lista, 'a').map(b => b.id)).toEqual(['7']);
        expect(removerBuffTemporario(lista, 7).map(b => b.id)).toEqual(['a']);
        expect(removerBuffTemporario(lista, 'zzz')).toHaveLength(2);
        expect(removerBuffTemporario(undefined, 'a')).toEqual([]);
    });
});

describe('integração: engine enxerga os buffs temporários', () => {
    const buffs = [{ id: 'b1', nome: 'Véu', fonte: 'Ana', restantes: 2, efeitos: [efeito('evasiva', 'base', 7)] }];

    it('getEfeitosDeClasse inclui os efeitos dos buffs (ficha sem classe)', () => {
        const efs = getEfeitosDeClasse({ buffsTemporarios: buffs });
        expect(efs).toContainEqual({ atributo: 'evasiva', propriedade: 'base', valor: 7, nome: 'Véu' });
    });

    it('getEfeitosDeClasse sem buffs não traz nada deles', () => {
        expect(getEfeitosDeClasse({}).filter(e => e.nome === 'Véu')).toEqual([]);
    });

    it('getEfeitosDeClasse inclui os buffs também em ficha com classe', () => {
        const efs = getEfeitosDeClasse({ bio: { classe: 'classe_inexistente' }, buffsTemporarios: buffs });
        expect(efs.some(e => e.nome === 'Véu')).toBe(true);
    });

    it('calcularCA soma o buff temporário', () => {
        const sem = calcularCA({ destreza: { base: 5 }, poderes: [], inventario: [] }, 'evasiva');
        const com = calcularCA({ destreza: { base: 5 }, poderes: [], inventario: [], buffsTemporarios: buffs }, 'evasiva');
        // o +7 entra na reducao: 12 + reduzirComBonus(5, 0)=15 -> 12 + reduzirComBonus(5, 7)=20
        expect(sem).toBe(15);
        expect(com).toBe(20);
    });

    it('calcularCA não soma buff de outro tipo de defesa', () => {
        const sem = calcularCA({ forca: { base: 100 }, poderes: [], inventario: [] }, 'resistencia');
        const com = calcularCA({ forca: { base: 100 }, poderes: [], inventario: [], buffsTemporarios: buffs }, 'resistencia');
        expect(com).toBe(sem);
    });
});
