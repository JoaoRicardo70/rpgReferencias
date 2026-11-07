import { describe, it, expect } from 'vitest';
import { normalizarAoDesligar, rolarAoDesligar, aplicarDanoEmSiMesmo, descreverAoDesligar } from './aoDesligar';
import { FATOR_EXIBICAO_VITAIS } from './vitals';

describe('aoDesligar', () => {
    it('normaliza e limita a 1000 dados/faces', () => {
        expect(normalizarAoDesligar({ dadosQtd: 238, dadosFaces: 6, texto: ' necrótico ' })).toEqual({ dadosQtd: 238, dadosFaces: 6, texto: 'necrótico' });
        expect(normalizarAoDesligar({ dadosQtd: 5000, dadosFaces: 9999 })).toEqual({ dadosQtd: 1000, dadosFaces: 1000 });
        [null, 'x', [], {}, { dadosQtd: 0, dadosFaces: 6 }, { dadosQtd: 2, dadosFaces: -1 }].forEach(v => expect(normalizarAoDesligar(v)).toBeNull());
    });
    it('rola com rng injetavel', () => {
        const p = { aoDesligar: { dadosQtd: 10, dadosFaces: 6 } };
        expect(rolarAoDesligar(p, () => 0)).toBe(10);
        expect(rolarAoDesligar(p, () => 0.999)).toBe(60);
        expect(rolarAoDesligar({}, () => 0)).toBe(0);
    });
    it('aplica dano na Vida sem passar de zero', () => {
        const f = { vida: { atual: 100 * FATOR_EXIBICAO_VITAIS } };
        expect(aplicarDanoEmSiMesmo(f, 30)).toBe(30);
        expect(f.vida.atual).toBe(70 * FATOR_EXIBICAO_VITAIS);
        aplicarDanoEmSiMesmo(f, 9999);
        expect(f.vida.atual).toBe(0);
        expect(aplicarDanoEmSiMesmo({}, 5)).toBe(0);
        expect(aplicarDanoEmSiMesmo(f, 0)).toBe(0);
    });
    it('descreve', () => {
        expect(descreverAoDesligar({ aoDesligar: { dadosQtd: 238, dadosFaces: 6 } })).toContain('238d6');
        expect(descreverAoDesligar({})).toBe('');
    });
});
