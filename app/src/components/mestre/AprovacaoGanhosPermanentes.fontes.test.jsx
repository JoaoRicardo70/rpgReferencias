import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AprovacaoGanhosPermanentes from './AprovacaoGanhosPermanentes';

// Decisao POR FONTE: cada personagem tem secoes separadas (Adaptacao / Zenkai / Derivados) com o seu Liberar/Recusar.
const zk = (pct = 2.5) => ({
    pct, turnos: 8, score: 1.7, teto: 5, fatorOponente: 1, fatorDuracao: 1, turnosMinimos: 3, semOponente: false, resumo: '',
    componentes: [{ id: 'dano', rotulo: 'Dano recebido', valor: 0.4, peso: 1, contribuicao: 0.4, detalhe: '40% da Vida máxima' }],
});
const completo = { nome: 'Natsu', pendencias: { temPendencia: true, adaptacao: { pct: 15, turnos: 2, soma: 30 }, derivados: { poderCalculado: 0.5, fatorPoder: 1 }, zenkai: zk() } };
const soAdaptacao = { nome: 'Verg', pendencias: { temPendencia: true, adaptacao: { pct: 10, turnos: 1, soma: 10 }, derivados: null } };
const T = (v) => ({ adaptacao: v, zenkai: v, derivados: v });
const secao = (nome, fonte) => screen.getByTestId(fonte === 'zenkai' ? `aprovacao-zenkai-${nome}` : `aprovacao-secao-${nome}-${fonte}`);
const radio = (el, valor) => el.querySelector(`input[value="${valor}"]`);

afterEach(cleanup);

describe('AprovacaoGanhosPermanentes: secoes por fonte', () => {
    it('mostra uma secao por fonte pendente, cada uma com Liberar pre-selecionado e radios nativos agrupados', () => {
        render(<AprovacaoGanhosPermanentes itens={[completo, soAdaptacao]} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        ['adaptacao', 'zenkai', 'derivados'].forEach((f) => {
            const s = secao('Natsu', f);
            expect(radio(s, 'liberar').type).toBe('radio');
            expect(radio(s, 'liberar').checked).toBe(true);
            expect(radio(s, 'recusar').checked).toBe(false);
            expect(radio(s, 'liberar').name).toBe(radio(s, 'recusar').name);
        });
        // nomes de grupo distintos por fonte (grupos independentes)
        const nomes = ['adaptacao', 'zenkai', 'derivados'].map(f => radio(secao('Natsu', f), 'liberar').name);
        expect(new Set(nomes).size).toBe(3);
        // quem so tem Adaptacao so ganha essa secao
        expect(screen.queryByTestId('aprovacao-secao-Verg-derivados')).toBeNull();
        expect(screen.queryByTestId('aprovacao-zenkai-Verg')).toBeNull();
        expect(secao('Verg', 'adaptacao').textContent).toMatch(/Adaptação: média de \+10% em 1 turno/);
    });
    it('cada secao tem os seus valores (Adaptacao, Zenkai sugerido, Derivados)', () => {
        render(<AprovacaoGanhosPermanentes itens={[completo]} aoConfirmar={() => {}} aoCancelar={() => {}} />);
        expect(secao('Natsu', 'adaptacao').textContent).toMatch(/média de \+15% em 2 turnos/);
        expect(secao('Natsu', 'zenkai').textContent).toMatch(/Zenkai sugerido: \+2,5%/);
        expect(secao('Natsu', 'derivados').textContent).toMatch(/Derivados: \+50% \(derivados\)/);
    });
    it('recusar UMA fonte nao mexe nas outras e o item vira "misto"', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={[completo]} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.click(radio(secao('Natsu', 'derivados'), 'recusar'));
        expect(radio(secao('Natsu', 'derivados'), 'recusar').checked).toBe(true);
        expect(radio(secao('Natsu', 'adaptacao'), 'liberar').checked).toBe(true);
        expect(radio(secao('Natsu', 'zenkai'), 'liberar').checked).toBe(true);
        const item = screen.getByTestId('aprovacao-item-Natsu');
        expect(item.className).toContain('aprovacao-item--misto');
        // "tudo" do personagem fica sem marca (misto)
        expect(radio(item.querySelector('.aprovacao-item-tudo'), 'liberar').checked).toBe(false);
        expect(radio(item.querySelector('.aprovacao-item-tudo'), 'recusar').checked).toBe(false);
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: { adaptacao: 'liberar', zenkai: 'liberar', derivados: 'recusar' } }, { Natsu: 2.5 });
    });
    it('todas as combinacoes por fonte chegam certas ao onConfirm', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={[completo]} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.click(radio(secao('Natsu', 'adaptacao'), 'recusar'));
        fireEvent.click(radio(secao('Natsu', 'zenkai'), 'recusar'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[0].Natsu).toEqual({ adaptacao: 'recusar', zenkai: 'recusar', derivados: 'liberar' });
        fireEvent.click(radio(secao('Natsu', 'adaptacao'), 'liberar'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[0].Natsu).toEqual({ adaptacao: 'liberar', zenkai: 'recusar', derivados: 'liberar' });
    });
    it('"Liberar/Recusar tudo" do personagem mexe so nele; os globais mexem em todos', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={[completo, soAdaptacao]} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        const tudoNatsu = screen.getByTestId('aprovacao-item-Natsu').querySelector('.aprovacao-item-tudo');
        fireEvent.click(radio(tudoNatsu, 'recusar'));
        ['adaptacao', 'zenkai', 'derivados'].forEach(f => expect(radio(secao('Natsu', f), 'recusar').checked).toBe(true));
        expect(radio(secao('Verg', 'adaptacao'), 'liberar').checked).toBe(true);
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar).toHaveBeenLastCalledWith({ Natsu: T('recusar'), Verg: T('liberar') }, { Natsu: 2.5 });
        fireEvent.click(screen.getByText('Liberar todos'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[0]).toEqual({ Natsu: T('liberar'), Verg: T('liberar') });
        fireEvent.click(screen.getByText('Recusar todos'));
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[0]).toEqual({ Natsu: T('recusar'), Verg: T('recusar') });
    });
    it('o campo do Zenkai continua editavel mesmo depois de recusar/liberar a secao (valor preservado)', () => {
        const aoConfirmar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={[completo]} aoConfirmar={aoConfirmar} aoCancelar={() => {}} />);
        fireEvent.change(screen.getByLabelText('Zenkai de Natsu (%)'), { target: { value: '4' } });
        fireEvent.click(radio(secao('Natsu', 'zenkai'), 'recusar'));
        fireEvent.click(radio(secao('Natsu', 'zenkai'), 'liberar'));
        expect(screen.getByLabelText('Zenkai de Natsu (%)').value).toBe('4');
        fireEvent.click(screen.getByText('Confirmar e encerrar'));
        expect(aoConfirmar.mock.lastCall[1]).toEqual({ Natsu: 4 });
    });
    it('teclado: radios sao focaveis nativos, o grupo tem rotulo acessivel, Esc cancela e Tab circula', () => {
        const aoCancelar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={[completo]} aoConfirmar={() => {}} aoCancelar={aoCancelar} />);
        expect(within(secao('Natsu', 'adaptacao')).getByRole('radiogroup', { name: 'Adaptação de Natsu' })).toBeTruthy();
        expect(within(secao('Natsu', 'zenkai')).getByRole('radiogroup', { name: 'Zenkai de Natsu' })).toBeTruthy();
        const r = radio(secao('Natsu', 'derivados'), 'recusar');
        r.focus();
        expect(document.activeElement).toBe(r);
        // Tab no ultimo foco volta ao primeiro
        const caixa = screen.getByRole('dialog').firstChild;
        const focaveis = Array.from(caixa.querySelectorAll('button, input')).filter(e => !e.disabled);
        focaveis[focaveis.length - 1].focus();
        fireEvent.keyDown(caixa, { key: 'Tab' });
        expect(document.activeElement).toBe(focaveis[0]);
        fireEvent.keyDown(caixa, { key: 'Escape' });
        expect(aoCancelar).toHaveBeenCalledTimes(1);
    });
    it('Cancelar nao confirma nada', () => {
        const aoConfirmar = vi.fn(); const aoCancelar = vi.fn();
        render(<AprovacaoGanhosPermanentes itens={[completo]} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} />);
        fireEvent.click(radio(secao('Natsu', 'derivados'), 'recusar'));
        fireEvent.click(screen.getByText('Cancelar'));
        expect(aoCancelar).toHaveBeenCalledTimes(1);
        expect(aoConfirmar).not.toHaveBeenCalled();
    });
});
