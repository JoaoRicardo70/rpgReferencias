import { describe, it, expect } from 'vitest';
import { escolherVozFeminina, configurarFalaSexta, TOM_SEM_VOZ_FEMININA } from './vozSexta.js';

const v = (name, lang) => ({ name, lang });
const daniel = v('Microsoft Daniel - Portuguese (Brazil)', 'pt-BR');
const maria = v('Microsoft Maria - Portuguese (Brazil)', 'pt-BR');
const francisca = v('Microsoft Francisca Online (Natural) - Portuguese (Brazil)', 'pt-BR');
const antonio = v('Microsoft Antonio Online (Natural) - Portuguese (Brazil)', 'pt-BR');
const google = v('Google português do Brasil', 'pt-BR');
const ingles = [v('Microsoft Zira - English (United States)', 'en-US'), v('Google US English', 'en-US')];

describe('escolherVozFeminina - caminho feliz', () => {
    it('Edge: prefere feminina pt-BR Online/Natural', () => {
        expect(escolherVozFeminina([...ingles, daniel, maria, antonio, francisca, google])).toBe(francisca);
    });
    it('Windows: escolhe Maria, nunca Daniel', () => {
        expect(escolherVozFeminina([...ingles, daniel, maria])).toBe(maria);
    });
    it('Chrome: escolhe Google português do Brasil', () => {
        expect(escolherVozFeminina([...ingles, google])).toBe(google);
    });
    it('feminina pt-BR comum vence Google pt-BR', () => {
        expect(escolherVozFeminina([google, maria])).toBe(maria);
    });
    it('nunca escolhe Antonio Online mesmo sendo Natural', () => {
        expect(escolherVozFeminina([antonio, maria])).toBe(maria);
    });
    it('Natural no nome também conta', () => {
        const nat = v('Microsoft Helena Natural', 'pt-BR');
        expect(escolherVozFeminina([maria, nat])).toBe(nat);
    });
});

describe('escolherVozFeminina - bordas', () => {
    it('somente Daniel retorna null', () => {
        expect(escolherVozFeminina([daniel])).toBeNull();
    });
    it('somente vozes em inglês retorna null', () => {
        expect(escolherVozFeminina(ingles)).toBeNull();
    });
    it('lista vazia retorna null', () => {
        expect(escolherVozFeminina([])).toBeNull();
    });
    it.each([[null], [undefined], ['abc'], [{}], [42]])('não-array (%s) retorna null', (x) => {
        expect(escolherVozFeminina(x)).toBeNull();
    });
    it('ignora entradas null, sem lang ou lang não-string', () => {
        expect(escolherVozFeminina([null, undefined, { name: 'Maria' }, { name: 'Maria', lang: 5 }, maria])).toBe(maria);
        expect(escolherVozFeminina([null, { name: 'Maria' }])).toBeNull();
    });
    it('entrada sem name não quebra', () => {
        expect(escolherVozFeminina([{ lang: 'pt-BR' }, maria])).toBe(maria);
    });
    it('aceita formato pt_BR e minúsculas', () => {
        const a = v('Microsoft Maria', 'pt_BR');
        expect(escolherVozFeminina([a])).toBe(a);
        const b = v('Google português', 'pt_br');
        expect(escolherVozFeminina([b])).toBe(b);
    });
    it('pt_BR Online é tratada como pt-BR na prioridade', () => {
        const a = v('Microsoft Francisca Online', 'pt_BR');
        const b = v('Microsoft Helena', 'pt-PT');
        expect(escolherVozFeminina([b, maria, a])).toBe(a);
    });
    it('"Portuguese Brazil Female" é escolhida (regressão male dentro de female)', () => {
        const f = v('Portuguese Brazil Female', 'pt-BR');
        expect(escolherVozFeminina([f])).toBe(f);
    });
    it('"Male" como palavra inteira é excluída', () => {
        expect(escolherVozFeminina([v('Portuguese Brazil Male', 'pt-BR')])).toBeNull();
    });
    it('nome com feminino e masculino juntos é excluído', () => {
        expect(escolherVozFeminina([v('Maria e Daniel', 'pt-BR')])).toBeNull();
    });
    it('Google masculino é excluído', () => {
        expect(escolherVozFeminina([v('Google português Male', 'pt-BR')])).toBeNull();
    });
    it('case-insensitive e com acentos', () => {
        const a = v('VITÓRIA Online', 'pt-BR');
        expect(escolherVozFeminina([a])).toBe(a);
    });
    it('não casa substrings (Mariana não é Maria)', () => {
        expect(escolherVozFeminina([v('Mariana', 'pt-BR')])).toBeNull();
    });
});

describe('escolherVozFeminina - pt-PT', () => {
    const helena = v('Microsoft Helena - Portuguese (Portugal)', 'pt-PT');
    const googlePT = v('Google português', 'pt-PT');
    it('apenas pt-PT feminina é escolhida', () => {
        expect(escolherVozFeminina([ingles[0], helena])).toBe(helena);
    });
    it('pt-PT feminina vence Google pt-PT', () => {
        expect(escolherVozFeminina([googlePT, helena])).toBe(helena);
    });
    it('Google pt-PT é o último recurso', () => {
        expect(escolherVozFeminina([googlePT, v('Microsoft Duarte', 'pt-PT')])).toBe(googlePT);
    });
    it('Google pt-BR vence feminina pt-PT', () => {
        expect(escolherVozFeminina([helena, google])).toBe(google);
    });
    it('masculina pt-PT retorna null', () => {
        expect(escolherVozFeminina([v('Microsoft Duarte - Portuguese (Portugal)', 'pt-PT')])).toBeNull();
    });
});

describe('configurarFalaSexta', () => {
    it('aplica voz e lang da voz escolhida', () => {
        const fala = {};
        const r = configurarFalaSexta(fala, [daniel, maria]);
        expect(fala.voice).toBe(maria);
        expect(fala.lang).toBe('pt-BR');
        expect(fala.pitch).toBeUndefined();
        expect(r).toBe(fala);
    });
    it('usa lang da voz pt-PT', () => {
        const h = v('Microsoft Helena', 'pt-PT');
        const fala = {};
        configurarFalaSexta(fala, [h]);
        expect(fala.lang).toBe('pt-PT');
    });
    it('somente Daniel: pitch de fallback e sem voz', () => {
        const fala = {};
        configurarFalaSexta(fala, [daniel]);
        expect(fala.voice).toBeUndefined();
        expect(fala.lang).toBe('pt-BR');
        expect(fala.pitch).toBe(TOM_SEM_VOZ_FEMININA);
    });
    it('lista vazia / não-array usa fallback', () => {
        for (const l of [[], null, undefined, 'x']) {
            const fala = {};
            configurarFalaSexta(fala, l);
            expect(fala.lang).toBe('pt-BR');
            expect(fala.pitch).toBe(TOM_SEM_VOZ_FEMININA);
        }
    });
    it('TOM_SEM_VOZ_FEMININA é número agudo (> 1)', () => {
        expect(typeof TOM_SEM_VOZ_FEMININA).toBe('number');
        expect(TOM_SEM_VOZ_FEMININA).toBeGreaterThan(1);
    });
});
