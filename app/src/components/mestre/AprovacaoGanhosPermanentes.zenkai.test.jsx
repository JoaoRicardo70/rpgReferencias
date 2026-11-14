import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AprovacaoGanhosPermanentes from './AprovacaoGanhosPermanentes';

const zk = (pct = 2.5) => ({
    pct, turnos: 8, score: 1.7, teto: 5, fatorOponente: 1.2, semOponente: false, resumo: '',
    componentes: [
        { id: 'dano', rotulo: 'Dano recebido', valor: 0.4, peso: 1, contribuicao: 0.4, detalhe: '40% da Vida máxima' },
        { id: 'energia', rotulo: 'Energia gasta', valor: 0, peso: 0.8, contribuicao: 0, detalhe: '0%' },
    ],
});
const itens = (extra = {}) => [
    { nome: 'Natsu', pendencias: { temPendencia: true, adaptacao: null, derivados: null, zenkai: zk(2.5) } },
    { nome: 'Verg', pendencias: { temPendencia: true, adaptacao: { pct: 10, turnos: 2, soma: 20 }, derivados: null, ...extra } },
];

afterEach(cleanup);

describe('AprovacaoGanhosPermanentes: Zenkai', () => {
    it('mostra o sugerido, so os fatores com valor, o oponente e o campo editavel; quem nao tem Zenkai nao ganha o bloco', () => {
        render(<AprovacaoGanhosPermanentes itens={itens()} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        const bloco = screen.getByTestId('aprovacao-zenkai-Natsu');
        expect(bloco.textContent).toMatch(/Zenkai sugerido: \+2,5%/);
        expect(bloco.textContent).toMatch(/teto 5%/);
        expect(bloco.textContent).toMatch(/Dano recebido: 40% da Vida máxima/);
        expect(bloco.textContent).not.toMatch(/Energia gasta/);
        expect(bloco.textContent).toMatch(/Oponente: fator ×1,2/);
        expect(screen.getByLabelText('Zenkai de Natsu (%)').value).toBe('2.5');
        expect(screen.queryByTestId('aprovacao-zenkai-Verg')).toBeNull();
    });
    it('sem dado de oponente avisa o fator 0,1', () => {
        const it2 = [{ nome: 'Natsu', pendencias: { temPendencia: true, adaptacao: null, derivados: null, zenkai: { ...zk(0.4), semOponente: true, fatorOponente: 0.1 } } }];
        render(<AprovacaoGanhosPermanentes itens={it2} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        expect(screen.getByTestId('aprovacao-zenkai-Natsu').textContent).toMatch(/sem dados \(fator ×0,1\)/);
    });
    it('Confirmar entrega as decisoes e o valor editado por personagem (so de quem tem Zenkai)', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={itens()} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.change(screen.getByLabelText('Zenkai de Natsu (%)'), { target: { value: '3.75' } });
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: 'liberar', Verg: 'liberar' }, { Natsu: 3.75 });
    });
    it('sem editar entrega o sugerido; vazio volta ao sugerido; acima de 100 e preso; negativo vira 0', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={itens()} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[1]).toEqual({ Natsu: 2.5 });
        const campo = screen.getByLabelText('Zenkai de Natsu (%)');
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[1]).toEqual({ Natsu: 2.5 });
        fireEvent.change(campo, { target: { value: '900' } });
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[1]).toEqual({ Natsu: 100 });
        fireEvent.change(campo, { target: { value: '-3' } });
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[1]).toEqual({ Natsu: 0 });
    });
    it('"Recusar todos" e "Liberar todos" funcionam com o Zenkai e mantem o valor digitado', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={itens()} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.change(screen.getByLabelText('Zenkai de Natsu (%)'), { target: { value: '1' } });
        fireEvent.click(screen.getByText('Recusar todos'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: 'recusar', Verg: 'recusar' }, { Natsu: 1 });
        fireEvent.click(screen.getByText('Liberar todos'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: 'liberar', Verg: 'liberar' }, { Natsu: 1 });
    });
});
