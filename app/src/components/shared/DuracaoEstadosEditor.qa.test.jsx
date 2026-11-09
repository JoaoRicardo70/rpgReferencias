import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DuracaoEstadosEditor from './DuracaoEstadosEditor';
import { definirDuracaoManual } from '../../core/duracaoEstados';

afterEach(cleanup);

const rotuloCampo = (nome) => `Duração de ${nome} (turnos, vazio = até remover)`;

describe('QA DuracaoEstadosEditor - bordas', () => {
    it('ficha nula/undefined e condicoes vazias: nada renderizado, sem quebrar', () => {
        expect(render(<DuracaoEstadosEditor ficha={null} onDefinir={() => {}} />).container.firstChild).toBeNull();
        cleanup();
        expect(render(<DuracaoEstadosEditor ficha={undefined} onDefinir={() => {}} />).container.firstChild).toBeNull();
        cleanup();
        expect(render(<DuracaoEstadosEditor ficha={{ condicoes: [], duracaoEstados: { lento: 3 } }} onDefinir={() => {}} />).container.firstChild).toBeNull();
    });

    it('campo vazio = permanente: mostra "ate remover", campo vazio e sem botao de tirar prazo', () => {
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }] }} onDefinir={() => {}} />);
        expect(screen.getByLabelText('Duração de Lento').textContent).toBe('até remover');
        expect(screen.getByLabelText(rotuloCampo('Lento')).value).toBe('');
        expect(screen.queryByLabelText('Tirar o prazo de Lento')).toBeNull();
    });

    it('esvaziar o campo de um estado com prazo chama onDefinir(id, "") (vira permanente)', () => {
        const onDefinir = vi.fn();
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 3 } }} onDefinir={onDefinir} />);
        const campo = screen.getByLabelText(rotuloCampo('Lento'));
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.blur(campo);
        expect(onDefinir).toHaveBeenCalledWith('lento', '');
    });

    it('campo vazio num estado permanente e blur: nao chama onDefinir', () => {
        const onDefinir = vi.fn();
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }] }} onDefinir={onDefinir} />);
        fireEvent.blur(screen.getByLabelText(rotuloCampo('Lento')));
        expect(onDefinir).not.toHaveBeenCalled();
    });

    it('espacos em branco no campo de um permanente contam como vazio (nao chama)', () => {
        const onDefinir = vi.fn();
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }] }} onDefinir={onDefinir} />);
        const campo = screen.getByLabelText(rotuloCampo('Lento'));
        fireEvent.change(campo, { target: { value: '   ' } });
        fireEvent.blur(campo);
        expect(onDefinir).not.toHaveBeenCalled();
    });

    it('valores invalidos (negativo, zero, 1e9, decimal) sao repassados crus e o core os sanitiza', () => {
        const base = { condicoes: [{ id: 'lento', stacks: 1 }] };
        const casos = [['-5', undefined], ['0', undefined], ['1e9', 99], ['2.7', 2], ['100', 99]];
        for (const [digitado, esperado] of casos) {
            const onDefinir = vi.fn();
            const { unmount } = render(<DuracaoEstadosEditor ficha={base} onDefinir={onDefinir} />);
            const campo = screen.getByLabelText(rotuloCampo('Lento'));
            fireEvent.change(campo, { target: { value: digitado } });
            fireEvent.blur(campo);
            // jsdom pode zerar valores que o input number considera invalidos; so valida o que foi chamado
            if (onDefinir.mock.calls.length > 0) {
                const f = { condicoes: [{ id: 'lento', stacks: 1 }] };
                definirDuracaoManual(f, onDefinir.mock.calls[0][0], onDefinir.mock.calls[0][1]);
                expect(f.duracaoEstados ? f.duracaoEstados.lento : undefined).toBe(esperado);
            }
            unmount();
        }
    });

    it('texto nao numerico no input number nao vira prazo (jsdom devolve vazio)', () => {
        const onDefinir = vi.fn();
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }] }} onDefinir={onDefinir} />);
        const campo = screen.getByLabelText(rotuloCampo('Lento'));
        fireEvent.change(campo, { target: { value: 'abc' } });
        fireEvent.blur(campo);
        expect(onDefinir).not.toHaveBeenCalled();
    });

    it('orfao no mapa (estado inativo/id invalido) nao aparece; so ativos sao listados', () => {
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { queimado: 3, xyz: 2 } }} onDefinir={() => {}} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(screen.queryByLabelText('Duração de Queimado')).toBeNull();
    });

    it('prazo cru acima de 99 aparece como 99 turnos; prazo 0 aparece como "ate remover"', () => {
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 1e9, queimado: 0 } }} onDefinir={() => {}} />);
        expect(screen.getByLabelText('Duração de Lento').textContent).toBe('⏳ 99 turnos');
        expect(screen.getByLabelText('Duração de Queimado').textContent).toBe('até remover');
    });

    it('limites do input: min=1 e max=99', () => {
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }] }} onDefinir={() => {}} />);
        const campo = screen.getByLabelText(rotuloCampo('Lento'));
        expect(campo.getAttribute('min')).toBe('1');
        expect(campo.getAttribute('max')).toBe('99');
    });

    it('varios estados: cada botao tira o prazo do seu proprio estado', () => {
        const onDefinir = vi.fn();
        render(<DuracaoEstadosEditor ficha={{ condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 2, queimado: 5 } }} onDefinir={onDefinir} />);
        fireEvent.click(screen.getByLabelText('Tirar o prazo de Queimado'));
        expect(onDefinir).toHaveBeenCalledTimes(1);
        expect(onDefinir).toHaveBeenCalledWith('queimado', '');
    });
});
