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
const mudar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

describe('GatilhosEditor - Fase 3', () => {
    it('modo: automatico por padrao; opcional mostra "comeca armado" e "perguntar antes de usar"', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        expect(screen.getByLabelText('Modo do gatilho').value).toBe('automatico');
        expect(screen.queryByLabelText('Começa armado')).toBeNull();
        expect(screen.getByText(/Automático: sempre vale/)).toBeTruthy();
        mudar('Modo do gatilho', 'opcional');
        expect(screen.getByLabelText('Começa armado').checked).toBe(true);
        expect(screen.getByLabelText('Perguntar antes de usar').checked).toBe(false);
        expect(screen.getByText(/Opcional: só vale armado/)).toBeTruthy();
    });
    it('cria gatilho opcional armado com perguntar; a lista mostra "(opcional, armado, pergunta antes)"', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Nome do gatilho', 'Cinzas');
        mudar('Modo do gatilho', 'opcional');
        fireEvent.click(screen.getByLabelText('Perguntar antes de usar'));
        clicar('+ Ação'); // anular dano
        clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: true, perguntar: true });
        expect(screen.getByText(/\(opcional, armado, pergunta antes\)/)).toBeTruthy();
        expect(semUndefined(ultima)).toBe(true);
    });
    it('automatico nao guarda armado nem perguntar; editar um opcional desarmado preserva', () => {
        const g = normalizarGatilhos([{ id: 'a', nome: 'Op', modo: 'opcional', armado: false, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }]).gatilhos;
        render(<Host inicial={g} />);
        expect(screen.getByText(/\(opcional, desarmado\)/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Editar gatilho Op'));
        expect(screen.getByLabelText('Começa armado').checked).toBe(false);
        clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: false });
        fireEvent.click(screen.getByLabelText('Editar gatilho Op'));
        mudar('Modo do gatilho', 'automatico');
        clicar('Salvar gatilho');
        expect(ultima[0].modo).toBe('automatico'); expect('armado' in ultima[0]).toBe(false); expect('perguntar' in ultima[0]).toBe(false);
    });
    it('ação "Dano no atacante" (% do dano recebido)', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Evento do gatilho', 'atingido');
        mudar('Tipo da ação', 'danoNoAtacante');
        mudar('Valor da ação', '50');
        clicar('+ Ação');
        clicar('Salvar gatilho');
        expect(ultima[0].acoes[0]).toEqual({ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 50 });
        expect(screen.getByText(/devolver 50% do dano recebido \(antes do escudo\) ao atacante/)).toBeTruthy();
    });
    it('monta a tabela da Volta das cinzas (1d4) com ações por linha e pré-visualização', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Nome do gatilho', 'Cinzas 0%');
        mudar('Tipo da ação', 'rolarTabela');
        // linha 1: até 1 -> curar 100%
        mudar('Até (linha 1)', '1');
        mudar('Tipo da ação (linha)', 'curar'); mudar('Valor da ação (linha)', '100'); clicar('+ Ação na linha');
        // linha 2: até 4 -> limpar condições + imunidade
        clicar('+ Linha');
        mudar('Até (linha 2)', '4');
        mudar('Texto da linha 2', 'imune');
        mudar('Tipo da ação (linha)', 'limparCondicoes'); clicar('+ Ação na linha');
        mudar('Tipo da ação (linha)', 'imunidadeTotal'); mudar('Valor da ação (linha)', '1'); clicar('+ Ação na linha');
        expect(screen.getByText(/rola 1d4: 1→curar 100% da Vida máxima; 2-4→"imune" limpar as condições \+ ficar imune/)).toBeTruthy();
        clicar('Adicionar tabela');
        clicar('Salvar gatilho');
        expect(ultima[0].acoes[0].tipo).toBe('rolarTabela');
        expect(ultima[0].acoes[0].resultados).toHaveLength(2);
        expect(ultima[0].acoes[0].resultados[1]).toMatchObject({ ate: 4, texto: 'imune' });
        expect(ultima[0].acoes[0].resultados[1].acoes).toHaveLength(2);
        expect(semUndefined(ultima)).toBe(true);
    });
    it('tabela inválida (linha sem ação ou dado ruim) não entra; dentro da linha não há "Rolar tabela"', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Tipo da ação', 'rolarTabela');
        clicar('Adicionar tabela');
        expect(screen.getByRole('alert').textContent).toMatch(/Tabela inválida/);
        const opcoesLinha = Array.from(screen.getByLabelText('Tipo da ação (linha)').querySelectorAll('option')).map(o => o.value);
        expect(opcoesLinha).not.toContain('rolarTabela');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'oi'); clicar('+ Ação na linha');
        mudar('Dado da tabela', 'abc');
        clicar('Adicionar tabela');
        expect(screen.getByRole('alert').textContent).toMatch(/Tabela inválida/);
        mudar('Dado da tabela', '1d6');
        clicar('Adicionar tabela');
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('máximo de 12 linhas na tabela', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Tipo da ação', 'rolarTabela');
        for (let i = 0; i < 11; i++) clicar('+ Linha');
        clicar('+ Linha');
        expect(screen.getByRole('alert').textContent).toMatch(/No máximo 12 linhas/);
    });
});
