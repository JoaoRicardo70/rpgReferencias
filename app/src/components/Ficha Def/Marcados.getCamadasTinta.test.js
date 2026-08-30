import { describe, it, expect } from 'vitest';
import { getCamadasTinta } from './Marcados';

// ---------------------------------------------------------------------------
// QA — getCamadasTinta(cor): a Moldura/Ícone de Classe pararam de usar esta função
// (o tingimento agora é feito por 3 sliders independentes — localMolduraOpMultiply/
// OpColor/OpOverlay — controláveis pelo jogador em vez de calculados a partir da cor
// escolhida). getCamadasTinta ficou como uma função pura órfã, ainda exportada, com
// um retorno fixo (mesmo {modo1, op1, modo2, op2} para qualquer cor válida) só pelo
// sentinela de "sem tingimento" (null). Este arquivo trava esse comportamento atual
// pra não quebrar silenciosamente caso algo volte a depender dela.
// ---------------------------------------------------------------------------

describe('getCamadasTinta — sentinela "sem tingimento" (null)', () => {
    it('retorna null para branco puro (#ffffff)', () => {
        expect(getCamadasTinta('#ffffff')).toBeNull();
    });

    it('retorna null para string vazia', () => {
        expect(getCamadasTinta('')).toBeNull();
    });

    it('retorna null para null', () => {
        expect(getCamadasTinta(null)).toBeNull();
    });

    it('retorna null para undefined', () => {
        expect(getCamadasTinta(undefined)).toBeNull();
    });

    it('retorna null para "transparent"', () => {
        expect(getCamadasTinta('transparent')).toBeNull();
    });
});

describe('getCamadasTinta — formato {modo1, op1, modo2, op2} fixo pra qualquer cor válida', () => {
    it('cor escura e saturada (#1a0033, roxo quase-preto) retorna o formato fixo atual', () => {
        const tinta = getCamadasTinta('#1a0033');
        expect(tinta).toEqual({ modo1: 'color', op1: 0.85, modo2: 'multiply', op2: 0.5 });
    });

    it('cor clara e saturada (#ffcc00, dourado) retorna o mesmo formato fixo (não há mais ramo claro/escuro)', () => {
        const tinta = getCamadasTinta('#ffcc00');
        expect(tinta).toEqual({ modo1: 'color', op1: 0.85, modo2: 'multiply', op2: 0.5 });
    });

    it('preto absoluto (#000000) também usa o formato fixo, sem tratamento especial', () => {
        const tinta = getCamadasTinta('#000000');
        expect(tinta).toEqual({ modo1: 'color', op1: 0.85, modo2: 'multiply', op2: 0.5 });
    });

    it('hex malformado (comprimento != 6) não lança erro e ainda retorna o formato fixo', () => {
        expect(() => getCamadasTinta('#zzz')).not.toThrow();
        expect(getCamadasTinta('#zzz')).toEqual({ modo1: 'color', op1: 0.85, modo2: 'multiply', op2: 0.5 });
    });
});

describe('getCamadasTinta — módulo Marcados.jsx importa/parseia corretamente', () => {
    it('a função nomeada (plural) getCamadasTinta é exportada e chamável isoladamente', () => {
        expect(typeof getCamadasTinta).toBe('function');
        expect(() => getCamadasTinta('#00ffff')).not.toThrow();
    });
});
