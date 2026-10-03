import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DisputaPoderResumo from './DisputaPoderResumo';
import useStore from '../../stores/useStore';
import { calcularDisputaPoder } from '../../core/disputaPoder';
import { ATRIBUTOS_AGRUPADOS } from '../../core/efeitos-constants';
import { somarEfeitosDeAtributo } from '../../core/percepcaoPoder';

vi.mock('../../stores/useStore');

// percepcao: pontos de PERCEPCAO_PODER da ficha de quem olha (>= 30 mostra a efetividade ao jogador).
function renderComo(isMestre, disputa, percepcao = 30) {
    const minhaFicha = { passivas: [{ nome: 'Olho', efeitos: [{ atributo: 'percepcao_poder', propriedade: 'base', valor: percepcao }] }] };
    useStore.mockImplementation((sel) => sel({ isMestre, minhaFicha }));
    return render(<DisputaPoderResumo disputa={disputa} nomeAtacante="Goku" nomeDefensor="Vegeta" />);
}
afterEach(() => cleanup());

describe('DisputaPoderResumo - numeros so para o Mestre', () => {
    const forte = calcularDisputaPoder(1100, 1000);
    const fraco = calcularDisputaPoder(1000, 1100);
    const igual = calcularDisputaPoder(500, 500);
    const zero = calcularDisputaPoder(1000, 2500);

    it('Mestre ve numeros exatos, Dano x e % mais forte', () => {
        const { container } = renderComo(true, forte);
        const t = container.textContent;
        expect(t).toContain('Dano x1,1');
        expect(t).toContain('1.100');
        expect(t).toContain('1.000');
        expect(t).toContain('10% mais forte');
    });
    it('jogador SEM percepcao: nem sabe quem leva vantagem (texto neutro, sem numeros)', () => {
        const { container } = renderComo(false, forte, 0);
        const t = container.textContent;
        expect(t).toContain('Disputa de Poder em vigor');
        expect(t).not.toContain('Vantagem');
        expect(t).not.toContain('Desvantagem');
        expect(t).not.toContain('mais forte');
        expect(t).not.toMatch(/[0-9]/);
        expect(renderComo(false, zero, 29).container.textContent).not.toContain('Sem efeito');
    });
    it('jogador ve so texto qualitativo: Vantagem de Poder, sem numeros', () => {
        const { container } = renderComo(false, forte);
        const t = container.textContent;
        expect(t).toContain('Vantagem de Poder');
        expect(t).not.toMatch(/[0-9]/);
        expect(t).not.toContain('Dano x');
        expect(t).not.toContain('%');
    });
    it('jogador: Desvantagem de Poder quando o fator < 1', () => {
        const { container } = renderComo(false, fraco);
        expect(container.textContent).toContain('Desvantagem de Poder');
        expect(container.textContent).not.toMatch(/[0-9]/);
    });
    it('jogador: Poder equilibrado quando igual', () => {
        const { container } = renderComo(false, igual);
        expect(container.textContent).toContain('Poder equilibrado');
        expect(container.textContent).toContain('equilíbrio');
        expect(container.textContent).not.toMatch(/[0-9]/);
    });
    it('Mestre em Poder igual ve os numeros e Dano x1', () => {
        const { container } = renderComo(true, igual);
        expect(container.textContent).toContain('Dano x1');
        expect(container.textContent).toContain('500');
    });
    it('golpe sem efeito: "Sem efeito" para ambos', () => {
        expect(renderComo(false, zero).container.textContent).toContain('Sem efeito');
        cleanup();
        expect(renderComo(true, zero).container.textContent).toContain('Sem efeito');
    });
    it('disputa nula nao renderiza; inativa mostra aviso sem numeros para jogador', () => {
        expect(renderComo(false, null).container.firstChild).toBeNull();
        cleanup();
        const r = renderComo(false, calcularDisputaPoder(null, 10));
        expect(r.container.textContent).toContain('Sem Disputa de Poder');
        expect(r.container.textContent).not.toContain('10');
    });
});
describe('efeitos-constants - grupo PERCEPCAO DE PODER', () => {
    it('contem percepcao_poder e ocultacao_poder em um grupo proprio', () => {
        const grupo = ATRIBUTOS_AGRUPADOS.find(g => g.label.includes('PERCEPÇÃO DE PODER'));
        expect(grupo).toBeDefined();
        expect(grupo.options).toEqual(['percepcao_poder', 'ocultacao_poder']);
    });
    it('as opcoes do grupo sao exatamente os atributos que percepcaoPoder.js le', () => {
        const grupo = ATRIBUTOS_AGRUPADOS.find(g => g.label.includes('PERCEPÇÃO DE PODER'));
        grupo.options.forEach(op => {
            expect(somarEfeitosDeAtributo({ passivas: [{ efeitos: [{ atributo: op, valor: 7 }] }] }, op)).toBe(7);
        });
    });
    it('nenhuma opcao do novo grupo repete outro grupo', () => {
        const todas = ATRIBUTOS_AGRUPADOS.flatMap(g => g.options);
        expect(new Set(todas).size).toBe(todas.length);
    });
});
