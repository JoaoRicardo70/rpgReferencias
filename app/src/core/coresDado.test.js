import { describe, it, expect } from 'vitest';
import { NIVEIS_ROLAGEM } from './rolagemDado';
import { CHAVE_CORES_DADO, NIVEIS_COLORIVEIS, coresPadraoDoDado, normalizarCor, clarearCor, lerCoresDado, salvarCoresDado, aplicarCoresDado } from './coresDado';

const fakeStorage = (inicial = {}) => {
    const dados = { ...inicial };
    return { dados, getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); } };
};
const quebrado = () => ({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } });

describe('coresPadraoDoDado', () => {
    it('iguais as de NIVEIS_ROLAGEM, nos 4 niveis', () => {
        const p = coresPadraoDoDado();
        expect(Object.keys(p).sort()).toEqual([...NIVEIS_COLORIVEIS].sort());
        NIVEIS_COLORIVEIS.forEach(n => expect(p[n]).toBe(NIVEIS_ROLAGEM[n].cor));
    });
    it('devolve objeto novo a cada chamada', () => {
        const a = coresPadraoDoDado(); a.normal = '#000000';
        expect(coresPadraoDoDado().normal).toBe(NIVEIS_ROLAGEM.normal.cor);
    });
});

describe('normalizarCor', () => {
    it('minuscula e trim', () => { expect(normalizarCor('#AABBCC')).toBe('#aabbcc'); expect(normalizarCor('  #0088FF ')).toBe('#0088ff'); });
    it('#abc de 3 digitos vira null', () => expect(normalizarCor('#abc')).toBeNull());
    it.each([['lixo'], [''], [null], [undefined], ['#gggggg'], ['aabbcc'], ['#aabbccdd'], [123], ['rgb(0,0,0)']])('invalido %s vira null', (v) => expect(normalizarCor(v)).toBeNull());
});

describe('clarearCor', () => {
    it('fator 0 mantem e 1 vira branco', () => { expect(clarearCor('#102030', 0)).toBe('#102030'); expect(clarearCor('#102030', 1)).toBe('#ffffff'); });
    it('fator padrao 0.4 mistura com branco', () => expect(clarearCor('#000000')).toBe('#666666'));
    it('fator fora de 0-1 e limitado', () => { expect(clarearCor('#000000', 5)).toBe('#ffffff'); expect(clarearCor('#000000', -2)).toBe('#000000'); });
    it('cor invalida devolve branco', () => { expect(clarearCor('xx')).toBe('#ffffff'); expect(clarearCor(null)).toBe('#ffffff'); });
    it('aceita maiuscula', () => expect(clarearCor('#FF0000', 0)).toBe('#ff0000'));
});

describe('lerCoresDado', () => {
    it('sem nada guardado devolve o padrao', () => expect(lerCoresDado(fakeStorage())).toEqual(coresPadraoDoDado()));
    it('le cores validas guardadas', () => {
        const s = fakeStorage({ [CHAVE_CORES_DADO]: JSON.stringify({ normal: '#112233', fatal: '#AABBCC' }) });
        const c = lerCoresDado(s);
        expect(c.normal).toBe('#112233');
        expect(c.fatal).toBe('#aabbcc');
        expect(c.critico).toBe(NIVEIS_ROLAGEM.critico.cor);
    });
    it('JSON corrompido devolve o padrao', () => expect(lerCoresDado(fakeStorage({ [CHAVE_CORES_DADO]: '{nao json' }))).toEqual(coresPadraoDoDado()));
    it('cor invalida cai no padrao daquele nivel', () => {
        const c = lerCoresDado(fakeStorage({ [CHAVE_CORES_DADO]: JSON.stringify({ normal: '#abc', critico: 'lixo', falha: 5 }) }));
        expect(c).toEqual(coresPadraoDoDado());
    });
    it('chaves extras sao ignoradas', () => {
        const c = lerCoresDado(fakeStorage({ [CHAVE_CORES_DADO]: JSON.stringify({ extra: '#123456', normal: '#654321' }) }));
        expect(Object.keys(c).sort()).toEqual([...NIVEIS_COLORIVEIS].sort());
        expect(c.normal).toBe('#654321');
    });
    it('JSON null ou array nao quebra', () => {
        expect(lerCoresDado(fakeStorage({ [CHAVE_CORES_DADO]: 'null' }))).toEqual(coresPadraoDoDado());
        expect(lerCoresDado(fakeStorage({ [CHAVE_CORES_DADO]: '[]' }))).toEqual(coresPadraoDoDado());
    });
    it('storage lancando devolve o padrao', () => expect(lerCoresDado(quebrado())).toEqual(coresPadraoDoDado()));
});

describe('salvarCoresDado', () => {
    it('grava limpo, normalizado, sem chaves extras, e devolve o mesmo', () => {
        const s = fakeStorage();
        const r = salvarCoresDado({ normal: '#ABCDEF', critico: 'lixo', extra: '#111111' }, s);
        expect(r.normal).toBe('#abcdef');
        expect(r.critico).toBe(NIVEIS_ROLAGEM.critico.cor);
        expect(r.extra).toBeUndefined();
        expect(JSON.parse(s.dados[CHAVE_CORES_DADO])).toEqual(r);
    });
    it('entrada nula usa o padrao', () => expect(salvarCoresDado(null, fakeStorage())).toEqual(coresPadraoDoDado()));
    it('storage lancando nao quebra e ainda devolve as cores', () => {
        expect(() => salvarCoresDado({ normal: '#123456' }, quebrado())).not.toThrow();
        expect(salvarCoresDado({ normal: '#123456' }, quebrado()).normal).toBe('#123456');
    });
    it('ida e volta com lerCoresDado', () => {
        const s = fakeStorage();
        const r = salvarCoresDado({ falha: '#010203' }, s);
        expect(lerCoresDado(s)).toEqual(r);
    });
});

describe('aplicarCoresDado', () => {
    const info = NIVEIS_ROLAGEM.critico;
    it('sem escolha devolve o mesmo objeto', () => {
        expect(aplicarCoresDado(info, {})).toBe(info);
        expect(aplicarCoresDado(info, null)).toBe(info);
        expect(aplicarCoresDado(info, undefined)).toBe(info);
    });
    it('cor igual ao padrao devolve o objeto original e preserva corTexto', () => {
        const r = aplicarCoresDado(info, { critico: info.cor.toUpperCase() });
        expect(r).toBe(info);
        expect(r.corTexto).toBe('#ffe066');
    });
    it('cor invalida devolve o original', () => expect(aplicarCoresDado(info, { critico: '#abc' })).toBe(info));
    it('cor diferente muda cor e corTexto sem mutar o original', () => {
        const r = aplicarCoresDado(info, { critico: '#00ff00' });
        expect(r).not.toBe(info);
        expect(r.cor).toBe('#00ff00');
        expect(r.corTexto).toBe(clarearCor('#00ff00', 0.4));
        expect(r.nivel).toBe('critico');
        expect(r.rotulo).toBe(info.rotulo);
        expect(info.cor).toBe('#ffcc00');
    });
    it('info ausente usa o nivel normal', () => {
        expect(aplicarCoresDado(undefined, {})).toBe(NIVEIS_ROLAGEM.normal);
        expect(aplicarCoresDado(null, { normal: '#111111' }).cor).toBe('#111111');
    });
    it('nivel desconhecido devolve o original', () => {
        const estranho = { nivel: 'xyz', cor: '#123456', corTexto: '#abcdef' };
        expect(aplicarCoresDado(estranho, coresPadraoDoDado())).toBe(estranho);
    });
});
