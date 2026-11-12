import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GatilhosEditor from './GatilhosEditor';

// QA - GatilhosEditor: seletor Duracao do Ganho de Poder (permanente | combate) e descricao "ate o fim do combate".
let ultima;
const CONTADORES = [{ id: 'dano', nome: 'Dano acumulado' }, { id: 'furia', nome: 'Furia' }];
function Host({ inicial = [] }) {
    const [lista, setLista] = useState(inicial);
    ultima = lista;
    return <GatilhosEditor gatilhos={lista} onChange={setLista} contadores={CONTADORES} poderes={[]} />;
}
afterEach(() => cleanup());
const clicar = (nome) => fireEvent.click(screen.getByText(nome));
const mudar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const abrir = (evento = 'acertou') => { render(<Host />); clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'G'); mudar('Evento do gatilho', evento); mudar('Tipo da ação', 'ganhoPermanente'); };
const seletorDuracao = () => screen.getByLabelText('Duração do ganho de Poder');

describe('GatilhosEditor: Duracao do ganho de Poder', () => {
    it('o tipo de acao aparece como "Ganho de Poder" (rotulo novo) e nao mais "Ganho permanente de Poder"', () => {
        render(<Host />); clicar('+ Novo gatilho');
        expect(screen.getByRole('option', { name: 'Ganho de Poder' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Ganho permanente de Poder' })).toBeNull();
    });
    it('seletor Duracao existe com Permanente (padrao) e So durante o combate', () => {
        abrir();
        const sel = seletorDuracao();
        expect(sel.value).toBe('permanente');
        expect(Array.from(sel.options).map(o => o.value)).toEqual(['permanente', 'combate']);
        expect(screen.getByRole('option', { name: 'Permanente' })).toBeTruthy();
        expect(screen.getByRole('option', { name: /Só durante o combate/ })).toBeTruthy();
    });
    it('padrao permanente: acao salva SEM campo duracao (formato antigo)', () => {
        abrir(); mudar('Valor do ganho permanente', '2');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 }]);
        expect(ultima[0].acoes[0]).not.toHaveProperty('duracao');
    });
    it('Duracao combate (valor fixo, multiplicar): grava duracao: combate', () => {
        abrir(); mudar('Como aplicar o ganho permanente', 'multiplicar');
        mudar('Duração do ganho de Poder', 'combate');
        mudar('Valor do ganho permanente', '2');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', duracao: 'combate', valor: 2 }]);
    });
    it('Duracao combate com ganho a partir de contador', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        mudar('Contador do ganho permanente', 'dano'); mudar('Fator do ganho permanente', '0.5');
        fireEvent.click(screen.getByLabelText('Zerar o contador depois'));
        mudar('Duração do ganho de Poder', 'combate');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', duracao: 'combate', deContador: { id: 'dano', fator: 0.5, zerar: true } });
    });
    it('voltar para Permanente remove o campo', () => {
        abrir(); mudar('Valor do ganho permanente', '3');
        mudar('Duração do ganho de Poder', 'combate');
        mudar('Duração do ganho de Poder', 'permanente');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0]).not.toHaveProperty('duracao');
    });
    it('a lista de acoes descreve "ate o fim do combate" so quando e de combate', () => {
        abrir(); mudar('Valor do ganho permanente', '2');
        mudar('Duração do ganho de Poder', 'combate');
        clicar('+ Ação');
        expect(screen.getAllByText(/ganha \+2% de Poder \(soma\) até o fim do combate/).length).toBeGreaterThan(0);
        mudar('Tipo da ação', 'ganhoPermanente');
        mudar('Valor do ganho permanente', '4');
        clicar('+ Ação');
        expect(screen.getAllByText(/ganha \+4% de Poder \(soma\)$/).length).toBeGreaterThan(0);
    });
    it('valor invalido continua rejeitado mesmo com duracao combate', () => {
        for (const v of ['', '0']) {
            cleanup();
            abrir(); mudar('Duração do ganho de Poder', 'combate'); mudar('Valor do ganho permanente', v);
            clicar('+ Ação'); clicar('Salvar gatilho');
            expect(ultima).toHaveLength(0);
        }
    });
    it('a nova acao comeca em Permanente (o seletor nao "gruda" no combate depois de adicionar)', () => {
        abrir(); mudar('Valor do ganho permanente', '1');
        mudar('Duração do ganho de Poder', 'combate');
        clicar('+ Ação');
        mudar('Tipo da ação', 'ganhoPermanente');
        expect(seletorDuracao().value).toBe('permanente');
    });
});

describe('GatilhosEditor: editar gatilho existente com duracao combate', () => {
    const acoes = [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', duracao: 'combate', valor: 2 }];
    it('preserva a duracao ao editar so o nome', () => {
        render(<Host inicial={[{ id: 'g1', nome: 'Ego', evento: { tipo: 'acertou', nivel: 'normal' }, condicoes: [], acoes, modo: 'automatico' }]} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Ego'));
        mudar('Nome do gatilho', 'Ego 2');
        clicar('Salvar gatilho');
        expect(ultima[0].nome).toBe('Ego 2');
        expect(ultima[0].acoes).toEqual(acoes);
    });
    it('a acao existente aparece descrita com "até o fim do combate" na listagem', () => {
        render(<Host inicial={[{ id: 'g1', nome: 'Ego', evento: { tipo: 'acertou', nivel: 'normal' }, condicoes: [], acoes, modo: 'automatico' }]} />);
        expect(screen.getAllByText(/até o fim do combate/).length).toBeGreaterThan(0);
    });
    it('gatilho legado sem duracao: sem a frase', () => {
        render(<Host inicial={[{ id: 'g1', nome: 'Ego', evento: { tipo: 'acertou', nivel: 'normal' }, condicoes: [], acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 }], modo: 'automatico' }]} />);
        expect(screen.queryByText(/até o fim do combate/)).toBeNull();
    });
});
