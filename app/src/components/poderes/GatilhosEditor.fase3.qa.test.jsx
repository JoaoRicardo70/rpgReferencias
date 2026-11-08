import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GatilhosEditor from './GatilhosEditor';
import { normalizarGatilhos } from '../../core/gatilhos';

// QA Fase 3 do editor: modo opcional (armado/perguntar), tabela de dado com varias linhas e acoes, remover linha, editar preservando campos, dados invalidos.
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
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const erro = () => (screen.queryByRole('alert') || {}).textContent || '';

const VOLTA = {
    id: 'v0', nome: 'Cinzas 0%', modo: 'opcional', armado: true, perguntar: true, prioridade: 5, notas: 'nota do mestre', passivo: true,
    evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, condicoes: [],
    acoes: [{ tipo: 'definirVida', percMax: 1 }, { tipo: 'rolarTabela', dado: '1d4', resultados: [
        { ate: 1, texto: 'cura total', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 100 }] },
        { ate: 3, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
        { ate: 4, texto: 'volta', acoes: [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 }] },
    ] }],
};
const inicialVolta = () => normalizarGatilhos([VOLTA]).gatilhos;

describe('GatilhosEditor QA - modo opcional', () => {
    it('opcional comeca ARMADO por padrao; desmarcar grava armado:false; perguntar so aparece em opcional', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        expect(screen.queryByLabelText('Perguntar antes de usar')).toBeNull();
        mudar('Modo do gatilho', 'opcional');
        clicarLabel('Começa armado');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect('perguntar' in ultima[0]).toBe(false);
        expect(semUndefined(ultima)).toBe(true);
        expect(screen.getByText(/\(opcional, desarmado\)/)).toBeTruthy();
    });
    it('opcional armado SEM perguntar grava armado:true e nao grava perguntar', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Modo do gatilho', 'opcional'); clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: true }); expect('perguntar' in ultima[0]).toBe(false);
    });
    it('perguntar marcado e depois voltar para automatico: nao deixa armado/perguntar para tras', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Modo do gatilho', 'opcional'); clicarLabel('Perguntar antes de usar');
        mudar('Modo do gatilho', 'automatico');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].modo).toBe('automatico'); expect('armado' in ultima[0]).toBe(false); expect('perguntar' in ultima[0]).toBe(false);
    });
    it('gatilho antigo SEM modo/armado (Fase 1/2) abre como automatico e salva automatico', () => {
        const g = [{ id: 'a', nome: 'Antigo', evento: { tipo: 'danoQueZeraria' }, condicoes: [], acoes: [{ tipo: 'anularDano' }] }];
        render(<Host inicial={g} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Antigo'));
        expect(screen.getByLabelText('Modo do gatilho').value).toBe('automatico');
        clicar('Salvar gatilho');
        expect(ultima[0].modo).toBe('automatico'); expect('armado' in ultima[0]).toBe(false);
    });
    it('gatilho opcional SEM armado (dado antigo) aparece DESARMADO, abre desmarcado e, ao salvar, grava armado:false explicito; marcando, grava true', () => {
        const g = [{ id: 'a', nome: 'Antigo', modo: 'opcional', evento: { tipo: 'danoQueZeraria' }, condicoes: [], acoes: [{ tipo: 'anularDano' }] }];
        render(<Host inicial={g} />);
        expect(screen.getByText(/(opcional, desarmado)/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Editar gatilho Antigo'));
        expect(screen.getByLabelText('Começa armado').checked).toBe(false);
        clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: false });
        fireEvent.click(screen.getByLabelText('Editar gatilho Antigo'));
        clicarLabel('Começa armado'); clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: true });
    });
    it('Volta das cinzas cadastrada pelo editor sai ARMADA (padrao true) e dispara no motor', async () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'Cinzas 0%'); mudar('Modo do gatilho', 'opcional');
        mudar('Tipo da ação', 'definirVida'); mudar('Valor da ação', '5'); clicar('+ Ação');
        clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ modo: 'opcional', armado: true });
        const { aplicarDanoNaVida } = await import('../../core/danoVida');
        const f = { vida: { atual: 100000 * 1000 }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: ultima }] };
        aplicarDanoNaVida(f, 1e9, { vidaMaxBruta: 100000 * 1000, cenaId: 'c' });
        expect(f.vida.atual).toBe(5000);
    });
    it('a explicacao muda com o modo e cita a pergunta quando marcada', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        expect(screen.getByText(/Automático: sempre vale/)).toBeTruthy();
        mudar('Modo do gatilho', 'opcional');
        expect(screen.queryByText(/A pergunta vale só para dano na Vida/)).toBeNull();
        clicarLabel('Perguntar antes de usar');
        expect(screen.getByText(/A pergunta vale só para dano na Vida/)).toBeTruthy();
    });
});

describe('GatilhosEditor QA - tabela de dado', () => {
    const abrirTabela = () => { render(<Host />); clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'Cinzas'); mudar('Tipo da ação', 'rolarTabela'); };
    it('tabela com 4 linhas e varias acoes por linha (volta das cinzas) grava exatamente o esperado', () => {
        abrirTabela();
        mudar('Dado da tabela', '1d4');
        // linha 1: ate 1 -> curar 100
        mudar('Até (linha 1)', '1'); mudar('Texto da linha 1', 'cura total');
        mudar('Tipo da ação (linha)', 'curar'); mudar('Valor da ação (linha)', '100'); clicar('+ Ação na linha');
        // linha 2: ate 2 -> limpar + curar 50
        clicar('+ Linha'); mudar('Até (linha 2)', '2');
        mudar('Tipo da ação (linha)', 'limparCondicoes'); clicar('+ Ação na linha');
        mudar('Tipo da ação (linha)', 'curar'); mudar('Valor da ação (linha)', '50'); clicar('+ Ação na linha');
        // linha 3: ate 3 -> imunidade + curar 50
        clicar('+ Linha'); mudar('Até (linha 3)', '3');
        mudar('Tipo da ação (linha)', 'imunidadeTotal'); mudar('Valor da ação (linha)', '1'); clicar('+ Ação na linha');
        mudar('Tipo da ação (linha)', 'curar'); mudar('Valor da ação (linha)', '50'); clicar('+ Ação na linha');
        // linha 4: ate 4 -> dano no atacante 100% + curar 50
        clicar('+ Linha'); mudar('Até (linha 4)', '4');
        mudar('Tipo da ação (linha)', 'danoNoAtacante'); mudar('Valor da ação (linha)', '100'); clicar('+ Ação na linha');
        mudar('Tipo da ação (linha)', 'curar'); mudar('Valor da ação (linha)', '50'); clicar('+ Ação na linha');
        clicar('Adicionar tabela');
        expect(erro()).toBe('');
        clicar('Salvar gatilho');
        const t = ultima[0].acoes[0];
        expect(t.tipo).toBe('rolarTabela'); expect(t.dado).toBe('1d4');
        expect(t.resultados.map(r => r.ate)).toEqual([1, 2, 3, 4]);
        expect(t.resultados[0]).toMatchObject({ texto: 'cura total', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 100 }] });
        expect(t.resultados[1].acoes.map(a => a.tipo)).toEqual(['limparCondicoes', 'curar']);
        expect(t.resultados[2].acoes[0]).toEqual({ tipo: 'imunidadeTotal', duracaoTurnos: 1 });
        expect(t.resultados[3].acoes[0]).toEqual({ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 });
        expect(semUndefined(ultima)).toBe(true);
    });
    it('a ordem das acoes na linha e a ordem de insercao; a linha marcada (radio) recebe as acoes', () => {
        abrirTabela();
        clicar('+ Linha');           // linha 2 passa a ser o alvo e ate = 2
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'na 2'); clicar('+ Ação na linha');
        clicarLabel('Receber ações na linha 1');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'na 1'); clicar('+ Ação na linha');
        clicar('Adicionar tabela'); clicar('Salvar gatilho');
        const rs = ultima[0].acoes[0].resultados;
        expect(rs[0].acoes[0].texto).toBe('na 1'); expect(rs[1].acoes[0].texto).toBe('na 2');
    });
    it('"+ Linha" sugere ate = ultimo + 1; se o ultimo "ate" estiver vazio, o novo vira 1 (vazio conta como 0) e a tabela e recusada pela linha vazia', () => {
        abrirTabela();
        mudar('Até (linha 1)', '');
        clicar('+ Linha');
        expect(screen.getByLabelText('Até (linha 2)').value).toBe('1');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'a'); clicar('+ Ação na linha');
        clicarLabel('Receber ações na linha 1');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'b'); clicar('+ Ação na linha');
        clicar('Adicionar tabela');
        expect(erro()).toMatch(/Tabela inválida/);
    });
    it('remover linha: some a linha, o alvo volta para a linha 1 e as acoes das outras linhas ficam', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'um'); clicar('+ Ação na linha');
        clicar('+ Linha'); mudar('Até (linha 2)', '2');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'dois'); clicar('+ Ação na linha');
        clicar('+ Linha'); mudar('Até (linha 3)', '3');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'tres'); clicar('+ Ação na linha');
        clicarLabel('Remover linha 2');
        expect(screen.queryByLabelText('Até (linha 3)')).toBeNull();
        expect(screen.getByLabelText('Receber ações na linha 1').checked).toBe(true);
        expect(screen.getByLabelText('Até (linha 2)').value).toBe('3'); // a antiga 3 virou 2 e manteve o ate
        clicar('Adicionar tabela'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0].resultados.map(r => r.acoes[0].texto)).toEqual(['um', 'tres']);
        expect(ultima[0].acoes[0].resultados.map(r => r.ate)).toEqual([1, 3]);
    });
    it('com uma linha so, nao ha botao de remover linha', () => {
        abrirTabela();
        expect(screen.queryByLabelText('Remover linha 1')).toBeNull();
    });
    it('"limpar acoes da linha" zera so aquela linha e a tabela volta a ser invalida ate reencher', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'um'); clicar('+ Ação na linha');
        clicarLabel('Limpar ações da linha 1');
        clicar('Adicionar tabela');
        expect(erro()).toMatch(/Tabela inválida/);
    });
    it('dado invalido (abc, 1d, vazio, 1d1001, 1d4+1): recusado; 2d6 e 1D20 aceitos', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'a'); clicar('+ Ação na linha');
        ['abc', '1d', '', '1d1001', '1d4+1', 'd6'].forEach((d) => { mudar('Dado da tabela', d); clicar('Adicionar tabela'); expect(erro(), d).toMatch(/Tabela inválida/); });
        mudar('Dado da tabela', '2d6'); clicar('Adicionar tabela');
        expect(erro()).toBe('');
        clicar('Salvar gatilho'); expect(ultima[0].acoes[0].dado).toBe('2d6');
    });
    it('"ate" invalidos (0, negativo, repetido, decrescente) recusados; decimal e arredondado para baixo', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'a'); clicar('+ Ação na linha');
        clicar('+ Linha'); mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'b'); clicar('+ Ação na linha');
        [['0', '2'], ['-1', '2'], ['2', '2'], ['3', '2']].forEach(([a, b]) => {
            mudar('Até (linha 1)', a); mudar('Até (linha 2)', b); clicar('Adicionar tabela');
            expect(erro(), `${a},${b}`).toMatch(/Tabela inválida/);
        });
        mudar('Até (linha 1)', '1.9'); mudar('Até (linha 2)', '4'); clicar('Adicionar tabela');
        expect(erro()).toBe('');
        clicar('Salvar gatilho');
        expect(ultima[0].acoes[0].resultados.map(r => r.ate)).toEqual([1, 4]);
    });
    it('so uma tabela por gatilho e no maximo 12 linhas; erro claro', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'a'); clicar('+ Ação na linha');
        clicar('Adicionar tabela');
        mudar('Tipo da ação', 'rolarTabela');
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'a'); clicar('+ Ação na linha');
        clicar('Adicionar tabela');
        expect(erro()).toMatch(/Só uma tabela por gatilho/);
        mudar('Tipo da ação', 'mensagem');
        mudar('Tipo da ação', 'rolarTabela');
        for (let i = 0; i < 14; i++) clicar('+ Linha');
        expect(erro()).toMatch(/No máximo 12 linhas/);
        expect(screen.queryByLabelText('Até (linha 13)')).toBeNull();
    });
    it('no maximo 6 acoes por linha', () => {
        abrirTabela();
        for (let i = 0; i < 6; i++) { mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', `m${i}`); clicar('+ Ação na linha'); }
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'm7'); clicar('+ Ação na linha');
        expect(erro()).toMatch(/No máximo 6 ações por linha/);
    });
    it('acao incompleta na linha (curar sem valor, escudo sem nome) e recusada com aviso', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'curar'); clicar('+ Ação na linha');
        expect(erro()).toMatch(/Ação da linha incompleta/);
        mudar('Tipo da ação (linha)', 'curar'); mudar('Valor da ação (linha)', '-5'); clicar('+ Ação na linha');
        expect(erro()).toMatch(/Ação da linha incompleta/);
        mudar('Tipo da ação (linha)', 'danoNoAtacante'); mudar('Valor da ação (linha)', '0'); clicar('+ Ação na linha');
        expect(erro()).toMatch(/Ação da linha incompleta/);
    });
    it('"anularDano" dentro da linha so existe em "golpe me levaria a 0" (evento padrao); ao trocar o evento a opcao some', () => {
        abrirTabela();
        const opcoes = () => Array.from(screen.getByLabelText('Tipo da ação (linha)').querySelectorAll('option')).map(o => o.value);
        expect(opcoes()).toContain('anularDano');
        mudar('Evento do gatilho', 'turnoInicio');
        expect(opcoes()).not.toContain('anularDano');
    });
    it('LIMITACAO: tabela com anularDano aninhado + trocar o evento depois: salvar mostra erro de gatilho invalido (nao perde em silencio)', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'anularDano'); clicar('+ Ação na linha');
        clicar('Adicionar tabela');
        mudar('Evento do gatilho', 'turnoInicio');
        clicar('Salvar gatilho');
        expect(erro()).toMatch(/Gatilho inválido/);
        expect(ultima).toHaveLength(0);
    });
    it('trocar o evento de "danoQueZeraria" remove so o anularDano de topo; a tabela segue', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'x'); clicar('+ Ação na linha'); clicar('Adicionar tabela');
        mudar('Tipo da ação', 'anularDano'); clicar('+ Ação');
        mudar('Evento do gatilho', 'turnoInicio'); clicar('Salvar gatilho');
        expect(ultima[0].acoes.map(a => a.tipo)).toEqual(['rolarTabela']);
    });
    it('pre-visualizacao do gatilho aparece quando ha acoes e traz o modo', () => {
        abrirTabela();
        mudar('Tipo da ação (linha)', 'mensagem'); mudar('Texto da mensagem (linha)', 'x'); clicar('+ Ação na linha'); clicar('Adicionar tabela');
        mudar('Modo do gatilho', 'opcional'); clicarLabel('Perguntar antes de usar');
        expect(screen.getByText(/Resumo: .*rola 1d4.*\(opcional, armado, pergunta antes\)/)).toBeTruthy();
    });
});

describe('GatilhosEditor QA - editar preservando campos', () => {
    it('editar a Volta das cinzas e salvar sem mexer: gatilho IDENTICO (tabela, notas, prioridade, passivo, limite, armado, perguntar)', () => {
        const ini = inicialVolta();
        render(<Host inicial={ini} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Cinzas 0%'));
        clicar('Salvar gatilho');
        expect(ultima).toEqual(ini);
        expect(ultima[0]).toMatchObject({ prioridade: 5, notas: 'nota do mestre', passivo: true, armado: true, perguntar: true, limite: { max: 1, por: 'cena' } });
    });
    it('editar so o nome: tabela e flags intactos, id estavel', () => {
        const ini = inicialVolta();
        render(<Host inicial={ini} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Cinzas 0%'));
        mudar('Nome do gatilho', 'Renascer');
        clicar('Salvar gatilho');
        expect(ultima).toHaveLength(1); expect(ultima[0].id).toBe(ini[0].id); expect(ultima[0].nome).toBe('Renascer');
        expect(ultima[0].acoes).toEqual(ini[0].acoes);
    });
    it('editar: remover a acao da tabela (Remover acao 2) e salvar sem a tabela; depois da para adicionar outra', () => {
        const ini = inicialVolta();
        render(<Host inicial={ini} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Cinzas 0%'));
        clicarLabel('Remover ação 2');
        clicar('Salvar gatilho');
        expect(ultima[0].acoes.map(a => a.tipo)).toEqual(['definirVida']);
    });
    it('desarmar editando um gatilho com perguntar mantem perguntar (so o armado muda)', () => {
        render(<Host inicial={inicialVolta()} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Cinzas 0%'));
        clicarLabel('Começa armado'); clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ armado: false, perguntar: true });
        expect(screen.getByText(/\(opcional, desarmado\)/)).toBeTruthy();
    });
    it('remover o gatilho da lista', () => {
        render(<Host inicial={inicialVolta()} />);
        fireEvent.click(screen.getByLabelText('Remover gatilho Cinzas 0%'));
        expect(ultima).toEqual([]);
    });
    it('limite de 8 gatilhos: o botao de novo fica desabilitado', () => {
        const oito = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, nome: `G${i}`, evento: { tipo: 'turnoInicio' }, condicoes: [], acoes: [{ tipo: 'mensagem', texto: 'a' }] }));
        render(<Host inicial={normalizarGatilhos(oito).gatilhos} />);
        expect(screen.getByText('+ Novo gatilho').disabled).toBe(true);
    });
    it('nome vazio vira "Gatilho"; nome gigante e cortado em 60', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].nome).toBe('Gatilho');
        clicar('+ Novo gatilho'); fireEvent.change(screen.getByLabelText('Nome do gatilho'), { target: { value: 'x'.repeat(200) } }); clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[1].nome.length).toBeLessThanOrEqual(60);
    });
});

describe('GatilhosEditor QA - dano no atacante', () => {
    it('fixo e percentual; valor 0/negativo/vazio recusado; descricao legivel na lista', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Evento do gatilho', 'atingido');
        mudar('Tipo da ação', 'danoNoAtacante');
        mudar('Valor da ação', '0'); clicar('+ Ação'); expect(erro()).toBeTruthy();
        mudar('Valor da ação', '-3'); clicar('+ Ação'); expect(erro()).toBeTruthy();
        mudar('Valor da ação', ''); clicar('+ Ação'); expect(erro()).toBeTruthy();
        mudar('Tipo do dano no atacante', 'fixo'); mudar('Valor da ação', '777'); clicar('+ Ação');
        expect(erro()).toBe('');
        clicar('Salvar gatilho');
        expect(ultima[0].acoes[0]).toEqual({ tipo: 'danoNoAtacante', modo: 'fixo', valor: 777 });
        expect(screen.getByText(/causar 777 de dano no atacante/)).toBeTruthy();
    });
});
