import { describe, it, expect } from 'vitest';
import { classificarRolagem, NIVEIS_ROLAGEM } from './rolagemDado';

describe('classificarRolagem - dano', () => {
    it('FATAL no armaStr vira fatal', () => {
        expect(classificarRolagem({ valor: 50, tipo: 'dano', armaStr: 'Espada (CRÍTICO FATAL)' }).nivel).toBe('fatal');
    });
    it('FATAL tem prioridade sobre CRÍTICO', () => {
        expect(classificarRolagem({ tipo: 'dano', armaStr: 'CRÍTICO e FATAL' })).toBe(NIVEIS_ROLAGEM.fatal);
        expect(classificarRolagem({ tipo: 'dano', armaStr: 'FATAL CRÍTICO' })).toBe(NIVEIS_ROLAGEM.fatal);
    });
    it('CRÍTICO sem FATAL vira critico', () => {
        expect(classificarRolagem({ tipo: 'dano', armaStr: 'Adaga CRÍTICO' })).toBe(NIVEIS_ROLAGEM.critico);
    });
    it('dano comum vira normal', () => {
        expect(classificarRolagem({ tipo: 'dano', armaStr: 'Adaga' })).toBe(NIVEIS_ROLAGEM.normal);
    });
    it.each([[undefined], [null], [''], [0]])('armaStr %s vira normal', (armaStr) => {
        expect(classificarRolagem({ tipo: 'dano', armaStr })).toBe(NIVEIS_ROLAGEM.normal);
    });
    it('o valor numerico nao influencia o dano (20 e 1)', () => {
        expect(classificarRolagem({ valor: 20, tipo: 'dano', armaStr: 'x' })).toBe(NIVEIS_ROLAGEM.normal);
        expect(classificarRolagem({ valor: 1, tipo: 'dano', armaStr: 'x' })).toBe(NIVEIS_ROLAGEM.normal);
    });
    it('e sensivel a maiusculas (minusculo nao conta)', () => {
        expect(classificarRolagem({ tipo: 'dano', armaStr: 'fatal crítico' })).toBe(NIVEIS_ROLAGEM.normal);
    });
});

describe('classificarRolagem - acerto', () => {
    it('20 e fatal', () => expect(classificarRolagem({ valor: 20, tipo: 'acerto' })).toBe(NIVEIS_ROLAGEM.fatal));
    it.each([18, 19])('%i e critico', (v) => expect(classificarRolagem({ valor: v, tipo: 'acerto' })).toBe(NIVEIS_ROLAGEM.critico));
    it('17 e normal', () => expect(classificarRolagem({ valor: 17, tipo: 'acerto' })).toBe(NIVEIS_ROLAGEM.normal));
    it('1 e falha', () => expect(classificarRolagem({ valor: 1, tipo: 'acerto' })).toBe(NIVEIS_ROLAGEM.falha));
    it.each([2, 10, 0, -5])('%i e normal', (v) => expect(classificarRolagem({ valor: v, tipo: 'acerto' })).toBe(NIVEIS_ROLAGEM.normal));
    it('strings numericas sao convertidas', () => {
        expect(classificarRolagem({ valor: '20' })).toBe(NIVEIS_ROLAGEM.fatal);
        expect(classificarRolagem({ valor: '19' })).toBe(NIVEIS_ROLAGEM.critico);
        expect(classificarRolagem({ valor: '1' })).toBe(NIVEIS_ROLAGEM.falha);
    });
    it('string nao numerica, NaN e undefined viram normal', () => {
        expect(classificarRolagem({ valor: 'abc' })).toBe(NIVEIS_ROLAGEM.normal);
        expect(classificarRolagem({ valor: NaN })).toBe(NIVEIS_ROLAGEM.normal);
        expect(classificarRolagem({ valor: undefined })).toBe(NIVEIS_ROLAGEM.normal);
    });
    it('valores acima de 20 contam como critico (comportamento atual)', () => {
        expect(classificarRolagem({ valor: 25 })).toBe(NIVEIS_ROLAGEM.critico);
    });
    it('tipo ausente usa a regra de acerto', () => {
        expect(classificarRolagem({ valor: 20 })).toBe(NIVEIS_ROLAGEM.fatal);
    });
});

describe('classificarRolagem - sem argumentos', () => {
    it('chamada sem argumentos retorna normal', () => {
        expect(classificarRolagem()).toBe(NIVEIS_ROLAGEM.normal);
        expect(classificarRolagem({})).toBe(NIVEIS_ROLAGEM.normal);
    });
});

describe('NIVEIS_ROLAGEM', () => {
    it('cores principais', () => {
        expect(NIVEIS_ROLAGEM.fatal.cor).toBe('#ff003c');
        expect(NIVEIS_ROLAGEM.critico.cor).toBe('#ffcc00');
        expect(NIVEIS_ROLAGEM.normal.cor).toBe('#0088ff');
    });
    it('rotulos', () => {
        expect(NIVEIS_ROLAGEM.fatal.rotulo).toBe('CRÍTICO FATAL!');
        expect(NIVEIS_ROLAGEM.critico.rotulo).toBe('CRÍTICO!');
        expect(NIVEIS_ROLAGEM.falha.rotulo).toBe('FALHA CRÍTICA');
        expect(NIVEIS_ROLAGEM.normal.rotulo).toBe('ROLADO!');
    });
    it('duracaoMs positivas e chave coerente com nivel', () => {
        for (const [chave, n] of Object.entries(NIVEIS_ROLAGEM)) {
            expect(n.nivel).toBe(chave);
            expect(n.duracaoMs).toBeGreaterThan(0);
            expect(n.corTexto).toMatch(/^#[0-9a-f]{6}$/i);
            expect(n.icone).toBeTruthy();
        }
    });
});
