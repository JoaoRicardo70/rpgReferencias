import { describe, it, expect } from 'vitest';
import { TEMAS_APP, TEMA_PADRAO, CHAVE_TEMA, temaValido, lerTemaSalvo, aplicarTemaNoBody, salvarTema } from './temasApp';

const fakeStorage = (inicial = {}) => {
    const dados = { ...inicial };
    return { dados, getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); } };
};
const storageQuebrado = () => ({ getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } });

describe('TEMAS_APP', () => {
    it('tem 8 temas com ids unicos e campos completos', () => {
        expect(TEMAS_APP).toHaveLength(8);
        expect(new Set(TEMAS_APP.map(t => t.id)).size).toBe(8);
        TEMAS_APP.forEach(t => {
            expect(t.id).toMatch(/^theme-/);
            expect(t.nome).toBeTruthy();
            expect(t.emoji).toBeTruthy();
            expect(t.descricao).toBeTruthy();
        });
    });
    it('grupo estilo = medieval/moderno/futurista/mescla', () => {
        expect(TEMAS_APP.filter(t => t.grupo === 'estilo').map(t => t.id).sort())
            .toEqual(['theme-futurista', 'theme-medieval', 'theme-mescla', 'theme-moderno']);
    });
    it('grupo classico = cyber/blood/glass/arcane', () => {
        expect(TEMAS_APP.filter(t => t.grupo === 'classico').map(t => t.id).sort())
            .toEqual(['theme-arcane', 'theme-blood', 'theme-cyber', 'theme-glass']);
    });
    it('padrao e chave', () => {
        expect(TEMA_PADRAO).toBe('theme-cyber');
        expect(CHAVE_TEMA).toBe('rpg_tema');
        expect(temaValido(TEMA_PADRAO)).toBe(true);
    });
});

describe('temaValido', () => {
    it.each(TEMAS_APP.map(t => t.id))('aceita %s', (id) => expect(temaValido(id)).toBe(true));
    it.each([['theme-x'], [''], [null], [undefined], [42], ['THEME-CYBER'], ['cyber']])('rejeita %s', (v) => expect(temaValido(v)).toBe(false));
});

describe('lerTemaSalvo', () => {
    it('devolve o tema valido salvo', () => expect(lerTemaSalvo(fakeStorage({ rpg_tema: 'theme-mescla' }))).toBe('theme-mescla'));
    it('invalido cai no padrao', () => expect(lerTemaSalvo(fakeStorage({ rpg_tema: 'theme-lixo' }))).toBe('theme-cyber'));
    it('ausente cai no padrao', () => expect(lerTemaSalvo(fakeStorage())).toBe('theme-cyber'));
    it('getItem lancando cai no padrao', () => expect(lerTemaSalvo(storageQuebrado())).toBe('theme-cyber'));
    it('sem storage explicito usa localStorage', () => {
        localStorage.setItem('rpg_tema', 'theme-glass');
        expect(lerTemaSalvo()).toBe('theme-glass');
        localStorage.clear();
        expect(lerTemaSalvo()).toBe('theme-cyber');
    });
});

describe('aplicarTemaNoBody', () => {
    const corpo = (...classes) => { const el = document.createElement('div'); el.className = classes.join(' '); return el; };
    it('remove apenas theme-* antigas e preserva outras classes', () => {
        const b = corpo('theme-blood', 'theme-arcane', 'modo-x', 'outra');
        aplicarTemaNoBody('theme-medieval', b);
        expect([...b.classList].sort()).toEqual(['modo-x', 'outra', 'theme-medieval']);
    });
    it('id invalido cai no padrao', () => {
        const b = corpo('theme-glass', 'x');
        aplicarTemaNoBody('theme-nao-existe', b);
        expect([...b.classList].sort()).toEqual(['theme-cyber', 'x']);
    });
    it('body sem classes e idempotente', () => {
        const b = corpo();
        aplicarTemaNoBody('theme-moderno', b);
        aplicarTemaNoBody('theme-moderno', b);
        expect(b.className).toBe('theme-moderno');
    });
    it('usa document.body por padrao', () => {
        document.body.className = 'theme-blood keep';
        aplicarTemaNoBody('theme-futurista');
        expect(document.body.classList.contains('theme-futurista')).toBe(true);
        expect(document.body.classList.contains('theme-blood')).toBe(false);
        expect(document.body.classList.contains('keep')).toBe(true);
        document.body.className = '';
    });
});

describe('salvarTema', () => {
    it('valido grava e retorna true', () => {
        const s = fakeStorage();
        expect(salvarTema('theme-arcane', s)).toBe(true);
        expect(s.dados.rpg_tema).toBe('theme-arcane');
    });
    it('invalido retorna false e nao grava', () => {
        const s = fakeStorage();
        expect(salvarTema('theme-xx', s)).toBe(false);
        expect(salvarTema(null, s)).toBe(false);
        expect(s.dados).toEqual({});
    });
    it('storage lancando nao quebra e retorna false', () => {
        expect(() => salvarTema('theme-cyber', storageQuebrado())).not.toThrow();
        expect(salvarTema('theme-cyber', storageQuebrado())).toBe(false);
    });
});
