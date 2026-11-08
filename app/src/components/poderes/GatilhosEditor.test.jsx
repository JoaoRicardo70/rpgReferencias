import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GatilhosEditor from './GatilhosEditor';
import { normalizarGatilhos } from '../../core/gatilhos';

let ultima;
function Host({ inicial = [] }) {
    const [lista, setLista] = useState(inicial);
    ultima = lista;
    return <GatilhosEditor gatilhos={lista} onChange={setLista} />;
}
afterEach(() => cleanup());
const clicar = (nome) => fireEvent.click(screen.getByText(nome));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

describe('GatilhosEditor', () => {
    it('cria o Negar morte: evento, condicao, limite e duas acoes', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        fireEvent.change(screen.getByLabelText('Nome do gatilho'), { target: { value: 'Negar morte' } });
        fireEvent.change(screen.getByLabelText('Só se a Vida for maior que'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Limite de usos do gatilho'), { target: { value: '1:cena' } });
        clicar('+ Ação'); // anular dano (padrao)
        fireEvent.change(screen.getByLabelText('Tipo da ação'), { target: { value: 'definirVida' } });
        fireEvent.change(screen.getByLabelText('Valor da ação'), { target: { value: '1' } });
        clicar('+ Ação');
        clicar('Salvar gatilho');
        expect(ultima).toHaveLength(1);
        expect(ultima[0]).toMatchObject({ nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' } });
        expect(ultima[0].acoes).toEqual([{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }]);
        expect(semUndefined(ultima)).toBe(true);
        expect(screen.getByText(/Quando um golpe me levaria a 0 e Vida maior que 1/)).toBeTruthy();
    });
    it('faixa de Vida com escudo; salvar sem acao e recusado', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        fireEvent.change(screen.getByLabelText('Evento do gatilho'), { target: { value: 'vidaAbaixoDe' } });
        fireEvent.change(screen.getByLabelText('Faixa de Vida: de (%)'), { target: { value: '10' } });
        fireEvent.change(screen.getByLabelText('Faixa de Vida: até (%)'), { target: { value: '6' } });
        clicar('Salvar gatilho');
        expect(screen.getByRole('alert').textContent).toMatch(/pelo menos uma ação/);
        fireEvent.change(screen.getByLabelText('Tipo da ação'), { target: { value: 'escudo' } });
        fireEvent.change(screen.getByLabelText('Valor da ação'), { target: { value: '500' } });
        fireEvent.change(screen.getByLabelText('Nome do escudo'), { target: { value: 'Cinzas' } });
        clicar('+ Ação');
        clicar('Salvar gatilho');
        expect(ultima[0].evento).toEqual({ tipo: 'vidaAbaixoDe', de: 10, ate: 6 });
        expect(ultima[0].acoes[0]).toMatchObject({ tipo: 'escudo', nome: 'Cinzas', valor: 500 });
    });
    it('edita e remove', () => {
        const g = normalizarGatilhos([{ id: 'a', nome: 'Velho', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }]).gatilhos;
        render(<Host inicial={g} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Velho'));
        fireEvent.change(screen.getByLabelText('Nome do gatilho'), { target: { value: 'Novo' } });
        clicar('Salvar gatilho');
        expect(ultima).toHaveLength(1);
        expect(ultima[0]).toMatchObject({ id: 'a', nome: 'Novo' });
        fireEvent.click(screen.getByLabelText('Remover gatilho Novo'));
        expect(ultima).toEqual([]);
    });
});

describe('GatilhosEditor - preserva campos nao editados', () => {
    it('passivo, notas, prioridade, modo opcional e armado sobrevivem a edicao', () => {
        const g = normalizarGatilhos([{ id: 'a', nome: 'Velho', notas: 'nota', prioridade: 5, passivo: true, modo: 'opcional', armado: true, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }], mestreDesligou: true }]).gatilhos;
        render(<Host inicial={g} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Velho'));
        fireEvent.change(screen.getByLabelText('Nome do gatilho'), { target: { value: 'Novo' } });
        clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ id: 'a', nome: 'Novo', notas: 'nota', prioridade: 5, passivo: true, modo: 'opcional', armado: true, mestreDesligou: true });
    });
    it('em vidaAbaixoDe nao oferece anular o dano e mostra a dica da faixa; definirVida em danoQueZeraria avisa', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        expect(screen.getByText(/já anula o golpe/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Evento do gatilho'), { target: { value: 'vidaAbaixoDe' } });
        expect(screen.getByText(/arredondado para baixo/)).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Anular o dano' })).toBeNull();
    });
});

describe('GatilhosEditor - extras', () => {
    it('avisa dos descartados e mostra limite max>1 existente', () => {
        const g = normalizarGatilhos([{ id: 'a', nome: 'Tres', limite: { max: 3, por: 'cena' }, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }]).gatilhos;
        render(<GatilhosEditor gatilhos={g} onChange={() => {}} descartados={[{ nome: 'Quebrado', motivo: 'evento desconhecido' }]} />);
        expect(screen.getByRole('status').textContent).toContain('Quebrado (evento desconhecido)');
        fireEvent.click(screen.getByLabelText('Editar gatilho Tres'));
        expect(screen.getByLabelText('Limite de usos do gatilho').value).toBe('3:cena');
        expect(screen.getByRole('option', { name: '3 vezes por cena' })).toBeTruthy();
    });
});
