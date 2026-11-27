import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import { resolverEfeitosEntidade, escalarEfeitosPorContador } from './efeitos-resolver';
import { montarEscalasDoEfeito, ESCALA_VAZIA } from './escalaEfeito';
import { calcularEficaciaCura } from './engine';
import { calcularMultiplicadorFuriaClasse } from './furia';

beforeEach(() => { useStore.setState({ personagens: {}, cenario: { ativa: 'default' }, isMestre: false }); });

const ef = (extra = {}) => ({ atributo: 'forca', propriedade: 'base', valor: '10', ...extra });
const ficha = (valor = 4) => ({ contadores: [{ id: 'c1', nome: 'Carga', valor }] });

describe('M8 escalarEfeitosPorContador', () => {
    it('soma valor + fator x contador', () => {
        const r = escalarEfeitosPorContador([ef({ escalaContador: { contadorId: 'c1', fator: 5 } })], ficha(4).contadores);
        expect(r[0].valor).toBe('30');
    });
    it('fator negativo e decimal (virgula no valor-base)', () => {
        const r = escalarEfeitosPorContador([ef({ valor: '1,5', escalaContador: { contadorId: 'c1', fator: -0.25 } })], ficha(4).contadores);
        expect(r[0].valor).toBe('0.5');
    });
    it('nao muta o efeito original', () => {
        const e = ef({ escalaContador: { contadorId: 'c1', fator: 5 } });
        escalarEfeitosPorContador([e], ficha().contadores);
        expect(e.valor).toBe('10');
    });
    it('valor-base vazio conta como 0', () => {
        expect(escalarEfeitosPorContador([ef({ valor: '', escalaContador: { contadorId: 'c1', fator: 2 } })], ficha(3).contadores)[0].valor).toBe('6');
    });
    it('contador inexistente / sem lista / undefined = mesma referencia', () => {
        const l = [ef({ escalaContador: { contadorId: 'zzz', fator: 5 } })];
        expect(escalarEfeitosPorContador(l, ficha().contadores)).toBe(l);
        expect(escalarEfeitosPorContador(l, undefined)).toBe(l);
        expect(escalarEfeitosPorContador(l, [])).toBe(l);
    });
    it('valor nao numerico (dado 20d6) nao escala e nao vira NaN', () => {
        const l = [ef({ atributo: 'dano_dados', valor: '20d6', escalaContador: { contadorId: 'c1', fator: 5 } })];
        const r = escalarEfeitosPorContador(l, ficha().contadores);
        expect(r).toBe(l);
    });
    it.each([[0], [Infinity], [NaN], [1e7], ['abc'], [null]])('fator %s = sem escala', (fator) => {
        const l = [ef({ escalaContador: { contadorId: 'c1', fator } })];
        expect(escalarEfeitosPorContador(l, ficha().contadores)).toBe(l);
    });
    it('contador com valor nao numerico = sem escala', () => {
        const l = [ef({ escalaContador: { contadorId: 'c1', fator: 5 } })];
        expect(escalarEfeitosPorContador(l, [{ id: 'c1', valor: 'x' }])).toBe(l);
    });
    it('contador 0 = mesma referencia (total === base)', () => {
        const l = [ef({ escalaContador: { contadorId: 'c1', fator: 5 } })];
        expect(escalarEfeitosPorContador(l, ficha(0).contadores)).toBe(l);
    });
    it('sem nenhum efeito escalavel devolve a mesma lista (sem alocar)', () => {
        const l = [ef(), ef({ atributo: 'acerto' })];
        expect(escalarEfeitosPorContador(l, ficha().contadores)).toBe(l);
    });
    it('entrada nao array / itens invalidos nao lancam', () => {
        expect(escalarEfeitosPorContador(undefined, [])).toBeUndefined();
        expect(escalarEfeitosPorContador(null, [])).toBeNull();
        const l = [null, 'x', ef({ escalaContador: { contadorId: 'c1', fator: 1 } })];
        expect(escalarEfeitosPorContador(l, ficha(2).contadores)[2].valor).toBe('12');
    });
    it('so escala os efeitos marcados, mantendo os demais', () => {
        const a = ef(); const b = ef({ escalaContador: { contadorId: 'c1', fator: 1 } });
        const r = escalarEfeitosPorContador([a, b], ficha(1).contadores);
        expect(r[0]).toBe(a); expect(r[1].valor).toBe('11');
    });
    it('id numerico do contador compara como texto', () => {
        const r = escalarEfeitosPorContador([ef({ escalaContador: { contadorId: '7', fator: 1 } })], [{ id: 7, valor: 3 }]);
        expect(r[0].valor).toBe('13');
    });
});

describe('M8 resolverEfeitosEntidade', () => {
    const poder = { id: 'p', efeitos: [ef({ escalaContador: { contadorId: 'c1', fator: 2 } })], efeitosPassivos: [ef({ atributo: 'evasiva', escalaContador: { contadorId: 'c1', fator: 3 } })] };
    it('escala ativos e passivos usando a ficha', () => {
        const r = resolverEfeitosEntidade(poder, ficha(4));
        expect(r.efeitos[0].valor).toBe('18');
        expect(r.efeitosPassivos[0].valor).toBe('22');
    });
    it('aceita a lista de contadores direto como fonte', () => {
        expect(resolverEfeitosEntidade(poder, ficha(1).contadores).efeitos[0].valor).toBe('12');
    });
    it('sem fonte = efeitos originais; ficha sem contadores = mesma referencia do resultado', () => {
        expect(resolverEfeitosEntidade(poder).efeitos[0].valor).toBe('10');
        const r = resolverEfeitosEntidade(poder, {});
        expect(r.efeitos).toBe(poder.efeitos);
    });
    it('sem escala em nenhum efeito devolve o mesmo objeto resolvido', () => {
        const p = { id: 'q', efeitos: [ef()], efeitosPassivos: [] };
        expect(resolverEfeitosEntidade(p, ficha()).efeitos).toBe(p.efeitos);
    });
    it('entidade nula nao lanca', () => {
        expect(resolverEfeitosEntidade(null, ficha())).toEqual({ efeitos: [], efeitosPassivos: [] });
    });
    it('Forma ativa tambem escala', () => {
        const p = { id: 'p', efeitos: [], formas: [{ id: 'f', efeitos: [ef({ escalaContador: { contadorId: 'c1', fator: 1 } })] }], formaAtivaId: 'f' };
        expect(resolverEfeitosEntidade(p, ficha(5)).efeitos[0].valor).toBe('15');
    });
});

describe('M8 efetividade_cura e furia respeitam a escala', () => {
    it('efetividade_cura passiva escalada', () => {
        const f = { ...ficha(3), poderes: [{ id: 'p', ativa: false, efeitos: [], efeitosPassivos: [{ atributo: 'cura', propriedade: 'efetividade_cura', valor: '0.1', escalaContador: { contadorId: 'c1', fator: 0.1 } }] }] };
        const base = calcularEficaciaCura({ ...f, poderes: [{ ...f.poderes[0], efeitosPassivos: [{ propriedade: 'efetividade_cura', valor: '0.1' }] }] });
        expect(calcularEficaciaCura(f)).toBeGreaterThan(base);
        expect(calcularEficaciaCura(f) / base).toBeCloseTo(1.4 / 1.1, 5);
    });
    it('efetividade_cura em poder desligado so escala os passivos', () => {
        const f = { ...ficha(3), poderes: [{ id: 'p', ativa: false, efeitos: [{ propriedade: 'efetividade_cura', valor: '1', escalaContador: { contadorId: 'c1', fator: 1 } }], efeitosPassivos: [] }] };
        expect(calcularEficaciaCura(f)).toBe(calcularEficaciaCura({ poderes: [] }));
    });
    it('furia_berserker ativo escalado', () => {
        const f = { ...ficha(3), poderes: [{ id: 'p', ativa: true, efeitos: [{ atributo: 'x', propriedade: 'furia_berserker', valor: '1', escalaContador: { contadorId: 'c1', fator: 0.5 } }], efeitosPassivos: [] }] };
        expect(calcularMultiplicadorFuriaClasse(f)).toBeCloseTo(2.5, 5);
    });
    it('furia sem contadores na ficha mantem o valor base', () => {
        const f = { poderes: [{ id: 'p', ativa: true, efeitos: [{ propriedade: 'furia_berserker', valor: '1', escalaContador: { contadorId: 'c1', fator: 0.5 } }] }] };
        expect(calcularMultiplicadorFuriaClasse(f)).toBe(1);
    });
});

describe('montarEscalasDoEfeito (editor)', () => {
    it('vazio = campos vazios', () => {
        expect(montarEscalasDoEfeito(ESCALA_VAZIA, 'forca')).toEqual({ campos: {} });
        expect(montarEscalasDoEfeito(undefined, 'forca')).toEqual({ campos: {} });
    });
    it('contador valido', () => {
        expect(montarEscalasDoEfeito({ ...ESCALA_VAZIA, contadorId: 'c1', fator: '2,5' }, 'forca').campos.escalaContador).toEqual({ contadorId: 'c1', fator: 2.5 });
    });
    it.each([['0'], [''], ['abc'], ['1e7'], ['Infinity']])('fator "%s" invalido devolve erro', (fator) => {
        const r = montarEscalasDoEfeito({ ...ESCALA_VAZIA, contadorId: 'c1', fator }, 'forca');
        expect(r.erro).toBeTruthy();
        expect(r.campos.escalaContador).toBeUndefined();
    });
    it('dado de dano nao escala, mas aceita valeParaAliados', () => {
        const r = montarEscalasDoEfeito({ ...ESCALA_VAZIA, contadorId: 'c1', fator: '2', paraAliados: true }, 'dano_dados');
        expect(r).toEqual({ campos: { valeParaAliados: true } });
    });
    it('paraAliados ignorado em atributo fora da lista', () => {
        expect(montarEscalasDoEfeito({ ...ESCALA_VAZIA, paraAliados: true }, 'forca').campos.valeParaAliados).toBeUndefined();
        expect(montarEscalasDoEfeito({ ...ESCALA_VAZIA, paraAliados: true }, 'acerto').campos.valeParaAliados).toBe(true);
    });
    it('escala por aliado com filtro', () => {
        const r = montarEscalasDoEfeito({ ...ESCALA_VAZIA, aliFator: '3', aliTipo: 'raca', aliValor: 'Elfo' }, 'forca');
        expect(r.campos.escalaAliados).toEqual({ fator: 3, filtro: 'raca=elfo' });
    });
    it('filtro sem texto ou fator invalido = erro', () => {
        expect(montarEscalasDoEfeito({ ...ESCALA_VAZIA, aliFator: '3', aliTipo: 'raca', aliValor: '  ' }, 'forca').erro).toBeTruthy();
        expect(montarEscalasDoEfeito({ ...ESCALA_VAZIA, aliFator: '0' }, 'forca').erro).toBeTruthy();
    });
});
