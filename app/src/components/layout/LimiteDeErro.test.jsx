import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import useStore from '../../stores/useStore';
import LimiteDeErro from './LimiteDeErro';
import TabPanel from './TabPanel';

const estado = { quebrar: true, renders: 0 };

function Bomba({ msg = 'boom' }) {
    estado.renders++;
    if (estado.quebrar) throw new Error(msg);
    return <p>conteudo ok</p>;
}

function BombaEfeito() {
    useEffect(() => {
        if (estado.quebrar) throw new Error('erro no efeito');
    }, []);
    return <p>efeito montado</p>;
}

describe('LimiteDeErro', () => {
    let spyErro;
    beforeEach(() => {
        estado.quebrar = true;
        estado.renders = 0;
        spyErro = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        spyErro.mockRestore();
    });

    describe('caminho feliz', () => {
        it('renderiza os filhos normalmente, sem wrapper extra no DOM', () => {
            const { container } = render(
                <LimiteDeErro area="Esta aba"><span data-testid="f">olá</span></LimiteDeErro>
            );
            expect(screen.getByTestId('f')).toBeTruthy();
            expect(container.firstChild).toBe(screen.getByTestId('f'));
            expect(container.children.length).toBe(1);
            expect(screen.queryByRole('alert')).toBeNull();
        });

        it('mostra o alerta com título e mensagem quando um filho lança erro, mantendo irmãos', () => {
            render(
                <div>
                    <p>irmão de fora</p>
                    <LimiteDeErro area="Esta aba"><Bomba msg="falhou feio" /></LimiteDeErro>
                </div>
            );
            const alerta = screen.getByRole('alert');
            expect(alerta.textContent).toContain('⚠️ Esta aba encontrou um erro');
            expect(screen.getByText('falhou feio')).toBeTruthy();
            expect(screen.getByText('irmão de fora')).toBeTruthy();
            expect(screen.queryByText('conteudo ok')).toBeNull();
        });

        it('usa o texto padrão quando area não é informada', () => {
            render(<LimiteDeErro><Bomba /></LimiteDeErro>);
            expect(screen.getByRole('alert').textContent).toContain('Esta parte do app encontrou um erro');
        });

        it('registra o erro no console.error', () => {
            render(<LimiteDeErro area="X"><Bomba /></LimiteDeErro>);
            expect(spyErro.mock.calls.some(c => String(c[0]).includes('[LimiteDeErro]'))).toBe(true);
        });
    });

    describe('Tentar de novo', () => {
        it('re-renderiza os filhos e o conteúdo volta quando o filho para de lançar', () => {
            render(<LimiteDeErro area="Esta aba"><Bomba /></LimiteDeErro>);
            expect(screen.getByRole('alert')).toBeTruthy();
            estado.quebrar = false;
            fireEvent.click(screen.getByText('🔄 Tentar de novo'));
            expect(screen.getByText('conteudo ok')).toBeTruthy();
            expect(screen.queryByRole('alert')).toBeNull();
        });

        it('mostra o alerta de novo, sem loop infinito, se o filho lançar outra vez', () => {
            render(<LimiteDeErro area="Esta aba"><Bomba /></LimiteDeErro>);
            const antes = estado.renders;
            fireEvent.click(screen.getByText('🔄 Tentar de novo'));
            expect(screen.getByRole('alert')).toBeTruthy();
            // React pode repetir a renderização do filho que falhou, mas de forma limitada
            expect(estado.renders - antes).toBeLessThan(10);
        });
    });

    describe('compacto', () => {
        it('mostra a mensagem compacta', () => {
            render(<LimiteDeErro area="O dock" compacto><Bomba /></LimiteDeErro>);
            const alerta = screen.getByRole('alert');
            expect(alerta.textContent).toContain('O dock parou de funcionar.');
            expect(alerta.className).toContain('limite-erro-compacto');
            expect(screen.queryByText('Recarregar a página')).toBeNull();
        });

        it('o botão Tentar de novo do modo compacto restaura o conteúdo', () => {
            render(<LimiteDeErro area="O dock" compacto><Bomba /></LimiteDeErro>);
            estado.quebrar = false;
            fireEvent.click(screen.getByText('Tentar de novo'));
            expect(screen.getByText('conteudo ok')).toBeTruthy();
        });
    });

    describe('chaveReset', () => {
        it('muda de false para true em estado de erro: reseta', () => {
            const { rerender } = render(
                <LimiteDeErro area="A" chaveReset={false}><Bomba /></LimiteDeErro>
            );
            expect(screen.getByRole('alert')).toBeTruthy();
            estado.quebrar = false;
            rerender(<LimiteDeErro area="A" chaveReset={true}><Bomba /></LimiteDeErro>);
            expect(screen.getByText('conteudo ok')).toBeTruthy();
            expect(screen.queryByRole('alert')).toBeNull();
        });

        it('muda de true para false em estado de erro: não reseta', () => {
            const { rerender } = render(
                <LimiteDeErro area="A" chaveReset={true}><Bomba /></LimiteDeErro>
            );
            expect(screen.getByRole('alert')).toBeTruthy();
            estado.quebrar = false;
            rerender(<LimiteDeErro area="A" chaveReset={false}><Bomba /></LimiteDeErro>);
            expect(screen.getByRole('alert')).toBeTruthy();
            expect(screen.queryByText('conteudo ok')).toBeNull();
        });

        it('mudar chaveReset sem estar em erro não afeta os filhos', () => {
            estado.quebrar = false;
            const { rerender } = render(
                <LimiteDeErro area="A" chaveReset={false}><Bomba /></LimiteDeErro>
            );
            rerender(<LimiteDeErro area="A" chaveReset={true}><Bomba /></LimiteDeErro>);
            expect(screen.getByText('conteudo ok')).toBeTruthy();
        });
    });

    describe('erro em useEffect', () => {
        it('captura erro lançado dentro de um useEffect do filho', () => {
            render(<LimiteDeErro area="Esta aba"><BombaEfeito /></LimiteDeErro>);
            expect(screen.getByRole('alert').textContent).toContain('Esta aba encontrou um erro');
            expect(screen.getByText('erro no efeito')).toBeTruthy();
        });
    });

    describe('Recarregar a página', () => {
        it('chama window.location.reload', () => {
            const original = window.location;
            const reload = vi.fn();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: { ...original, reload },
            });
            try {
                render(<LimiteDeErro area="Esta aba"><Bomba /></LimiteDeErro>);
                fireEvent.click(screen.getByText('Recarregar a página'));
                expect(reload).toHaveBeenCalledTimes(1);
            } finally {
                Object.defineProperty(window, 'location', { configurable: true, value: original });
            }
        });
    });

    describe('TabPanel', () => {
        beforeEach(() => {
            act(() => { useStore.setState({ abaAtiva: 'aba-a' }); });
        });

        it('erro em um TabPanel mostra o alerta só nele; outro TabPanel continua renderizando', () => {
            const { container } = render(
                <div>
                    <TabPanel id="aba-a"><Bomba /></TabPanel>
                    <TabPanel id="aba-b"><p>conteudo da b</p></TabPanel>
                </div>
            );
            const a = container.querySelector('#aba-a');
            const b = container.querySelector('#aba-b');
            expect(a.querySelector('[role="alert"]')).not.toBeNull();
            expect(b.querySelector('[role="alert"]')).toBeNull();
            expect(b.textContent).toContain('conteudo da b');
            expect(screen.getAllByRole('alert', { hidden: true }).length).toBe(1);
        });

        it('trocar abaAtiva para outra e voltar para a aba quebrada tenta de novo', () => {
            const { container } = render(
                <div>
                    <TabPanel id="aba-a"><Bomba /></TabPanel>
                    <TabPanel id="aba-b"><p>conteudo da b</p></TabPanel>
                </div>
            );
            const a = container.querySelector('#aba-a');
            expect(a.querySelector('[role="alert"]')).not.toBeNull();

            act(() => { useStore.setState({ abaAtiva: 'aba-b' }); });
            expect(a.querySelector('[role="alert"]')).not.toBeNull(); // ainda quebrada, oculta
            expect(a.style.display).toBe('none');

            estado.quebrar = false;
            act(() => { useStore.setState({ abaAtiva: 'aba-a' }); });
            expect(a.querySelector('[role="alert"]')).toBeNull();
            expect(a.textContent).toContain('conteudo ok');
            expect(a.style.display).toBe('block');
        });

        it('voltar para a aba que continua quebrada mostra o alerta de novo', () => {
            const { container } = render(
                <div>
                    <TabPanel id="aba-a"><Bomba /></TabPanel>
                    <TabPanel id="aba-b"><p>b</p></TabPanel>
                </div>
            );
            act(() => { useStore.setState({ abaAtiva: 'aba-b' }); });
            act(() => { useStore.setState({ abaAtiva: 'aba-a' }); });
            expect(container.querySelector('#aba-a [role="alert"]')).not.toBeNull();
        });
    });
});
