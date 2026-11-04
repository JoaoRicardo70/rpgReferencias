import { describe, it, expect } from 'vitest';
import {
    normalizarSuporte, somarBuffTemporario, passarTurnoDosBuffs, removerBuffsDoCombate, buffsTemporariosDaFicha,
    fontesDeSuporte, suportesPassivos, efeitosDeSuportePassivo, curaPassivaDoTurno
} from './suporte.js';
import { getEfeitosDeClasse } from './attributes.js';
import { calcularCA } from './engine.js';

const buff = { atributo: 'evasiva', propriedade: 'base', valor: 7 };
const efeitos = [buff];

describe('normalizarSuporte: modo passivo', () => {
    it('forca alvos si, acao nenhuma, custo 0 e duracao permanente', () => {
        const s = normalizarSuporte({ modo: 'passivo', buffs: [buff], alvos: 'aliados', acao: 'padrao', custoPercentual: 40, duracao: 5, duracaoModo: 'turnos' });
        expect(s.modo).toBe('passivo');
        expect(s.alvos).toBe('si');
        expect(s.acao).toBe('nenhuma');
        expect(s.custoPercentual).toBe(0);
        expect(s.duracaoModo).toBe('permanente');
        expect(s.duracao).toBe(0);
    });
    it('modo desconhecido vira uso', () => {
        expect(normalizarSuporte({ modo: 'xyz', buffs: [buff] }).modo).toBe('uso');
        expect(normalizarSuporte({ buffs: [buff] }).modo).toBe('uso');
    });
    it('passivo sem cura nem buff valido continua null', () => {
        expect(normalizarSuporte({ modo: 'passivo' })).toBeNull();
    });
});

describe('normalizarSuporte: duracaoModo', () => {
    it.each(['turnos', 'combate', 'permanente'])('aceita %s', (m) => {
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: m, duracao: 4 }).duracaoModo).toBe(m);
    });
    it('turnos mantem a duracao (minimo 1); combate e permanente zeram', () => {
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: 'turnos', duracao: 4 }).duracao).toBe(4);
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: 'turnos', duracao: 0 }).duracao).toBe(1);
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: 'combate', duracao: 4 }).duracao).toBe(0);
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: 'permanente', duracao: 4 }).duracao).toBe(0);
    });
    it('dados antigos: so duracao > 0 vira turnos', () => {
        const s = normalizarSuporte({ buffs: [buff], duracao: 5 });
        expect(s.duracaoModo).toBe('turnos');
        expect(s.duracao).toBe(5);
    });
    it('dados antigos: duracao 0 vira permanente', () => {
        const s = normalizarSuporte({ buffs: [buff], duracao: 0 });
        expect(s.duracaoModo).toBe('permanente');
        expect(s.duracao).toBe(0);
    });
    it('duracaoModo invalido cai na regra antiga', () => {
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: 'lixo', duracao: 2 }).duracaoModo).toBe('turnos');
        expect(normalizarSuporte({ buffs: [buff], duracaoModo: 'lixo', duracao: 0 }).duracaoModo).toBe('permanente');
    });
    it('sem duracao informada usa o padrao 3 turnos', () => {
        const s = normalizarSuporte({ buffs: [buff] });
        expect(s.duracaoModo).toBe('turnos');
        expect(s.duracao).toBe(3);
    });
});

describe('somarBuffTemporario com duracaoModo', () => {
    it('combate: flag ateFimCombate e restantes 0', () => {
        const l = somarBuffTemporario([], { id: 'a', nome: 'B', fonte: 'X', efeitos, duracao: 5, duracaoModo: 'combate' });
        expect(l[0].ateFimCombate).toBe(true);
        expect(l[0].restantes).toBe(0);
    });
    it('turnos (padrao): restantes = duracao, sem flag', () => {
        const l = somarBuffTemporario([], { id: 'a', nome: 'B', fonte: 'X', efeitos, duracao: 5 });
        expect(l[0].restantes).toBe(5);
        expect(l[0].ateFimCombate).toBeUndefined();
    });
    it('permanente: restantes 0, sem flag', () => {
        const l = somarBuffTemporario([], { id: 'a', nome: 'B', fonte: 'X', efeitos, duracao: 5, duracaoModo: 'permanente' });
        expect(l[0].restantes).toBe(0);
        expect(l[0].ateFimCombate).toBeUndefined();
    });
    it('mesma origem e nome renova trocando o modo', () => {
        let l = somarBuffTemporario([], { id: 'a', nome: 'B', fonte: 'X', efeitos, duracao: 5 });
        l = somarBuffTemporario(l, { id: 'b', nome: 'B', fonte: 'X', efeitos, duracaoModo: 'combate' });
        expect(l).toHaveLength(1);
        expect(l[0].ateFimCombate).toBe(true);
    });
});

describe('passarTurnoDosBuffs / removerBuffsDoCombate com os tres modos', () => {
    const lista = () => {
        let l = somarBuffTemporario([], { id: 'c', nome: 'Combate', fonte: 'X', efeitos, duracaoModo: 'combate' });
        l = somarBuffTemporario(l, { id: 't', nome: 'Turnos', fonte: 'X', efeitos, duracao: 2 });
        l = somarBuffTemporario(l, { id: 'p', nome: 'Perm', fonte: 'X', efeitos, duracaoModo: 'permanente' });
        return l;
    };
    it('passar turno: combate e permanente nao expiram, turnos perde 1', () => {
        const r = passarTurnoDosBuffs({ buffsTemporarios: lista() });
        expect(r.expirados).toEqual([]);
        expect(r.lista.map(b => b.nome)).toEqual(['Combate', 'Turnos', 'Perm']);
        expect(r.lista.find(b => b.nome === 'Turnos').restantes).toBe(1);
    });
    it('buff por turnos expira no segundo turno e os outros ficam', () => {
        const r1 = passarTurnoDosBuffs({ buffsTemporarios: lista() });
        const r2 = passarTurnoDosBuffs({ buffsTemporarios: r1.lista });
        expect(r2.expirados).toEqual(['Turnos']);
        expect(r2.lista.map(b => b.nome)).toEqual(['Combate', 'Perm']);
    });
    it('buff de 1 turno expira ja no primeiro avanco', () => {
        const l = somarBuffTemporario([], { id: 'u', nome: 'Um', fonte: 'X', efeitos, duracao: 1 });
        expect(passarTurnoDosBuffs({ buffsTemporarios: l })).toEqual({ lista: [], expirados: ['Um'] });
    });
    it('fim do combate: so o ateFimCombate sai', () => {
        const r = removerBuffsDoCombate(lista());
        expect(r.map(b => b.nome)).toEqual(['Turnos', 'Perm']);
        expect(r.find(b => b.nome === 'Turnos').restantes).toBe(2);
    });
    it('entradas vazias/invalidas nao quebram', () => {
        expect(removerBuffsDoCombate(undefined)).toEqual([]);
        expect(removerBuffsDoCombate(null)).toEqual([]);
        expect(passarTurnoDosBuffs({})).toEqual({ lista: [], expirados: [] });
        expect(passarTurnoDosBuffs(null)).toEqual({ lista: [], expirados: [] });
    });
    it('buffsTemporariosDaFicha preserva a flag ateFimCombate', () => {
        expect(buffsTemporariosDaFicha({ buffsTemporarios: lista() }).find(b => b.id === 'c').ateFimCombate).toBe(true);
    });
});

const passivoBuff = { modo: 'passivo', buffs: [buff] };
const passivoCura = { modo: 'passivo', cura: { fixo: 100 } };

describe('fontesDeSuporte', () => {
    it('ficha vazia/nula', () => {
        expect(fontesDeSuporte(null)).toEqual([]);
        expect(fontesDeSuporte({})).toEqual([]);
    });
    it('Poder so conta se ativa', () => {
        expect(fontesDeSuporte({ poderes: [{ nome: 'P', ativa: false, suporte: passivoBuff }] })).toEqual([]);
        expect(fontesDeSuporte({ poderes: [{ nome: 'P', ativa: true, suporte: passivoBuff }] })).toHaveLength(1);
    });
    it('Tecnica so conta se equipada', () => {
        expect(fontesDeSuporte({ ataquesElementais: [{ nome: 'T', equipado: false, suporte: passivoBuff }] })).toEqual([]);
        expect(fontesDeSuporte({ ataquesElementais: [{ nome: 'T', equipado: true, suporte: passivoBuff }] })[0].nome).toBe('T');
    });
    it('Item so conta se equipado', () => {
        expect(fontesDeSuporte({ inventario: [{ nome: 'I', suporte: passivoBuff }] })).toEqual([]);
        expect(fontesDeSuporte({ inventario: [{ nome: 'I', equipado: true, suporte: passivoBuff }] })[0].nome).toBe('I');
    });
    it('ignora entradas sem suporte ou nulas', () => {
        expect(fontesDeSuporte({ poderes: [null, { ativa: true }], inventario: [null, { equipado: true }], ataquesElementais: [null] })).toEqual([]);
    });
    it('nomes padrao quando sem nome', () => {
        const f = fontesDeSuporte({ poderes: [{ ativa: true, suporte: passivoBuff }], ataquesElementais: [{ equipado: true, suporte: passivoBuff }], inventario: [{ equipado: true, suporte: passivoBuff }] });
        expect(f.map(x => x.nome)).toEqual(['Poder', 'Técnica', 'Item']);
    });
    describe('Arma Espiritual', () => {
        const arma = (extra = {}) => ({
            armaEspiritual: {
                nome: 'Lamina', acessoArma: true, estadoAtivo: 'base',
                efeitosEstados: { base: { suporte: passivoBuff }, verdadeira: { suporte: passivoCura } },
                ...extra
            }
        });
        it('conta no estado efetivo com acesso', () => {
            const f = fontesDeSuporte(arma());
            expect(f).toHaveLength(1);
            expect(f[0].nome).toBe('Lamina');
        });
        it('so o bloco do estado efetivo vale (verdadeira)', () => {
            const f = fontesDeSuporte(arma({ estadoAtivo: 'verdadeira' }));
            expect(f).toHaveLength(1);
            expect(f[0].suporte).toBe(passivoCura);
        });
        it('estado sem acesso cai um nivel (fantasma sem acesso -> verdadeira)', () => {
            const f = fontesDeSuporte(arma({ estadoAtivo: 'fantasma', acessoFantasma: false }));
            expect(f[0].suporte).toBe(passivoCura);
        });
        it('desequipada nao conta', () => {
            expect(fontesDeSuporte(arma({ equipada: false }))).toEqual([]);
        });
        it('sem acesso nao conta', () => {
            expect(fontesDeSuporte(arma({ acessoArma: false }))).toEqual([]);
        });
        it('estado ativo sem bloco de suporte nao conta', () => {
            expect(fontesDeSuporte(arma({ estadoAtivo: 'fantasma', acessoFantasma: true }))).toEqual([]);
        });
        it('nome padrao quando a arma nao tem nome', () => {
            expect(fontesDeSuporte(arma({ nome: undefined }))[0].nome).toBe('Arma Espiritual');
        });
    });
});

describe('suportesPassivos / efeitosDeSuportePassivo', () => {
    it('filtra apenas os de modo passivo', () => {
        const ficha = { poderes: [
            { nome: 'A', ativa: true, suporte: passivoBuff },
            { nome: 'B', ativa: true, suporte: { buffs: [buff] } },
            { nome: 'C', ativa: true, suporte: { modo: 'passivo' } }
        ] };
        expect(suportesPassivos(ficha).map(f => f.nome)).toEqual(['A']);
    });
    it('efeitos usam nome do buff ou da fonte', () => {
        const ficha = { poderes: [{ nome: 'Aura', ativa: true, suporte: { modo: 'passivo', buffs: [buff, { ...buff, nome: 'Custom' }] } }] };
        const e = efeitosDeSuportePassivo(ficha);
        expect(e).toEqual([
            { atributo: 'evasiva', propriedade: 'base', valor: 7, nome: 'Aura' },
            { atributo: 'evasiva', propriedade: 'base', valor: 7, nome: 'Custom' }
        ]);
    });
    it('somem quando o Poder desliga', () => {
        const ficha = { poderes: [{ nome: 'Aura', ativa: true, suporte: passivoBuff }] };
        expect(efeitosDeSuportePassivo(ficha)).toHaveLength(1);
        ficha.poderes[0].ativa = false;
        expect(efeitosDeSuportePassivo(ficha)).toEqual([]);
    });
    it('suporte de uso (nao passivo) nao gera efeito', () => {
        expect(efeitosDeSuportePassivo({ poderes: [{ nome: 'X', ativa: true, suporte: { buffs: [buff] } }] })).toEqual([]);
    });
});

describe('getEfeitosDeClasse e calcularCA enxergam o suporte passivo', () => {
    const mk = (ativa) => ({ poderes: [{ nome: 'Aura', ativa, suporte: passivoBuff }] });
    it('getEfeitosDeClasse inclui o buff enquanto o Poder esta ativo', () => {
        expect(getEfeitosDeClasse(mk(true)).some(e => e.atributo === 'evasiva' && e.valor === 7)).toBe(true);
        expect(getEfeitosDeClasse(mk(false)).some(e => e.atributo === 'evasiva')).toBe(false);
    });
    it('calcularCA sobe pelo valor do buff passivo e volta ao desligar', () => {
        const base = calcularCA(mk(false), 'evasiva');
        expect(base).toBe(3); // reduzirComBonus(5, 0)
        expect(calcularCA(mk(true), 'evasiva')).toBe(8); // reduzirComBonus(5, 7) = 8
    });
    it('buff temporario tambem entra na CA', () => {
        const f = mk(false);
        const base = calcularCA(f, 'evasiva');
        f.buffsTemporarios = somarBuffTemporario([], { id: 'x', nome: 'T', fonte: 'Y', efeitos, duracaoModo: 'combate' });
        expect(base).toBe(3);
        expect(calcularCA(f, 'evasiva')).toBe(8); // reduzirComBonus(5, 7)
    });
});

describe('curaPassivaDoTurno', () => {
    it('sem fontes passivas: zero', () => {
        expect(curaPassivaDoTurno({})).toEqual({ total: 0, partes: [] });
    });
    it('fixo + % da Vida, somando varias fontes (rolar injetado)', () => {
        const ficha = { poderes: [
            { nome: 'A', ativa: true, suporte: { modo: 'passivo', cura: { fixo: 100 } } },
            { nome: 'B', ativa: true, suporte: { modo: 'passivo', cura: { percVida: 10 } } }
        ] };
        const r = curaPassivaDoTurno(ficha, { vidaMaxExibida: 1000, rolar: () => 1 });
        expect(r.partes.map(p => [p.nome, p.valor])).toEqual([['A', 100], ['B', 100]]);
        expect(r.total).toBe(200);
    });
    it('usa o rolar injetado nos dados', () => {
        const ficha = { poderes: [{ nome: 'A', ativa: true, suporte: { modo: 'passivo', cura: { dadosQtd: 3, dadosFaces: 6 } } }] };
        const r = curaPassivaDoTurno(ficha, { rolar: (f) => f });
        expect(r.total).toBe(18);
        expect(r.partes[0].detalhe).toContain('3d6');
    });
    it('ignora suporte so de buffs, de uso e Poder desligado', () => {
        const ficha = { poderes: [
            { nome: 'A', ativa: true, suporte: passivoBuff },
            { nome: 'B', ativa: true, suporte: { cura: { fixo: 50 } } },
            { nome: 'C', ativa: false, suporte: passivoCura }
        ] };
        expect(curaPassivaDoTurno(ficha, { rolar: () => 1 })).toEqual({ total: 0, partes: [] });
    });
    it('% da Vida com vidaMaxExibida 0 nao cura', () => {
        const ficha = { poderes: [{ nome: 'A', ativa: true, suporte: { modo: 'passivo', cura: { percVida: 50 } } }] };
        expect(curaPassivaDoTurno(ficha, { vidaMaxExibida: 0 }).total).toBe(0);
    });
});
