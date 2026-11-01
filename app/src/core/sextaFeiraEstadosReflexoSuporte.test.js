import { describe, it, expect } from 'vitest';
import {
    normalizarPoder, normalizarMagia, normalizarItem, normalizarProposta, resumirProposta, descreverExtrasProposta, DECLARACOES_CRIACAO,
} from './sextaFeiraCriacao';

const declaracao = (nome) => DECLARACOES_CRIACAO.find(d => d.name === nome);
const ESTADO = { id: 'sangrando', stacks: 2, teste: { atributo: 'constituicao', cd: 15 }, apenasCritico: true };
const SUPORTE = { cura: { dadosQtd: 3, dadosFaces: 8, fixo: 10 }, buffs: [{ atributo: 'forca', propriedade: 'base', valor: 5 }], duracao: 3, alvos: 'aliados', maxAlvos: 3 };

describe('Sexta-Feira: estados, reflexo e suporte nas criações', () => {
    it('poder aceita aplicaEstados, reflexo e suporte normalizados', () => {
        const { objeto, avisos, valido } = normalizarPoder({ nome: 'Lâmina', aplicaEstados: [ESTADO], reflexo: { modo: 'devolver', mult: 100 }, suporte: SUPORTE });
        expect(valido).toBe(true);
        expect(objeto.aplicaEstados).toEqual([ESTADO]);
        expect(objeto.reflexo.modo).toBe('devolver');
        expect(objeto.suporte.cura.dadosQtd).toBe(3);
        expect(objeto.suporte.alvos).toBe('aliados');
        expect(avisos).toEqual([]);
    });

    it('campos ausentes não entram no objeto', () => {
        for (const n of [normalizarPoder, normalizarMagia, normalizarItem]) {
            const { objeto } = n({ nome: 'X', tipo: 'arma', elemento: 'Fogo' });
            expect(objeto).not.toHaveProperty('aplicaEstados');
            expect(objeto).not.toHaveProperty('reflexo');
            expect(objeto).not.toHaveProperty('suporte');
        }
    });

    it('descarta estados inválidos com aviso e omite a lista vazia', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'X', aplicaEstados: [{ id: 'inexistente' }, { id: 'queimado', stacks: 99 }] });
        expect(objeto.aplicaEstados).toEqual([{ id: 'queimado', stacks: 6 }]);
        expect(avisos.some(a => /estado/.test(a))).toBe(true);
        const vazio = normalizarMagia({ nome: 'X', elemento: 'Fogo', aplicaEstados: [{ id: 'nada' }] });
        expect(vazio.objeto).not.toHaveProperty('aplicaEstados');
    });

    it('reflexo inválido é ignorado com aviso; item não aceita reflexo', () => {
        const p = normalizarPoder({ nome: 'X', reflexo: { modo: 'xyz' } });
        expect(p.objeto).not.toHaveProperty('reflexo');
        expect(p.avisos.some(a => /Reflexo/.test(a))).toBe(true);
        const m = normalizarMagia({ nome: 'X', elemento: 'Fogo', reflexo: { modo: 'contra' } });
        expect(m.objeto.reflexo.mult).toBe(150);
        const i = normalizarItem({ nome: 'X', tipo: 'arma', reflexo: { modo: 'devolver' }, aplicaEstados: [ESTADO], suporte: SUPORTE });
        expect(i.objeto).not.toHaveProperty('reflexo');
        expect(i.avisos.some(a => /Reflexo/.test(a))).toBe(true);
        expect(i.objeto.aplicaEstados).toHaveLength(1);
        expect(i.objeto.suporte).toBeTruthy();
    });

    it('suporte descarta buffs inválidos com aviso e some se ficar vazio', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'X', suporte: { buffs: [{ atributo: 'forca', propriedade: 'base', valor: 2 }, { atributo: 'naoexiste', propriedade: 'base', valor: 1 }] } });
        expect(objeto.suporte.buffs).toHaveLength(1);
        expect(avisos.some(a => /buff/.test(a))).toBe(true);
        const vazio = normalizarMagia({ nome: 'X', elemento: 'Fogo', suporte: { buffs: [{ atributo: 'naoexiste', propriedade: 'x', valor: 1 }] } });
        expect(vazio.objeto).not.toHaveProperty('suporte');
        expect(vazio.avisos.some(a => /Suporte/.test(a))).toBe(true);
    });

    it('normalizarProposta é idempotente com os campos novos (gravação/aprovação relê o objeto)', () => {
        const primeira = normalizarProposta('poder', { nome: 'Lâmina', aplicaEstados: [ESTADO], reflexo: { modo: 'devolver' }, suporte: SUPORTE }).objeto;
        const segunda = normalizarProposta('poder', primeira).objeto;
        expect(segunda).toEqual(primeira);
    });

    it('resumo e linhas descrevem o que a criação faz', () => {
        const { objeto } = normalizarPoder({ nome: 'X', aplicaEstados: [ESTADO], reflexo: { modo: 'devolver', mult: 100 }, suporte: SUPORTE });
        const linhas = descreverExtrasProposta(objeto);
        expect(linhas[0]).toBe('🩸 Aplica Sangrando x2 (teste de Constituição CD 15, só em crítico)');
        expect(linhas[1]).toBe('↩️ Reflexo: Devolver 100%');
        expect(linhas[2]).toContain('Cura 3d8+10');
        expect(linhas[2]).toContain('forca base +5 por 3 turnos');
        expect(linhas[2]).toContain('aliados (até 3)');
        expect(resumirProposta('poder', objeto)).toContain('Aplica Sangrando');
        expect(resumirProposta('poder', objeto, { extras: false })).not.toContain('Aplica');
    });

    it('declarações expõem os campos novos nos schemas certos', () => {
        const props = (n) => declaracao(n).parameters.properties;
        expect(props('propor_habilidade')).toHaveProperty('aplicaEstados');
        expect(props('propor_habilidade')).toHaveProperty('reflexo');
        expect(props('propor_habilidade')).toHaveProperty('suporte');
        expect(props('propor_magia')).toHaveProperty('reflexo');
        expect(props('propor_item')).toHaveProperty('suporte');
        expect(props('propor_item')).not.toHaveProperty('reflexo');
        expect(props('propor_habilidade').aplicaEstados.items.properties.id.enum).toContain('petrificado');
    });
});
