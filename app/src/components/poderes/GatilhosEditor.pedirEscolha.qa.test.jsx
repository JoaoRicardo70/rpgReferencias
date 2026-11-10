import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GatilhosEditor from './GatilhosEditor';
import { normalizarGatilhos } from '../../core/gatilhos';

// QA do editor: ação "Pedir uma escolha" (criar, adicionar/remover opções, limites, erros, edição preservando).
let ultima;
function Host({ inicial = [] }) {
    const [lista, setLista] = useState(inicial);
    ultima = lista;
    return <GatilhosEditor gatilhos={lista} onChange={setLista} />;
}
afterEach(() => cleanup());
const clicar = (nome) => fireEvent.click(screen.getByText(nome));
const clicarLabel = (rotulo) => fireEvent.click(screen.getByLabelText(rotulo));
const mudar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const erro = () => (screen.queryByRole('alert') || {}).textContent || '';
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

const abrir = () => { render(<Host />); clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'Escolha'); mudar('Tipo da ação', 'pedirEscolha'); };
const msgNaOpcao = (texto) => { mudar('Tipo da ação (opção)', 'mensagem'); mudar('Texto da mensagem (opção)', texto); clicar('+ Ação na opção'); };

describe('GatilhosEditor - pedirEscolha: Happy Path', () => {
    it('a ação aparece no seletor e esconde o botão "+ Ação" genérico', () => {
        abrir();
        expect(screen.getByLabelText('Tipo da ação').value).toBe('pedirEscolha');
        expect(screen.getByText('Adicionar escolha')).toBeTruthy();
        expect(screen.getByLabelText('Pergunta da escolha')).toBeTruthy();
        expect(screen.getByLabelText('Texto da opção 1')).toBeTruthy();
        expect(screen.getByLabelText('Texto da opção 2')).toBeTruthy();
    });
    it('cria escolha com 2 opções e salva o gatilho normalizado', () => {
        abrir();
        mudar('Pergunta da escolha', 'Qual caminho?');
        mudar('Texto da opção 1', 'Curar'); mudar('Tipo da ação (opção)', 'curar'); mudar('Valor da ação (opção)', '10'); clicar('+ Ação na opção');
        clicarLabel('Receber ações na opção 2');
        mudar('Texto da opção 2', 'Aviso'); msgNaOpcao('olá');
        clicar('Adicionar escolha');
        expect(erro()).toBe('');
        clicar('Salvar gatilho');
        const a = ultima[0].acoes[0];
        expect(a.tipo).toBe('pedirEscolha'); expect(a.pergunta).toBe('Qual caminho?');
        expect(a.opcoes.map(o => o.texto)).toEqual(['Curar', 'Aviso']);
        expect(a.opcoes[0].acoes[0]).toMatchObject({ tipo: 'curar', valor: 10 });
        expect(a.opcoes[1].acoes[0]).toEqual({ tipo: 'mensagem', texto: 'olá' });
        expect(semUndefined(ultima)).toBe(true);
        expect(normalizarGatilhos(ultima).gatilhos).toHaveLength(1);
    });
    it('pergunta é opcional', () => {
        abrir();
        mudar('Texto da opção 1', 'A'); msgNaOpcao('a');
        clicarLabel('Receber ações na opção 2'); mudar('Texto da opção 2', 'B'); msgNaOpcao('b');
        clicar('Adicionar escolha'); clicar('Salvar gatilho');
        expect('pergunta' in ultima[0].acoes[0]).toBe(false);
    });
    it('uma opção com várias ações grava na ordem de inserção', () => {
        abrir();
        mudar('Texto da opção 1', 'A'); msgNaOpcao('um'); msgNaOpcao('dois');
        clicarLabel('Receber ações na opção 2'); mudar('Texto da opção 2', 'B'); msgNaOpcao('b');
        clicar('Adicionar escolha'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0].opcoes[0].acoes.map(a => a.texto)).toEqual(['um', 'dois']);
    });
    it('mostra a prévia legível enquanto monta', () => {
        abrir();
        mudar('Texto da opção 1', 'A'); msgNaOpcao('um');
        clicarLabel('Receber ações na opção 2'); mudar('Texto da opção 2', 'B'); msgNaOpcao('dois');
        expect(screen.getAllByText(/escolher: "A"/).length).toBeGreaterThan(0);
    });
});

describe('GatilhosEditor - pedirEscolha: adicionar/remover opções', () => {
    it('"+ Opção" adiciona opção 3 e ela passa a receber ações; ao todo até 6', () => {
        abrir();
        clicar('+ Opção');
        expect(screen.getByLabelText('Texto da opção 3')).toBeTruthy();
        expect(screen.getByLabelText('Receber ações na opção 3').checked).toBe(true);
        clicar('+ Opção'); clicar('+ Opção'); clicar('+ Opção');
        expect(screen.getByLabelText('Texto da opção 6')).toBeTruthy();
        expect(erro()).toBe('');
    });
    it('7ª opção é recusada com mensagem e não é criada', () => {
        abrir();
        for (let i = 0; i < 4; i++) clicar('+ Opção');
        clicar('+ Opção');
        expect(erro()).toMatch(/No máximo 6 opções/);
        expect(screen.queryByLabelText('Texto da opção 7')).toBeNull();
    });
    it('com 2 opções não há botão de remover; com 3 há e remove', () => {
        abrir();
        expect(screen.queryByLabelText('Remover opção 1')).toBeNull();
        clicar('+ Opção');
        expect(screen.getByLabelText('Remover opção 3')).toBeTruthy();
        clicarLabel('Remover opção 3');
        expect(screen.queryByLabelText('Texto da opção 3')).toBeNull();
        expect(screen.queryByLabelText('Remover opção 1')).toBeNull();
    });
    it('remover uma opção do meio mantém as demais (textos deslocam)', () => {
        abrir();
        clicar('+ Opção');
        mudar('Texto da opção 1', 'X'); mudar('Texto da opção 2', 'Y'); mudar('Texto da opção 3', 'Z');
        clicarLabel('Remover opção 2');
        expect(screen.getByLabelText('Texto da opção 1').value).toBe('X');
        expect(screen.getByLabelText('Texto da opção 2').value).toBe('Z');
    });
    it('remover reposiciona o alvo na opção 1', () => {
        abrir();
        clicar('+ Opção');
        clicarLabel('Remover opção 3');
        expect(screen.getByLabelText('Receber ações na opção 1').checked).toBe(true);
    });
    it('"limpar ações da opção" zera a lista da opção', () => {
        abrir();
        mudar('Texto da opção 1', 'A'); msgNaOpcao('um');
        clicarLabel('Limpar ações da opção 1');
        expect(screen.queryByLabelText('Limpar ações da opção 1')).toBeNull();
    });
});

describe('GatilhosEditor - pedirEscolha: Error Cases', () => {
    it('escolha sem textos/ações é recusada e nada é adicionado', () => {
        abrir();
        clicar('Adicionar escolha');
        expect(erro()).toMatch(/Escolha inválida/);
        clicar('Salvar gatilho');
        expect(erro()).toMatch(/pelo menos uma ação/);
        expect(ultima).toHaveLength(0);
    });
    it('opção sem texto é recusada', () => {
        abrir();
        msgNaOpcao('a'); clicarLabel('Receber ações na opção 2'); mudar('Texto da opção 2', 'B'); msgNaOpcao('b');
        clicar('Adicionar escolha');
        expect(erro()).toMatch(/Escolha inválida/);
    });
    it('opção sem ações é recusada', () => {
        abrir();
        mudar('Texto da opção 1', 'A'); msgNaOpcao('a'); mudar('Texto da opção 2', 'B');
        clicar('Adicionar escolha');
        expect(erro()).toMatch(/Escolha inválida/);
    });
    it('ação incompleta na opção (mensagem vazia) mostra erro e não entra', () => {
        abrir();
        mudar('Tipo da ação (opção)', 'mensagem'); clicar('+ Ação na opção');
        expect(erro()).toMatch(/Ação da opção incompleta/);
    });
    it('opção de escolha não oferece rolarTabela nem pedirEscolha (sem aninhamento)', () => {
        abrir();
        const ids = Array.from(screen.getByLabelText('Tipo da ação (opção)').querySelectorAll('option')).map(o => o.value);
        expect(ids).not.toContain('rolarTabela'); expect(ids).not.toContain('pedirEscolha');
        expect(ids).toContain('mensagem');
    });
    it('anularDano só é oferecido dentro da opção quando o evento é "danoQueZeraria"', () => {
        abrir();
        const evento = screen.queryByLabelText('Evento do gatilho');
        const ids = () => Array.from(screen.getByLabelText('Tipo da ação (opção)').querySelectorAll('option')).map(o => o.value);
        if (evento) {
            mudar('Evento do gatilho', 'turnoInicio');
            expect(ids()).not.toContain('anularDano');
            mudar('Evento do gatilho', 'danoQueZeraria');
            expect(ids()).toContain('anularDano');
        }
    });
});

describe('GatilhosEditor - pedirEscolha: tabela e edição', () => {
    it('só uma escolha por gatilho', () => {
        abrir();
        mudar('Texto da opção 1', 'A'); msgNaOpcao('a'); clicarLabel('Receber ações na opção 2'); mudar('Texto da opção 2', 'B'); msgNaOpcao('b');
        clicar('Adicionar escolha');
        mudar('Tipo da ação', 'pedirEscolha');
        mudar('Texto da opção 1', 'C'); msgNaOpcao('c'); clicarLabel('Receber ações na opção 2'); mudar('Texto da opção 2', 'D'); msgNaOpcao('d');
        clicar('Adicionar escolha');
        expect(erro()).toMatch(/Só uma escolha/);
    });
    it('gatilho existente com escolha reabre e preserva ao salvar', () => {
        const g = normalizarGatilhos([{ nome: 'Cinzas', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'pedirEscolha', pergunta: 'Q?', opcoes: [{ texto: 'A', acoes: [{ tipo: 'mensagem', texto: 'a' }] }, { texto: 'B', acoes: [{ tipo: 'mensagem', texto: 'b' }] }] }] }]).gatilhos;
        render(<Host inicial={g} />);
        expect(screen.getByText(/escolher \(Q\?\)/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Editar gatilho Cinzas'));
        clicar('Salvar gatilho');
        expect(ultima[0].acoes[0]).toEqual(g[0].acoes[0]);
    });
    it('rolarTabela continua funcionando no mesmo editor (regressão)', () => {
        render(<Host />); clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'T'); mudar('Tipo da ação', 'rolarTabela');
        mudar('Dado da tabela', '1d4'); mudar('Até (linha 1)', '4');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'x'); clicar('+ Ação na linha');
        clicar('Adicionar tabela'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0].tipo).toBe('rolarTabela');
    });
});
