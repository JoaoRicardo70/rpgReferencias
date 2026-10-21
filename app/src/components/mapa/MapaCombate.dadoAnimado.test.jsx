import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaDadoAnimado } from './MapaCombate';
import { useMapaForm } from './MapaFormContext';

const canvasProps = vi.hoisted(() => []);
vi.mock('../../stores/useStore');
vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }) => {
        const filho = React.Children.toArray(children)[0];
        canvasProps.push(filho?.props || {});
        return <div data-testid="canvas-mock" />;
    },
    useFrame: vi.fn()
}));
vi.mock('./MapaFormContext', () => ({
    useMapaForm: vi.fn(),
    MapaFormProvider: ({ children }) => <>{children}</>,
    urlSeguraParaCss: (u) => u,
    calcularCA: () => 10
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarDummie: vi.fn()
}));

const q = (sel) => document.body.querySelector(sel);
const mockar = (dadoAnim, extra = {}) => useMapaForm.mockReturnValue({ abaAtiva: 'aba-mapa', dadoAnim, ...extra });
const base = { ativo: true, numero: 17, cor: '#0088ff', quemRolou: 'Kenji' };
const limpar = () => { cleanup(); document.body.innerHTML = ''; };

beforeEach(() => { vi.clearAllMocks(); canvasProps.length = 0; });
afterEach(() => limpar());

describe('MapaDadoAnimado', () => {
    it('nao renderiza com dadoAnim.ativo=false', () => {
        mockar({ ...base, ativo: false });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena')).toBeNull();
    });
    it('nao renderiza sem contexto, sem dadoAnim ou fora da aba do mapa', () => {
        useMapaForm.mockReturnValue(null);
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena')).toBeNull();
        mockar(undefined);
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena')).toBeNull();
        mockar(base, { abaAtiva: 'aba-ficha' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena')).toBeNull();
    });
    it('no ar: dado-no-ar, sem medalhao HTML, valor undefined no Canvas, "esta rolando..." e sem rotulo', () => {
        mockar({ ...base, nivel: 'normal' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').classList.contains('dado-no-ar')).toBe(true);
        expect(q('.dado-cena').classList.contains('dado-pousou')).toBe(false);
        expect(q('.dado-medalhao')).toBeNull();
        expect(q('.dado-numero')).toBeNull();
        const ultimo = canvasProps[canvasProps.length - 1];
        expect(ultimo.valor).toBeUndefined();
        expect(ultimo.isLanded).toBe(false);
        expect(q('.dado-quem').textContent).toContain('está rolando...');
        expect(q('.dado-rotulo')).toBeNull();
        expect(q('.dado-onda')).toBeNull();
        expect(q('.dado-raios')).toBeNull();
    });
    it('pousado fatal: rotulo, classes, raios, fagulhas, clarao, onda', () => {
        mockar({ ...base, numero: 20, cor: '#ff003c', nivel: 'fatal', finalResult: 20 });
        render(<MapaDadoAnimado />);
        const cena = q('.dado-cena');
        expect(cena.classList.contains('dado-nivel-fatal')).toBe(true);
        expect(cena.classList.contains('dado-pousou')).toBe(true);
        expect(cena.classList.contains('dado-no-ar')).toBe(false);
        expect(q('.dado-rotulo').textContent).toContain('CRÍTICO FATAL!');
        expect(q('.dado-raios')).not.toBeNull();
        expect(q('.dado-clarao')).not.toBeNull();
        expect(q('.dado-onda')).not.toBeNull();
        expect(document.body.querySelectorAll('.dado-fagulha').length).toBe(16);
        expect(q('.dado-quem').textContent).toContain('rolou');
        expect(q('.dado-quem').textContent).not.toContain('está rolando');
    });
    it('pousado: Canvas recebe valor = finalResult e isLanded true, sem medalhao', () => {
        mockar({ ...base, nivel: 'normal', finalResult: 17 });
        render(<MapaDadoAnimado />);
        const ultimo = canvasProps[canvasProps.length - 1];
        expect(ultimo.valor).toBe(17);
        expect(ultimo.isLanded).toBe(true);
        expect(q('.dado-medalhao')).toBeNull();
        expect(q('.dado-numero')).toBeNull();
    });
    it('finalResult 0 conta como pousado (usa != null)', () => {
        mockar({ ...base, nivel: 'normal', finalResult: 0 });
        render(<MapaDadoAnimado />);
        const ultimo = canvasProps[canvasProps.length - 1];
        expect(ultimo.valor).toBe(0);
        expect(ultimo.isLanded).toBe(true);
        expect(q('.dado-cena').classList.contains('dado-pousou')).toBe(true);
        expect(q('.dado-rotulo').textContent).toContain('ROLADO!');
    });
    it('pousado critico: rotulo e raios, sem clarao', () => {
        mockar({ ...base, numero: 19, cor: '#ffcc00', nivel: 'critico', finalResult: 19 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-rotulo').textContent).toContain('CRÍTICO!');
        expect(q('.dado-raios')).not.toBeNull();
        expect(q('.dado-clarao')).toBeNull();
        expect(document.body.querySelectorAll('.dado-fagulha').length).toBe(16);
    });
    it('pousado falha: FALHA CRÍTICA sem raios nem fagulhas', () => {
        mockar({ ...base, numero: 1, nivel: 'falha', finalResult: 1 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-rotulo').textContent).toContain('FALHA CRÍTICA');
        expect(q('.dado-raios')).toBeNull();
        expect(q('.dado-fagulhas')).toBeNull();
    });
    it('pousado normal: ROLADO! sem raios', () => {
        mockar({ ...base, nivel: 'normal', finalResult: 17 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-rotulo').textContent).toContain('ROLADO!');
        expect(q('.dado-raios')).toBeNull();
        expect(q('.dado-fagulhas')).toBeNull();
    });
    it('nivel ausente ou desconhecido cai em normal', () => {
        mockar({ ...base, finalResult: 12 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').classList.contains('dado-nivel-normal')).toBe(true);
        expect(q('.dado-rotulo').textContent).toContain('ROLADO!');
        limpar();
        mockar({ ...base, nivel: 'inexistente', finalResult: 12 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-rotulo').textContent).toContain('ROLADO!');
        expect(q('.dado-raios')).toBeNull();
    });
    it('mostra quemRolou e omite a linha se ausente', () => {
        mockar({ ...base, nivel: 'normal' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-quem').textContent).toContain('Kenji');
        limpar();
        mockar({ ...base, quemRolou: undefined });
        render(<MapaDadoAnimado />);
        expect(q('.dado-quem')).toBeNull();
    });
    it('passa a cor para a variavel CSS e renderiza o Canvas mockado', () => {
        mockar({ ...base, cor: '#ffcc00', nivel: 'critico' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').style.getPropertyValue('--cor-dado')).toBe('#ffcc00');
        expect(q('[data-testid="canvas-mock"]')).not.toBeNull();
    });
});
