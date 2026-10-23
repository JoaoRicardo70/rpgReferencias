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
        expect(cena.classList.contains('dado-sacode')).toBe(true);
        expect(q('canvas.dado-particulas')).not.toBeNull();
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
        expect(q('.dado-cena').classList.contains('dado-sacode-leve')).toBe(true);
        expect(q('.dado-cena').classList.contains('dado-sacode')).toBe(false);
        expect(q('canvas.dado-particulas')).not.toBeNull();
    });
    it('pousado falha: FALHA CRÍTICA sem raios nem fagulhas', () => {
        mockar({ ...base, numero: 1, nivel: 'falha', finalResult: 1 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-rotulo').textContent).toContain('FALHA CRÍTICA');
        expect(q('.dado-raios')).toBeNull();
        expect(q('.dado-fagulhas')).toBeNull();
        expect(q('svg.dado-rachaduras')).not.toBeNull();
        expect(q('.dado-cena').classList.contains('dado-sacode')).toBe(false);
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
    it('a prop nivel chega ao DadoFisico3D (Canvas)', () => {
        mockar({ ...base, nivel: 'critico', finalResult: 19 });
        render(<MapaDadoAnimado />);
        expect(canvasProps[canvasProps.length - 1].nivel).toBe('critico');
        canvasProps.length = 0;
        limpar();
        mockar({ ...base, finalResult: 5 });
        render(<MapaDadoAnimado />);
        expect(canvasProps[canvasProps.length - 1].nivel).toBe('normal');
    });
    it('rotulo usa dadoAnim.corTexto em --cor-texto-dado', () => {
        mockar({ ...base, nivel: 'critico', finalResult: 19, corTexto: '#123456' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').style.getPropertyValue('--cor-texto-dado')).toBe('#123456');
    });
    it('sem dadoAnim.corTexto cai no corTexto do nivel', () => {
        mockar({ ...base, nivel: 'critico', finalResult: 19 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').style.getPropertyValue('--cor-texto-dado')).toBe('#ffe066');
        limpar();
        mockar({ ...base, nivel: 'falha', finalResult: 1 });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').style.getPropertyValue('--cor-texto-dado')).toBe('#c9b6e4');
    });
    it('passa a cor para a variavel CSS e renderiza o Canvas mockado', () => {
        mockar({ ...base, cor: '#ffcc00', nivel: 'critico' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').style.getPropertyValue('--cor-dado')).toBe('#ffcc00');
        expect(q('[data-testid="canvas-mock"]')).not.toBeNull();
    });
    it('modo fisico: so conta como pousado quando dadoAnim.pousou', () => {
        mockar({ ...base, fisica: true, id: 'a1', finalResult: 17, pousou: false, nivel: 'critico', cor: '#ffcc00' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').classList.contains('dado-fisica')).toBe(true);
        expect(q('.dado-cena').classList.contains('dado-no-ar')).toBe(true);
        expect(q('.dado-rotulo')).toBeNull();
        expect(q('.dado-raios')).toBeNull();
        expect(q('canvas.dado-particulas')).toBeNull();
        expect(q('.dado-quem').textContent).toContain('está rolando');
        const ultimo = canvasProps[canvasProps.length - 1];
        expect(typeof ultimo.fisica.aoPousar).toBe('function');
        limpar();
        mockar({ ...base, fisica: true, id: 'a1', finalResult: 17, pousou: true, nivel: 'critico', cor: '#ffcc00' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').classList.contains('dado-pousou')).toBe(true);
        expect(q('.dado-rotulo').textContent).toContain('CRÍTICO!');
        expect(q('canvas.dado-particulas')).not.toBeNull();
    });
    it('modo fisico segurando: dica, classe e texto "vai lancar"', () => {
        mockar({ ...base, fisica: true, id: 'a2', finalResult: 17, pousou: false, segurando: true });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').classList.contains('dado-segurando')).toBe(true);
        expect(q('.dado-dica-mao')).not.toBeNull();
        expect(q('.dado-quem').textContent).toContain('vai lançar o dado');
    });
    it('efeitos suaves: sem tremor, sem clarao, mas com particulas e raios', () => {
        mockar({ ...base, numero: 20, nivel: 'fatal', finalResult: 20, efeitos: 'suaves' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-cena').classList.contains('dado-sacode')).toBe(false);
        expect(q('.dado-clarao')).toBeNull();
        expect(q('.dado-raios')).not.toBeNull();
        expect(q('canvas.dado-particulas')).not.toBeNull();
    });
    it('efeitos desligados: so o rotulo (sem raios, onda, particulas ou tremor)', () => {
        mockar({ ...base, numero: 20, nivel: 'fatal', finalResult: 20, efeitos: 'desligados' });
        render(<MapaDadoAnimado />);
        expect(q('.dado-rotulo')).not.toBeNull();
        expect(q('.dado-raios')).toBeNull();
        expect(q('.dado-onda')).toBeNull();
        expect(q('.dado-clarao')).toBeNull();
        expect(q('canvas.dado-particulas')).toBeNull();
        expect(q('.dado-cena').classList.contains('dado-sacode')).toBe(false);
    });
    it('modo fisico pousado: fecha a cena apos duracaoMs, so se for o mesmo dado', () => {
        vi.useFakeTimers();
        try {
            const setDadoAnim = vi.fn();
            mockar({ ...base, fisica: true, id: 'a3', finalResult: 17, pousou: true, duracaoMs: 1500 }, { setDadoAnim });
            render(<MapaDadoAnimado />);
            expect(setDadoAnim).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1500);
            expect(setDadoAnim).toHaveBeenCalledTimes(1);
            const atualiza = setDadoAnim.mock.calls[0][0];
            expect(atualiza({ id: 'a3', ativo: true }).ativo).toBe(false);
            const outro = { id: 'outro', ativo: true };
            expect(atualiza(outro)).toBe(outro);
        } finally { vi.useRealTimers(); }
    });
});
