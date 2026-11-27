import { describe, it, expect } from 'vitest';
import { idAlvoPersonagem, ehAlvoPersonagem, nomeAlvoPersonagem, resolverAlvoCombate, reduzirDanoNoAlvo, montarAlvoPersonagem } from './alvoCombate.js';
import { calcularDanoRapido, getVidaDoAlvoExibida } from './danoRapido.js';
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';

const fichaComReducoes = () => ({
    vida: { base: 1000000, atual: 500000 },
    reducoesDano: [
        { id: 'a', nome: 'Armadura', percentual: 20, elementos: ['todos'] },
        { id: 'b', nome: 'Véu Yin', percentual: 30, elementos: ['pol:yin'] },
    ],
});

describe('ids de alvo-personagem', () => {
    it('monta e lê o id', () => {
        expect(idAlvoPersonagem('Ana')).toBe('pj:Ana');
        expect(ehAlvoPersonagem('pj:Ana')).toBe(true);
        expect(ehAlvoPersonagem('pj:')).toBe(false);
        expect(ehAlvoPersonagem('d1')).toBe(false);
        expect(ehAlvoPersonagem(null)).toBe(false);
        expect(nomeAlvoPersonagem('pj:Ana')).toBe('Ana');
        expect(nomeAlvoPersonagem('d1')).toBeNull();
    });
});

describe('resolverAlvoCombate', () => {
    const personagens = { Ana: fichaComReducoes(), Bia: fichaComReducoes() };

    it('id que não é de personagem não resolve', () => {
        expect(resolverAlvoCombate('d1', { personagens, meuNome: 'Bia' })).toBeNull();
    });

    it('monta o alvo a partir da ficha do personagem', () => {
        const alvo = resolverAlvoCombate('pj:Ana', { personagens, meuNome: 'Bia' });
        expect(alvo.isPersonagem).toBe(true);
        expect(alvo.nome).toBe('Ana');
        expect(alvo.personagemNome).toBe('Ana');
        expect(typeof alvo.valorDefesa).toBe('number');
        expect(alvo.valorDefesa).toBeGreaterThan(0);
        expect(alvo.hpAtual).toBe(500000);
        expect(alvo.ficha).toBe(personagens.Ana);
    });

    it('não deixa mirar em si mesmo, em personagem inexistente ou sem id', () => {
        expect(resolverAlvoCombate('pj:Bia', { personagens, meuNome: 'Bia' })).toBeNull();
        expect(resolverAlvoCombate('pj:Zed', { personagens, meuNome: 'Bia' })).toBeNull();
        expect(resolverAlvoCombate(null, { personagens })).toBeNull();
        expect(resolverAlvoCombate('x', { personagens })).toBeNull();
        expect(montarAlvoPersonagem('Ana', null)).toBeNull();
    });
});

describe('reduzirDanoNoAlvo', () => {
    it('alvo sem reduções passa direto', () => {
        expect(reduzirDanoNoAlvo({}, 1000, 'fogo').final).toBe(1000);
        expect(reduzirDanoNoAlvo({ isPersonagem: true, ficha: { vida: { base: 1 } } }, 1000, 'fogo')).toEqual({ final: 1000, detalhe: [], texto: '' });
        expect(reduzirDanoNoAlvo(null, 50, 'fogo').final).toBe(50);
    });

    it('personagem: reduções em sequência (geral 20% e depois Yin 30% = 560)', () => {
        const alvo = { isPersonagem: true, ficha: fichaComReducoes() };
        const r = reduzirDanoNoAlvo(alvo, 1000, 'fogo');
        expect(r.final).toBe(560);
        expect(r.texto).toContain('→');
        expect(reduzirDanoNoAlvo(alvo, 1000, 'vento').final).toBe(800);
    });
});

describe('calcularDanoRapido (prévia e aplicação)', () => {
    const base = { divisorMesa: undefined, pontosVida: 200 };

    it('personagem: aplica as reduções em sequência e mostra o texto', () => {
        const ficha = fichaComReducoes();
        const alvo = { nome: 'Ana', ficha };
        const p = calcularDanoRapido({ ...base, alvo, fichaDoAlvo: ficha, dano: 1000, elemento: 'Fogo' });
        expect(p.valor).toBe(560);
        expect(p.reduzido.detalhe).toHaveLength(2);
        expect(p.textoReducao).toContain('560');
    });

    it('sem alvo devolve null; dano zero devolve valor 0', () => {
        expect(calcularDanoRapido({ ...base, alvo: null, dano: 10 })).toBeNull();
        const alvo = { nome: 'Ana', ficha: fichaComReducoes() };
        expect(calcularDanoRapido({ ...base, alvo, fichaDoAlvo: alvo.ficha, dano: 0 }).valor).toBe(0);
    });

    it('getVidaDoAlvoExibida sem alvo', () => {
        expect(getVidaDoAlvoExibida(null)).toEqual({ atual: null, max: null });
    });
});
