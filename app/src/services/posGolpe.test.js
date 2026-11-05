import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    salvarDummie: vi.fn()
}));

import { salvarCamposPersonagem, salvarDummie } from './firebase-sync';
import { condicoesComEstados, criarPosGolpe, aplicarEstadosDoGolpe, resolverReflexoAutomatico, gravarEstadosNoAlvo } from './posGolpe';

const personagem = (ficha = {}, nome = 'Goku') => ({ isPersonagem: true, personagemNome: nome, nome, ficha });
const dummie = (extra = {}) => ({ isPersonagem: false, nome: 'Boneco', vida: 100, ...extra });
const comReflexo = (reflexo, extra = {}) => ({
    mana: { base: 1000000, atual: 1000000 },
    poderes: [{ id: 'p1', nome: 'Espelho', ativa: true, reflexo }],
    ...extra
});

beforeEach(() => { vi.clearAllMocks(); });

describe('posGolpe - gravarEstadosNoAlvo', () => {
    it('nao grava com alvo nulo ou lista vazia (devolve o alvo como veio)', () => {
        const p = personagem();
        expect(gravarEstadosNoAlvo('id', null, [{ id: 'lento', stacks: 1 }])).toBeNull();
        expect(gravarEstadosNoAlvo('id', p, [])).toBe(p);
        expect(gravarEstadosNoAlvo('id', p, null)).toBe(p);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('personagem: soma na lista existente e grava so o campo condicoes', () => {
        gravarEstadosNoAlvo('x', personagem({ condicoes: [{ id: 'lento', stacks: 1 }] }), [{ id: 'lento', stacks: 2 }, { id: 'queimado', stacks: 1 }], 'Vegeta');
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Goku');
        expect(Object.keys(campos)).toEqual(['condicoes']);
        expect(campos.condicoes).toEqual([{ id: 'lento', stacks: 3, fonte: 'Vegeta' }, { id: 'queimado', stacks: 1, fonte: 'Vegeta' }]);
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('dummie: nao grava sozinho; devolve o dummie com condicoes novas para gravar junto com o Dano', () => {
        const d = dummie();
        const novo = gravarEstadosNoAlvo('d1', d, [{ id: 'sangrando', stacks: 2 }]);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(novo).toMatchObject({ vida: 100, condicoes: [{ id: 'sangrando', stacks: 2 }] });
        expect(d.condicoes).toBeUndefined();
    });
    it('junta duplicados antes de somar (limite 6)', () => {
        const novo = gravarEstadosNoAlvo('d1', dummie(), [{ id: 'lento', stacks: 4 }, { id: 'lento', stacks: 4 }]);
        expect(novo.condicoes).toEqual([{ id: 'lento', stacks: 6 }]);
    });
    it('condicoesComEstados soma na lista existente sem gravar', () => {
        const l = condicoesComEstados(dummie({ condicoes: [{ id: 'lento', stacks: 1 }] }), [{ id: 'lento', stacks: 1 }]);
        expect(l).toEqual([{ id: 'lento', stacks: 2 }]);
        expect(salvarDummie).not.toHaveBeenCalled();
    });
});

describe('posGolpe - aplicarEstadosDoGolpe', () => {
    it('devolve texto "" e o mesmo alvo sem alvo ou sem estados', () => {
        const d = dummie();
        expect(aplicarEstadosDoGolpe({ idAlvo: 'a', alvo: null, estados: [{ id: 'lento', stacks: 1 }] })).toEqual({ texto: '', alvo: null });
        expect(aplicarEstadosDoGolpe({ idAlvo: 'a', alvo: d, estados: [] })).toEqual({ texto: '', alvo: d });
        expect(aplicarEstadosDoGolpe({ idAlvo: 'a', alvo: d }).alvo).toBe(d);
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('escreve no alvo-personagem e devolve texto com o nome', () => {
        const t = aplicarEstadosDoGolpe({ idAlvo: 'a', alvo: personagem(), estados: [{ id: 'queimado', stacks: 2 }], fonte: 'Vegeta' });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Goku', { condicoes: [{ id: 'queimado', stacks: 2, fonte: 'Vegeta' }] });
        expect(t.texto).toContain('Goku ficou com');
        expect(t.texto).toContain('Queimado +2');
    });
    it('dummie: ignora teste de resistencia e devolve o alvo com condicoes (sem gravar)', () => {
        const t = aplicarEstadosDoGolpe({ idAlvo: 'd1', alvo: dummie(), estados: [{ id: 'queimado', stacks: 1, teste: { atributo: 'forca', cd: 1 } }] });
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(t.alvo.condicoes).toEqual([{ id: 'queimado', stacks: 1 }]);
        expect(t.texto).toContain('Boneco');
    });
    it('apenasCritico sem critico nao grava; com critico grava', () => {
        const estados = [{ id: 'sangrando', stacks: 1, apenasCritico: true }];
        const sem = aplicarEstadosDoGolpe({ idAlvo: 'd', alvo: dummie(), estados, critico: false });
        expect(sem.texto).toBe('');
        expect(sem.alvo.condicoes).toBeUndefined();
        const com = aplicarEstadosDoGolpe({ idAlvo: 'd', alvo: dummie(), estados, critico: true });
        expect(com.alvo.condicoes).toEqual([{ id: 'sangrando', stacks: 1 }]);
    });
    it('alvo-personagem que sempre resiste: nao grava e informa a resistencia', () => {
        const ficha = { forca: { base: 9900 } }; // dezena 99; d20 + 99 >= CD 60
        const t = aplicarEstadosDoGolpe({ idAlvo: 'a', alvo: personagem(ficha), estados: [{ id: 'queimado', stacks: 1, teste: { atributo: 'forca', cd: 60 } }] });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(t.texto).toContain('resistiu a');
    });
});

describe('posGolpe - resolverReflexoAutomatico', () => {
    const args = (alvo, extra = {}) => ({ alvo, danoNoAlvo: 1000, danoOriginal: 2000, nomeAtacante: 'Vegeta', ...extra });

    it('neutro sem alvo, dummie ou sem ficha', () => {
        expect(resolverReflexoAutomatico(args(null))).toEqual({ danoNoAlvo: 1000, danoNoAtacante: 0, texto: '' });
        expect(resolverReflexoAutomatico(args(dummie()))).toEqual({ danoNoAlvo: 1000, danoNoAtacante: 0, texto: '' });
        expect(resolverReflexoAutomatico(args({ isPersonagem: true }))).toEqual({ danoNoAlvo: 1000, danoNoAtacante: 0, texto: '' });
    });
    it('reflexo nao automatico nao dispara', () => {
        const r = resolverReflexoAutomatico(args(personagem(comReflexo({ modo: 'devolver' }))));
        expect(r.texto).toBe('');
        expect(r.danoNoAlvo).toBe(1000);
    });
    it('poder inativo nao dispara', () => {
        const ficha = comReflexo({ modo: 'devolver', automatico: true });
        ficha.poderes[0].ativa = false;
        expect(resolverReflexoAutomatico(args(personagem(ficha))).texto).toBe('');
    });
    it('devolver: defensor 0, atacante recebe, sem custo nao escreve', () => {
        const r = resolverReflexoAutomatico(args(personagem(comReflexo({ modo: 'devolver', automatico: true }))));
        expect(r.danoNoAlvo).toBe(0);
        expect(r.danoNoAtacante).toBe(1000);
        expect(r.texto).toContain('Espelho');
        expect(r.texto).toContain('Vegeta');
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('compartilhar e contra', () => {
        expect(resolverReflexoAutomatico(args(personagem(comReflexo({ modo: 'compartilhar', automatico: true, mult: 50 })))))
            .toMatchObject({ danoNoAlvo: 1000, danoNoAtacante: 500 });
        expect(resolverReflexoAutomatico(args(personagem(comReflexo({ modo: 'contra', automatico: true })))))
            .toMatchObject({ danoNoAlvo: 0, danoNoAtacante: 3000 });
    });
    it('cobra o custo da energia escolhida e grava so esse campo', () => {
        const ficha = comReflexo({ modo: 'devolver', automatico: true, custoPercentual: 10, energia: 'aura' }, { aura: { base: 1000000, atual: 500000 } });
        const r = resolverReflexoAutomatico(args(personagem(ficha)));
        expect(r.danoNoAlvo).toBe(0);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Goku');
        expect(Object.keys(campos)).toEqual(['aura/atual']);
        expect(campos['aura/atual']).toBeLessThan(500000);
        expect(campos['aura/atual']).toBeGreaterThanOrEqual(0);
    });
    it('sem energia suficiente: neutro e nada gravado', () => {
        const ficha = comReflexo({ modo: 'devolver', automatico: true, custoPercentual: 50 });
        ficha.mana.atual = 0;
        expect(resolverReflexoAutomatico(args(personagem(ficha)))).toEqual({ danoNoAlvo: 1000, danoNoAtacante: 0, texto: '' });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('energia ausente na ficha (NaN) tambem nao paga', () => {
        const ficha = comReflexo({ modo: 'devolver', automatico: true, custoPercentual: 10, energia: 'chakra' });
        expect(resolverReflexoAutomatico(args(personagem(ficha))).texto).toBe('');
    });
    it('se o primeiro nao paga, usa o segundo', () => {
        const ficha = comReflexo({ modo: 'devolver', automatico: true, custoPercentual: 50 });
        ficha.mana.atual = 0;
        ficha.ataquesElementais = [{ id: 't', nome: 'Barreira', equipado: true, reflexo: { modo: 'compartilhar', automatico: true } }];
        const r = resolverReflexoAutomatico(args(personagem(ficha)));
        expect(r.texto).toContain('Barreira');
        expect(r.danoNoAlvo).toBe(1000);
    });
    it('sem nomeAtacante usa "o atacante"', () => {
        const r = resolverReflexoAutomatico({ alvo: personagem(comReflexo({ modo: 'devolver', automatico: true })), danoNoAlvo: 10, danoOriginal: 10 });
        expect(r.texto).toContain('o atacante');
    });
});

describe('posGolpe - criarPosGolpe', () => {
    it('sem alvo devolve o dano', () => {
        const p = criarPosGolpe();
        expect(p.aplicar('x', null, 77)).toBe(77);
        expect(p.resultado()).toEqual({ textos: [], danoAtacante: 0, aoAcertar: [], critico: false });
    });
    it('sem estados nem reflexo: dano inalterado, nada escrito', () => {
        const p = criarPosGolpe({ nomeAtacante: 'V' });
        expect(p.aplicar('a', personagem(), 500)).toBe(500);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(p.resultado().textos).toEqual([]);
    });
    it('aplica estados no alvo-personagem (grava) e no dummie (alvoParaGravar leva as condicoes)', () => {
        const p = criarPosGolpe({ estados: [{ id: 'queimado', stacks: 1 }], nomeAtacante: 'V' });
        const d = dummie();
        expect(p.aplicar('a', personagem(), 10)).toBe(10);
        expect(p.aplicar('d', d, 10)).toBe(10);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(p.alvoParaGravar('d', d).condicoes).toEqual([{ id: 'queimado', stacks: 1, fonte: 'V' }]);
        expect(p.alvoParaGravar('outro', d)).toBe(d);
        expect(p.resultado().textos).toHaveLength(2);
    });
    it('reflexo devolvendo tudo (dano 0) impede os estados', () => {
        const alvo = personagem(comReflexo({ modo: 'devolver', automatico: true }));
        const p = criarPosGolpe({ estados: [{ id: 'queimado', stacks: 1 }], danoOriginal: 2000, nomeAtacante: 'V' });
        expect(p.aplicar('a', alvo, 1000)).toBe(0);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        const r = p.resultado();
        expect(r.danoAtacante).toBe(1000);
        expect(r.textos).toHaveLength(1);
        expect(r.textos[0]).toContain('Espelho');
    });
    it('compartilhar (defensor sofre) ainda recebe os estados', () => {
        const alvo = personagem(comReflexo({ modo: 'compartilhar', automatico: true }));
        const p = criarPosGolpe({ estados: [{ id: 'queimado', stacks: 1 }], danoOriginal: 1000, nomeAtacante: 'V' });
        expect(p.aplicar('a', alvo, 1000)).toBe(1000);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Goku', expect.objectContaining({ condicoes: expect.any(Array) }));
        expect(p.resultado().danoAtacante).toBe(1000);
    });
    it('custo do reflexo e cobrado por alvo e o dano devolvido soma', () => {
        const mk = () => personagem(comReflexo({ modo: 'devolver', automatico: true, custoPercentual: 10 }));
        const p = criarPosGolpe({ danoOriginal: 100, nomeAtacante: 'V' });
        p.aplicar('a', mk(), 100);
        p.aplicar('b', mk(), 50);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(2);
        expect(p.resultado().danoAtacante).toBe(150);
    });
    it('dano 0 chegando ao alvo com reflexo: nao recebe estado', () => {
        const alvo = personagem(comReflexo({ modo: 'devolver', automatico: true }));
        const p = criarPosGolpe({ estados: [{ id: 'lento', stacks: 1 }] });
        p.aplicar('a', alvo, 0);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('resultado devolve copia dos textos', () => {
        const p = criarPosGolpe({ estados: [{ id: 'lento', stacks: 1 }] });
        p.aplicar('d', dummie(), 1);
        p.resultado().textos.push('x');
        expect(p.resultado().textos).toHaveLength(1);
    });
});
